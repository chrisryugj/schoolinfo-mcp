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
export function formatSchedule(
  school: string,
  year: number | undefined,
  items: ScheduleItem[],
  opts: { today?: string } = {}
): string {
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
  // 다가오는 시험·방학 D-day 요약 (상단)
  const up = upcomingHighlights(items, opts.today);
  const hi: string[] = [];
  if (up.exam) hi.push(`📝 다음 시험: ${ddayLabel(up.exam)}`);
  if (up.vacation) hi.push(`🏖 다음 방학: ${ddayLabel(up.vacation)}`);
  if (hi.length) parts.push(...hi, "");
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

// ─── 급식 식단 (mealServiceDietInfo) ────────────────────────────
// 학교알리미 공시 35종의 '급식'(코드 34/35)은 연간 실시 통계일 뿐, 매일 식단표는 NEIS에만 있다.
// 응답 DDISH_NM은 "차조밥 <br/>얼큰한우물만두국 (1.5.6.10.16.18)<br/>..." 형태로,
// 각 요리 뒤 괄호에 알레르기 유발식품 번호(아래 ALLERGENS)가 붙는다.

const MEAL_TTL = 6 * 60 * 60 * 1000; // 급식은 월초 확정이나 학기중 변동 가능 → 6시간

/** NEIS 표준 알레르기 유발식품 18종 (번호 → 이름). 18 조개류는 굴·전복·홍합 포함. */
export const ALLERGENS: Record<number, string> = {
  1: "난류", 2: "우유", 3: "메밀", 4: "땅콩", 5: "대두", 6: "밀",
  7: "고등어", 8: "게", 9: "새우", 10: "돼지고기", 11: "복숭아", 12: "토마토",
  13: "아황산류", 14: "호두", 15: "닭고기", 16: "쇠고기", 17: "오징어", 18: "조개류",
};

export interface MealDish {
  name: string;
  allergens: number[]; // 1~18, ALLERGENS 키
}
export interface MealItem {
  date: string; // YYYYMMDD
  meal: string; // 조식 | 중식 | 석식
  mealCode: string; // 1 | 2 | 3
  kcal?: string; // "832.0 Kcal"
  dishes: MealDish[];
  nutrients?: string; // "탄수화물(g) : 97.0 · 단백질(g) : 33.1 · ..."
}

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

/** YYYYMMDD → "6/15(월)". 날짜만 다루므로 UTC로 계산해 실행환경 무관하게 요일 고정. */
export function ymdToLabel(ymd: string): string {
  const y = +ymd.slice(0, 4), m = +ymd.slice(4, 6), d = +ymd.slice(6, 8);
  const w = WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}/${d}(${w})`;
}

/** 오늘(KST) YYYYMMDD. fly 컨테이너 UTC 보정 — currentAcademicYear와 동일 정책. */
export function todayKstYmd(): string {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/** YYYYMMDD에 n일 더한 YYYYMMDD */
export function addDaysYmd(ymd: string, n: number): string {
  const y = +ymd.slice(0, 4), mo = +ymd.slice(4, 6), d = +ymd.slice(6, 8);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

/** "얼큰한우물만두국 (1.5.6.10.16.18)" → {name, allergens:[1,5,6,10,16,18]}. 구분자는 . , 공백 허용. */
export function parseDish(raw: string): MealDish {
  const s = String(raw ?? "").replace(/\s+/g, " ").trim();
  const m = s.match(/\(([\d.,\s]+)\)\s*$/);
  if (!m) return { name: s, allergens: [] };
  const name = s.slice(0, m.index).trim();
  const allergens = m[1]
    .split(/[.,\s]+/)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 18);
  return { name: name || s, allergens };
}

/** 회피 알레르기 입력(["우유","땅콩"] 또는 ["2","4"] 또는 "우유, 밀") → 번호 Set. */
export function parseAvoid(input: string[] | undefined): Set<number> {
  const out = new Set<number>();
  if (!input) return out;
  const byName = Object.entries(ALLERGENS).map(([k, v]) => [v, Number(k)] as const);
  for (const raw of input) {
    for (const tok of String(raw).split(/[,\s]+/).filter(Boolean)) {
      if (/^\d+$/.test(tok)) {
        const n = Number(tok);
        if (ALLERGENS[n]) out.add(n);
      } else {
        // 접두 매칭만 — 부분포함이면 "밀"이 "메밀"을 잘못 무는 오회피가 생긴다.
        for (const [name, num] of byName) {
          if (name.startsWith(tok) || tok.startsWith(name)) out.add(num);
        }
      }
    }
  }
  return out;
}

/** 번호 배열 → "우유·밀" */
export function allergenNames(nums: number[]): string {
  return nums.map((n) => ALLERGENS[n] ?? `?${n}`).join("·");
}

function cleanNtr(s: any): string {
  return String(s ?? "")
    .split(/<br\s*\/?>/i)
    .map((x) => x.trim())
    .filter(Boolean)
    .join(" · ");
}

/** 급식 조회 (기간: YYYYMMDD ~ YYYYMMDD). 끼니별(조/중/석) 각각 한 행. */
export async function fetchMeal(
  atptCode: string,
  schoolCode: string,
  fromYmd: string,
  toYmd: string
): Promise<MealItem[]> {
  const cacheKey = `neis:meal:${atptCode}:${schoolCode}:${fromYmd}:${toYmd}`;
  const cached = schoolCache.get<MealItem[]>(cacheKey);
  if (cached) return cached;
  const json = await neisGet("mealServiceDietInfo", {
    ATPT_OFCDC_SC_CODE: atptCode,
    SD_SCHUL_CODE: schoolCode,
    MLSV_FROM_YMD: fromYmd,
    MLSV_TO_YMD: toYmd,
  });
  const rows = neisRows(json, "mealServiceDietInfo");
  const items: MealItem[] = rows
    .map((r: any) => {
      const dishes = String(r.DDISH_NM ?? "")
        .split(/<br\s*\/?>/i)
        .map((x) => x.trim())
        .filter(Boolean)
        .map(parseDish);
      return {
        date: String(r.MLSV_YMD ?? "").trim(),
        meal: String(r.MMEAL_SC_NM ?? "").trim(),
        mealCode: String(r.MMEAL_SC_CODE ?? "").trim(),
        kcal: String(r.CAL_INFO ?? "").trim() || undefined,
        dishes,
        nutrients: cleanNtr(r.NTR_INFO) || undefined,
      };
    })
    .filter((it) => /^\d{8}$/.test(it.date) && it.dishes.length > 0);
  // 날짜 → 끼니(조1·중2·석3) 순
  items.sort((a, b) => a.date.localeCompare(b.date) || a.mealCode.localeCompare(b.mealCode));
  schoolCache.set(cacheKey, items, MEAL_TTL);
  return items;
}

const MEAL_DISCLAIMER = "※ 알레르기 정보는 참고용입니다. 최종 확인은 학교 영양(교)사에게 하세요.";

/** 급식을 사람이 읽기 좋은 마크다운으로 (MCP/CLI 공용). avoid 지정 시 회피/안전 분리. */
export function formatMeal(
  school: string,
  items: MealItem[],
  opts: { avoid?: Set<number>; nutrition?: boolean } = {}
): string {
  const title = `🍚 ${school} 급식`;
  if (!items.length) {
    return `# ${title}\n\n해당 기간 급식 정보가 없습니다 (주말·방학·휴일일 수 있어요).`;
  }
  const avoid = opts.avoid && opts.avoid.size ? opts.avoid : null;
  const parts = [`# ${title}`, ""];
  if (avoid) parts.push(`> 회피 알레르기: **${allergenNames([...avoid])}**`, "");
  const dishLine = (d: MealDish) =>
    `- ${d.name}${d.allergens.length ? ` (${allergenNames(d.allergens)})` : ""}`;
  for (const it of items) {
    parts.push(`## ${ymdToLabel(it.date)} ${it.meal}${it.kcal ? ` · ${it.kcal}` : ""}`);
    if (avoid) {
      const hit = it.dishes.filter((d) => d.allergens.some((a) => avoid.has(a)));
      const safe = it.dishes.filter((d) => !d.allergens.some((a) => avoid.has(a)));
      if (hit.length) {
        parts.push(`⚠️ 회피 해당:`, ...hit.map(dishLine));
      }
      parts.push(`✅ 안전:`, ...safe.map(dishLine));
    } else {
      parts.push(...it.dishes.map(dishLine));
    }
    if (opts.nutrition && it.nutrients) parts.push("", `영양: ${it.nutrients}`);
    parts.push("");
  }
  parts.push(MEAL_DISCLAIMER);
  return parts.join("\n");
}

