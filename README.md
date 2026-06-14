# schoolinfo-mcp

**학교알리미(schoolinfo.go.kr) 공시정보 MCP 서버 + CLI + 웹앱**
— 학부모가 *내 아이 학교*의 급식·학생수·방과후·동아리, 그리고 **수행평가 계획**을 쉽게 확인하도록.

> 전국 모든 초·중·고의 공시정보가 학교알리미에 공개돼 있습니다. 이 도구는
> 학교알리미 **OpenAPI**(정형 데이터 35종)와 [**kordoc**](https://github.com/chrisryugj/kordoc)(hwp→마크다운)을
> 묶어서, 매번 사이트를 헤매지 않고 학교명만으로 조회·요약·**수행평가 자동 추출**까지 받게 해줍니다.

## 무엇을 할 수 있나

| 기능 | 설명 |
|------|------|
| 🔍 학교 검색 | 시도·시군구·학교급·이름으로 학교 찾기 |
| 📊 공시 조회 | 급식/학생수/교원/동아리/방과후/상담/학교폭력예방 등 **35종** |
| 👪 학부모 다이제스트 | 자주 보는 핵심 공시를 한 번에 모아보기 |
| 📋 **수행평가 계획 자동 조회** | 학교명만 넣으면 평가계획 hwp를 **자동 다운로드 → kordoc 파싱 → 수행평가 표(과목·반영비율·시기) 추출** |
| 🌐 웹앱 | 브라우저에서 클릭 몇 번으로 (fly.io 배포, 인증키는 서버에) |
| 🔔 자동 알림 | 공시 변경 감지 → Windows 토스트 알림 (스케줄러 연동) |

### 🎯 핵심: 수행평가 계획 자동화

"교과별(학년별) 교수·학습 및 평가 운영 계획"은 학교알리미 OpenAPI에 **없고 hwp 첨부로만** 공시됩니다.
이 도구는 학교알리미 학교별 공시정보의 내부 요청을 그대로 재현해서 **브라우저 없이 순수 HTTP로**
평가계획 hwp/hwpx를 자동 내려받고, kordoc으로 파싱해 수행평가 표를 뽑아줍니다.

```
OpenAPI(학교식별코드) → POST 평가계획 항목 → hwp/hwpx 다운로드 → kordoc 파싱 → 수행평가 표
```

실제 추출 예 (개포중학교 2026):

| 과목 | 영역 | 유형 | 반영비율 |
|------|------|------|---------|
| 국어 | 말하기·듣기/매체 활동 | 정기시험(중간·기말) 선택형 | 30% |
| … | … | … | … |

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

## CLI 사용 (실제 동작 예시)

아래는 인증키를 설정한 뒤 **실제로 실행한 출력**입니다.

### 학교 검색

```bash
$ schoolinfo search 서울 강남구 중학교 개포
```
```markdown
## 개포중학교 (중학교)

| 항목 | 내용 |
|------|------|
| 설립 | 공립 |
| 교육청 | 서울특별시교육청 |
| 주소 | 서울특별시 강남구 선릉로 9 |
| 전화 | 02-2138-1631 |
| 홈페이지 | https://gaepo.sen.ms.kr |
| 학교코드 | S010000699 |
```

### 특정 공시 — 급식

```bash
$ schoolinfo get 서울 강남구 중학교 개포중학교 급식
```
```markdown
### 급식 실시 현황

| 항목 | 값 |
|------|------|
| 학교과정구분명(초-중-고) | 중 |
| 급식학생수 | 1090 |
| 전체학생수 | 1090 |
| 설립구분 | 공립 |
| 급식담당인력(명) - 영양(교)사 | 1 |
| 배식장소 - 배식장소(식당) | ○ |
| 운영방식 - 급식종류 | 직영 |
| 운영방식 - 직영급식 | ○ |
| 급식담당인력(명) - 조리사 | 1 |
| 급식비율 | 100 |
| 급식담당인력(명) - 조리원 | 9 |
```

### 학년별·학급별 학생수 (`get ... 학년별`)

```markdown
### 학년별·학급별 학생수

| 항목 | 값 |
|------|------|
| 1학년 학생수 | 300 |
| 2학년 학생수 | 374 |
| 3학년 학생수 | 410 |
| 총계 학생수 | 1090 |
| 총계 학급수 | 37 |
| 총계 교사수 | 63 |
| 총계 학급당 학생수 | 29.5 |
| 총계 수업교원 1인당 학생수 | 17.3 |
```

### 수행평가 계획 자동 조회 (hwp 자동 다운로드 + 파싱)

```bash
$ schoolinfo eval 서울 강남구 중학교 개포중학교
```
```markdown
## 📄 2026학년도 개포중 학교교육과정 편성 운영 및 교수학습 평가 계획.hwpx (hwpx)

### 🎯 수행평가 관련 (3개)

| 과목 | 1학기 | 2학기 | 반영비율(%) | 만점 |
|------|-------|-------|------------|------|
| 국어 | 말하기·듣기 매체 활동 / 정기시험 중간·기말(선택형) | … | 30 | 100 |
| …  | … | … | … | … |
```
> 학교명만 넣으면 학교알리미에서 평가계획 hwp를 자동으로 내려받아 kordoc으로 변환합니다.
> (자동 조회 실패 시 수동으로 찾는 경로를 안내합니다)

### 그 외 명령

```bash
schoolinfo digest 서울 강남구 중학교 개포중학교       # 핵심 공시 모아보기
schoolinfo parse "C:\Downloads\2026_평가계획.hwp"     # 받은 hwp → 마크다운 + 수행평가 추출
schoolinfo check 서울 강남구 중학교 개포중학교         # 변경 감지 + 알림 (스케줄러용)
```

## 웹앱으로 사용 (브라우저, 인증키 불필요)

학부모(비개발자)가 가장 쉽게 쓰는 방법. 인증키는 서버에만 두면 접속자는 URL만 알면 됩니다.

### 로컬 실행

```bash
SCHOOLINFO_API_KEY=발급키 npm run serve   # http://localhost:8080
```

### fly.io 배포 (키는 secret으로)

```bash
fly auth login                              # 최초 1회 (브라우저 로그인)
fly launch --no-deploy                      # 앱 생성 (fly.toml 자동 인식)
fly secrets set SCHOOLINFO_API_KEY=발급키   # 인증키를 secret으로 안전하게 주입
fly deploy                                  # 배포
```

배포 후 `https://<앱이름>.fly.dev` 에서 시도/시군구/학교명 선택 → **수행평가 계획** 버튼이면 끝.
hwp/hwpx 파싱은 순수 JS라 Chromium 등 무거운 의존성이 없어 512MB 머신으로 충분합니다.

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
`get_parent_digest`, `get_evaluation_plan`(수행평가 자동 조회), `parse_evaluation_file`

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
| `src/evaluation.ts` | **평가계획 hwp 자동 다운로드** + kordoc 파싱·수행평가 추출 |
| `src/regions.json` | 17개 시도·257개 시군구 행정코드 (xlsx 추출) |
| `src/labels.json` | 35종 공시항목 컬럼ID→한글 라벨 (xlsx 추출) |
| `src/mcp.ts` | MCP 서버 (stdio) |
| `src/cli.ts` | CLI + 변경감지 알림 |
| `src/server.ts` + `src/web.ts` | 웹앱 HTTP 서버 + 단일 페이지 UI (fly 배포) |

## 라이선스

MIT · 데이터 출처: 학교알리미(schoolinfo.go.kr), 공공누리 제1유형(출처표시)
