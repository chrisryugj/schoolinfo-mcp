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
  autoFetchEvaluation,
  listEvaluationDocs,
  fetchEvaluationBySeq,
  fetchEvaluationFiles,
  downloadEvaluationFile,
  DISCLOSURE_PORTAL,
} from "./evaluation.js";
export type { EvaluationResult, EvaluationFile } from "./evaluation.js";

import { SchoolInfoClient, School } from "./client.js";
import { API_TYPES } from "./codes.js";
import labelsData from "./labels.json" with { type: "json" };

/** apiType별 컬럼ID → 한글 라벨 (OpenAPI_Output.xlsx 추출) */
const LABELS: Record<string, Record<string, string>> = labelsData as any;

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
  const label = (k: string) => (labelMap[k] ?? k).replace(/^(초등부|중등부|고등부)-/, "");
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

export async function getParentDigest(
  client: SchoolInfoClient,
  school: School,
  year?: number
): Promise<{ name: string; rows: Record<string, any>[]; apiType: string }[]> {
  const out: { name: string; rows: Record<string, any>[]; apiType: string }[] = [];
  for (const apiType of PARENT_DIGEST) {
    if (apiType === "0") continue; // 기본정보는 이미 school에 있음
    try {
      const r = await client.getDisclosure(school, apiType, year);
      out.push({ ...r, apiType });
    } catch (e) {
      out.push({ name: API_TYPES[apiType] ?? apiType, rows: [], apiType });
    }
  }
  return out;
}
