// 대학 모집단위(학과)별 전공 연계 권장(반영) 이수과목.
// 데이터는 admission.json(scripts/gen_admission.py가 2028 권역별 자료집 xlsx에서 생성).
// 대학마다 기재 형식이 달라 핵심/권장/기준을 원문 문자열로 충실히 보존한다.
// "특정 대학 이름 → 그 대학 학과별 권장과목"을 빠르게 조회·포맷한다.

import admissionData from "./admission.json" with { type: "json" };

export interface AdmissionMajor {
  unit: string;           // 모집단위/학과 (예: 컴퓨터공학부)
  college?: string;       // 단과대학/계열 (있을 때)
  core: string;           // 핵심과목 (필수적 이수 권장) — 원문 텍스트
  recommended: string;    // 권장과목 (가급적 이수 권장) — 원문 텍스트
  note: string;           // 기준/비고 (과목 수·순위 등) — 원문 텍스트
  campus?: string;        // 캠퍼스 변형 병합 시 표기 (예: 춘천)
}
export interface AdmissionUniversity {
  name: string;
  region?: string;        // 권역 (수도권/영남권/중부권/호남권)
  area?: string;          // 지역 (서울/부산 등)
  source: string;
  sourceUrl?: string;
  guide?: string;
  majors: AdmissionMajor[];
}
interface AdmissionDB {
  version: string;
  updated: string;
  note: string;
  sources?: string[];
  universities: AdmissionUniversity[];
}

const DB = admissionData as AdmissionDB;
const ALL: AdmissionUniversity[] = DB.universities;

const norm = (s: string) => s.replace(/[\s·∙‧・]/g, "").toLowerCase();
/** 학교 접미사를 제거한 매칭 키 ("서울대"/"서울대학교" 동일) */
const uniKey = (s: string) => norm(s).replace(/(대학교|대학|대)$/u, "");
/** 캠퍼스 괄호를 제거한 기준 키 ("강원대(춘천)"/"강원대(삼척)" 동일) */
const baseKey = (s: string) => uniKey(s.replace(/\([^)]*\)/g, ""));
const campusOf = (s: string) => (s.match(/\(([^)]+)\)/)?.[1] ?? "").trim();

/** 데이터가 있는 대학 목록 (캠퍼스 분할 포함) */
export function listAdmissionUniversities(): { name: string; region?: string; area?: string; majorCount: number }[] {
  return ALL.map((u) => ({ name: u.name, region: u.region, area: u.area, majorCount: u.majors.length }));
}

/** 대학명(부분/약칭)으로 찾기. 같은 기준명의 캠퍼스 분할은 하나로 병합. */
export function findAdmissionUniversity(query: string): AdmissionUniversity | undefined {
  const qk = uniKey(query);
  if (!qk) return undefined;
  // 1) 캠퍼스까지 포함한 정확 매칭 — "건국대"는 본교(서울)만, "건국대(글로컬)"은 그 분교만.
  let matches = ALL.filter((u) => uniKey(u.name) === qk);
  if (matches.length) {
    // 단, 괄호 없는 본교가 아예 없는 캠퍼스 분할(강원대(춘천)·(삼척), 전남대(광주)·(여수))은
    // 어느 캠퍼스로 입력하든 동급이므로 기준명 그룹 전체를 병합한다.
    const base = baseKey(matches[0].name);
    const group = ALL.filter((u) => baseKey(u.name) === base);
    if (group.length > 1 && !group.some((u) => campusOf(u.name) === "")) matches = group;
  } else {
    // 2) 기준명 정확 매칭 — "강원대"(통합명) 입력 시 캠퍼스 분할 병합.
    matches = ALL.filter((u) => baseKey(u.name) === qk);
    // 3) 부분/약칭 매칭.
    if (!matches.length) matches = ALL.filter((u) => baseKey(u.name).includes(qk) || qk.includes(baseKey(u.name)));
  }
  if (!matches.length) return undefined;
  if (matches.length === 1) return matches[0];
  // 같은 기준명(캠퍼스 분할)만 병합 — 서로 다른 대학이 섞이면 첫 매칭만
  const bases = new Set(matches.map((m) => baseKey(m.name)));
  if (bases.size > 1) return matches[0];
  const head = matches[0];
  return {
    name: head.name.replace(/\([^)]*\)/g, "").trim() || head.name,
    region: head.region,
    area: [...new Set(matches.map((m) => m.area).filter(Boolean))].join("·"),
    source: head.source,
    sourceUrl: head.sourceUrl,
    guide: head.guide,
    majors: matches.flatMap((m) => {
      const c = campusOf(m.name);
      return c ? m.majors.map((mj) => ({ ...mj, campus: c })) : m.majors;
    }),
  };
}

/** 대학 내에서 학과/계열명(부분)으로 모집단위 필터. query 없으면 전체. */
export function searchAdmissionMajors(uni: AdmissionUniversity, query?: string): AdmissionMajor[] {
  if (!query || !query.trim()) return uni.majors;
  const q = norm(query);
  return uni.majors.filter((m) => norm(m.unit).includes(q) || (m.college ? norm(m.college).includes(q) : false));
}

/** MCP/텍스트용 마크다운 포맷 */
export function formatAdmission(uni: AdmissionUniversity, majors: AdmissionMajor[], query?: string): string {
  const loc = [uni.region, uni.area].filter(Boolean).join(" · ");
  const head = `# ${uni.name}${loc ? ` (${loc})` : ""} 전공 연계 권장 이수과목\n` +
    `> 출처: ${uni.source}${uni.sourceUrl ? ` · ${uni.sourceUrl}` : ""}\n`;
  if (!majors.length) {
    const sample = uni.majors.slice(0, 8).map((m) => m.unit).join(", ");
    return head + `\n"${query ?? ""}"에 해당하는 모집단위를 찾지 못했습니다.\n예시 모집단위: ${sample} 등`;
  }
  const guide = uni.guide ? `\n${uni.guide}\n` : "";
  const body = majors
    .map((m) => {
      const title = `## ${m.campus ? `[${m.campus}] ` : ""}${m.college ? `${m.college} · ` : ""}${m.unit}`;
      const lines = [title];
      if (m.core) lines.push(`- 핵심과목: ${m.core}`);
      if (m.recommended) lines.push(`- 권장과목: ${m.recommended}`);
      if (m.note) lines.push(`- 기준: ${m.note}`);
      if (!m.core && !m.recommended && !m.note)
        lines.push(`  (별도 권장과목 없음 — 진로·적성에 따른 선택과목 이수 권장)`);
      return lines.join("\n");
    })
    .join("\n\n");
  return head + guide + "\n" + body;
}
