// 학교알리미 OpenAPI 클라이언트
// 요청 URL: https://www.schoolinfo.go.kr/openApi.do (REST, JSON)

import {
  API_TYPES,
  REGIONS,
  SCHOOL_KIND,
  SCHOOL_KIND_REV,
  SchoolKindName,
  resolveSido,
  resolveSggList,
} from "./codes.js";
import { fetchWithRetry } from "./lib/fetch-with-retry.js";
import { schoolCache } from "./lib/cache.js";

const BASE_URL = "https://www.schoolinfo.go.kr/openApi.do";

// 전국 학교명 자동완성 검색 (공시포털 내부 AJAX). 인증키 불필요.
// OpenAPI에는 학교명 전국검색 파라미터가 없어, 학부모가 시도/시군구를 몰라도
// 이름만으로 찾을 수 있도록 이 엔드포인트를 재현한다. SHL_IDF_CD까지 함께 받는다.
const NAME_SEARCH_URL =
  "https://www.schoolinfo.go.kr/ei/ss/pneiss_a04_s0/getSchoolList.do";
const NAME_SEARCH_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

export interface School {
  schoolCode: string; // SCHUL_CODE — 공시 학교코드 (모든 상세조회의 키)
  shlIdfCd: string; // SHL_IDF_CD — 학교고유식별코드 (평가계획 웹 다운로드 키)
  name: string; // SCHUL_NM
  kind: string; // 학교급명 (중학교 등)
  foundation: string; // 설립구분 (공립/사립/국립)
  office: string; // 시도교육청
  officeCode: string; // ATPT_OFCDC_ORG_CODE
  address: string; // 도로명 주소
  tel: string; // 대표전화
  homepage: string; // 홈페이지
  // 후속 공시조회에 필요한 검색 코드 (학교 검색 시점의 값 보존)
  sidoCode: string;
  sggCode: string;
  schulKndCode: string;
  raw: Record<string, any>;
}

export interface ApiResult<T = any> {
  resultCode: string;
  resultMsg: string;
  list: T[];
}

export class SchoolInfoClient {
  constructor(private apiKey: string) {
    if (!apiKey) throw new Error("학교알리미 인증키(SCHOOLINFO_API_KEY)가 필요합니다.");
  }

