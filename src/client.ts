// 학교알리미 OpenAPI 클라이언트
// 요청 URL: https://www.schoolinfo.go.kr/openApi.do (REST, JSON)

import {
  API_TYPES,
  REGIONS,
  SCHOOL_KIND,
  SchoolKindName,
  resolveSido,
  resolveSgg,
} from "./codes.js";

const BASE_URL = "https://www.schoolinfo.go.kr/openApi.do";

export interface School {
  schoolCode: string; // SCHUL_CODE — 공시 학교코드 (모든 상세조회의 키)
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

    const res = await fetch(url, {
      headers: { "User-Agent": "schoolinfo-mcp/0.1" },
    });
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
    const sgg = resolveSgg(sido.name, params.sgg);
    if (!sgg)
      throw new Error(
        `"${sido.name}"에 없는 시군구: "${params.sgg}". 가능한 값: ${Object.keys(
          REGIONS[sido.name].sgg
        )
          .slice(0, 8)
          .join(", ")} ...`
      );
    const kindCode = SCHOOL_KIND[params.kind];
    if (!kindCode) throw new Error(`알 수 없는 학교급: "${params.kind}"`);

    const data = await this.request("0", {
      sidoCode: sido.code,
      sggCode: sgg.code,
      schulKndCode: kindCode,
    });

    let schools = data.list.map((r) =>
      toSchool(r, sido.code, sgg.code, kindCode)
    );
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

function toSchool(
  r: Record<string, any>,
  sidoCode: string,
  sggCode: string,
  schulKndCode: string
): School {
  return {
    schoolCode: r.SCHUL_CODE,
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
