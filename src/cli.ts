// 학교알리미 CLI — 학부모가 터미널/스케줄러에서 사용
//
// 사용법:
//   schoolinfo search <시도> <시군구> <학교급> [학교명]
//   schoolinfo digest <시도> <시군구> <학교급> <학교명>
//   schoolinfo eval   <시도> <시군구> <학교급> <학교명>     # 평가계획 찾기 안내
//   schoolinfo parse  <파일경로>                            # 받은 hwp → 마크다운
//   schoolinfo check  <시도> <시군구> <학교급> <학교명>     # 변경 감지 + 알림(스케줄러용)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { execFile } from "child_process";
import { SchoolInfoClient, School } from "./client.js";
import { SCHOOL_KIND, SchoolKindName, findApiType, API_TYPES } from "./codes.js";
import { formatSchool, formatDisclosure, getParentDigest } from "./index.js";
import { evaluationGuide, parseEvaluationDocument, autoFetchEvaluation, listEvaluationDocs } from "./evaluation.js";

const KINDS = Object.keys(SCHOOL_KIND);
const STATE_DIR = join(homedir(), ".schoolinfo-mcp");

function client(): SchoolInfoClient {
  const key = process.env.SCHOOLINFO_API_KEY;
  if (!key) {
    console.error("❌ 환경변수 SCHOOLINFO_API_KEY가 필요합니다.");
    console.error("   인증키 발급: https://www.schoolinfo.go.kr/ng/go/pnnggo_a01_m0.do");
    process.exit(1);
  }
  return new SchoolInfoClient(key);
}

async function pickSchool(c: SchoolInfoClient, sido: string, sgg: string, kind: SchoolKindName, name: string): Promise<School> {
  const list = await c.searchSchools({ sido, sgg, kind, name });
  if (!list.length) { console.error(`❌ 학교를 찾을 수 없습니다: ${name}`); process.exit(1); }
  return list.find((s) => s.name === name) ?? list[0];
}

/** Windows 토스트 알림 (best-effort). 실패해도 무시. */
function notify(title: string, message: string) {
  if (process.platform !== "win32") { console.log(`🔔 ${title}: ${message}`); return; }
  const ps = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType=WindowsRuntime] | Out-Null
$t = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$texts = $t.GetElementsByTagName("text")
$texts.Item(0).AppendChild($t.CreateTextNode(${JSON.stringify(title)})) | Out-Null
$texts.Item(1).AppendChild($t.CreateTextNode(${JSON.stringify(message)})) | Out-Null
$toast = [Windows.UI.Notifications.ToastNotification]::new($t)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("학교알리미").Show($toast)
`;
  execFile("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], () => {});
  console.log(`🔔 ${title}: ${message}`);
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);

  switch (cmd) {
    case "search": {
      const [sido, sgg, kind, name] = args;
      requireKind(kind);
      const list = await client().searchSchools({ sido, sgg, kind: kind as SchoolKindName, name });
      if (!list.length) { console.log("검색 결과 없음"); break; }
      if (name && list.length === 1) console.log(formatSchool(list[0]));
      else list.forEach((s) => console.log(`- ${s.name} (${s.foundation}, ${s.address})`));
      break;
    }
    case "digest": {
      const [sido, sgg, kind, name] = args;
      requireKind(kind); requireName(name);
      const c = client();
      const school = await pickSchool(c, sido, sgg, kind as SchoolKindName, name);
      console.log(formatSchool(school), "\n");
      const digest = await getParentDigest(c, school);
      for (const d of digest) console.log(formatDisclosure(d.name, d.rows, d.apiType), "\n");
      break;
    }
    case "get": {
      const [sido, sgg, kind, name, item, year] = args;
      requireKind(kind); requireName(name);
      const c = client();
      const school = await pickSchool(c, sido, sgg, kind as SchoolKindName, name);
      let apiType = item;
      if (!API_TYPES[item]) {
        const m = findApiType(item ?? "");
        if (!m.length) { console.error(`알 수 없는 항목: ${item}`); process.exit(1); }
        apiType = m[0].code;
      }
      let y: number | undefined;
      if (year) { y = Number(year); if (!Number.isInteger(y)) { console.error(`잘못된 연도: ${year}`); process.exit(1); } }
      const r = await c.getDisclosure(school, apiType, y);
      console.log(formatDisclosure(r.name, r.rows, apiType));
      break;
    }
    case "eval": {
      const [sido, sgg, kind, name, ...rest] = args;
      requireKind(kind); requireName(name);
      const all = rest.includes("all");
      const yearArg = rest.find((a) => /^\d{4}$/.test(a));
      const year = yearArg ? Number(yearArg) : undefined;
      const c = client();
      const school = await pickSchool(c, sido, sgg, kind as SchoolKindName, name);
      try {
        // 과목별로 나뉜 학교는 목록 먼저 안내
        const { docs } = await listEvaluationDocs(school, year);
        if (docs.length > 1 && !all) {
          console.log(`📋 ${school.name} 평가계획 파일 ${docs.length}개 (과목별):\n`);
          docs.forEach((d) => console.log(`  - ${d.filename}${d.sizeKB ? ` (${d.sizeKB}KB)` : ""}`));
          console.log(`\n전체를 보려면 명령 끝에 'all'을 붙이세요. 예: eval ${sido} ${sgg} ${kind} ${name} all`);
          break;
        }
        const results = await autoFetchEvaluation(school, year, { all });
        for (const r of results) {
          console.log(`\n## 📄 ${r.filename} (${r.fileType})\n`);
          if (r.evaluationSections.length) {
            console.log(`### 🎯 수행평가 관련 (${r.evaluationSections.length}개)\n`);
            console.log(r.evaluationSections.join("\n\n---\n\n"));
          } else {
            console.log(r.markdown);
          }
          if (r.needsOcr) console.log(`\n⚠️ 본문 추출이 빈약합니다(이미지 PDF 추정).\n${evaluationGuide(school, year)}`);
        }
      } catch (e: any) {
        console.error(`⚠️ 자동 조회 실패: ${e.message}\n`);
        console.log(evaluationGuide(school, year));
      }
      break;
    }
    case "parse": {
      const [file] = args;
      if (!file) { console.error("파일 경로가 필요합니다"); process.exit(1); }
      const buf = readFileSync(file);
      const r = await parseEvaluationDocument(buf, file);
      if (r.evaluationSections.length) {
        console.log(`## 🎯 수행평가 관련 (${r.evaluationSections.length}개 섹션)\n`);
        console.log(r.evaluationSections.join("\n\n---\n\n"));
        console.log("\n\n===== 전체 문서 =====\n");
      }
      console.log(r.markdown);
      break;
    }
    case "check": {
      const [sido, sgg, kind, name] = args;
      requireKind(kind); requireName(name);
      await runCheck(sido, sgg, kind as SchoolKindName, name);
      break;
    }
    default:
      printHelp();
  }
}

