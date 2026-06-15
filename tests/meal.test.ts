// 급식 알레르기 파서/포맷 단위테스트 — 안전 직결 로직이라 회귀 방지가 중요.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDish, parseAvoid, allergenNames, formatMeal, type MealItem } from "../src/neis.js";

test("parseDish: 알레르기 번호 추출 (점 구분)", () => {
  const d = parseDish("얼큰한우물만두국 (1.5.6.10.16.18)");
  assert.equal(d.name, "얼큰한우물만두국");
  assert.deepEqual(d.allergens, [1, 5, 6, 10, 16, 18]);
});

test("parseDish: 알레르기 없는 메뉴", () => {
  const d = parseDish("차조밥");
  assert.equal(d.name, "차조밥");
  assert.deepEqual(d.allergens, []);
});

test("parseDish: 콤마/공백 구분도 허용", () => {
  assert.deepEqual(parseDish("납작불고기+파채무침 (2, 5, 16)").allergens, [2, 5, 16]);
});

test("parseDish: 18 범위 밖 숫자는 무시", () => {
  assert.deepEqual(parseDish("정체불명 (19.0.99)").allergens, []);
});

test("parseAvoid: 이름·번호 혼합 입력", () => {
  const s = parseAvoid(["우유", "6"]);
  assert.ok(s.has(2), "우유=2");
  assert.ok(s.has(6), "밀=6");
  assert.equal(s.size, 2);
});

test("parseAvoid: 쉼표 한 문자열도 분해", () => {
  const s = parseAvoid(["우유, 땅콩"]);
  assert.ok(s.has(2) && s.has(4));
});

test("parseAvoid: '밀'은 메밀(3)을 잡지 않는다 (접두 매칭)", () => {
  const s = parseAvoid(["밀"]);
  assert.ok(s.has(6), "밀=6 포함");
  assert.ok(!s.has(3), "메밀=3 미포함");
  assert.equal(s.size, 1);
});

test("parseAvoid: 접두 '돼지'→돼지고기, '조개'→조개류", () => {
  const s = parseAvoid(["돼지", "조개"]);
  assert.ok(s.has(10) && s.has(18));
  assert.equal(s.size, 2);
});

test("allergenNames", () => {
  assert.equal(allergenNames([2, 6]), "우유·밀");
});

test("formatMeal: 회피 지정 시 ⚠️/✅ 분리 + 면책 포함", () => {
  const items: MealItem[] = [
    {
      date: "20260615",
      meal: "중식",
      mealCode: "2",
      kcal: "832.0 Kcal",
      dishes: [parseDish("차조밥"), parseDish("우유빵 (2.6)"), parseDish("오이지무침 (13)")],
      nutrients: undefined,
    },
  ];
  const md = formatMeal("개포중", items, { avoid: parseAvoid(["우유"]) });
  assert.match(md, /⚠️ 회피 해당/);
  assert.match(md, /우유빵/);
  assert.match(md, /✅ 안전/);
  assert.match(md, /차조밥/);
  assert.match(md, /참고용/);
});

test("formatMeal: 빈 급식은 안내문", () => {
  assert.match(formatMeal("X학교", []), /급식 정보가 없습니다/);
});

test("formatMeal: 회피 없으면 전체 나열 + 알레르기 라벨", () => {
  const items: MealItem[] = [
    { date: "20260615", meal: "중식", mealCode: "2", dishes: [parseDish("불고기 (16)")] },
  ];
  const md = formatMeal("X학교", items);
  assert.match(md, /불고기 \(쇠고기\)/);
  assert.doesNotMatch(md, /회피 해당/);
});
