// schoolinfo-mcp — 학교알리미 공시정보 라이브러리 진입점
//
// 학부모가 "내 아이 학교"의 공시정보(평가계획·수행평가·급식·학생수 등)를
// 쉽게 확인할 수 있도록 학교알리미 OpenAPI + kordoc(hwp 파싱)을 묶는다.

export { SchoolInfoClient, searchSchoolsByName } from "./client.js";
export type { School, ApiResult, SchoolHit } from "./client.js";
export {
  API_TYPES,
  SCHOOL_KIND,
  REGIONS,
  findApiType,
  resolveSido,
  resolveSgg,
} from "./codes.js";
export type { SchoolKindName } from "./codes.js";
export {
  evaluationGuide,
  parseEvaluationDocument,
  extractEvaluationSections,
  structureEvaluation,
  autoFetchEvaluation,
  listEvaluationDocs,
  fetchEvaluationBySeq,
  fetchEvaluationFiles,
  downloadEvaluationFile,
  DISCLOSURE_PORTAL,
} from "./evaluation.js";
export type { EvaluationResult, EvaluationFile, GradeOverview, StructuredEvaluation } from "./evaluation.js";

import { SchoolInfoClient, School } from "./client.js";
import { API_TYPES, SCHOOL_KIND, SchoolKindName, resolveSido, resolveSggList } from "./codes.js";
import labelsData from "./labels.json" with { type: "json" };

/** apiType별 컬럼ID → 한글 라벨 (OpenAPI_Output.xlsx 추출) */
const LABELS: Record<string, Record<string, string>> = labelsData as any;

/**
 * apiType과 무관하게 의미가 고정인 공통 코드 컬럼.
 * 일부 항목(예: 09 학년별·학급별 학생수)의 labels.json에 누락돼
 * 영문 코드ID(DGHT_CRSE_SC_CODE 등)가 그대로 화면에 노출되는 것을 막는다.
 */
const COMMON_LABELS: Record<string, string> = {
  DGHT_CRSE_SC_CODE: "주야과정구분",
};

export function createClient(apiKey = process.env.SCHOOLINFO_API_KEY ?? ""): SchoolInfoClient {
  return new SchoolInfoClient(apiKey);
}

/** 학교 한 곳을 사람이 읽기 좋은 마크다운으로 */
export function formatSchool(s: School): string {
  return [
    `## ${s.name} (${s.kind})`,
    ``,
    `| 항목 | 내용 |`,
    `|------|------|`,
    `| 설립 | ${s.foundation} |`,
    `| 교육청 | ${s.office} |`,
    `| 주소 | ${s.address} |`,
    `| 전화 | ${s.tel} |`,
    `| 홈페이지 | ${s.homepage || "—"} |`,
    `| 학교코드 | ${s.schoolCode} |`,
  ].join("\n");
}

/** 공시정보 행(들)을 마크다운 표로. apiType을 주면 컬럼명을 한글 라벨로 변환 */
export function formatDisclosure(
  name: string,
  rows: Record<string, any>[],
  apiType?: string
): string {
  if (!rows.length) return `### ${name}\n\n(해당 공시 데이터가 없습니다)`;
  // 메타 식별 컬럼은 숨김
  const HIDE = new Set([
    "ATPT_OFCDC_ORG_CODE",
    "ATPT_OFCDC_ORG_NM",
    "JU_ORG_CODE",
    "JU_ORG_NM",
    "SCHUL_CODE",
    "SCHUL_NM",
    "SCHUL_KND_SC_CODE",
    "SHL_IDF_CD",
    "ADRCD_CD",
    "ADRCD_ID",
    "ADRCD_NM",
    "LCTN_SC_CODE",
    "BNHH_YN",
    "PBAN_EXCP_YN",
  ]);
  const labelMap = apiType ? LABELS[apiType] ?? {} : {};
  // 학교알리미는 학년 컬럼(COL_S1 등)을 학교급 무관하게 재사용하므로
  // "초등부-/중등부-/고등부-" 접두사는 제거해야 실제 학교급 학년과 맞는다.
  const label = (k: string) =>
    (labelMap[k] ?? COMMON_LABELS[k] ?? k).replace(/^(초등부|중등부|고등부)-/, "");
  const lines = [`### ${name}`, ``];
  for (const row of rows) {
    // 값 0("학업중단 0명" 등)은 의미 있는 정보이므로 표시. 빈값/null만 숨김.
    const entries = Object.entries(row).filter(
      ([k, v]) => !HIDE.has(k) && v != null && v !== ""
    );
    lines.push(`| 항목 | 값 |`, `|------|------|`);
    for (const [k, v] of entries) lines.push(`| ${label(k)} | ${v} |`);
    lines.push(``);
  }
  return lines.join("\n");
}

