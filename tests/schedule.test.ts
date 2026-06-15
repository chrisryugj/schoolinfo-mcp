// 학사일정 D-day · 주간 브리핑 로직 단위테스트 (NEIS 호출 없이 가공 로직만).
import { test } from "node:test";
import assert from "node:assert/strict";
import { upcomingHighlights, weekRange, formatWeek } from "../src/neis.js";

test("upcomingHighlights: 다가오는 시험/방학 D-day", () => {
  const items = [
    { date: "20260610", name: "지난 행사" },
    { date: "20260701", name: "1학기 기말고사" },
    { date: "20260722", name: "여름방학식" },
  ];
  const up = upcomingHighlights(items, "20260615");
  assert.equal(up.exam?.name, "1학기 기말고사");
  assert.equal(up.exam?.dday, 16); // 6/15 → 7/1
  assert.equal(up.vacation?.name, "여름방학식");
  assert.equal(up.vacation?.dday, 37);
});

test("upcomingHighlights: 과거 항목 제외", () => {
  const up = upcomingHighlights([{ date: "20260101", name: "겨울방학" }], "20260615");
  assert.equal(up.vacation, undefined);
});

test("upcomingHighlights: '수행평가'는 시험으로 안 잡고 '고사'를 잡는다", () => {
  const items = [
    { date: "20260620", name: "수행평가 주간" },
    { date: "20260625", name: "중간고사" },
  ];
  assert.equal(upcomingHighlights(items, "20260615").exam?.name, "중간고사");
});

test("weekRange: 월요일~일요일 (2026-06-15는 월)", () => {
  const r = weekRange("20260615");
  assert.equal(r.from, "20260615");
  assert.equal(r.to, "20260621");
  // 일요일 입력도 같은 주(그 주 월요일)로
  const r2 = weekRange("20260621");
  assert.equal(r2.from, "20260615");
  assert.equal(r2.to, "20260621");
});

test("formatWeek: D-day 헤더 + 오늘 표시 + 급식/일정", () => {
  const md = formatWeek("개포중", { from: "20260615", to: "20260621" }, {
    meals: [
      { date: "20260615", meal: "중식", mealCode: "2", kcal: "832.0 Kcal", dishes: [{ name: "차조밥", allergens: [] }] },
    ],
    weekEvents: [{ date: "20260617", name: "현장체험학습" }],
    upcoming: { exam: { name: "기말고사", date: "20260701", dday: 16 } },
    today: "20260615",
  });
  assert.match(md, /기말고사 D-16/);
  assert.match(md, /· 오늘/);
  assert.match(md, /차조밥/);
  assert.match(md, /현장체험학습/);
});

test("formatWeek: 오늘 시간표 있으면 포함", () => {
  const md = formatWeek("개포중", { from: "20260615", to: "20260621" }, {
    meals: [],
    weekEvents: [],
    upcoming: {},
    today: "20260615",
    todayTimetable: [
      { date: "20260615", period: 1, subject: "도덕" },
      { date: "20260615", period: 2, subject: "사회" },
    ],
  });
  assert.match(md, /오늘 시간표: 도덕·사회/);
});
