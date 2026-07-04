# CLAUDE.md

## ⚠️ 배포 — 두 갈래 (MCP는 fly 통합호스트, 웹앱은 Vercel)

### 웹앱 — Vercel `school.gomdori.app` (2026-07-04부터)
공식 웹앱(브라우저용 UI + `/api/*` + `/mcp`)은 **Vercel 프로젝트 `schoolinfo-mcp`**로 서빙. 주소 **`https://school.gomdori.app`**.

- **함정**: 이 패키지는 npm 라이브러리(`main: ./dist/index.js`)를 겸해서, Vercel 기본 감지(`framework: node`)가 라이브러리 진입점을 서버 함수로 오인 → `FUNCTION_INVOCATION_FAILED`("Invalid export"). 그래서 `vercel.json`에 **`framework: null` + `functions."api/index.ts"` 단일 함수**로 고정하고, 전 경로를 `rewrites`로 `/api/index?__vpath=/$1`에 실어 보낸 뒤 `api/index.ts`에서 원경로 복원(고정 destination rewrite는 `req.url`을 덮어씀).
- **반영 절차**: main 커밋·푸시 후 `cd ~/workspace/schoolinfo-mcp && vercel build --prod && vercel deploy --prebuilt --prod` (클라우드 빌드는 감지 이슈로 불안정 → **로컬 빌드 후 `--prebuilt` 업로드가 정석**) → `curl https://school.gomdori.app/health` 확인
- env: `SCHOOLINFO_API_KEY`·`NEIS_API_KEY`가 Vercel 프로젝트(production/preview)에 등록돼 있음
- **파싱 성능 주의**: 큰 수행평가 hwpx(1.6MB)가 서버리스에서 13~18초(로컬 1.2초). memory 상향은 무효 확인 → 병목은 학교알리미 다운로드(외부). maxDuration 60(기본 300s)라 타임아웃은 안 남
- 지역코드: `src/regions.json`은 2026 개편(전남광주통합특별시·인천 신설구·화성 분구)을 **union**으로 반영 — 학교알리미 API가 과도기라 구(광주광역시/전라남도)·신(전남광주통합특별시) 명칭을 섞어 주므로 both 유지해야 브릿지가 안 깨짐

### MCP — fly 통합 호스트 (2026-07-02부터)
MCP 전용 서빙은 **[gomdori-mcp](https://github.com/chrisryugj/gomdori-mcp) 통합 호스트**(fly 앱 `korean-law-mcp` 1대, MCP 5종 동거).

- MCP 주소: `https://mcp.gomdori.app/school` (MCP 엔드포인트. `/school/xyz`는 프리픽스만 벗겨 전달)
- 구 fly 앱 `school-mcp`는 **중단 상태**(`fly scale count 0`, 주소·앱은 보존) — 복구는 `fly scale count 1 -a school-mcp`
- **반영 절차**: main에 커밋·푸시한 뒤 `cd ~/workspace/gomdori-mcp && fly deploy -c fly.production.toml` (Dockerfile이 GitHub main을 clone→tsup 빌드) → `curl https://mcp.gomdori.app/healthz` 확인
- 시크릿 `SCHOOLINFO_API_KEY`·`NEIS_API_KEY`는 korean-law-mcp 앱에도 이관돼 있음
