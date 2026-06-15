// 학교알리미 웹앱 — fly.io 배포용 HTTP 서버
//
// 인증키는 서버 환경변수(SCHOOLINFO_API_KEY)에 두므로 접속자는 키가 필요 없다.
// 학부모가 브라우저에서 학교 검색 → 공시/수행평가 계획을 바로 확인.

import http from "http";
import { readFileSync } from "fs";
import { createClient, formatSchool, formatDisclosure, getParentDigest, REGIONS, searchSchoolsByName, resolveSido } from "./index.js";
import { SCHOOL_KIND, SchoolKindName } from "./codes.js";
import { listEvaluationDocs, fetchEvaluationBySeq, evaluationGuide, downloadEvaluationFile, structureEvaluation, MAX_ALL_DOCS, type EvaluationResult } from "./evaluation.js";
import type { School } from "./client.js";
import { findNeisSchool, fetchSchedule, hasNeisKey, currentAcademicYear } from "./neis.js";
import { renderPage } from "./web.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildMcpServer } from "./mcpServer.js";

const PORT = Number(process.env.PORT) || 8080;
const MAX_NAME_LEN = 40;

// OG 공유 이미지 (카톡/오픈그래프) — 빌드와 함께 배포되는 정적 PNG (dist 기준 ../og.png)
let OG_IMAGE: Buffer | null = null;
try {
  OG_IMAGE = readFileSync(new URL("../og.png", import.meta.url));
} catch {
  OG_IMAGE = null;
}

// 보안 헤더 (XSS 완화 CSP 포함). marked/DOMPurify는 jsdelivr CDN 사용.
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; font-src 'self' https://cdn.jsdelivr.net; " +
    "img-src 'self' data: https:; connect-src 'self'; " +
    "object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
};

// 간단 IP rate limit (in-memory, 단일 머신 기준)
const RL_WINDOW = 60_000;
const RL_MAX = 60; // 일반 API: 분당 60회
const RL_HEAVY_MAX = 10; // 평가계획 다운로드/파싱: 분당 10회 (증폭 DoS 완화)
const rlMap = new Map<string, { count: number; reset: number }>();
const rlHeavyMap = new Map<string, { count: number; reset: number }>();
function rlHit(map: Map<string, { count: number; reset: number }>, max: number, ip: string, now: number): boolean {
  const e = map.get(ip);
  if (!e || now > e.reset) {
    map.set(ip, { count: 1, reset: now + RL_WINDOW });
    if (map.size > 5000) for (const [k, v] of map) if (now > v.reset) map.delete(k);
    return false;
  }
  e.count++;
  return e.count > max;
}
function rateLimited(ip: string, now: number): boolean {
  return rlHit(rlMap, RL_MAX, ip, now);
}
function rateLimitedHeavy(ip: string, now: number): boolean {
  return rlHit(rlHeavyMap, RL_HEAVY_MAX, ip, now);
}

// 다운로드+파싱(메모리·CPU 큰 작업) 전역 동시성 상한 — 요청 간 in-flight 폭주로 인한 OOM 방어.
const MAX_HEAVY_CONCURRENT = 4;
let heavyInFlight = 0;

function clientIp(req: http.IncomingMessage): string {
  // fly-client-ip는 fly 프록시가 설정하는 실제 클라이언트 IP (클라이언트가 보낸 값은 프록시가 덮어씀)
  // → 신뢰 가능. x-forwarded-for는 위조 가능하므로 rate-limit 키로 신뢰하지 않는다(우회 방지).
  const fly = req.headers["fly-client-ip"];
  if (typeof fly === "string" && fly.trim()) return fly.trim();
  return req.socket.remoteAddress ?? "unknown";
}

/** 공시연도 검증: 정수 + 합리적 범위 */
function parseYear(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 2010 || n > 2100) return undefined;
  return n;
}

function json(res: http.ServerResponse, code: number, data: any) {
  const body = JSON.stringify(data);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS });
  res.end(body);
}

