// 학교알리미 웹앱 — fly.io 배포용 HTTP 서버
//
// 인증키는 서버 환경변수(SCHOOLINFO_API_KEY)에 두므로 접속자는 키가 필요 없다.
// 학부모가 브라우저에서 학교 검색 → 공시/수행평가 계획을 바로 확인.

import http from "http";
import { createClient, formatSchool, formatDisclosure, getParentDigest, REGIONS } from "./index.js";
import { SCHOOL_KIND, SchoolKindName } from "./codes.js";
import { listEvaluationDocs, fetchEvaluationBySeq, evaluationGuide } from "./evaluation.js";
import { renderPage } from "./web.js";

const PORT = Number(process.env.PORT) || 8080;
const MAX_NAME_LEN = 40;

// 보안 헤더 (XSS 완화 CSP 포함). marked/DOMPurify는 jsdelivr CDN 사용.
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
    "style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; " +
    "object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
};

// 간단 IP rate limit (in-memory, 단일 머신 기준) — 분당 60회
const RL_WINDOW = 60_000;
const RL_MAX = 60;
const rlMap = new Map<string, { count: number; reset: number }>();
function rateLimited(ip: string, now: number): boolean {
  const e = rlMap.get(ip);
  if (!e || now > e.reset) {
    rlMap.set(ip, { count: 1, reset: now + RL_WINDOW });
    if (rlMap.size > 5000) for (const [k, v] of rlMap) if (now > v.reset) rlMap.delete(k);
    return false;
  }
  e.count++;
  return e.count > RL_MAX;
}

function clientIp(req: http.IncomingMessage): string {
  const xff = req.headers["fly-client-ip"] ?? req.headers["x-forwarded-for"];
  if (typeof xff === "string") return xff.split(",")[0].trim();
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

const server = http.createServer(async (req, res) => {
  // monotonic-ish clock — Date.now는 rate limit 용도로만
  const now = Date.now();
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const q = url.searchParams;

    // 헬스체크
    if (url.pathname === "/health") return json(res, 200, { ok: true });

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

      // 수행평가/평가계획 자동 조회
      //  - seq 없음 + 파일 여러 개 → 과목 목록 반환 (선택용)
      //  - seq 지정 또는 파일 1개 → 해당 파일 파싱
      if (url.pathname === "/api/evaluation") {
        const school = await resolve();
        if (!school) return json(res, 404, { error: "학교를 찾을 수 없습니다." });
        const seq = q.get("seq");
        const all = q.get("all") === "1";
        try {
          const { docs, downloadParams } = await listEvaluationDocs(school, year);
          if (!seq && !all && docs.length > 1) {
            // 과목별로 쪼개진 학교 → 목록 반환
            return json(res, 200, {
              school: school.name,
              mode: "list",
              files: docs.map((d) => ({ seq: d.seq, filename: d.filename, sizeKB: d.sizeKB })),
            });
          }
          const targets = all ? docs : [seq ? docs.find((d) => d.seq === seq) ?? docs[0] : docs[0]];
          const sections: string[] = [];
          for (const t of targets) {
            const r = await fetchEvaluationBySeq(downloadParams, t);
            const parts = [`## 📄 ${r.filename}`];
            if (r.evaluationSections.length) {
              parts.push(`\n### 🎯 수행평가 관련\n`, r.evaluationSections.join("\n\n---\n\n"));
            }
            parts.push(`\n<details><summary>전체 문서 보기</summary>\n\n${r.markdown}\n</details>`);
            sections.push(parts.join("\n"));
          }
          return json(res, 200, {
            school: school.name,
            mode: "doc",
            markdown: sections.join("\n\n"),
          });
        } catch (e: any) {
          return json(res, 200, {
            school: school.name,
            mode: "doc",
            markdown: `> ⚠️ 자동 조회 실패: ${e.message}\n\n${evaluationGuide(school, year)}`,
          });
        }
      }

      return json(res, 404, { error: "알 수 없는 API" });
    }

    res.writeHead(404, SECURITY_HEADERS).end("Not Found");
  } catch (e: any) {
    // 상세는 서버 로그에만, 사용자에겐 일반 메시지 (정보 노출 방지)
    console.error("[server error]", e?.message ?? e);
    json(res, 500, { error: "일시적인 오류가 발생했습니다. 잠시 후 다시 시도하세요." });
  }
});

server.listen(PORT, () => {
  console.log(`schoolinfo 웹앱: http://localhost:${PORT}`);
  if (!process.env.SCHOOLINFO_API_KEY) console.warn("⚠️ SCHOOLINFO_API_KEY 미설정 — API 비활성");
});
