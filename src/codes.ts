// 학교알리미 OpenAPI 코드 매핑
// 출처: schoolinfo.go.kr OpenAPI 명세 + OpenAPI_Output.xlsx (2026 기준)

import regionsData from "./regions.json" with { type: "json" };

/** 시도별 { code: 시도코드, sgg: { 시군구명: 시군구코드 } } */
export const REGIONS: Record<string, { code: string; sgg: Record<string, string> }> =
  regionsData as any;

/** 학교급 구분 코드 (schulKndCode) */
export const SCHOOL_KIND = {
  초등학교: "02",
  중학교: "03",
  고등학교: "04",
  특수학교: "05",
  그외학교: "06",
  각종학교: "07",
} as const;

export type SchoolKindName = keyof typeof SCHOOL_KIND;

/** 학교급 코드 → 이름 역매핑 */
export const SCHOOL_KIND_REV: Record<string, string> = Object.fromEntries(
  Object.entries(SCHOOL_KIND).map(([k, v]) => [v, k])
);

/**
 * OpenAPI 조사항목(apiType) 코드 → 항목명
 * 학교기본정보(0)는 학교 검색/메타 조회에 사용.
 * 나머지는 SCHUL_CODE 등으로 상세 공시정보 조회.
 *
 * ⚠️ "교과별(학년별) 교수·학습 및 평가 운영 계획"(수행평가 주제/평가기준)은
 *    OpenAPI 정형 항목에 없음 — hwp 첨부파일로만 공시됨 (evaluation.ts 참조).
 */
export const API_TYPES: Record<string, string> = {
  "0": "학교기본정보",
  "04": "자유학기제 운영에 관한 사항",
  "08": "수업일수 및 수업시수 현황",
  "09": "학년별·학급별 학생수",
  "10": "전·출입 및 학업중단 학생 수",
  "16": "학교용지 현황",
  "17": "교사(校舍) 현황",
  "18": "학생교육활동에 필요한 지원시설 현황",
  "20": "학교시설 개방에 관한 사항",
  "21": "장애인 편의시설 현황",
  "22": "직위별 교원 현황",
  "24": "표시과목별 교원 현황",
  "27": "학교회계 예·결산서(국공립)",
  "28": "사립학교 교비회계 예·결산서",
  "30": "학교발전기금",
  "34": "급식 실시 현황",
  "35": "급식비 집행 실적",
  "38": "보건관리 현황",
  "42": "환경위생관리 현황",
  "43": "안전교육 계획 및 실시현황",
  "44": "시설안전 점검 현황",
  "51": "입학생 현황",
  "55": "장학금 수혜 현황",
  "56": "동아리 활동 현황",
  "58": "학교도서관 현황",
  "59": "방과후학교 운영 계획 및 운영ㆍ지원현황",
  "61": "학생·학부모 상담계획 및 실시 현황",
  "62": "학교 현황",
  "63": "성별 학생수",
  "64": "자격종별 교원 현황",
  "67": "교육운영 특색사업 계획",
  "68": "직원 현황",
  "73": "교복 구매 유형 및 단가",
  "90": "학생의 체력 증진에 관한 사항",
  "94": "대상별 학교폭력 예방교육 실적",
};

/** 항목명(부분일치) → apiType 코드 검색 */
export function findApiType(query: string): { code: string; name: string }[] {
  const q = query.replace(/\s/g, "");
  return Object.entries(API_TYPES)
    .filter(([, name]) => name.replace(/\s/g, "").includes(q))
    .map(([code, name]) => ({ code, name }));
}

/** 시도 약칭(글자축약형 포함) → 정식 명칭 */
const SIDO_ALIAS: Record<string, string> = {
  서울: "서울특별시", 부산: "부산광역시", 대구: "대구광역시", 인천: "인천광역시",
  광주: "광주광역시", 대전: "대전광역시", 울산: "울산광역시", 세종: "세종특별자치시",
  경기: "경기도", 강원: "강원특별자치도", 충북: "충청북도", 충남: "충청남도",
  전북: "전북특별자치도", 전남: "전라남도", 경북: "경상북도", 경남: "경상남도",
  제주: "제주특별자치도",
  // 구 명칭 호환
  강원도: "강원특별자치도", 전라북도: "전북특별자치도", 제주도: "제주특별자치도",
};

