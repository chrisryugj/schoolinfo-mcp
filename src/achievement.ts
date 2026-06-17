// 교과별 학업성취 사항 (과목별 학기 평균점수 + 성취도 A~E 분포비율)
//
// 이 항목은 학교알리미 OpenAPI 정형 데이터(35종)에 없고, 학교별 공시 웹에서만 제공된다.
// 게다가 평가계획(evaluation.ts)과 달리 **세션 기반 숫자 캡차(CAPTCHA)** 로 보호돼
// 순수 HTTP 자동조회가 불가능하다 — 학교알리미가 성적 데이터의 봇 자동수집을 의도적으로 막은 것.
// (평가계획 b43엔 캡차가 없지만 학업성취 b44엔 캡차를 걸어둔 것이 그 증거.)
//
//   참고 — 역분석으로 확보한 내부 엔드포인트/코드 (캡차로 인해 직접 사용은 안 함):
//     · POST /ei/pp/Pneipp_b44_s0p.do
//     · GS_HANGMOK_CD=44, JG_HANGMOK_CD=15, GS_BURYU_CD=JG220, JG_BURYU_CD=JG040
//     · 공시기관: 중학교·고등학교 (초등·특수는 데이터 없음)
//
// 따라서 자동 추출 대신, 사용자가 직접 확인하도록 **학교별 공시 화면 딥링크**를 안내한다.

import type { School } from "./client.js";

const BASE = "https://www.schoolinfo.go.kr";
/** 학교명+항목으로 직접 찾는 통합검색 화면 (SHL_IDF_CD가 없을 때 폴백) */
const DISCLOSURE_PORTAL = `${BASE}/ei/ss/pneiss_a03_s0.do`;

/** 이 항목은 중·고만 공시된다 (초등·특수는 데이터 없음) */
export function achievementApplies(kind: string): boolean {
  return kind.includes("중학교") || kind.includes("고등학교");
}

/**
 * 학교별 공시 화면 딥링크.
 * SHL_IDF_CD가 있으면 해당 학교 공시 화면으로 바로(GET 동작 확인됨),
 * 없으면 학교명으로 찾는 통합검색 화면으로 보낸다.
 */
export function achievementDeepLink(shlIdfCd?: string): string {
  return shlIdfCd
    ? `${BASE}/ei/ss/Pneiss_b01_s0.do?SHL_IDF_CD=${encodeURIComponent(shlIdfCd)}`
    : DISCLOSURE_PORTAL;
}

/** 교과별 학업성취 사항 확인 안내 (캡차로 자동조회 불가 → 직접 확인 딥링크) */
export function achievementGuide(school: School): string {
  const link = achievementDeepLink(school.shlIdfCd);
  const lines = [
    `📊 "${school.name}" 교과별 학업성취 사항 — 과목별 평균점수·성취도(A~E) 분포비율`,
    ``,
  ];
  if (!achievementApplies(school.kind)) {
    lines.push(`※ 이 항목은 중·고등학교만 공시합니다 (${school.kind || "이 학교"}는 해당 없음).`, ``);
  }
  lines.push(
    `이 항목은 학교알리미가 보안문자(캡차)로 보호하고 있어 자동 조회가 되지 않습니다.`,
    `아래 링크에서 직접 확인하세요:`,
    ``,
    `👉 ${link}`,
    ``,
    `공시 화면이 열리면 "학업성취사항 → 교과별 학업성취 사항"을 선택하고 보안문자를 입력하면`,
    `학년·학기·과목별 평균점수와 성취도(A~E) 분포비율을 볼 수 있습니다.`,
  );
  return lines.join("\n");
}