  /** 임의 조사항목(apiType) 원시 호출 */
  async request(
    apiType: string,
    opts: { sidoCode: string; sggCode: string; schulKndCode: string; pbanYr?: string | number }
  ): Promise<ApiResult> {
    const url = new URL(BASE_URL);
    url.searchParams.set("apiKey", this.apiKey);
    url.searchParams.set("apiType", apiType);
    url.searchParams.set("schulKndCode", opts.schulKndCode);
    url.searchParams.set("sidoCode", opts.sidoCode);
    url.searchParams.set("sggCode", opts.sggCode);
    if (opts.pbanYr != null) url.searchParams.set("pbanYr", String(opts.pbanYr));

    const res = await fetchWithRetry(
      url,
      { headers: { "User-Agent": "schoolinfo-mcp/0.1" } },
      { timeout: 15_000, label: "학교알리미 OpenAPI" }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${url.pathname}`);
    const data = (await res.json()) as ApiResult;
    if (data.resultCode !== "success") {
      throw new Error(`학교알리미 API 오류: ${data.resultMsg}`);
    }
    return data;
  }

  /**
   * 학교 검색 — 시도/시군구/학교급으로 지역 내 학교 목록을 받고,
   * 이름 부분일치로 필터한다. (OpenAPI에 학교명 직접검색 파라미터가 없음)
   */
  async searchSchools(params: {
    sido: string;
    sgg: string;
    kind: SchoolKindName;
    name?: string;
  }): Promise<School[]> {
    const sido = resolveSido(params.sido);
    if (!sido) throw new Error(`알 수 없는 시도: "${params.sido}". 예: 서울특별시, 경기도`);
    const sggList = resolveSggList(sido.name, params.sgg);
    if (!sggList.length)
      throw new Error(
        `"${sido.name}"에 없는 시군구: "${params.sgg}". 가능한 값: ${Object.keys(
          REGIONS[sido.name].sgg
        )
          .slice(0, 8)
          .join(", ")} ...`
      );
    const kindCode = SCHOOL_KIND[params.kind];
    if (!kindCode) throw new Error(`알 수 없는 학교급: "${params.kind}"`);

    // 지역+학교급 단위 결과를 캐시 (이름 필터는 캐시 후 메모리에서). 동일 지역 반복조회 절감.
    const cacheKey = `search:${sido.code}:${params.sgg.trim()}:${kindCode}`;
    let schools = schoolCache.get<School[]>(cacheKey);
    if (!schools) {
      // 자치구를 가진 시("포항")는 하위 구 코드를 모두 합산 검색 (시 전체 코드는 0건이라 무해).
      // 자치구가 여럿이면 병렬 호출(allSettled)로 직렬 왕복을 줄인다.
      const merged = new Map<string, School>();
      let lastErr: Error | null = null;
      const settled = await Promise.allSettled(
        sggList.map((sgg) =>
          this.request("0", { sidoCode: sido.code, sggCode: sgg.code, schulKndCode: kindCode }).then(
            (data) => ({ sgg, data })
          )
        )
      );
      for (const r of settled) {
        if (r.status === "fulfilled") {
          for (const row of r.value.data.list) {
            const s = toSchool(row, sido.code, r.value.sgg.code, kindCode);
            if (s.schoolCode) merged.set(s.schoolCode, s);
          }
        } else {
          // "데이터 없음"(시 전체 코드 등) 등은 무시하고 계속
          lastErr = r.reason instanceof Error ? r.reason : new Error(String(r.reason));
        }
      }
      if (merged.size === 0 && lastErr) throw lastErr;
      schools = [...merged.values()];
      // 일부 구가 일시 실패했으면(부분결과) 캐시하지 않는다 — 누락된 학교가 굳지 않게
      if (!lastErr) schoolCache.set(cacheKey, schools);
    }
    if (params.name) {
      const q = params.name.replace(/\s/g, "");
      schools = schools.filter((s) => s.name.replace(/\s/g, "").includes(q));
    }
    return schools;
  }

  /**
   * 특정 학교의 공시정보(특정 apiType)를 조회한다.
   * 해당 지역 전체를 받아 SCHUL_CODE로 필터한다.
   */
  /**
   * 지역(시도/시군구/학교급) 전체 학교의 apiType 행을 반환한다 (캐시).
   * 학교알리미가 항목 조회 시 시군구 전체를 한 번에 주므로, 학교별 조회와 지역 비교가 이 list를 공유한다.
   */
  async getAreaDisclosure(
    apiType: string,
    sidoCode: string,
    sggCode: string,
    schulKndCode: string,
    year?: string | number
  ): Promise<Record<string, any>[]> {
    const y = year ?? new Date().getFullYear();
    // (지역+학교급+연도) 단위 캐시 — 같은 지역 다이제스트/비교 반복 시 적중. 연도는 해석값으로 키 정규화.
    const cacheKey = `disc:${apiType}:${sidoCode}:${sggCode}:${schulKndCode}:${y}`;
    let list = schoolCache.get<Record<string, any>[]>(cacheKey);
    if (!list) {
      const data = await this.request(apiType, { sidoCode, sggCode, schulKndCode, pbanYr: y });
      list = data.list;
      schoolCache.set(cacheKey, list);
    }
    return list;
  }

  async getDisclosure(
    school: School,
    apiType: string,
    year?: string | number
  ): Promise<{ name: string; rows: Record<string, any>[] }> {
    const list = await this.getAreaDisclosure(apiType, school.sidoCode, school.sggCode, school.schulKndCode, year);
    const rows = list.filter((r) => String(r.SCHUL_CODE ?? "") === school.schoolCode);
    return { name: API_TYPES[apiType] ?? apiType, rows };
  }
}

/** 전국 이름검색 결과 (지역/학교급 선택 없이 학교명만으로) */
export interface SchoolHit {
  name: string; // SHL_NM
  shlIdfCd: string; // SHL_IDF_CD (평가계획 다운로드 키)
  schoolCode: string; // SHL_CD
  sido: string; // 시도 정식명 (USER_DFN_CODE_VALUE_01)
  sgg: string; // 시군구 (USER_DFN_CODE_VALUE_02)
  dong: string; // 읍면동 (USER_DFN_CODE_VALUE_03)
  kind: string; // 학교급명 (중학교 등)
  foundation: string; // 설립 (공립/사립…)
  address: string; // FULL_ADDR
}

/**
 * 학교명만으로 전국 검색 (시도/시군구/학교급 선택 불필요).
 * 공시포털 자동완성 엔드포인트를 그대로 호출 — 인증키가 필요 없다.
 * 결과의 sido/sgg/kind로 기존 공시·평가계획 조회에 그대로 브릿지된다.
 */
export async function searchSchoolsByName(word: string, limit = 30): Promise<SchoolHit[]> {
  // 입력 길이 캡(40자) — 웹은 이미 잘라 보내나 MCP find_school은 원본 전달이라 양 경로 일관 방어
  const q = (word ?? "").trim().slice(0, 40);
  if (q.length < 2) return []; // 단일글자 전국검색 폭주 방지 (자동완성 최소 2자)
  const res = await fetchWithRetry(
    NAME_SEARCH_URL,
    {
      method: "POST",
      headers: {
        "User-Agent": NAME_SEARCH_UA,
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Referer: "https://www.schoolinfo.go.kr/ei/ss/pneiss_a03_s0.do",
      },
      body: new URLSearchParams({ SEARCH_WORD: q }),
    },
    { timeout: 15_000, label: "학교알리미" }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status} — 학교명 검색 실패`);
  // 응답 크기 상한 (4MB) — 거대 응답 전체 역직렬화 전 차단 (다운로드 경로와 동일한 방어)
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > 4_000_000) throw new Error("학교명 검색 응답이 너무 큽니다.");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > 4_000_000) throw new Error("학교명 검색 응답이 너무 큽니다.");
  let list: any[];
  try {
    list = JSON.parse(buf.toString("utf-8"));
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  return list
    .filter((r) => r && r.SHL_NM && r.SHL_IDF_CD)
    .slice(0, limit)
    .map((r) => {
      const name = String(r.SHL_NM);
      const sido = String(r.USER_DFN_CODE_VALUE_01 ?? r.LCTN_NM ?? "");
      // 세종특별자치시는 시군구(_02)가 없다(단일계층). regions.json의 세종 시군구 키가
      // 시도명과 같으므로, _02가 비면 시도명으로 폴백해 지역검색 브릿지가 깨지지 않게 한다.
      const sgg = String(r.USER_DFN_CODE_VALUE_02 ?? "") || sido;
      // 학교급: 코드 매핑 우선, 실패 시 학교명 접미사로 폴백.
      // (kind가 비면 후속 공시/평가계획 조회가 "잘못된 학교급"으로 깨지므로 최대한 채운다)
      let kind = SCHOOL_KIND_REV[String(r.SCHUL_KIND ?? r.SHL_CRSE_SC_CD ?? "")] ?? "";
      if (!kind) {
        if (name.endsWith("초등학교")) kind = "초등학교";
        else if (name.endsWith("중학교")) kind = "중학교";
        else if (name.endsWith("고등학교")) kind = "고등학교";
      }
      return {
        name,
        shlIdfCd: String(r.SHL_IDF_CD),
        schoolCode: String(r.SHL_CD ?? ""),
        sido,
        sgg,
        dong: String(r.USER_DFN_CODE_VALUE_03 ?? ""),
        kind,
        foundation: String(r.FOND_SC_NM ?? ""),
        address: String(r.FULL_ADDR ?? ""),
      };
    })
    .filter((s) => s.sido); // 지역 미상 행은 지역검색 브릿지가 불가하므로 제외
}

