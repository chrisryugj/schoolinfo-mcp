// "09 학년별·학급별 학생수" 구조화 단위테스트.
// generic 2열 표로 풀면 학년이 섞여 못 읽겠다는 학부모 피드백 → 학년을 열로 구조화한다.
// 라이브 키 없이 검증하려고, getAreaStudents와 동일한 실제 컬럼(COL_S1.. 등) mock으로 확인.
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDisclosure } from "../src/index.js";

test("09 학생수: 학년을 열로 구조화 + 학급/교사 지표", () => {
  const row = {
    SCHUL_NM: "테스트초",
    COL_S1: "100", COL_S2: "110", COL_S3: "105",
    COL_S4: "98", COL_S5: "102", COL_S6: "95",
    COL_S_SUM: "610", COL_C_SUM: "24", COL_SUM: "25", TEACH_CAL: "15",
  };
  const md = formatDisclosure("학년별·학급별 학생수", [row], "09");
  // 학년이 헤더 열로 분리돼야 한다(섞이지 않게)
  assert.match(md, /\| 구분 \| 1학년 \| 2학년 \| 3학년 \| 4학년 \| 5학년 \| 6학년 \| 합계 \|/);
  // 학생수 행에 값과 합계
  assert.match(md, /\| 학생수 \| 100 \| 110 \| 105 \| 98 \| 102 \| 95 \| 610 \|/);
  // 학급/교사 지표
  assert.match(md, /학급수 \*\*24\*\*/);
  assert.match(md, /학급당 \*\*25명\*\*/);
  assert.match(md, /교사 1인당 \*\*15명\*\*/);
});

test("09 학생수: 학년 컬럼 없는 양식이면 generic 2열 표로 폴백", () => {
  const md = formatDisclosure("학년별·학급별 학생수", [{ SCHUL_NM: "X", SOME_COL: "값" }], "09");
  assert.match(md, /\| 항목 \| 값 \|/);
  assert.match(md, /\| SOME_COL \| 값 \|/);
});

test("09가 아닌 공시는 영향 없음(generic 표 유지)", () => {
  const md = formatDisclosure("아무공시", [{ SCHUL_NM: "X", FOO: "bar" }], "34");
  assert.match(md, /\| 항목 \| 값 \|/);
  assert.match(md, /\| FOO \| bar \|/);
});
