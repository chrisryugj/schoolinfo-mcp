# schoolinfo-mcp

**학교알리미(schoolinfo.go.kr) 공시정보 MCP 서버 + CLI**
— 학부모가 *내 아이 학교*의 급식·학생수·방과후·동아리, 그리고 **수행평가 계획**을 쉽게 확인하도록.

> 전국 모든 초·중·고의 공시정보가 학교알리미에 공개돼 있습니다. 이 도구는
> 학교알리미 **OpenAPI**(정형 데이터 35종)와 [**kordoc**](https://github.com/chrisryugj/kordoc)(hwp→마크다운)을
> 묶어서, 매번 사이트를 헤매지 않고 한 줄로 조회·요약·변경알림까지 받게 해줍니다.

## 무엇을 할 수 있나

| 기능 | 설명 |
|------|------|
| 🔍 학교 검색 | 시도·시군구·학교급·이름으로 학교 찾기 |
| 📊 공시 조회 | 급식/학생수/교원/동아리/방과후/상담/학교폭력예방 등 **35종** |
| 👪 학부모 다이제스트 | 자주 보는 핵심 공시를 한 번에 모아보기 |
| 📋 평가계획(수행평가) | hwp 첨부 위치 안내 + 받은 hwp를 **kordoc으로 파싱**해 수행평가 섹션 추출 |
| 🔔 자동 알림 | 공시 변경 감지 → Windows 토스트 알림 (스케줄러 연동) |

> ⚠️ **수행평가 주제·평가기준**(교과별 교수·학습 및 평가 운영 계획)은 학교알리미
> OpenAPI에 **없고 hwp 첨부파일로만** 공시됩니다. 그래서 이 도구는 ① 찾아가는 경로를
> 안내하고 ② 받은 hwp/hwpx/pdf를 마크다운으로 변환·요약합니다.

## 설치

```bash
npm install
npm run build
```

## 인증키 발급 (필수)

1. https://www.schoolinfo.go.kr/ng/go/pnnggo_a01_m0.do 접속
2. 네이버/카카오 로그인 후 OpenAPI 인증키 신청 (무료, 즉시 발급)
3. 환경변수로 설정:

```bash
# .env.local 파일 또는 환경변수
SCHOOLINFO_API_KEY=발급받은_인증키
```

## CLI 사용

```bash
# 학교 검색
schoolinfo search 서울 강남구 중학교 개포

# 학부모 핵심 공시 모아보기
schoolinfo digest 서울 강남구 중학교 개포중학교

# 특정 공시 (항목명 또는 코드)
schoolinfo get 서울 강남구 중학교 개포중학교 급식
schoolinfo get 서울 강남구 중학교 개포중학교 동아리 2026

# 수행평가 계획 찾는 법 안내
schoolinfo eval 서울 강남구 중학교 개포중학교

# 받은 평가계획 hwp → 마크다운 + 수행평가 섹션 추출
schoolinfo parse "C:\Downloads\2026_1학기_평가계획.hwp"

# 변경 감지 + 알림 (스케줄러용)
schoolinfo check 서울 강남구 중학교 개포중학교
```

## MCP 서버로 사용 (Claude Desktop / Cursor)

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "schoolinfo": {
      "command": "node",
      "args": ["C:/github_project/schoolinfo-mcp/dist/mcp.js"],
      "env": { "SCHOOLINFO_API_KEY": "발급받은_인증키" }
    }
  }
}
```

제공 도구: `search_school`, `list_disclosure_types`, `get_disclosure`,
`get_parent_digest`, `get_evaluation_guide`, `parse_evaluation_file`

그러면 Claude에게 이렇게 물어볼 수 있습니다:
> "개포중학교 급식이랑 동아리 현황 알려줘"
> "이 평가계획 hwp 파일에서 우리 애 학년 수행평가만 정리해줘"

## 자동 알림 (매일/매주 팝업)

비개발자도 OS 스케줄러로 주기 실행하면 됩니다.

**Windows 작업 스케줄러** — 매일 오전 8시 변경 확인:

```powershell
schtasks /create /tn "학교알리미체크" /sc daily /st 08:00 ^
  /tr "node C:\github_project\schoolinfo-mcp\dist\cli.js check 서울 강남구 중학교 개포중학교"
```

공시가 바뀌면 토스트 알림이 뜹니다. (변경 없으면 조용히 넘어감)

**macOS/Linux cron** — 매주 월요일 8시:

```cron
0 8 * * 1 SCHOOLINFO_API_KEY=... node /path/dist/cli.js check 서울 강남구 중학교 개포중학교
```

## 아키텍처

```
학교알리미 OpenAPI ─┐
 (35종 정형 JSON)   ├─→ SchoolInfoClient ─→ MCP 도구 / CLI
                    │
평가계획 hwp 첨부 ──┘─→ kordoc(parse) ─→ 수행평가 섹션 추출
```

| 모듈 | 역할 |
|------|------|
| `src/client.ts` | 학교알리미 OpenAPI 클라이언트 (학교검색 + 공시조회) |
| `src/codes.ts` | 시도/시군구/학교급/공시항목 코드 매핑 |
| `src/evaluation.ts` | 평가계획 안내 + kordoc 기반 hwp 파싱·수행평가 추출 |
| `src/regions.json` | 17개 시도·257개 시군구 행정코드 (xlsx 추출) |
| `src/labels.json` | 35종 공시항목 컬럼ID→한글 라벨 (xlsx 추출) |
| `src/mcp.ts` | MCP 서버 (stdio) |
| `src/cli.ts` | CLI + 변경감지 알림 |

## 라이선스

MIT · 데이터 출처: 학교알리미(schoolinfo.go.kr), 공공누리 제1유형(출처표시)