function toSchool(
  r: Record<string, any>,
  sidoCode: string,
  sggCode: string,
  schulKndCode: string
): School {
  return {
    // MCP 클라이언트가 숫자를 보낼 수 있고 필드 결측 시 후속 필터가 통째로 깨지므로 String 방어
    schoolCode: String(r.SCHUL_CODE ?? ""),
    shlIdfCd: r.SHL_IDF_CD ?? "",
    name: String(r.SCHUL_NM ?? ""),
    // 학교급명: API가 SCHUL_CRSE_SC_VALUE_NM을 안 주면 검색에 쓴 학교급 코드로 폴백 (빈 괄호 노출 방지)
    kind: r.SCHUL_CRSE_SC_VALUE_NM ? `${r.SCHUL_CRSE_SC_VALUE_NM}학교` : (SCHOOL_KIND_REV[schulKndCode] ?? ""),
    foundation: r.FOND_SC_CODE ?? "",
    office: r.ATPT_OFCDC_ORG_NM ?? "",
    officeCode: r.ATPT_OFCDC_ORG_CODE ?? "",
    address: r.SCHUL_RDNMA ?? r.ADRES_BRKDN ?? "",
    tel: r.USER_TELNO ?? "",
    homepage: r.HMPG_ADRES ?? "",
    sidoCode,
    sggCode,
    schulKndCode,
    raw: r,
  };
}
