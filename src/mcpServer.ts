// 학교알리미 MCP 서버 구성 (도구 등록) — stdio / 원격 HTTP 양쪽에서 재사용.
//
// 학부모는 학교코드를 몰라도 됨: 시도/시군구/학교명만 입력하면 내부에서 해결.
//
// buildMcpServer()는 전송수단(transport)에 묶이지 않은 McpServer를 반환한다.
//  - stdio(로컬): mcp.ts에서 StdioServerTransport로 연결
//  - 원격(fly):   server.ts에서 StreamableHTTPServerTransport로 연결
//
// localFiles=false(원격)면 서버 로컬 파일을 읽는 parse_evaluation_file은 등록하지 않는다
// (공개 엔드포인트에서 서버 파일시스템 접근 도구를 노출하지 않기 위함).

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync, statSync, realpathSync } from "fs";
import { resolve, extname } from "path";
import { SchoolInfoClient, School, searchSchoolsByName } from "./client.js";
import { API_TYPES, SCHOOL_KIND, SchoolKindName, findApiType, resolveSido } from "./codes.js";
import { formatSchool, formatDisclosure, getParentDigest, getAreaReport, formatAreaReport } from "./index.js";
import {
  findNeisSchool, fetchSchedule, hasNeisKey, currentAcademicYear, formatSchedule,
  fetchMeal, formatMeal, parseAvoid, todayKstYmd, addDaysYmd,
  fetchTimetable, weekRange, formatWeek, upcomingHighlights,
  fetchAreaExams, formatExamCalendar,
} from "./neis.js";
import {
  evaluationGuide,
  parseEvaluationDocument,
  autoFetchEvaluation,
  listEvaluationDocs,
} from "./evaluation.js";
import {
  findAdmissionUniversity,
  searchAdmissionMajors,
  formatAdmission,
  listAdmissionUniversities,
} from "./admission.js";

const KINDS = Object.keys(SCHOOL_KIND) as [SchoolKindName, ...SchoolKindName[]];
const ALLOWED_EXT = new Set([".hwp", ".hwpx", ".hwpml", ".pdf", ".xlsx", ".xls", ".docx"]);
const MAX_FILE_SIZE = 200 * 1024 * 1024;
/** 시험 캘린더 다학교 NEIS 조회 상한 — 응답 지연·rate 방어 */
const MAX_EXAM_SCHOOLS = 20;

function getClient(): SchoolInfoClient {
  const key = process.env.SCHOOLINFO_API_KEY;
  if (!key) throw new Error("환경변수 SCHOOLINFO_API_KEY가 설정되지 않았습니다.");
  return new SchoolInfoClient(key);
}

