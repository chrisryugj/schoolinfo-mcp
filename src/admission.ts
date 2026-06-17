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

// ─── 과목 체크리스트용 ─────────────────────────────────────────
// 학생이 "내 이수(예정) 과목"을 고를 때 자유 입력 대신 실제 등장 과목 칩에서 고르게 하면
// 표기 불일치(미적분Ⅱ vs 미적분 II)를 원천 차단할 수 있다. 그 후보 목록을 빈도순으로 뽑는다.
const ROMAN: Record<string, string> = { "Ⅰ": "1", "Ⅱ": "2", "Ⅲ": "3", "Ⅳ": "4", "Ⅴ": "5" };
/** 매칭용 정규화 키 — 로마자만 숫자로 통일하고 공백·구분자 제거. 완전일치 비교에 쓴다. */
export function subjectKey(s: string): string {
  return s.replace(/[ⅠⅡⅢⅣⅤ]/g, (m) => ROMAN[m] ?? m).replace(/[\s·∙‧・]/g, "").toLowerCase();
}
/** 깔끔한 과목명 토막만 — 조건문·괄호·콜론·깨진 파싱(대괄호·원문자)이 든 항목은 거른다. */
function looksLikeSubject(s: string): boolean {
  return s.length >= 2 && s.length <= 16 && !/[:()/[\]①-⑳]/.test(s) &&
    !/(이상|이하|중\s*\d|택\s*\d|과목|또는|권장|필수|선택)/.test(s);
}
// 2015개정 전용 표기 — 현행(2022개정) 학생이 고르는 팔레트에서만 숨긴다. 원문(core/recommended)은 보존.
// '미적분'은 2015 단독 과목이라 제외하되 2022의 '미적분Ⅰ/Ⅱ'는 남는다. 영어Ⅰ/Ⅱ·확률과 통계·기하·세계사는 양 교육과정 공통이라 유지.
//  수학Ⅰ/Ⅱ → 2022 대수·미적분Ⅰ / 물리학Ⅰ/Ⅱ 등 → 2022 물리학+세분 진로선택 / 한국지리·세계지리·동아시아사 → 2022 한국지리 탐구·세계시민과 지리·동아시아 역사 기행
const LEGACY_2015 = new Set(
  ["수학Ⅰ", "수학Ⅱ", "미적분", "물리학Ⅰ", "물리학Ⅱ", "화학Ⅰ", "화학Ⅱ", "생명과학Ⅰ", "생명과학Ⅱ", "지구과학Ⅰ", "지구과학Ⅱ",
   "한국지리", "세계지리", "동아시아사"]
    .map(subjectKey)
);
// 개별 선택과목이 아닌 교과·영역명 — 학생이 "수학 이수" 체크는 무의미하므로 팔레트에서 제외.
// ('물리'는 '물리학'의 약칭/오기 — '물리학'은 유지된다)
const NON_SUBJECT = new Set(
  ["영어", "수학", "과학", "국어", "사회", "역사", "지리", "윤리", "물리", "일반사회", "과학 교과", "체육", "체육1", "체육2", "예술", "교양", "제2외국어"]
    .map(subjectKey)
);
/** core·recommended에 자주 등장하는 과목명을 빈도순으로 (체크리스트 팔레트용). */
export function commonSubjects(limit = 48): string[] {
  const freq = new Map<string, { name: string; n: number }>();
  for (const u of ALL)
    for (const m of u.majors)
      for (const field of [m.core, m.recommended]) {
        if (!field || field.indexOf(":") >= 0) continue;
        for (const tok of field.split(",").map((s) => s.trim()).filter(Boolean)) {
          if (!looksLikeSubject(tok)) continue;
          const k = subjectKey(tok);
          if (LEGACY_2015.has(k) || NON_SUBJECT.has(k)) continue;   // 2015 전용 표기·교과명은 팔레트에서 제외
          const cur = freq.get(k);
          if (cur) cur.n++;
          else freq.set(k, { name: tok, n: 1 });
        }
      }
  return [...freq.values()].sort((a, b) => b.n - a.n).slice(0, limit).map((x) => x.name);
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