/** 공시 변경 감지 — 이전 스냅샷과 비교해 달라지면 알림 */
async function runCheck(sido: string, sgg: string, kind: SchoolKindName, name: string) {
  const c = client();
  const school = await pickSchool(c, sido, sgg, kind, name);
  const digest = await getParentDigest(c, school);
  const snapshot = JSON.stringify(digest.map((d) => ({ n: d.name, r: d.rows })));

  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
  const key = `${school.schoolCode}.json`.replace(/[^\w.]/g, "_");
  const file = join(STATE_DIR, key);
  const prev = existsSync(file) ? readFileSync(file, "utf8") : "";

  if (prev && prev !== snapshot) {
    const changed = digest
      .filter((d, i) => {
        const p = prev ? JSON.parse(prev)[i] : null;
        return !p || JSON.stringify(p.r) !== JSON.stringify(d.rows);
      })
      .map((d) => d.name);
    notify(`${school.name} 공시 변경`, `변경 항목: ${changed.join(", ") || "확인 필요"}`);
  } else if (!prev) {
    notify(`${school.name} 모니터링 시작`, "최초 스냅샷 저장 완료");
  } else {
    console.log(`변경 없음 — ${school.name}`);
  }
  writeFileSync(file, snapshot);
}

function requireKind(kind?: string) {
  if (!kind || !KINDS.includes(kind)) {
    console.error(`❌ 학교급은 다음 중 하나: ${KINDS.join(", ")}`);
    process.exit(1);
  }
}
function requireName(name?: string) {
  if (!name) { console.error("❌ 학교명이 필요합니다"); process.exit(1); }
}

function printHelp() {
  console.log(`학교알리미 CLI — 내 아이 학교 공시정보 조회

사용법:
  schoolinfo search <시도> <시군구> <학교급> [학교명]   학교 검색
  schoolinfo digest <시도> <시군구> <학교급> <학교명>   학부모 핵심 공시 모아보기
  schoolinfo get    <시도> <시군구> <학교급> <학교명> <항목> [연도]   특정 공시
  schoolinfo eval   <시도> <시군구> <학교급> <학교명>   평가계획(수행평가) 찾기 안내
  schoolinfo parse  <hwp파일경로>                       받은 평가계획 → 마크다운
  schoolinfo check  <시도> <시군구> <학교급> <학교명>   변경 감지 + 알림(스케줄러용)

학교급: ${KINDS.join(", ")}

예시:
  schoolinfo digest 서울 강남구 중학교 개포중학교
  schoolinfo eval 서울 강남구 중학교 개포중학교
  schoolinfo check 서울 강남구 중학교 개포중학교

환경변수: SCHOOLINFO_API_KEY (인증키)`);
}

main().catch((e) => { console.error("오류:", e.message); process.exit(1); });