// ─── 학사일정 D-day 하이라이트 (Phase 2) ────────────────────
// 학사일정은 fetchSchedule로 이미 받는다. 신규 NEIS 호출 없이 가공만.

export interface UpcomingEvent {
  name: string;
  date: string; // YYYYMMDD
  dday: number; // 오늘=0
}

/** YYYYMMDD 간 일수 차 (target - base) */
function ddayBetween(base: string, target: string): number {
  const b = Date.UTC(+base.slice(0, 4), +base.slice(4, 6) - 1, +base.slice(6, 8));
  const t = Date.UTC(+target.slice(0, 4), +target.slice(4, 6) - 1, +target.slice(6, 8));
  return Math.round((t - b) / 86400000);
}

const EXAM_RE = /고사|지필/; // 중간/기말고사, 1·2차 지필평가 등 ("평가"만은 수행평가 노이즈라 제외)
const VACATION_RE = /방학/;

/** 오늘(KST) 이후 가장 가까운 시험/방학 항목 (D-day 포함) */
export function upcomingHighlights(
  items: ScheduleItem[],
  today?: string
): { exam?: UpcomingEvent; vacation?: UpcomingEvent } {
  const t = today ?? todayKstYmd();
  const future = items.filter((it) => it.date >= t).sort((a, b) => a.date.localeCompare(b.date));
  const find = (re: RegExp): UpcomingEvent | undefined => {
    const hit = future.find((it) => re.test(it.name));
    return hit ? { name: hit.name, date: hit.date, dday: ddayBetween(t, hit.date) } : undefined;
  };
  return { exam: find(EXAM_RE), vacation: find(VACATION_RE) };
}

