# CLAUDE.md

## ⚠️ 배포 — 통합 호스트 (2026-07-02부터)

프로덕션 공식 서빙은 **[gomdori-mcp](https://github.com/chrisryugj/gomdori-mcp) 통합 호스트**(fly 앱 `korean-law-mcp` 1대, MCP 5종 동거)다.

- 공식 주소: `https://mcp.gomdori.app/school` (MCP 엔드포인트. `/school/xyz`는 프리픽스만 벗겨 전달)
- 구 fly 앱 `school-mcp`는 **중단 상태**(`fly scale count 0`, 주소·앱은 보존) — 복구는 `fly scale count 1 -a school-mcp`
- **반영 절차**: npm이 구버전(0.2.0)이라 GitHub 빌드 — main에 커밋·푸시한 뒤 `cd ~/workspace/gomdori-mcp && fly deploy -c fly.production.toml` (Dockerfile이 GitHub main을 clone→tsup 빌드) → `curl https://mcp.gomdori.app/healthz` 확인
- 웹 UI 루트(`/`)는 통합 경로에서 `/school` = MCP로 매핑되므로 접근 불가 — 웹앱 살리려면 별도 결정 필요
- 시크릿 `SCHOOLINFO_API_KEY`·`NEIS_API_KEY`는 korean-law-mcp 앱에 이관돼 있음