/** 다운로드 파일명 정제 — 제어문자/경로구분자 제거 (헤더는 RFC5987 인코딩으로 한 번 더 방어) */
function sanitizeFilename(name: string): string {
  return (
    name
      .replace(/[\r\n"\\/\x00-\x1f\x7f-\x9f]/g, "")
      .trim()
      .slice(0, 200) || "download"
  );
}

/** 폴백 doc 마크다운 상한 — 구조화 실패 문서가 모바일 DOM을 폭주시키지 않게 (초과분은 원본 다운로드로 유도) */
const DOC_MD_CAP = 100_000;
/** 구조화 성공 시에도 '전체 원문 보기' 모달용으로 함께 보내는 파싱 원문 상한 */
const MODAL_MD_CAP = 120_000;

/** 모달 '전체 원문'용 마크다운 — 상한 초과 시 잘라 원본 다운로드로 유도 */
function modalMarkdown(md: string): string {
  if (md.length <= MODAL_MD_CAP) return md;
  return md.slice(0, MODAL_MD_CAP) + "\n\n> ⚠️ 문서가 길어 일부만 표시했습니다. 전체는 위의 **원본 다운로드**로 확인하세요.";
}

/**
 * 구조화 실패(통합형 아님/초등 등) 시 보내는 doc 마크다운.
 * 기존엔 `### 수행평가 섹션` + `<details>전체 문서</details>`로 본문을 2번 실어 모바일이 죽었다.
 * 여기선 중복을 없애고(섹션 있으면 섹션만), 과대 문서는 잘라 원본 다운로드로 유도한다.
 */
function slimDocMarkdown(school: School, results: EvaluationResult[], year?: number): string {
  const parts: string[] = [];
  for (const r of results) {
    parts.push(`## 📄 ${r.filename}`);
    if (r.evaluationSections.length) {
      parts.push(`\n### 🎯 수행평가 관련\n`, r.evaluationSections.join("\n\n---\n\n"));
    } else if (r.markdown.trim().length < 200) {
      parts.push(`\n> ⚠️ 이 파일은 이미지로 된 PDF로 보여 자동 추출이 어렵습니다. 원본을 직접 확인하세요.\n`, evaluationGuide(school, year));
    } else {
      parts.push("\n", r.markdown);
    }
  }
  let md = parts.join("\n");
  if (md.length > DOC_MD_CAP) {
    md = md.slice(0, DOC_MD_CAP) + `\n\n> ⚠️ 문서가 매우 커서 일부만 표시했습니다. 전체 내용은 위의 **원본 다운로드**로 확인하세요.`;
  }
  return md;
}

/** 확장자 → Content-Type (원본 다운로드용) */
function contentTypeFor(name: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  switch (ext) {
    case "pdf": return "application/pdf";
    case "hwp": return "application/x-hwp";
    case "hwpx": return "application/haansofthwpx";
    case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "xlsx": return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    default: return "application/octet-stream";
  }
}

const server = http.createServer(async (req, res) => {
  // monotonic-ish clock — Date.now는 rate limit 용도로만
  const now = Date.now();
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const q = url.searchParams;

    // 헬스체크
    if (url.pathname === "/health") return json(res, 200, { ok: true });

    // OG 공유 이미지 (카톡 미리보기)
    if (url.pathname === "/og.png") {
      if (!OG_IMAGE) return res.writeHead(404, SECURITY_HEADERS).end("Not Found");
      res.writeHead(200, {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400",
        ...SECURITY_HEADERS,
      });
      return res.end(OG_IMAGE);
    }

    // 원격 MCP 엔드포인트 (Streamable HTTP, stateless) — 설치/키 없이 Claude·Cursor에서 연결
    //  인증키는 서버(fly secret)에 있으므로 접속자는 키가 필요 없다.
    //  stateless: 요청마다 새 서버+트랜스포트 (세션 어피니티 불필요 → fly auto-scale 안전).
    if (url.pathname === "/mcp") {
      // 웹 기반 MCP 클라이언트(claude.ai 등) 대비 CORS (Origin이 있을 때만 반사, 와일드카드 폴백 없음)
      if (req.headers.origin) res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id, mcp-protocol-version, authorization");
      res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");
      if (req.method === "OPTIONS") return res.writeHead(204).end();
      if (rateLimited(clientIp(req), now)) {
        res.writeHead(429, { "Content-Type": "application/json; charset=utf-8" });
        return res.end(JSON.stringify({ error: "요청이 너무 많습니다." }));
      }
      const mcp = buildMcpServer({ localFiles: false }); // 원격: 서버 로컬파일 도구 제외
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless
        enableJsonResponse: true,
      });
      res.on("close", () => {
        transport.close();
        mcp.close();
      });
      await mcp.connect(transport);
      await transport.handleRequest(req, res);
      return;
    }

    // 메인 페이지
    if (url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", ...SECURITY_HEADERS });
      return res.end(renderPage(REGIONS, Object.keys(SCHOOL_KIND)));
    }

    // API
    if (url.pathname.startsWith("/api/")) {
      if (rateLimited(clientIp(req), now)) {
        return json(res, 429, { error: "요청이 너무 많습니다. 잠시 후 다시 시도하세요." });
      }

      // 비용 큰 엔드포인트(평가계획 다운로드/파싱)는 더 낮은 rate + 동시성 상한으로 증폭 DoS 방어.
      // 동시성 카운터는 res 종료 시 자동 감소 → 모든 return/스트리밍 경로에서 누수 없음.
      const isHeavy = url.pathname === "/api/evaluation" || url.pathname === "/api/download";
      if (isHeavy) {
        if (rateLimitedHeavy(clientIp(req), now)) {
          return json(res, 429, { error: "요청이 너무 많습니다. 잠시 후 다시 시도하세요." });
        }
        if (heavyInFlight >= MAX_HEAVY_CONCURRENT) {
          return json(res, 503, { error: "요청이 많아 잠시 후 다시 시도하세요." });
        }
        heavyInFlight++;
        res.on("close", () => { heavyInFlight--; });
      }

      // 학교명 전국 검색 — 인증키 불필요 (공시포털 자동완성 재현)
      if (url.pathname === "/api/searchName") {
        const word = (q.get("word") ?? "").slice(0, MAX_NAME_LEN);
        const hits = await searchSchoolsByName(word);
        return json(res, 200, { schools: hits });
      }

      if (!process.env.SCHOOLINFO_API_KEY) {
        return json(res, 500, { error: "서버 설정 오류입니다." });
      }
      const client = createClient();
      const sido = (q.get("sido") ?? "").slice(0, 20);
      const sgg = (q.get("sgg") ?? "").slice(0, 30);
      const kindRaw = q.get("kind") ?? "중학교";
      if (!(kindRaw in SCHOOL_KIND)) {
        return json(res, 400, { error: "잘못된 학교급입니다." });
      }
      const kind = kindRaw as SchoolKindName;
      const name = (q.get("name") ?? "").slice(0, MAX_NAME_LEN);
      const year = parseYear(q.get("year"));

      // 학교 검색
      if (url.pathname === "/api/search") {
        const list = await client.searchSchools({ sido, sgg, kind, name: name || undefined });
        return json(res, 200, {
          schools: list.map((s) => ({
            schoolCode: s.schoolCode,
            name: s.name,
            foundation: s.foundation,
            address: s.address,
            tel: s.tel,
            homepage: s.homepage,
          })),
        });
      }

      // 학교 1곳 해석
      const resolve = async () => {
        const list = await client.searchSchools({ sido, sgg, kind, name: name || undefined });
        if (!list.length) return null;
        return list.find((s) => s.name === name) ?? list[0];
      };

      // 원본 평가계획 파일 다운로드 (스트리밍) — 변환 없이 hwp/hwpx/pdf 원본 그대로
      if (url.pathname === "/api/download") {
        const seq = q.get("seq") ?? "";
        if (!/^\d+$/.test(seq)) return json(res, 400, { error: "잘못된 파일 식별자입니다." });
        const school = await resolve();
        if (!school) return json(res, 404, { error: "학교를 찾을 수 없습니다." });
        const { docs, downloadParams } = await listEvaluationDocs(school, year);
        const target = docs.find((d) => d.seq === seq);
        if (!target) return json(res, 404, { error: "해당 파일을 찾을 수 없습니다." });
        const { buffer, filename } = await downloadEvaluationFile(downloadParams, seq);
        const safe = sanitizeFilename(filename || target.filename || `evaluation_${seq}`);
        res.writeHead(200, {
          "Content-Type": contentTypeFor(safe),
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safe)}`,
          "Content-Length": String(buffer.byteLength),
          ...SECURITY_HEADERS,
        });
        return res.end(Buffer.from(buffer));
      }

      // 다이제스트
      if (url.pathname === "/api/digest") {
        const school = await resolve();
        if (!school) return json(res, 404, { error: "학교를 찾을 수 없습니다." });
        const digest = await getParentDigest(client, school, year);
        const md = [
          formatSchool(school),
          "",
          ...digest.map((d) => formatDisclosure(d.name, d.rows, d.apiType)),
        ].join("\n");
        return json(res, 200, { school: school.name, markdown: md });
      }

      // 학사일정 (NEIS 교육정보 개방 API — 학교알리미 공시엔 없는 항목)
      if (url.pathname === "/api/schedule") {
        const school = await resolve();
        if (!school) return json(res, 404, { error: "학교를 찾을 수 없습니다." });
        if (!hasNeisKey()) {
          return json(res, 200, { school: school.name, items: [], note: "학사일정은 NEIS API 키 설정 후 제공됩니다." });
        }
        try {
          // 시도 약칭(경북 등)은 정식명으로 정규화해 NEIS LCTN_SC_NM과 매칭, sgg로 동명이교 구분
          const ns = await findNeisSchool(school.name, resolveSido(sido)?.name ?? sido, sgg);
          if (!ns) return json(res, 200, { school: school.name, items: [], note: "NEIS에서 해당 학교를 찾지 못했습니다." });
          const y = year ?? currentAcademicYear();
          const lastFeb = new Date(y + 1, 2, 0).getDate(); // 다음해 2월 말일(윤년 29 포함)
          const items = await fetchSchedule(ns.atptCode, ns.schoolCode, `${y}0301`, `${y + 1}02${lastFeb}`);
          return json(res, 200, { school: school.name, year: y, items });
        } catch (e: any) {
          // 상세는 로그에만, 사용자에겐 일반 문구 (전역 catch와 동일한 정보-비노출 정책)
          console.error("[schedule]", e?.message ?? e);
          return json(res, 200, { school: school.name, items: [], note: "학사일정을 일시적으로 가져오지 못했습니다." });
        }
      }

      // 수행평가/평가계획 자동 조회
      //  - seq 없음 + 파일 여러 개 → 파일(과목/학년) 목록 반환 (선택용)
      //  - 단일 문서 → 학년별 종합표로 구조화(structured) 시도 → 실패 시 슬림 doc
      //  - all → 여러 문서를 슬림 doc 으로 (중복/과대 본문 방지)
      if (url.pathname === "/api/evaluation") {
        const school = await resolve();
        if (!school) return json(res, 404, { error: "학교를 찾을 수 없습니다." });
        const seq = q.get("seq");
        const all = q.get("all") === "1";
        try {
          const { docs, downloadParams, year: docYear } = await listEvaluationDocs(school, year);
          if (!seq && !all && docs.length > 1) {
            // 과목/학년별로 쪼개진 학교 → 목록 반환
            return json(res, 200, {
              school: school.name,
              mode: "list",
              year: docYear,
              files: docs.map((d) => ({ seq: d.seq, filename: d.filename, sizeKB: d.sizeKB })),
            });
          }
          let targets;
          if (all) {
            targets = docs.slice(0, MAX_ALL_DOCS);
          } else if (seq) {
            // 선택한 과목이 (연도 재해석 등으로) 현재 목록에 없으면 엉뚱한 과목을 보여주지 말고 알린다
            const found = docs.find((d) => d.seq === seq);
            if (!found) return json(res, 404, { error: "선택한 과목을 찾을 수 없습니다. 목록을 다시 조회하세요." });
            targets = [found];
          } else {
            targets = [docs[0]];
          }

          // 단일 문서: 학년별 종합표 구조화 시도 (통합형이면 학년/과목 칩으로 가볍게 전달)
          if (targets.length === 1) {
            const t = targets[0];
            const r = await fetchEvaluationBySeq(downloadParams, t);
            const downloads = [{ seq: t.seq, filename: t.filename, sizeKB: t.sizeKB }];
            const structured = structureEvaluation(r.markdown);
            if (structured) {
              return json(res, 200, {
                school: school.name,
                mode: "structured",
                year: docYear,
                filename: r.filename,
                grades: structured.grades,
                allSubjects: structured.allSubjects,
                downloads,
                // '전체 원문 보기' 모달용 파싱 원문 (hwp 다운로드 없이 인앱 열람)
                markdown: modalMarkdown(r.markdown),
              });
            }
            // 구조화 실패 → 슬림 doc (클라가 점진 렌더)
            return json(res, 200, {
              school: school.name,
              mode: "doc",
              year: docYear,
              downloads,
              markdown: slimDocMarkdown(school, [r], docYear),
            });
          }

          // 다중(all): 슬림 doc
          const results: EvaluationResult[] = [];
          for (const t of targets) results.push(await fetchEvaluationBySeq(downloadParams, t));
          let markdown = slimDocMarkdown(school, results, docYear);
          if (all && docs.length > MAX_ALL_DOCS) {
            markdown += `\n\n> 평가계획 파일이 ${docs.length}개로 많아 앞쪽 ${MAX_ALL_DOCS}개만 표시했습니다. 특정 과목/학년을 선택해 조회하세요.`;
          }
          return json(res, 200, {
            school: school.name,
            mode: "doc",
            year: docYear,
            downloads: targets.map((t) => ({ seq: t.seq, filename: t.filename, sizeKB: t.sizeKB })),
            markdown,
          });
        } catch (e: any) {
          // 상세 에러(저수준 네트워크 문구 등)는 로그에만, 사용자에겐 안내문구 (다른 엔드포인트와 동일 정책)
          console.error("[evaluation]", e?.message ?? e);
          return json(res, 200, {
            school: school.name,
            mode: "doc",
            markdown: `> ⚠️ 평가계획을 자동으로 가져오지 못했습니다.\n\n${evaluationGuide(school, year)}`,
          });
        }
      }

      return json(res, 404, { error: "알 수 없는 API" });
    }

    res.writeHead(404, SECURITY_HEADERS).end("Not Found");
  } catch (e: any) {
    // 상세는 서버 로그에만, 사용자에겐 일반 메시지 (정보 노출 방지)
    console.error("[server error]", e?.message ?? e);
    // 스트리밍(/mcp, /api/download)에서 헤더가 이미 나갔다면 재기록 불가
    if (res.headersSent) return res.end();
    json(res, 500, { error: "일시적인 오류가 발생했습니다. 잠시 후 다시 시도하세요." });
  }
});

server.listen(PORT, () => {
  console.log(`schoolinfo 웹앱: http://localhost:${PORT}`);
  if (!process.env.SCHOOLINFO_API_KEY) console.warn("⚠️ SCHOOLINFO_API_KEY 미설정 — API 비활성");
});