/** "기말고사 D-12 (7/1)" — 오늘이면 D-DAY */
function ddayLabel(e: UpcomingEvent): string {
  const md = `${+e.date.slice(4, 6)}/${+e.date.slice(6, 8)}`;
  return `${e.name} ${e.dday === 0 ? "D-DAY" : `D-${e.dday}`} (${md})`;
}

// ─── 시간표 (Phase 3, 주간 브리핑 내장용) ───────────────────
// 학교급별 엔드포인트가 다르다. 학교가 NEIS에 미등록이면 빈 배열(주간 브리핑에서 해당 줄만 생략).

const TIMETABLE_TTL = 6 * 60 * 60 * 1000;
const TIMETABLE_SVC: Record<string, string> = {
  초등학교: "elsTimetable",
  중학교: "misTimetable",
  고등학교: "hisTimetable",
  특수학교: "spsTimetable",
};

export interface TimetableItem {
  date: string;
  period: number;
  subject: string;
}

export async function fetchTimetable(
  kind: string,
  atptCode: string,
  schoolCode: string,
  academicYear: number,
  grade: string,
  classNm: string,
  fromYmd: string,
  toYmd: string
): Promise<TimetableItem[]> {
  const svc = TIMETABLE_SVC[kind];
  if (!svc) return []; // 시간표 미지원 학교급
  const cacheKey = `neis:tt:${svc}:${schoolCode}:${academicYear}:${grade}:${classNm}:${fromYmd}:${toYmd}`;
  const cached = schoolCache.get<TimetableItem[]>(cacheKey);
  if (cached) return cached;
  const json = await neisGet(svc, {
    ATPT_OFCDC_SC_CODE: atptCode,
    SD_SCHUL_CODE: schoolCode,
    AY: String(academicYear),
    GRADE: grade,
    CLASS_NM: classNm,
    TI_FROM_YMD: fromYmd,
    TI_TO_YMD: toYmd,
  });
  const rows = neisRows(json, svc);
  const seen = new Set<string>();
  const items: TimetableItem[] = [];
  for (const r of rows) {
    const date = String(r.ALL_TI_YMD ?? "").trim();
    const period = Number(r.PERIO);
    const subject = String(r.ITRT_CNTNT ?? "").trim();
    if (!/^\d{8}$/.test(date) || !Number.isFinite(period) || !subject) continue;
    const k = `${date}|${period}`;
    if (seen.has(k)) continue; // 같은 교시 중복행 제거
    seen.add(k);
    items.push({ date, period, subject });
  }
  items.sort((a, b) => a.date.localeCompare(b.date) || a.period - b.period);
  schoolCache.set(cacheKey, items, TIMETABLE_TTL);
  return items;
}

