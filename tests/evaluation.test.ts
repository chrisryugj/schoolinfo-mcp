// PDF(GFM 파이프표) 평가계획의 학년/과목 구조화 단위테스트.
// kordoc PDF 출력은 HTML <table>가 아니라 GFM 파이프표라, structureEvaluation이
// 이를 정규화해 hwpx와 동일하게 학년/과목 칩 UI 데이터를 만들어내야 한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { structureEvaluation, gradeInFilename } from "../src/evaluation.js";

// 통합형 PDF를 흉내낸 GFM 마크다운: 학년 캡션 + 한 학년 전과목 종합표(5과목 이상).
const PDF_MD = `# 2026학년도 ○○중학교 교육과정 평가계획

1학년 교과별 평가 운영 계획

| 교과 | 평가영역 | 평가방법 | 반영비율 |
| --- | --- | --- | --- |
| 국어 | 말하기·듣기 | 수행평가 | 40% |
| 수학 | 도형 | 정기시험 | 60% |
| 영어 | 듣기 | 수행평가 | 50% |
| 과학 | 탐구 | 수행평가 | 50% |
| 사회 | 일반사회 | 정기시험 | 40% |
| 체육 | 건강 | 수행평가 | 100% |

2학년 교과별 평가 운영 계획

| 교과 | 평가영역 | 평가방법 | 반영비율 |
| --- | --- | --- | --- |
| 국어 | 쓰기 | 수행평가 | 45% |
| 수학 | 함수 | 정기시험 | 55% |
| 영어 | 독해 | 수행평가 | 50% |
| 과학 | 화학 | 수행평가 | 50% |
| 역사 | 한국사 | 정기시험 | 40% |
| 음악 | 가창 | 수행평가 | 100% |
`;

test("structureEvaluation: PDF(GFM 파이프표)도 학년별 종합표로 구조화한다", () => {
  const s = structureEvaluation(PDF_MD);
  assert.ok(s, "구조화 결과가 null이면 안 됨 (GFM 표 정규화 실패)");
  assert.equal(s!.grades.length, 2, "1·2학년 두 종합표");
  assert.equal(s!.grades[0].grade, 1);
  assert.equal(s!.grades[1].grade, 2);
  // 각 학년 종합표에서 5과목 이상 추출
  assert.ok(s!.grades[0].subjects.includes("국어"));
  assert.ok(s!.grades[0].subjects.includes("체육"));
  assert.ok(s!.grades[1].subjects.includes("역사"));
  // 종합표 tableHtml은 HTML <table>로 정규화되어 각 교과 행에 data-subject가 주입됨
  assert.match(s!.grades[0].tableHtml, /<table>/);
  assert.match(s!.grades[0].tableHtml, /data-subject="국어"/);
});

test("structureEvaluation: 학년 캡션 없는 GFM 표는 구조화하지 않는다(폴백)", () => {
  const noGrade = `| 교과 | 평가방법 |
| --- | --- |
| 국어 | 수행평가 |
| 수학 | 정기시험 |
`;
  assert.equal(structureEvaluation(noGrade), null);
});

test("structureEvaluation: HWPX(HTML <table>) 경로는 GFM 정규화의 영향을 받지 않는다", () => {
  // <table>가 이미 있으면 GFM 변환을 건너뛴다 (가드 검증). 학년/5과목 없으니 null.
  const htmlMd = `<table><tr><td>국어</td><td>수행평가</td></tr></table>`;
  assert.equal(structureEvaluation(htmlMd), null);
});

// 회귀: 파일명의 "2026학년도" 끝자리를 학년으로 오독하던 문제.
// 한국 학교 문서는 파일명에 거의 항상 학년도가 들어가서, 막지 않으면 모든 파일이
// 학년 표기를 가진 것으로 잡히고 값도 틀린다(실측 파일명 기준).
test("gradeInFilename — 학년도를 학년으로 오독하지 않는다", () => {
  // 학년 표기가 없는 실제 파일명 → null (기존엔 2026 의 6 을 잡아 6 을 반환)
  assert.equal(gradeInFilename("2026학년도 한문과 1학기 교수학습 및 평가운영 계획.hwp"), null);
  assert.equal(gradeInFilename("2026학년도 자양중 1학기 교수·학습 및 평가계획.hwpx"), null);
  assert.equal(gradeInFilename("2026학년도 광남고 학교교육과정 편성·운영·평가 계획.pdf"), null);

  // 실제 학년 표기는 그대로 인식
  assert.equal(gradeInFilename("6. 2026학년도 6학년 1학기 교수학습 및 평가 계획.hwp"), 6);
  assert.equal(gradeInFilename("4. 2026학년도 4학년 1학기 교수학습 및 평가 계획.hwp"), 4);

  // 연도와 학년이 다를 때 연도를 집어가지 않는다 (기존엔 2025 의 5 를 반환)
  assert.equal(gradeInFilename("2025학년도 3학년 전과목 평가계획.hwp"), 3);
  assert.equal(gradeInFilename("3 학년 평가계획.hwp"), 3);
});