/**
 * 학교 한 곳의 "주요 공시" 묶음 조회 — 학부모가 자주 보는 항목.
 */
export const PARENT_DIGEST: string[] = [
  "0", // 학교기본정보
  "09", // 학년별·학급별 학생수
  "34", // 급식 실시 현황
  "59", // 방과후학교
  "56", // 동아리
  "61", // 상담
  "94", // 학교폭력 예방교육
];

export interface DigestEntry {
  name: string;
  rows: Record<string, any>[];
  apiType: string;
  /** 조회 실패(인증/네트워크/타임아웃 등)면 true — '데이터 없음'(rows:[])과 구분. check가 거짓 변경알림을 막는 데 사용 */
  error?: boolean;
}

// ─── 지역(시군구) 학교별 학생수 비교 ───────────────────────────
// 학교알리미는 "09 학년별·학급별 학생수" 조회 시 시군구 전체 학교 행을 한 번에 주므로,
// 같은 시군구+학교급 학생수 비교표를 API 1회(자치구 시는 구 수만큼)로 만든다.

const STUDENT_LABELS = (labelsData as any)["09"] as Record<string, string> | undefined;

export interface AreaSchoolStudents {
  name: string;
  schoolCode: string;
  total: number | null;
  byGrade: Record<number, number>;
  classes: number | null;
  perClass: number | null;
  perTeacher: number | null;
}
export interface AreaStudents {
  sido: string;
  sgg: string;
  kind: string;
  year: number;
  grades: number[];
  schools: AreaSchoolStudents[];
}

