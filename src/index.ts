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