// ─── 주간 브리핑 (Phase 3) ──────────────────────────────────
// 이번주 급식 + 학사일정 + 다가오는 D-day(+오늘 시간표)를 한 카드로.

/** 오늘이 포함된 주(월~일)의 YYYYMMDD 범위 */
export function weekRange(today: string): { from: string; to: string } {
  const y = +today.slice(0, 4), m = +today.slice(4, 6), d = +today.slice(6, 8);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=일
  const from = addDaysYmd(today, dow === 0 ? -6 : 1 - dow); // 그 주 월요일
  return { from, to: addDaysYmd(from, 6) };
}

export interface WeekData {
  meals: MealItem[];
  weekEvents: ScheduleItem[];
  upcoming: { exam?: UpcomingEvent; vacation?: UpcomingEvent };
  todayTimetable?: TimetableItem[];
  today: string;
}

/** 주간 브리핑 마크다운 (MCP/CLI/web 공용). 급식·일정 없는 날은 생략하되 오늘은 항상 표시. */
export function formatWeek(school: string, range: { from: string; to: string }, data: WeekData): string {
  const md = (ymd: string) => `${+ymd.slice(4, 6)}/${+ymd.slice(6, 8)}`;
  const parts = [`# 📅 ${school} 이번주 (${md(range.from)}~${md(range.to)})`, ""];
  const hi: string[] = [];
  if (data.upcoming.exam) hi.push(`📝 다음 시험: ${ddayLabel(data.upcoming.exam)}`);
  if (data.upcoming.vacation) hi.push(`🏖 다음 방학: ${ddayLabel(data.upcoming.vacation)}`);
  if (hi.length) parts.push(hi.join("  ·  "), "");

  const mealsByDate = new Map<string, MealItem[]>();
  for (const m of data.meals) {
    const arr = mealsByDate.get(m.date) ?? [];
    if (!arr.length) mealsByDate.set(m.date, arr);
    arr.push(m);
  }
  const evByDate = new Map<string, ScheduleItem[]>();
  for (const e of data.weekEvents) {
    const arr = evByDate.get(e.date) ?? [];
    if (!arr.length) evByDate.set(e.date, arr);
    arr.push(e);
  }

  let shown = 0;
  for (let i = 0; i < 7; i++) {
    const day = addDaysYmd(range.from, i);
    const dayMeals = mealsByDate.get(day) ?? [];
    const dayEvents = evByDate.get(day) ?? [];
    const isToday = day === data.today;
    if (!dayMeals.length && !dayEvents.length && !isToday) continue;
    shown++;
    parts.push(`## ${ymdToLabel(day)}${isToday ? " · 오늘" : ""}`);
    for (const m of dayMeals) {
      const names = m.dishes.map((x) => x.name).join("·");
      parts.push(`🍚 ${m.meal}: ${names}${m.kcal ? ` (${m.kcal})` : ""}`);
    }
    for (const e of dayEvents) parts.push(`📌 ${e.name}${e.content ? ` — ${e.content}` : ""}`);
    if (isToday && data.todayTimetable && data.todayTimetable.length) {
      parts.push(`🕐 오늘 시간표: ${data.todayTimetable.map((t) => t.subject).join("·")}`);
    }
    parts.push("");
  }
  if (!shown) parts.push("이번주 급식·학사일정 정보가 없습니다.", "");
  parts.push("> 급식 알레르기 등 상세는 '급식'을, 전체 일정은 '학사일정'을 조회하세요.");
  return parts.join("\n");
}
