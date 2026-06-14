// 학교알리미 웹앱 — fly.io 배포용 HTTP 서버
//
// 인증키는 서버 환경변수(SCHOOLINFO_API_KEY)에 두므로 접속자는 키가 필요 없다.
// 학부모가 브라우저에서 학교 검색 → 공시/수행평가 계획을 바로 확인.

import http from "http";
import { createClient, formatSchool, formatDisclosure, getParentDigest, REGIONS } from "./index.js";
import { SCHOOL_KIND, SchoolKindName } from "./codes.js";
import { autoFetchEvaluation, evaluationGuide } from "./evaluation.js";
import { renderPage } from "./web.js";

const PORT = Number(process.env.PORT) || 8080;

function json(res: http.ServerResponse, code: number, data: any) {
  const body = JSON.stringify(data);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const q = url.searchParams;

    // 헬스체크
    if (url.pathname === "/health") return json(res, 200, { ok: true });

    // 메인 페이지
    if (url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(renderPage(REGIONS, Object.keys(SCHOOL_KIND)));
    }

    // API: 키 확인
    if (url.pathname.startsWith("/api/")) {
      if (!process.env.SCHOOLINFO_API_KEY) {
        return json(res, 500, { error: "서버에 SCHOOLINFO_API_KEY가 설정되지 않았습니다." });
      }
      const client = createClient();
      const sido = q.get("sido") ?? "";
      const sgg = q.get("sgg") ?? "";
      const kind = (q.get("kind") ?? "중학교") as SchoolKindName;
      const name = q.get("name") ?? "";
      const year = q.get("year") ? Number(q.get("year")) : undefined;

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
      if (url.pathname === "/api/evaluation") {
        const school = await resolve();
        if (!school) return json(res, 404, { error: "학교를 찾을 수 없습니다." });
        try {
          const results = await autoFetchEvaluation(school, year);
          const md = results
            .map((r) => {
              const parts = [`## 📄 ${r.filename}`];
              if (r.evaluationSections.length) {
                parts.push(`\n### 🎯 수행평가 관련\n`, r.evaluationSections.join("\n\n---\n\n"));
              }
              parts.push(`\n<details><summary>전체 문서 보기</summary>\n\n${r.markdown}\n</details>`);
              return parts.join("\n");
            })
            .join("\n\n");
          return json(res, 200, { school: school.name, markdown: md });
        } catch (e: any) {
          return json(res, 200, {
            school: school.name,
            markdown: `> ⚠️ 자동 조회 실패: ${e.message}\n\n${evaluationGuide(school, year)}`,
          });
        }
      }

      return json(res, 404, { error: "알 수 없는 API" });
    }

    res.writeHead(404).end("Not Found");
  } catch (e: any) {
    json(res, 500, { error: e?.message ?? "서버 오류" });
  }
});

server.listen(PORT, () => {
  console.log(`schoolinfo 웹앱: http://localhost:${PORT}`);
  if (!process.env.SCHOOLINFO_API_KEY) console.warn("⚠️ SCHOOLINFO_API_KEY 미설정 — API 비활성");
});
