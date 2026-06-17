// 대학 전공 연계 권장 이수과목 로더 단위테스트.
// 2028 권역별 자료집(xlsx) 49개 대학 + 연세·성균관 보완. 문자열 스키마(core/recommended/note).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findAdmissionUniversity,
  searchAdmissionMajors,
  formatAdmission,
  listAdmissionUniversities,
} from "../src/admission.js";

test("listAdmissionUniversities: 49개 대학 + 4개 권역", () => {
  const list = listAdmissionUniversities();
  assert.ok(list.length >= 49, `대학 수 ${list.length}`);
  const regions = new Set(list.map((u) => u.region));
  for (const r of ["수도권", "영남권", "중부권", "호남권"]) assert.ok(regions.has(r), `${r} 누락`);
});

test("findAdmissionUniversity: 약칭/정식명 매칭, 서울대↔서울시립대 미혼동", () => {
  assert.equal(findAdmissionUniversity("서울대")?.name, "서울대");
  assert.equal(findAdmissionUniversity("부산대")?.name, "부산대");
  assert.ok(findAdmissionUniversity("연세")?.name.includes("연세"));
  assert.equal(findAdmissionUniversity("없는대학")?.name, undefined);
});

test("캠퍼스 분할(강원대) 병합 + campus 태그", () => {
  const u = findAdmissionUniversity("강원대")!;
  assert.ok(u, "강원대 없음");
  // 춘천/삼척 모집단위가 합쳐지고 campus 태그가 붙는다
  assert.ok(u.majors.some((m) => m.campus), "campus 태그 없음");
});

test("본교/분교 분리: 괄호 없는 이름은 본교만, 분교명은 그 분교만", () => {
  // "건국대"는 서울 본교만(글로컬 충주 섞이지 않음)
  const ku = findAdmissionUniversity("건국대")!;
  assert.equal(ku.name, "건국대");
  assert.equal(ku.area, "서울");
  assert.ok(!ku.majors.some((m) => m.campus), "본교에 글로컬 campus 섞임");
  // "건국대(글로컬)"는 글로컬 분교만
  const kuG = findAdmissionUniversity("건국대(글로컬)")!;
  assert.ok(kuG.name.includes("글로컬"), `name=${kuG.name}`);
  assert.equal(kuG.area, "충북");
  // 한양대/단국대도 동일
  assert.equal(findAdmissionUniversity("한양대")!.area, "서울");
  assert.equal(findAdmissionUniversity("한양대(ERICA)")!.area, "경기");
  assert.equal(findAdmissionUniversity("단국대")!.area, "경기");
  assert.equal(findAdmissionUniversity("단국대(천안)")!.area, "충남");
});

test("부산대 모집단위에 핵심과목·기준 문자열 보존", () => {
  const u = findAdmissionUniversity("부산대")!;
  const m = searchAdmissionMajors(u, "경영")[0];
  assert.ok(m, "경영 매칭 없음");
  assert.ok(m.core.includes("미적분"), `core=${m.core}`);
  assert.ok(typeof m.note === "string");
});

test("연세대 보완 데이터: 컴퓨터과학과 핵심과목", () => {
  const u = findAdmissionUniversity("연세")!;
  const m = u.majors.find((x) => x.unit === "컴퓨터과학과")!;
  assert.ok(m, "컴퓨터과학과 없음");
  assert.ok(m.core.includes("미적분"));
});

test("searchAdmissionMajors: 단과대명으로도 필터", () => {
  const snu = findAdmissionUniversity("서울대")!;
  const hits = searchAdmissionMajors(snu, "공과대학");
  assert.ok(hits.length > 0 && hits.every((m) => (m.college ?? "").includes("공") || m.unit.includes("공")));
});

test("formatAdmission: 핵심/권장/기준 라벨과 출처 포함", () => {
  const u = findAdmissionUniversity("부산대")!;
  const md = formatAdmission(u, searchAdmissionMajors(u, "경영"));
  assert.ok(md.includes("출처"));
  assert.ok(md.includes("핵심과목") || md.includes("권장과목"));
});