export async function getAreaStudents(
  client: SchoolInfoClient,
  sidoName: string,
  sggInput: string,
  kind: SchoolKindName,
  year?: number
): Promise<AreaStudents> {
  const sido = resolveSido(sidoName);
  if (!sido) throw new Error(`알 수 없는 시도: ${sidoName}`);
  const sggList = resolveSggList(sido.name, sggInput);
  if (!sggList.length) throw new Error(`알 수 없는 시군구: ${sggInput}`);
  const kindCode = SCHOOL_KIND[kind];
  if (!kindCode) throw new Error(`알 수 없는 학교급: ${kind}`);
  const y = year ?? new Date().getFullYear();

  // 자치구를 가진 시는 구별 합산. 학교코드로 중복 제거.
  const seen = new Set<string>();
  const rows: Record<string, any>[] = [];
  for (const s of sggList) {
    let list: Record<string, any>[];
    try {
      list = await client.getAreaDisclosure("09", sido.code, s.code, kindCode, y);
    } catch {
      continue; // "데이터 없음"(시 전체 코드 등)은 무시
    }
    for (const r of list) {
      const code = String(r.SCHUL_CODE ?? "");
      if (code && !seen.has(code)) {
        seen.add(code);
        rows.push(r);
      }
    }
  }

  const num = (v: any): number | null => {
    if (v == null || v === "") return null;
    const n = Number(String(v).replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  };
  const pick = (r: Record<string, any>, ...keys: string[]): number | null => {
    for (const k of keys) {
      const n = num(r[k]);
      if (n != null) return n;
    }
    return null;
  };

  const gradeSet = new Set<number>();
  const schools: AreaSchoolStudents[] = rows
    .map((r) => {
      const byGrade: Record<number, number> = {};
      // 학교급(초 1~6 / 중·고 1~3)에 따라 채워지는 컬럼이 달라, 라벨 "N학년 학생수"를 일반 매칭하고
      // 값>0만 채택한다(컬럼 ID 하드코딩 없이 어느 학교급이든 정확). 특수·순회 등 비학년은 제외됨.
      if (STUDENT_LABELS) {
        for (const [k, label] of Object.entries(STUDENT_LABELS)) {
          const m = /(?:초등부|중등부|고등부)-([1-6])학년 학생수$/.exec(label);
          if (!m) continue;
          const v = num(r[k]);
          if (v != null && v > 0) {
            const g = Number(m[1]);
            byGrade[g] = v;
            gradeSet.add(g);
          }
        }
      }
      return {
        name: String(r.SCHUL_NM ?? ""),
        schoolCode: String(r.SCHUL_CODE ?? ""),
        total: pick(r, "COL_S_SUM", "COL_SUM_S4"),
        byGrade,
        classes: pick(r, "COL_C_SUM", "COL_SUM_C4"),
        perClass: pick(r, "COL_SUM", "COL_SUM_4"),
        perTeacher: pick(r, "TEACH_CAL"),
      };
    })
    .filter((s) => s.name && s.total != null);

  schools.sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
  const grades = [...gradeSet].sort((a, b) => a - b);
  return { sido: sido.name, sgg: sggInput, kind, year: y, grades, schools };
}

// ─── 지역(시군구) 학교 비교 리포트 ───────────────────────────────
// 전학·입학 결정용. 학급당 인원·급식방식/식품비·교원 안정성(기간제 비율)·동아리·도서관을
// 같은 시군구+학교급 학교들에 대해 한 표로. 각 공시(09/34/35/22/56/58)를 시군구 전체로
// 1패스 조회(getAreaDisclosure 캐시 공유)해 SCHUL_CODE로 조인한다.

// 급식비집행(35)·도서관(58)은 OpenAPI에 depthNo 추가 파라미터를 요구해(현재 미전달) 조회 불가 →
// depthNo 없이 안정 조회되는 항목만 사용한다. (depthNo 값 확인 시 식품비·장서 칼럼 추가 가능)
const REPORT_TYPES = ["09", "34", "22", "56"] as const;

export interface SchoolReportRow {
  name: string;
  schoolCode: string;
  total: number | null;          // 전체 학생수 (09)
  perClass: number | null;       // 학급당 인원 (09)
  mealType: string | null;       // 급식 운영방식 직영/위탁 (34)
  tempTeacherRate: number | null; // 기간제 교사 비율 % (22)
  clubs: number | null;          // 동아리 수(창체+자율) (56)
}
export interface AreaReport {
  sido: string;
  sgg: string;
  kind: string;
  year: number;
  schools: SchoolReportRow[];
}

/** 시군구 내 학교들을 핵심 지표로 비교 (전학·입학 판단용) */
export async function getAreaReport(
  client: SchoolInfoClient,
  sidoName: string,
  sggInput: string,
  kind: SchoolKindName,
  year?: number
): Promise<AreaReport> {
  const sido = resolveSido(sidoName);
  if (!sido) throw new Error(`알 수 없는 시도: ${sidoName}`);
  const sggList = resolveSggList(sido.name, sggInput);
  if (!sggList.length) throw new Error(`알 수 없는 시군구: ${sggInput}`);
  const kindCode = SCHOOL_KIND[kind];
  if (!kindCode) throw new Error(`알 수 없는 학교급: ${kind}`);
  const y = year ?? new Date().getFullYear();

  // apiType → (schoolCode → row). 자치구 시는 구별 합산.
  // 항목마다 공시 시기가 달라(급식비 집행·도서관 등은 전년 실적), 지정연도에 0건이면
  // 직전연도로 폴백한다(연도 미지정 시). 항목별 독립이라 병렬 조회.
  const years = year != null ? [year] : [y, y - 1];
  const byType: Record<string, Map<string, Record<string, any>>> = {};
  for (const t of REPORT_TYPES) byType[t] = new Map();
  await Promise.all(
    REPORT_TYPES.map(async (t) => {
      for (const yy of years) {
        for (const s of sggList) {
          try {
            const list = await client.getAreaDisclosure(t, sido.code, s.code, kindCode, yy);
            for (const r of list) {
              const code = String(r.SCHUL_CODE ?? "");
              if (code && !byType[t].has(code)) byType[t].set(code, r);
            }
          } catch {
            /* "데이터 없음"(시 전체 코드 등) 무시 */
          }
        }
        if (byType[t].size) break; // 이 연도에 데이터가 있으면 이전연도 폴백 안 함
      }
    })
  );

  const num = (v: any): number | null => {
    if (v == null || v === "") return null;
    const n = Number(String(v).replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  };
  const pick = (r: Record<string, any> | undefined, ...keys: string[]): number | null => {
    if (!r) return null;
    for (const k of keys) {
      const n = num(r[k]);
      if (n != null) return n;
    }
    return null;
  };

  // 학교 목록은 09(학생수) 기준 — 학생수 없는 행은 비교 의미 없음
  const schools: SchoolReportRow[] = [...byType["09"].entries()]
    .map(([code, r09]) => {
      const r34 = byType["34"].get(code);
      const r22 = byType["22"].get(code);
      const r56 = byType["56"].get(code);

      // 급식 운영방식: 직영급식(COL_1) 값이 있으면 직영, 전부/일부 위탁(COL_2/COL_3) 값이 있으면 위탁
      let mealType: string | null = null;
      if (r34) {
        const direct = String(r34.COL_1 ?? "").trim();
        const out2 = String(r34.COL_2 ?? "").trim();
        const out3 = String(r34.COL_3 ?? "").trim();
        const oper = String(r34.OPER_MET_CODE ?? "").trim();
        if (/직영/.test(oper) || (direct && !out2 && !out3)) mealType = "직영";
        else if (/위탁/.test(oper) || out2 || out3) mealType = "위탁";
        else if (oper) mealType = oper;
      }

      // 교원 안정성: 기간제 / (일반 + 기간제). 22 COL_4=일반교사(계), COL_11=기간제(계)
      const gen = pick(r22, "COL_4");
      const temp = pick(r22, "COL_11");
      const tempTeacherRate =
        gen != null && temp != null && gen + temp > 0
          ? Math.round((temp / (gen + temp)) * 1000) / 10
          : null;

      // 동아리: 창체동아리 + 자율동아리 수
      const club1 = pick(r56, "CREAT_EXPER_ACT_CCCLU_FGR");
      const club2 = pick(r56, "STDNT_SLCTL_CCCLU_FGR");
      const clubs = club1 != null || club2 != null ? (club1 ?? 0) + (club2 ?? 0) : null;

      return {
        name: String(r09.SCHUL_NM ?? ""),
        schoolCode: code,
        total: pick(r09, "COL_S_SUM", "COL_SUM_S4"),
        perClass: pick(r09, "COL_SUM", "COL_SUM_4"),
        mealType,
        tempTeacherRate,
        clubs,
      };
    })
    .filter((s) => s.name && s.total != null)
    .sort((a, b) => (b.total ?? 0) - (a.total ?? 0));

  return { sido: sido.name, sgg: sggInput, kind, year: y, schools };
}

/** 비교 리포트를 마크다운 표로 (MCP/CLI 공용) */
export function formatAreaReport(rep: AreaReport, names?: string[]): string {
  let schools = rep.schools;
  if (names && names.length) {
    const want = names.map((n) => n.replace(/\s/g, ""));
    schools = schools.filter((s) => want.some((w) => s.name.replace(/\s/g, "").includes(w)));
  }
  const title = `# 🏫 ${rep.sido} ${rep.sgg} ${rep.kind} 비교 (${rep.year})`;
  if (!schools.length) return `${title}\n\n비교할 학교를 찾지 못했습니다.`;
  const fmt = (v: number | null, suffix = "") => (v == null ? "—" : `${v}${suffix}`);
  const lines = [
    title,
    "",
    `| 학교 | 학생수 | 학급당 | 급식 | 기간제비율 | 동아리 |`,
    `|------|------|------|------|------|------|`,
  ];
  for (const s of schools) {
    lines.push(
      `| ${s.name} | ${fmt(s.total)} | ${fmt(s.perClass)} | ${s.mealType ?? "—"} | ${fmt(s.tempTeacherRate, "%")} | ${fmt(s.clubs)} |`
    );
  }
  lines.push(
    "",
    "> 수치는 학교알리미 공시 원자료입니다. 우열이 아니라 참고용이며, 기간제 비율 등은 학교 사정에 따라 다양한 이유가 있습니다."
  );
  return lines.join("\n");
}

export async function getParentDigest(
  client: SchoolInfoClient,
  school: School,
  year?: number
): Promise<DigestEntry[]> {
  // 기본정보("0")는 이미 school에 있어 제외. 나머지는 독립 조회라 병렬(Promise.all)로 직렬 왕복 제거.
  const types = PARENT_DIGEST.filter((t) => t !== "0");
  return Promise.all(
    types.map(async (apiType): Promise<DigestEntry> => {
      try {
        const r = await client.getDisclosure(school, apiType, year);
        return { ...r, apiType };
      } catch (e: any) {
        // 실패를 빈 표로 삼키지 않고 error 플래그로 전파 (표시는 동일, check만 분기)
        console.error(`[digest] ${apiType} 조회 실패:`, e?.message ?? e);
        return { name: API_TYPES[apiType] ?? apiType, rows: [], apiType, error: true };
      }
    })
  );
}
