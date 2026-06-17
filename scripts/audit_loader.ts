// JSON ↔ 로더 전수 대조: 빌드된 로더(admission.ts)가 admission.json을 누락·왜곡 없이 서빙하는지.
// (원본 xlsx ↔ JSON 은 verify_admission.py가 별도 증명. 이 둘을 합치면 원본→서빙 끝단 정합.)
import admissionData from "../src/admission.json" with { type: "json" };
import {
  findAdmissionUniversity, searchAdmissionMajors, formatAdmission, listAdmissionUniversities,
} from "../src/admission.js";

const DB: any = admissionData;
const fail: string[] = [];
const ck = (c: boolean, m: string) => { if (!c) fail.push(m); };
const norm = (s: string) => (s || "").replace(/[\s·]/g, "");

// 1) 목록 정합
ck(listAdmissionUniversities().length === DB.universities.length, `목록 수 ${listAdmissionUniversities().length} vs ${DB.universities.length}`);

// 2) 캠퍼스 기준명 그룹
const bk = (s: string) => s.replace(/\([^)]*\)/g, "").replace(/[\s·]/g, "").replace(/(대학교|대학|대)$/u, "");
const byBase = new Map<string, any[]>();
for (const u of DB.universities) { const k = bk(u.name); (byBase.get(k) || byBase.set(k, []).get(k)!).push(u); }

// 3) 전 대학: find가 해석되고, 그 대학 모든 모집단위를 서빙하는지(병합 포함)
let majorChecks = 0;
for (const u of DB.universities) {
  const found = findAdmissionUniversity(u.name);
  ck(!!found, `find 실패: ${u.name}`);
  if (!found) continue;
  // u의 각 모집단위가 found.majors(병합 시 상위집합)에 그대로 존재
  for (const m of u.majors) {
    const hit = found.majors.find((x: any) => x.unit === m.unit && norm(x.core) === norm(m.core) && norm(x.recommended) === norm(m.recommended) && norm(x.note) === norm(m.note));
    ck(!!hit, `서빙 누락/왜곡: ${u.name}/${m.unit}`);
    majorChecks++;
  }
}

// 4) 캠퍼스 병합 합계 검증
for (const [base, group] of byBase) {
  if (group.length < 2) continue;
  const merged = findAdmissionUniversity(group[0].name);
  const sum = group.reduce((s: number, g: any) => s + g.majors.length, 0);
  ck(merged!.majors.length === sum, `캠퍼스병합 합계 ${base}: ${merged!.majors.length} vs ${sum}`);
  ck(merged!.majors.some((m: any) => m.campus), `캠퍼스 태그 누락 ${base}`);
}

// 5) 검색 필터 정확성 (전 대학에서 첫 모집단위 토큰으로)
for (const u of DB.universities) {
  const found = findAdmissionUniversity(u.name)!;
  const sample = u.majors[0];
  const tok = sample.unit.slice(0, 3);
  const res = searchAdmissionMajors(found, tok);
  ck(res.every((m: any) => m.unit.includes(tok) || (m.college || "").includes(tok)), `필터 오염 ${u.name} "${tok}"`);
}

// 6) 위생: 빈 unit / 'None'·'nan' 잔재
for (const u of DB.universities) for (const m of u.majors) {
  ck(!!m.unit && m.unit.trim().length > 0, `빈 unit ${u.name}`);
  for (const f of ["core", "recommended", "note"]) ck(!["None", "nan", "-", "—"].includes((m as any)[f]), `위생 ${u.name}/${m.unit}.${f}`);
}

// 7) 엣지
ck(findAdmissionUniversity("부산대")?.name === "부산대", "약칭 부산대");
ck(findAdmissionUniversity("서울대")?.name === "서울대", "약칭 서울대(서울시립과 미혼동)");
ck(findAdmissionUniversity("서울시립대")?.name === "서울시립대", "서울시립대 해석");
ck(findAdmissionUniversity("없는대학ZZZ") === undefined, "미존재 undefined");
ck(/출처/.test(formatAdmission(findAdmissionUniversity("부산대")!, searchAdmissionMajors(findAdmissionUniversity("부산대")!, "경영"))), "format 출처");

console.log(`대학 ${DB.universities.length} / 모집단위 서빙대조 ${majorChecks} / 캠퍼스병합그룹 ${[...byBase.values()].filter(g => g.length > 1).length}`);
if (fail.length) { console.log(`❌ ${fail.length}건 실패:`); fail.slice(0, 40).forEach(f => console.log("  -", f)); process.exit(1); }
console.log("✅ JSON↔로더 전수 정합 — 누락·왜곡·위생 0건");