/** 시도/시군구/학교급/이름 → 첫 매칭 학교 (없으면 에러, 여러개면 목록 안내) */
async function resolveSchool(
  client: SchoolInfoClient,
  sido: string,
  sgg: string,
  kind: SchoolKindName,
  name: string
): Promise<{ school?: School; many?: School[] }> {
  const list = await client.searchSchools({ sido, sgg, kind, name });
  if (list.length === 0) return {};
  if (list.length > 1) {
    const exact = list.find((s) => s.name === name);
    if (exact) return { school: exact };
    return { many: list };
  }
  return { school: list[0] };
}

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}
function err(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

/**
 * 모든 도구가 등록된 McpServer를 생성한다 (transport 미연결).
 * @param opts.localFiles 서버 로컬 파일을 읽는 도구(parse_evaluation_file) 등록 여부. 기본 true.
 */
export function buildMcpServer(opts: { localFiles?: boolean } = {}): McpServer {
  const localFiles = opts.localFiles !== false;
  const server = new McpServer({ name: "schoolinfo-mcp", version: "0.2.0" });

  // ─── 0. 학교명 전국 검색 (지역/학교급 몰라도 됨) ────────
  server.tool(
    "find_school",
    "학교명만으로 전국에서 학교를 찾습니다. 시도·시군구를 몰라도 됩니다. 결과의 지역·학교급으로 다른 도구(get_parent_digest, get_evaluation_plan 등)를 바로 호출하세요.",
    {
      name: z.string().describe("학교명 또는 일부 (예: 개포중, 한밭초)"),
    },
    async ({ name }) => {
      try {
        const hits = await searchSchoolsByName(name);
        if (!hits.length) return ok(`검색 결과가 없습니다: "${name}" (2글자 이상 입력)`);
        const lines = hits.map(
          (s) => `- ${s.name} — ${s.sido} ${s.sgg} · ${s.kind} · ${s.foundation}`
        );
        return ok(`"${name}" 검색 결과 ${hits.length}개:\n\n` + lines.join("\n"));
      } catch (e: any) {
        return err(`오류: ${e.message}`);
      }
    }
  );

  // ─── 1. 학교 검색 (지역 기반) ───────────────────────────
  server.tool(
    "search_school",
    "학교알리미에서 학교를 검색합니다. 시도·시군구·학교급·학교명으로 찾아 학교 기본정보를 반환합니다.",
    {
      sido: z.string().describe("시도명 (예: 서울특별시, 경기도, 부산광역시 — 약칭 '서울'도 가능)"),
      sgg: z.string().describe("시군구명 (예: 강남구, 수원시 장안구, 해운대구)"),
      kind: z.enum(KINDS).describe("학교급"),
      name: z.string().optional().describe("학교명 (부분 일치, 생략 시 지역 전체 목록)"),
    },
    async ({ sido, sgg, kind, name }) => {
      try {
        const client = getClient();
        const list = await client.searchSchools({ sido, sgg, kind, name });
        if (!list.length) return ok(`검색 결과가 없습니다: ${sido} ${sgg} ${kind} ${name ?? ""}`);
        if (list.length === 1) return ok(formatSchool(list[0]));
        const head = `검색 결과 ${list.length}개:\n\n`;
        return ok(head + list.map((s) => `- ${s.name} (${s.foundation}, ${s.address})`).join("\n"));
      } catch (e: any) {
        return err(`오류: ${e.message}`);
      }
    }
  );

  // ─── 2. 공시항목 목록 ───────────────────────────────────
  server.tool(
    "list_disclosure_types",
    "조회 가능한 학교알리미 공시정보 항목(급식·학생수·교원·동아리·방과후 등 35종) 목록을 반환합니다.",
    {},
    async () => {
      const lines = Object.entries(API_TYPES).map(([code, name]) => `- ${name} (코드 ${code})`);
      return ok(
        "조회 가능한 공시정보 항목:\n\n" +
          lines.join("\n") +
          "\n\n※ 수행평가 주제·평가기준(교과별 교수·학습 및 평가계획)은 OpenAPI에 없으며, get_evaluation_plan을 사용하세요." +
          "\n※ 학사일정(시험·방학 등)도 공시에 없으며, get_school_schedule을 사용하세요."
      );
    }
  );

  // ─── 3. 특정 공시정보 조회 ──────────────────────────────
  server.tool(
    "get_disclosure",
    "특정 학교의 특정 공시정보를 조회합니다. 항목명(예: '급식', '학생수', '동아리')으로 찾습니다.",
    {
      sido: z.string(),
      sgg: z.string(),
      kind: z.enum(KINDS),
      name: z.string().describe("학교명"),
      item: z.string().describe("공시항목명 또는 코드 (예: 급식, 학년별·학급별 학생수, 09)"),
      year: z.number().optional().describe("공시연도 (기본: 올해)"),
    },
    async ({ sido, sgg, kind, name, item, year }) => {
      try {
        const client = getClient();
        const { school, many } = await resolveSchool(client, sido, sgg, kind, name);
        if (many) return ok(`여러 학교가 검색됨. 정확한 이름을 지정하세요:\n` + many.map((s) => `- ${s.name}`).join("\n"));
        if (!school) return ok(`학교를 찾을 수 없습니다: ${name}`);

        // 항목 해석: 코드면 그대로, 이름이면 검색
        let apiType = item;
        if (!API_TYPES[item]) {
          const matches = findApiType(item);
          if (!matches.length) return ok(`알 수 없는 공시항목: "${item}". list_disclosure_types로 목록을 확인하세요.`);
          if (matches.length > 1)
            return ok(`여러 항목이 매칭됨:\n` + matches.map((m) => `- ${m.name} (${m.code})`).join("\n"));
          apiType = matches[0].code;
        }

        const { name: itemName, rows } = await client.getDisclosure(school, apiType, year);
        return ok(`# ${school.name} — ${itemName}\n\n` + formatDisclosure(itemName, rows, apiType));
      } catch (e: any) {
        return err(`오류: ${e.message}`);
      }
    }
  );

  // ─── 4. 학부모 다이제스트 ───────────────────────────────
  server.tool(
    "get_parent_digest",
    "학부모가 자주 보는 핵심 공시(학생수·급식·방과후·동아리·상담·학교폭력예방)를 한 번에 모아 보여줍니다.",
    {
      sido: z.string(),
      sgg: z.string(),
      kind: z.enum(KINDS),
      name: z.string().describe("학교명"),
      year: z.number().optional(),
    },
    async ({ sido, sgg, kind, name }) => {
      try {
        const client = getClient();
        const { school, many } = await resolveSchool(client, sido, sgg, kind, name);
        if (many) return ok(`여러 학교가 검색됨:\n` + many.map((s) => `- ${s.name}`).join("\n"));
        if (!school) return ok(`학교를 찾을 수 없습니다: ${name}`);

        const digest = await getParentDigest(client, school);
        const parts = [formatSchool(school), ""];
        for (const d of digest) parts.push(formatDisclosure(d.name, d.rows, d.apiType), "");
        return ok(parts.join("\n"));
      } catch (e: any) {
        return err(`오류: ${e.message}`);
      }
    }
  );

  // ─── 4.5 학사일정 (NEIS 교육정보 개방 API) ─────────────
  // 학교알리미 공시 35종엔 없는 항목. NEIS_API_KEY만으로 동작(학교알리미 키 불필요).
  server.tool(
    "get_school_schedule",
    "학교의 학사일정(시업식·중간/기말고사·방학·체험학습·개교기념일 등)을 NEIS 교육정보 개방 포털에서 조회합니다. 학교알리미 공시 35종엔 없는 항목입니다. 시도·학교명으로 찾고, 동명이교는 시군구로 구분합니다.",
    {
      sido: z.string().describe("시도명 (예: 서울특별시, 경기도 — 약칭 '서울'도 가능)"),
      name: z.string().describe("학교명 (예: 개포중학교)"),
      sgg: z.string().optional().describe("시군구명 (동명이교 구분용, 예: 강남구)"),
      year: z.number().optional().describe("학년도 (기본: 현재 학년도. 한국 학년도는 3월~익년 2월)"),
    },
    async ({ sido, name, sgg, year }) => {
      try {
        if (!hasNeisKey())
          return err("학사일정 조회는 NEIS API 키(NEIS_API_KEY)가 필요합니다. https://open.neis.go.kr 에서 무료 발급 후 설정하세요.");
        const ns = await findNeisSchool(name, resolveSido(sido)?.name ?? sido, sgg);
        if (!ns) return ok(`NEIS에서 학교를 찾지 못했습니다: ${sido} ${name}`);
        const y = year ?? currentAcademicYear();
        const lastFeb = new Date(y + 1, 2, 0).getDate(); // 다음해 2월 말일(윤년 29 포함)
        const items = await fetchSchedule(ns.atptCode, ns.schoolCode, `${y}0301`, `${y + 1}02${lastFeb}`);
        return ok(formatSchedule(ns.name, y, items));
      } catch (e: any) {
        return err(`오류: ${e.message}`);
      }
    }
  );

  // ─── 4.6 급식 식단 (NEIS) ───────────────────────────────
  // 학교알리미 공시의 '급식'(34/35)은 연간 통계. 매일 식단표·알레르기는 NEIS에만 있다.
  server.tool(
    "get_school_meal",
    "학교 급식 식단(요리·알레르기 유발식품·칼로리·영양)을 NEIS 교육정보 개방 포털에서 조회합니다. 학교알리미 공시의 '급식'은 연간 통계일 뿐 매일 식단표는 여기에만 있습니다. avoid에 알레르기(예: ['우유','땅콩'])를 주면 회피/안전 메뉴를 갈라 보여줍니다. 학교급 없이 시도·학교명으로 찾고, 동명이교는 시군구로 구분합니다.",
    {
      sido: z.string().describe("시도명 (예: 서울특별시 — 약칭 '서울'도 가능)"),
      name: z.string().describe("학교명 (예: 개포중학교)"),
      sgg: z.string().optional().describe("시군구명 (동명이교 구분용, 예: 강남구)"),
      date: z.string().optional().describe("기준일 YYYYMMDD (기본: 오늘)"),
      days: z.number().optional().describe("기준일부터 조회할 일수 (기본 1, 최대 31). 7이면 일주일치"),
      avoid: z.array(z.string()).optional().describe("회피할 알레르기 이름/번호 (예: ['우유','땅콩'] 또는 ['2','4'])"),
      nutrition: z.boolean().optional().describe("true면 9대 영양소까지 표시 (기본 칼로리만)"),
    },
    async ({ sido, name, sgg, date, days, avoid, nutrition }) => {
      try {
        if (!hasNeisKey())
          return err("급식 조회는 NEIS API 키(NEIS_API_KEY)가 필요합니다. https://open.neis.go.kr 에서 무료 발급 후 설정하세요.");
        const ns = await findNeisSchool(name, resolveSido(sido)?.name ?? sido, sgg);
        if (!ns) return ok(`NEIS에서 학교를 찾지 못했습니다: ${sido} ${name}`);
        const from = date && /^\d{8}$/.test(date) ? date : todayKstYmd();
        const n = Math.min(Math.max(days ?? 1, 1), 31);
        const items = await fetchMeal(ns.atptCode, ns.schoolCode, from, addDaysYmd(from, n - 1));
        return ok(formatMeal(ns.name, items, { avoid: parseAvoid(avoid), nutrition }));
      } catch (e: any) {
        return err(`오류: ${e.message}`);
      }
    }
  );

  // ─── 4.7 이번주 브리핑 (NEIS 급식+학사일정+D-day, 옵션 시간표) ──
  server.tool(
    "get_school_week",
    "이번주 학교 브리핑 — 급식(주간)·이번주 학사일정·다가오는 시험/방학 D-day를 한 번에 모아 보여줍니다. kind·grade·class를 모두 주면 오늘 시간표도 포함합니다. 학부모가 아침에 한 번 보는 요약용. 학교급 없이 시도·학교명으로 찾습니다.",
    {
      sido: z.string().describe("시도명 (예: 서울특별시 — 약칭 '서울'도 가능)"),
      name: z.string().describe("학교명 (예: 개포중학교)"),
      sgg: z.string().optional().describe("시군구명 (동명이교 구분용)"),
      kind: z.enum(KINDS).optional().describe("학교급 (오늘 시간표 조회용, grade·class와 함께)"),
      grade: z.string().optional().describe("학년 (오늘 시간표용, 예: '1')"),
      class: z.string().optional().describe("반 (오늘 시간표용, 예: '3')"),
    },
    async ({ sido, name, sgg, kind, grade, class: cls }) => {
      try {
        if (!hasNeisKey())
          return err("이번주 브리핑은 NEIS API 키(NEIS_API_KEY)가 필요합니다. https://open.neis.go.kr 에서 무료 발급 후 설정하세요.");
        const ns = await findNeisSchool(name, resolveSido(sido)?.name ?? sido, sgg);
        if (!ns) return ok(`NEIS에서 학교를 찾지 못했습니다: ${sido} ${name}`);
        const today = todayKstYmd();
        const range = weekRange(today);
        const ay = currentAcademicYear();
        const lastFeb = new Date(ay + 1, 2, 0).getDate();
        const [meals, sched] = await Promise.all([
          fetchMeal(ns.atptCode, ns.schoolCode, range.from, range.to),
          fetchSchedule(ns.atptCode, ns.schoolCode, `${ay}0301`, `${ay + 1}02${lastFeb}`),
        ]);
        const weekEvents = sched.filter((e) => e.date >= range.from && e.date <= range.to);
        const upcoming = upcomingHighlights(sched, today);
        let todayTimetable;
        if (kind && grade && cls) {
          try {
            todayTimetable = await fetchTimetable(kind, ns.atptCode, ns.schoolCode, ay, grade, cls, today, today);
          } catch { /* 시간표 미등록/오류는 무시(브리핑 본체는 유지) */ }
        }
        return ok(formatWeek(ns.name, range, { meals, weekEvents, upcoming, todayTimetable, today }));
      } catch (e: any) {
        return err(`오류: ${e.message}`);
      }
    }
  );

  // ─── 4.8 지역 시험 캘린더 (다학교 시험기간 집계, NEIS) ──
  // 학원/학부모: 여러 학교의 중간·기말고사 일정을 한 타임라인으로. names를 주면 그 학교만,
  // 없으면 sgg+kind 지역 전체(상한). NEIS 학사일정에 시험을 등록한 학교만 집계된다.
  server.tool(
    "get_exam_calendar",
    "여러 학교의 시험(중간·기말고사) 일정을 한 캘린더로 모아 보여줍니다. 학원이 '우리 학원 학생들 학교 시험이 언제 몰리나'를 보거나, 학부모가 인근 학교 시험기간을 비교할 때 씁니다. names에 학교명 배열을 주면 그 학교들만, 생략하면 sgg+kind 지역 전체(최대 20개)를 집계합니다. NEIS 학사일정 기반(NEIS_API_KEY 필요).",
    {
      sido: z.string().describe("시도명 (예: 서울특별시 — 약칭 '서울'도 가능)"),
      names: z.array(z.string()).optional().describe("학교명 배열 (예: ['개포중학교','대청중학교']). 생략 시 지역 전체."),
      sgg: z.string().optional().describe("시군구명 (지역 전체 모드에 필수, 동명이교 구분용)"),
      kind: z.enum(KINDS).optional().describe("학교급 (지역 전체 모드에 필수)"),
      year: z.number().optional().describe("학년도 (기본: 현재 학년도)"),
    },
    async ({ sido, names, sgg, kind, year }) => {
      try {
        if (!hasNeisKey())
          return err("시험 캘린더는 NEIS API 키(NEIS_API_KEY)가 필요합니다. https://open.neis.go.kr 에서 무료 발급 후 설정하세요.");
        const sidoName = resolveSido(sido)?.name ?? sido;
        let schoolNames: string[];
        if (names && names.length) {
          schoolNames = names.slice(0, MAX_EXAM_SCHOOLS);
        } else {
          if (!kind || !sgg)
            return err("지역 전체 조회에는 sgg(시군구)와 kind(학교급)가 필요합니다. 또는 names에 학교명 배열을 주세요.");
          const list = await getClient().searchSchools({ sido, sgg, kind });
          if (!list.length) return ok(`${sidoName} ${sgg} ${kind} 학교를 찾지 못했습니다.`);
          schoolNames = list.map((s) => s.name).slice(0, MAX_EXAM_SCHOOLS);
        }
        const neisSchools = (
          await Promise.all(schoolNames.map((n) => findNeisSchool(n, sidoName, sgg).catch(() => null)))
        ).filter((s): s is NonNullable<typeof s> => !!s);
        if (!neisSchools.length) return ok("NEIS에서 해당 학교들을 찾지 못했습니다.");
        const y = year ?? currentAcademicYear();
        const results = await fetchAreaExams(neisSchools, y);
        return ok(formatExamCalendar(`${sidoName} ${sgg ?? ""}`.trim(), results));
      } catch (e: any) {
        return err(`오류: ${e.message}`);
      }
    }
  );

  // ─── 4.9 학교 비교 리포트 (전학·입학 결정) ──────────────
  server.tool(
    "get_school_report",
    "같은 시군구·학교급 학교들을 핵심 지표(학급당 인원·급식 운영방식/1식 식품비·교원 기간제 비율·동아리 수·1인당 장서)로 한 표에 비교합니다. 전학·입학 학교를 고를 때 씁니다. names에 학교명 배열을 주면 그 학교들만 추려 비교합니다.",
    {
      sido: z.string().describe("시도명 (예: 서울특별시)"),
      sgg: z.string().describe("시군구명 (예: 강남구)"),
      kind: z.enum(KINDS).describe("학교급"),
      names: z.array(z.string()).optional().describe("비교할 학교명 배열 (생략 시 시군구 전체)"),
      year: z.number().optional().describe("공시연도 (기본: 올해)"),
    },
    async ({ sido, sgg, kind, names, year }) => {
      try {
        const rep = await getAreaReport(getClient(), sido, sgg, kind, year);
        return ok(formatAreaReport(rep, names));
      } catch (e: any) {
        return err(`오류: ${e.message}`);
      }
    }
  );

  // ─── 4.10 대학 전공 연계 권장 이수과목 ──────────────────
  // "○○대 ○○학과 가려면 어떤 과목을 들어야 하나" — 대학 입학전형 시행계획의
  // 전공 연계 권장과목 표를 정적 DB로 큐레이션해 조회한다. (학교알리미/NEIS 키 불필요)
  server.tool(
    "get_admission_subjects",
    "대학 모집단위(학과)별 '전공 연계 권장 이수과목'을 조회합니다. 특정 대학·학과를 가려면 고등학교에서 어떤 선택과목(예: 미적분·기하·물리학Ⅱ)을 이수하는 게 좋은지 알려줍니다. university만 주면 그 대학 전체, major까지 주면 해당 학과만 보여줍니다.",
    {
      university: z.string().describe("대학명 (예: 서울대학교, 서울대)"),
      major: z.string().optional().describe("학과/모집단위 또는 단과대학명 (부분 일치, 예: 컴퓨터공학부, 의예과, 공과대학)"),
    },
    async ({ university, major }) => {
      try {
        const uni = findAdmissionUniversity(university);
        if (!uni) {
          const have = listAdmissionUniversities().map((u) => u.name).join(", ");
          return ok(`"${university}"의 권장 이수과목 데이터가 아직 없습니다.\n현재 제공 대학: ${have || "(없음)"}`);
        }
        const majors = searchAdmissionMajors(uni, major);
        return ok(formatAdmission(uni, majors, major));
      } catch (e: any) {
        return err(`오류: ${e.message}`);
      }
    }
  );

  // ─── 5. 평가계획(수행평가) 자동 조회 ────────────────────
  server.tool(
    "get_evaluation_plan",
    "학교의 '교과별 교수·학습 및 평가 운영 계획'(수행평가 주제·평가기준·반영비율)을 학교알리미에서 자동으로 내려받아 마크다운으로 변환하고 수행평가 표를 추출합니다.",
    {
      sido: z.string(),
      sgg: z.string(),
      kind: z.enum(KINDS),
      name: z.string().describe("학교명"),
      year: z.number().optional().describe("공시연도 (기본: 올해)"),
      subject: z.string().optional().describe("과목/파일명 키워드 (과목별로 나뉜 학교에서 특정 과목 선택)"),
      all: z.boolean().optional().describe("true면 전체 과목 파일을 모두 조회"),
      full: z.boolean().optional().describe("true면 전체 문서, 기본은 수행평가 섹션 위주"),
    },
    async ({ sido, sgg, kind, name, year, subject, all, full }) => {
      try {
        const client = getClient();
        const { school, many } = await resolveSchool(client, sido, sgg, kind, name);
        if (many) return ok(`여러 학교가 검색됨:\n` + many.map((s) => `- ${s.name}`).join("\n"));
        if (!school) return ok(`학교를 찾을 수 없습니다: ${name}`);

        // 과목별로 나뉜 학교는 목록을 먼저 안내 (subject/all 미지정 시)
        const { docs } = await listEvaluationDocs(school, year);
        if (docs.length > 1 && !subject && !all) {
          const lines = docs.map((d) => `- ${d.filename}${d.sizeKB ? ` (${d.sizeKB}KB)` : ""}`);
          return ok(
            `# ${school.name} — 평가계획 파일이 ${docs.length}개 있습니다 (과목별)\n\n` +
              lines.join("\n") +
              `\n\n특정 과목은 subject="국어"처럼, 전체는 all=true로 다시 요청하세요.`
          );
        }
        const seq = subject ? docs.find((d) => d.filename.includes(subject))?.seq : undefined;
        const results = await autoFetchEvaluation(school, year, { all: !!all, seq });
        const parts: string[] = [`# ${school.name} — 교수·학습 및 평가 운영 계획\n`];
        for (const r of results) {
          parts.push(`## 📄 ${r.filename} (${r.fileType})\n`);
          if (r.evaluationSections.length) {
            parts.push(`### 🎯 수행평가 관련 (${r.evaluationSections.length}개)\n`);
            parts.push(r.evaluationSections.join("\n\n---\n\n"));
          }
          if (r.needsOcr) {
            parts.push(`\n> ⚠️ 본문 추출이 빈약합니다(이미지 PDF 추정). 원본 직접 확인을 권장합니다.\n`, evaluationGuide(school, year));
          }
          if (full || !r.evaluationSections.length) {
            parts.push(`\n### 전체 문서\n`, r.markdown);
          }
        }
        return ok(parts.join("\n"));
      } catch (e: any) {
        // 자동 다운로드 실패 시 수동 안내로 폴백
        try {
          const client = getClient();
          const { school } = await resolveSchool(client, sido, sgg, kind, name);
          if (school) return ok(`⚠️ 자동 조회 실패: ${e.message}\n\n` + evaluationGuide(school, year));
        } catch {}
        return err(`오류: ${e.message}`);
      }
    }
  );

  // ─── 6. 내려받은 평가계획 hwp 파싱 (로컬 stdio 전용) ────
  // 서버의 파일시스템을 읽으므로 공개 원격 MCP에는 등록하지 않는다.
  if (localFiles) {
    server.tool(
      "parse_evaluation_file",
      "학교알리미에서 내려받은 평가계획 문서(hwp/hwpx/pdf/docx)를 마크다운으로 변환하고 수행평가 관련 섹션을 추출합니다. (kordoc 기반)",
      {
        file_path: z.string().describe("내려받은 문서 파일의 절대 경로"),
      },
      async ({ file_path }) => {
        try {
          const resolved = realpathSync(resolve(file_path));
          const ext = extname(resolved).toLowerCase();
          if (!ALLOWED_EXT.has(ext)) return err(`지원하지 않는 확장자: ${ext}`);
          if (statSync(resolved).size > MAX_FILE_SIZE) return err("파일이 너무 큽니다 (최대 200MB)");

          const buf = readFileSync(resolved);
          const result = await parseEvaluationDocument(buf, resolved);
          const parts = [`[${result.fileType.toUpperCase()}] ${file_path}`, ""];
          if (result.evaluationSections.length) {
            parts.push(`## 🎯 수행평가 관련 추출 (${result.evaluationSections.length}개 섹션)\n`);
            parts.push(result.evaluationSections.join("\n\n---\n\n"));
            parts.push("\n\n<details><summary>전체 문서</summary>\n");
          }
          parts.push(result.markdown);
          return ok(parts.join("\n"));
        } catch (e: any) {
          return err(`오류: ${e.message}`);
        }
      }
    );
  }

  return server;
}
