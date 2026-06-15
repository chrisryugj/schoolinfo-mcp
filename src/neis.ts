// NEIS 교육정보 개방 포털(open.neis.go.kr) 학사일정 연동.
//
// 학교알리미 공시 35종엔 '학사일정' 항목이 없어 NEIS Open API로 별도 조회한다.
// 환경변수 NEIS_API_KEY 필요 — https://open.neis.go.kr 에서 인증키 발급(무료).
//
// 흐름: 학교명(+시도) → schoolInfo로 NEIS 학교코드 → SchoolSchedule로 학사일정.

import { fetchWithRetry } from "./lib/fetch-with-retry.js";
import { schoolCache } from "./lib/cache.js";

const SCHOOL_TTL = 30 * 24 * 60 * 60 * 1000; // 학교코드는 거의 불변 → 30일
const SCHEDULE_TTL = 12 * 60 * 60 * 1000; // 학사일정은 학기 중 변동 가능 → 12시간

const NEIS_BASE = "https://open.neis.go.kr/hub";
const FETCH_TIMEOUT = 15_000;

export function hasNeisKey(): boolean {
  return !!process.env.NEIS_API_KEY;
}

async function neisGet(path: string, params: Record<string, string>): Promise<any> {
  const key = process.env.NEIS_API_KEY;
  if (!key) throw new Error("NEIS_API_KEY가 설정되지 않았습니다.");
  const qs = new URLSearchParams({ KEY: key, Type: "json", pIndex: "1", pSize: "1000", ...params });
  const res = await fetchWithRetry(`${NEIS_BASE}/${path}?${qs}`, {}, { timeout: FETCH_TIMEOUT, label: "NEIS" });
  if (!res.ok) throw new Error(`NEIS HTTP ${res.status}`);
  return await res.json();
}

/**
 * NEIS 응답에서 데이터 row 추출 (정상 시 [{head},{row}]).
 * NEIS는 무자료/오류를 모두 HTTP 200 + {RESULT:{CODE}}로 반환하므로, 인증실패·쿼터초과
 * (ERROR-*) 등을 무자료(INFO-200)와 구분해 throw 한다 — 키 장애가 '학교 못 찾음'으로
 * 둔갑해 침묵으로 넘어가는 것을 막기 위함(server.ts의 schedule catch가 로그로 남김).
 */
function neisRows(json: any, service: string): any[] {
  const code = json?.RESULT?.CODE ?? json?.[service]?.[0]?.head?.[1]?.RESULT?.CODE;
  if (code && code !== "INFO-000" && code !== "INFO-200") throw new Error(`NEIS ${code}`);
  const node = json?.[service];
  if (Array.isArray(node) && node[1] && Array.isArray(node[1].row)) return node[1].row;
  return [];
}

/**
 * 한국 학년도(3월~익년 2월) 기준 현재 학년도. 1~2월이면 (달력연도-1).
 * fly 컨테이너는 UTC이므로 KST(+9h) 보정해 연말연시 경계 어긋남을 막는다.
 */
export function currentAcademicYear(): number {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  return kst.getUTCMonth() < 2 ? kst.getUTCFullYear() - 1 : kst.getUTCFullYear();
}

export interface NeisSchool {
  atptCode: string; // ATPT_OFCDC_SC_CODE (시도교육청코드)
  schoolCode: string; // SD_SCHUL_CODE (행정표준 학교코드)
  name: string;
  sido: string;
}

/**
 * 학교명(+시도명+시군구)으로 NEIS 학교코드를 조회한다.
 * NEIS SCHUL_NM은 LIKE 부분일치라 동명이교가 여럿 잡히므로 시도→완전일치→시군구 순으로 좁힌다.
 * 호출부는 시도 약칭을 정식명으로 정규화해 넘길 것(예: 경북→경상북도). sgg는 도로명주소로 동명이교를 가른다.
 */
