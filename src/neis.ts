// NEIS 교육정보 개방 포털(open.neis.go.kr) 학사일정 연동.
//
// 학교알리미 공시 35종엔 '학사일정' 항목이 없어 NEIS Open API로 별도 조회한다.
// 환경변수 NEIS_API_KEY 필요 — https://open.neis.go.kr 에서 인증키 발급(무료).
//
// 흐름: 학교명(+시도) → schoolInfo로 NEIS 학교코드 → SchoolSchedule로 학사일정.

const NEIS_BASE = "https://open.neis.go.kr/hub";
const FETCH_TIMEOUT = 15_000;

export function hasNeisKey(): boolean {
  return !!process.env.NEIS_API_KEY;
}

async function neisGet(path: string, params: Record<string, string>): Promise<any> {
  const key = process.env.NEIS_API_KEY;
  if (!key) throw new Error("NEIS_API_KEY가 설정되지 않았습니다.");
  const qs = new URLSearchParams({ KEY: key, Type: "json", pIndex: "1", pSize: "1000", ...params });
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(`${NEIS_BASE}/${path}?${qs}`, { signal: ac.signal });
    if (!res.ok) throw new Error(`NEIS HTTP ${res.status}`);
    return await res.json();
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error("NEIS 응답 지연으로 시간이 초과되었습니다.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** NEIS 응답에서 데이터 row 추출 (정상 시 [{head},{row}], 무데이터/오류 시 []) */
function neisRows(json: any, service: string): any[] {
  const node = json?.[service];
  if (Array.isArray(node) && node[1] && Array.isArray(node[1].row)) return node[1].row;
  return [];
}

export interface NeisSchool {
  atptCode: string; // ATPT_OFCDC_SC_CODE (시도교육청코드)
  schoolCode: string; // SD_SCHUL_CODE (행정표준 학교코드)
  name: string;
  sido: string;
}

/** 학교명(+시도명)으로 NEIS 학교코드를 조회한다 */
export async function findNeisSchool(name: string, sidoName?: string): Promise<NeisSchool | null> {
  const json = await neisGet("schoolInfo", { SCHUL_NM: name });
  const rows = neisRows(json, "schoolInfo");
  if (!rows.length) return null;
  let cand = rows;
  if (sidoName) {
    // 전체 시도명으로 비교 (2글자 prefix는 경상북도/경상남도·충청북도/충청남도를 못 가림).
    // 양쪽 앞 2글자로 느슨 비교해 "서울"↔"서울특별시" 약칭 차이는 흡수하되, 정식 도명은 끝까지 본다.
    const norm = (v: string) => v.replace(/\s/g, "");
    const key = norm(sidoName);
    const filtered = rows.filter((x: any) => {
      const lc = norm(String(x.LCTN_SC_NM || ""));
      return lc === key || lc.startsWith(key) || key.startsWith(lc);
    });
    if (filtered.length) cand = filtered;
  }
  const hit = cand.find((x: any) => x.SCHUL_NM === name) ?? cand[0];
  return {
    atptCode: String(hit.ATPT_OFCDC_SC_CODE ?? ""),
    schoolCode: String(hit.SD_SCHUL_CODE ?? ""),
    name: String(hit.SCHUL_NM ?? name),
    sido: String(hit.LCTN_SC_NM ?? ""),
  };
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
  return items;
}
