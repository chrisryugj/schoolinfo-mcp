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

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 15_000);
    let res: Response;
    try {
      res = await fetch(url, { headers: { "User-Agent": "schoolinfo-mcp/0.1" }, signal: ac.signal });
    } catch (e: any) {
      if (e?.name === "AbortError") throw new Error("학교알리미 OpenAPI 응답 시간 초과");
      throw e;
    } finally {
      clearTimeout(timer);
    }
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

    // 자치구를 가진 시("포항")는 하위 구 코드를 모두 합산 검색 (시 전체 코드는 0건이라 무해)
    const merged = new Map<string, School>();
    let lastErr: Error | null = null;
    for (const sgg of sggList) {
      try {
        const data = await this.request("0", {
          sidoCode: sido.code,
          sggCode: sgg.code,
          schulKndCode: kindCode,
        });
        for (const r of data.list) {
          const s = toSchool(r, sido.code, sgg.code, kindCode);
          if (s.schoolCode) merged.set(s.schoolCode, s);
        }
      } catch (e: any) {
        lastErr = e; // "데이터 없음"(시 전체 코드 등)은 무시하고 계속
      }
    }
    if (merged.size === 0 && lastErr) throw lastErr;

    let schools = [...merged.values()];
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
  async getDisclosure(
    school: School,
    apiType: string,
    year?: string | number
  ): Promise<{ name: string; rows: Record<string, any>[] }> {
    const data = await this.request(apiType, {
      sidoCode: school.sidoCode,
      sggCode: school.sggCode,
      schulKndCode: school.schulKndCode,
      pbanYr: year ?? new Date().getFullYear(),
    });
    const rows = data.list.filter((r) => r.SCHUL_CODE === school.schoolCode);
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
  const q = (word ?? "").trim();
  if (q.length < 2) return []; // 단일글자 전국검색 폭주 방지 (자동완성 최소 2자)
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(NAME_SEARCH_URL, {
      method: "POST",
      headers: {
        "User-Agent": NAME_SEARCH_UA,
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Referer: "https://www.schoolinfo.go.kr/ei/ss/pneiss_a03_s0.do",
      },
      body: new URLSearchParams({ SEARCH_WORD: q }),
      signal: ac.signal,
    });
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error("학교알리미 응답 시간 초과");
    throw e;
  } finally {
    clearTimeout(timer);
  }
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
    schoolCode: r.SCHUL_CODE,
    shlIdfCd: r.SHL_IDF_CD ?? "",
    name: r.SCHUL_NM,
    kind: r.SCHUL_CRSE_SC_VALUE_NM ? `${r.SCHUL_CRSE_SC_VALUE_NM}학교` : "",
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