export async function findNeisSchool(name: string, sidoName?: string, sgg?: string): Promise<NeisSchool | null> {
  const cacheKey = `neis:school:${name}:${sidoName ?? ""}:${sgg ?? ""}`;
  const cached = schoolCache.get<NeisSchool>(cacheKey);
  if (cached) return cached;
  const json = await neisGet("schoolInfo", { SCHUL_NM: name });
  const rows = neisRows(json, "schoolInfo");
  if (!rows.length) return null;
  const norm = (v: string) => String(v ?? "").replace(/\s/g, "");
  let cand = rows;
  if (sidoName) {
    // 전체 시도명으로 비교 (2글자 prefix는 경상북도/경상남도·충청북도/충청남도를 못 가림).
    // 양쪽 앞 2글자로 느슨 비교해 "서울"↔"서울특별시" 약칭 차이는 흡수하되, 정식 도명은 끝까지 본다.
    const key = norm(sidoName);
    const filtered = rows.filter((x: any) => {
      const lc = norm(x.LCTN_SC_NM);
      return lc === key || lc.startsWith(key) || key.startsWith(lc);
    });
    // 시도가 주어졌는데 그 시도에 없으면 타 시도 학교를 임의 선택하지 말고 null
    // (전국 폴백은 동명이교의 엉뚱한 도시 일정을 조용히 반환하는 버그였음).
    if (!filtered.length) return null;
    cand = filtered;
  }
  // LIKE 부분일치 결과 중 정식명 완전일치 우선 (없으면 부분일치 후보 유지)
  const exact = cand.filter((x: any) => x.SCHUL_NM === name);
  let pool = exact.length ? exact : cand;
  // 같은 시도 내 동명이교: 시군구로 추가 구분 (NEIS ORG_RDNMA 도로명주소에 시군구 포함)
  if (pool.length > 1 && sgg) {
    const sggKey = norm(sgg);
    const byAddr = pool.filter((x: any) => norm(x.ORG_RDNMA).includes(sggKey));
    if (byAddr.length) pool = byAddr;
  }
  const hit = pool[0];
  const result: NeisSchool = {
    atptCode: String(hit.ATPT_OFCDC_SC_CODE ?? ""),
    schoolCode: String(hit.SD_SCHUL_CODE ?? ""),
    name: String(hit.SCHUL_NM ?? name),
    sido: String(hit.LCTN_SC_NM ?? ""),
  };
  schoolCache.set(cacheKey, result, SCHOOL_TTL);
  return result;
}

export interface ScheduleItem {
  date: string; // YYYYMMDD
  name: string;
  content?: string;
}

/** 학사일정 조회 (기간: YYYYMMDD ~ YYYYMMDD) */
export async function fetchSchedule(
  atptCode: string,
  schoolCode: string,
  fromYmd: string,
  toYmd: string
): Promise<ScheduleItem[]> {
  const cacheKey = `neis:sched:${atptCode}:${schoolCode}:${fromYmd}:${toYmd}`;
  const cached = schoolCache.get<ScheduleItem[]>(cacheKey);
  if (cached) return cached;
  const json = await neisGet("SchoolSchedule", {
    ATPT_OFCDC_SC_CODE: atptCode,
    SD_SCHUL_CODE: schoolCode,
    AA_FROM_YMD: fromYmd,
    AA_TO_YMD: toYmd,
  });
  const rows = neisRows(json, "SchoolSchedule");
  const seen = new Set<string>();
  const items: ScheduleItem[] = [];
  for (const x of rows) {
    const name = String(x.EVENT_NM ?? "").trim();
    const date = String(x.AA_YMD ?? "").trim();
    if (!name || !/^\d{8}$/.test(date)) continue;
    if (name === "토요휴업일") continue; // 매주 반복되는 노이즈 제거
    const k = date + "|" + name;
    if (seen.has(k)) continue;
    seen.add(k);
    const content = String(x.EVENT_CNTNT ?? "").trim();
    items.push({ date, name, content: content || undefined });
  }
  items.sort((a, b) => a.date.localeCompare(b.date));
  schoolCache.set(cacheKey, items, SCHEDULE_TTL);
  return items;
}

/** 학사일정 항목을 월별로 묶어 사람이 읽기 좋은 마크다운으로 (MCP/CLI 공용) */
export function formatSchedule(school: string, year: number | undefined, items: ScheduleItem[]): string {
  const title = `🗓 ${school} ${year ? `${year}학년도 ` : ""}학사일정`;
  if (!items.length) return `# ${title}\n\n표시할 학사일정이 없습니다.`;
  const byMonth = new Map<string, ScheduleItem[]>();
  for (const it of items) {
    const m = it.date.slice(0, 6);
    const arr = byMonth.get(m) ?? [];
    if (!arr.length) byMonth.set(m, arr);
    arr.push(it);
  }
  const parts = [`# ${title}`, ""];
  for (const m of [...byMonth.keys()].sort()) {
    parts.push(`## ${Number(m.slice(4, 6))}월`, "");
    for (const it of byMonth.get(m)!) {
      const day = Number(it.date.slice(6, 8));
      parts.push(`- ${day}일 ${it.name}${it.content ? ` — ${it.content}` : ""}`);
    }
    parts.push("");
  }
  return parts.join("\n");
}