/** 시도명 정규화 — "서울"·"충북"·"강원도" 같은 약칭/구명칭 허용 */
export function resolveSido(input: string): { name: string; code: string } | null {
  const t = input.trim();
  if (!t) return null;
  // 1) 정확 매칭
  if (REGIONS[t]) return { name: t, code: REGIONS[t].code };
  // 2) 약칭 테이블
  const alias = SIDO_ALIAS[t];
  if (alias && REGIONS[alias]) return { name: alias, code: REGIONS[alias].code };
  // 3) 접두 매칭 — 후보가 정확히 1개일 때만 채택 (모호하면 null로 오선택 방지)
  const cands = Object.entries(REGIONS).filter(([name]) => name.startsWith(t));
  if (cands.length === 1) return { name: cands[0][0], code: cands[0][1].code };
  return null;
}

/** 시도 내 시군구명 정규화 — "강남"→"강남구", "성남"→"성남시"(시 전체 우선) */
export function resolveSgg(sidoName: string, input: string): { name: string; code: string } | null {
  const region = REGIONS[sidoName];
  if (!region) return null;
  const t = input.trim();
  if (!t) return null;
  const sgg = region.sgg;
  // 1) 정확 매칭
  if (sgg[t]) return { name: t, code: sgg[t] };
  // 2) 접미사 완성 — "성남"→"성남시", "강남"→"강남구"
  for (const suf of ["시", "군", "구"]) {
    if (sgg[t + suf]) return { name: t + suf, code: sgg[t + suf] };
  }
  // 3) 접두 매칭 — 가장 짧은 이름 우선 (예: "성남시" < "성남시 분당구").
  //    단, 동률(여러 구만 존재)이면 모호하므로 첫 후보 반환하되 사용자에게 노출되도록 호출부에서 처리.
  const cands = Object.entries(sgg)
    .filter(([name]) => name.startsWith(t))
    .sort((a, b) => a[0].length - b[0].length);
  if (cands.length) return { name: cands[0][0], code: cands[0][1] };
  return null;
}

/**
 * 시군구 입력 → 검색할 코드 목록.
 * 학교알리미는 **자치구 단위로만** 학교를 검색할 수 있어, "포항"/"성남"처럼
 * 자치구를 가진 시를 입력하면 시 전체 코드로는 0건이 나온다.
 * 따라서 정확매칭이 아니면 하위 구를 모두 포함해 합산 검색한다.
 */
export function resolveSggList(sidoName: string, input: string): { name: string; code: string }[] {
  const region = REGIONS[sidoName];
  if (!region) return [];
  const t = input.trim();
  if (!t) return [];
  const sgg = region.sgg;
  // 1) 정확 매칭 (강남구, 수원시 장안구 등). 단 "포항시"·"성남시"처럼 하위 자치구를 가진
  //    시는 시 코드만으론 0건이라, 하위 구를 함께 합산해야 검색이 된다.
  if (sgg[t]) {
    const children = Object.entries(sgg).filter(([name]) => name.startsWith(t + " "));
    if (children.length)
      return [{ name: t, code: sgg[t] }, ...children.map(([name, code]) => ({ name, code }))];
    return [{ name: t, code: sgg[t] }];
  }
  // 2) 접미사 완성이 자치구("강남"→"강남구")면 단일, "시"면 하위 구까지 합산
  if (sgg[t + "구"]) return [{ name: t + "구", code: sgg[t + "구"] }];
  if (sgg[t + "군"]) return [{ name: t + "군", code: sgg[t + "군"] }];
  // 3) 접두 매칭 전부 (포항→포항시+포항시 남구+포항시 북구). 시 전체 코드는 0건이라 무해.
  const cands = Object.entries(sgg)
    .filter(([name]) => name.startsWith(t))
    .map(([name, code]) => ({ name, code }));
  return cands;
}

/** 시군구 부분입력에 대한 모든 후보 (모호성 안내용) */
export function sggCandidates(sidoName: string, input: string): string[] {
  const region = REGIONS[sidoName];
  if (!region) return [];
  const t = input.trim();
  return Object.keys(region.sgg).filter((name) => name === t || name.startsWith(t));
}
