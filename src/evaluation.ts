// 교과별(학년별) 교수·학습 및 평가 운영 계획 (= 수행평가 주제/평가기준)
//
// 이 항목은 학교알리미 OpenAPI 정형 데이터에 없고 hwp/hwpx 첨부파일로만 공시된다.
// 하지만 학교별 공시정보 웹의 내부 요청을 그대로 재현하면 **순수 HTTP fetch로**
// 자동 다운로드가 가능하다 (브라우저 자동화 불필요). 흐름:
//
//   1) OpenAPI 학교기본정보 → SHL_IDF_CD (학교고유식별코드)
//   2) POST /ei/pp/Pneipp_b43_s0p.do  → 첨부파일 목록 + 다운로드 파라미터 (EUC-KR HTML)
//   3) GET  /servlets/EiFileDownLoad.do?...&FILE_SEQ=n → hwp/hwpx
//   4) kordoc parse → 마크다운 + 수행평가 섹션 추출

import { parse } from "kordoc";
import iconv from "iconv-lite";
import type { School } from "./client.js";
import { fetchWithRetry } from "./lib/fetch-with-retry.js";

const BASE = "https://www.schoolinfo.go.kr";
export const DISCLOSURE_PORTAL = `${BASE}/ei/ss/pneiss_a03_s0.do`;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

/** 외부 요청 타임아웃 (ms) — 학교알리미 지연 시 무한 대기 방지 */
const FETCH_TIMEOUT = 20_000;
/** 다운로드/파싱 허용 최대 크기 (50MB) — 메모리/DoS 방어 */
const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024;
/** 'all'(전체 과목) 일괄 조회 상한 — 과목 수십 개 학교의 다운로드 폭주/응답 비대화 방지 */
export const MAX_ALL_DOCS = 20;
/** 이 길이 미만이면 이미지 PDF 등으로 본문 추출이 사실상 실패한 것으로 간주 */
const MIN_USEFUL_MD = 200;

/** 타임아웃 + 재시도 fetch (학교알리미 평가계획 조회/다운로드용) */
async function fetchT(url: string, init: RequestInit = {}, timeout = FETCH_TIMEOUT): Promise<Response> {
  return fetchWithRetry(url, init, { timeout, label: "학교알리미" });
}

// "교과별(학년별) 교수·학습 및 평가계획에 관한 사항" 공시항목 고정 코드
// (학교알리미 공시항목 자체의 분류 코드 — 모든 학교 공통)
const EVAL_ITEM = {
  GS_HANGMOK_CD: "43",
  GS_HANGMOK_NO: "4-가",
  GS_HANGMOK_NM: "교과별(학년별) 교수ㆍ학습 및 평가계획에 관한 사항",
  GS_BURYU_CD: "JG110",
  JG_BURYU_CD: "JG040",
  JG_HANGMOK_CD: "14",
  JG_GUBUN: "1",
};

export interface EvaluationFile {
  seq: string; // FILE_SEQ
  filename: string;
  sizeKB?: number;
}

/** 평가계획 첨부파일 목록 + 다운로드 파라미터 조회 (POST b43) */
export async function fetchEvaluationFiles(
  shlIdfCd: string,
  schoolName: string,
  year = new Date().getFullYear()
): Promise<{ files: EvaluationFile[]; downloadParams: Record<string, string> }> {
  if (!shlIdfCd) throw new Error("학교고유식별코드(SHL_IDF_CD)가 없습니다.");
  const body = new URLSearchParams({
    ...EVAL_ITEM,
    HG_NM: schoolName,
    SHL_IDF_CD: shlIdfCd,
    GS_TYPE: "Y",
    JG_YEAR: String(year),
    SORT: "BR",
    CHOSEN_JG_YEAR: String(year),
    PRE_JG_YEAR: String(year),
    LOAD_TYPE: "single",
  });

  const res = await fetchT(`${BASE}/ei/pp/Pneipp_b43_s0p.do`, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "X-Requested-With": "XMLHttpRequest",
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: `${BASE}/ei/ss/Pneiss_b01_s0.do`,
    },
    body,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} — 평가계획 항목 조회 실패`);
  const listBuf = Buffer.from(await res.arrayBuffer());
  if (listBuf.byteLength > MAX_DOWNLOAD_BYTES) throw new Error("평가계획 목록 응답이 너무 큽니다.");
  const html = iconv.decode(listBuf, "euc-kr");

  // 첨부파일 목록: getEiFile43('N') + 파일명.확장자(NN KB)
  const files = parseFileList(html);
  // 다운로드 폼 파라미터 (eiFileDownForm hidden)
  const downloadParams = parseDownloadParams(html, shlIdfCd, year);

  return { files, downloadParams };
}

function parseFileList(html: string): EvaluationFile[] {
  const files: EvaluationFile[] = [];
  const seen = new Set<string>();
  // <a ... onclick="getEiFile43('5')...">파일명.hwpx(89 KB)</a>
  // 파일명에 괄호가 있을 수 있으므로 앵커(>)와 종료(<) 사이 전체를 잡고, 크기 표기는 선택적.
  // onclick 따옴표(작은/큰), getEiFile43 인자 공백·따옴표 유무를 모두 허용 (HTML 변형 견고화).
  const re =
    /onclick=["'][^"']*getEiFile43\(\s*['"]?(\d+)['"]?\s*\)[^"']*["'][^>]*>\s*([^<]*?\.(?:hwpx|hwp|pdf|docx|xlsx))\s*(?:\(\s*([\d.,]+)\s*([KM]B)\s*\))?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    files.push({ seq: m[1], filename: m[2].trim(), sizeKB: toKB(m[3], m[4]) });
  }
  // 폴백: 순서 기반 매칭 (onclick과 파일명이 분리된 비표준 구조)
  if (files.length === 0) {
    const seqs = [...html.matchAll(/getEiFile43\(\s*['"]?(\d+)['"]?\s*\)/g)].map((x) => x[1]);
    const names = [...html.matchAll(/([^>\s][^<>]*?\.(?:hwpx|hwp|pdf|docx|xlsx))\s*(?:\(\s*([\d.,]+)\s*([KM]B)\s*\))?/gi)];
    // 개수가 일치할 때만 신뢰 (어긋나면 seq↔파일명 뒤바뀜 위험)
    if (seqs.length === names.length) {
      seqs.forEach((seq, i) => {
        files.push({ seq, filename: names[i][1].trim(), sizeKB: toKB(names[i][2], names[i][3]) });
      });
    } else {
      // 최후 폴백: 파일명 없이 seq만 (다운로드 후 Content-Disposition으로 파일명 확보)
      seqs.forEach((seq) => { if (!seen.has(seq)) { seen.add(seq); files.push({ seq, filename: `첨부파일_${seq}` }); } });
    }
  }
  return files;
}

/** "89", "1,234"(KB) / "1.2"(MB) → KB 숫자 */
function toKB(num?: string, unit?: string): number | undefined {
  if (!num) return undefined;
  const n = parseFloat(num.replace(/,/g, ""));
  if (!isFinite(n)) return undefined;
  return /MB/i.test(unit ?? "") ? Math.round(n * 1024) : n;
}

function parseDownloadParams(
  html: string,
  shlIdfCd: string,
  year: number
): Record<string, string> {
  const params: Record<string, string> = {};
  const formIdx = html.indexOf("eiFileDownForm");
  // 폼 전체를 </form>까지 잡는다 (고정 1200B 슬라이스는 hidden이 많으면 뒤쪽 필수값을 잘랐음).
  let seg = html;
  if (formIdx >= 0) {
    const end = html.indexOf("</form>", formIdx);
    seg = html.slice(formIdx, end >= 0 ? end : formIdx + 4096);
  }
  const re = /name="([A-Za-z_][A-Za-z0-9_]*)"[^>]*?value="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(seg))) {
    // 값은 코드/연도 등 단순 토큰만 신뢰 (외부 HTML에서 추출 → 방어적 형식 검증)
    if (!(m[1] in params) && /^[\w.\-]*$/.test(m[2])) params[m[1]] = m[2];
  }
  // 필수값 보강
  params.SHL_IDF_CD ??= shlIdfCd;
  params.JG_BURYU_CD ??= EVAL_ITEM.JG_BURYU_CD;
  params.JG_HANGMOK_CD ??= EVAL_ITEM.JG_HANGMOK_CD;
  params.JG_GUBUN ??= EVAL_ITEM.JG_GUBUN;
  params.JG_YEAR ??= String(year);
  params.JG_CHASU ??= "1";
  params.PRE_JG_YEAR ??= String(year);
  return params;
}

/** 특정 첨부파일 다운로드 (GET EiFileDownLoad) */
export async function downloadEvaluationFile(
  downloadParams: Record<string, string>,
  seq: string
): Promise<{ buffer: ArrayBuffer; filename: string }> {
  if (!/^\d+$/.test(seq)) throw new Error("잘못된 파일 식별자입니다.");
  const qs = new URLSearchParams({ ...downloadParams, FILE_SEQ: seq });
  const res = await fetchT(`${BASE}/servlets/EiFileDownLoad.do?${qs}`, {
    headers: { "User-Agent": UA, Referer: `${BASE}/ei/pp/Pneipp_b43_s0p.do` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} — 파일 다운로드 실패`);
  // 크기 상한 — Content-Length 선검사 + 실제 바이트 재확인
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > MAX_DOWNLOAD_BYTES) throw new Error("파일이 너무 큽니다 (50MB 초과).");
  const buffer = await res.arrayBuffer();
  if (buffer.byteLength > MAX_DOWNLOAD_BYTES) throw new Error("파일이 너무 큽니다 (50MB 초과).");
  // Content-Disposition에서 파일명 (RFC URL-encoded)
  let filename = `evaluation_${seq}`;
  const cd = res.headers.get("content-disposition") ?? "";
  const fm = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)/i);
  if (fm) {
    try {
      filename = decodeURIComponent(fm[1].trim());
    } catch {
      filename = fm[1].trim();
    }
  }
  return { buffer, filename };
}

export interface EvaluationResult {
  filename: string;
  fileType: string;
  markdown: string;
  evaluationSections: string[];
  /** 본문 추출이 빈약(이미지 PDF 추정)해 OCR/수동확인이 필요할 때 true */
  needsOcr?: boolean;
}

/**
 * 평가계획 첨부파일 목록을 수행평가 관련성 순으로 정렬해 반환한다 (다운로드/파싱 전).
 * 과목별로 쪼개진 학교(과목별 PDF 여러 개)는 목록을 먼저 보여주고 선택하게 하기 위함.
 */
export async function listEvaluationDocs(
  school: School,
  year?: number
): Promise<{ docs: EvaluationFile[]; downloadParams: Record<string, string>; year: number }> {
  // 연도 미지정 시: 올해 → (연초엔 신학년도 평가계획이 아직 미공시이므로) 작년 순으로 자동 폴백.
  // 사용자가 연도를 명시하면 그 해만 조회 (임의 폴백 금지).
  const thisYear = new Date().getFullYear();
  const candidates = year != null ? [year] : [thisYear, thisYear - 1];
  for (const y of candidates) {
    const { files, downloadParams } = await fetchEvaluationFiles(school.shlIdfCd, school.name, y);
    if (files.length) {
      const docs = files
        .filter((f) => /\.(hwpx|hwp|pdf|docx)$/i.test(f.filename))
        .sort((a, b) => evalScore(a.filename) - evalScore(b.filename));
      return { docs: docs.length ? docs : files, downloadParams, year: y };
    }
  }
  throw new Error(
    `${candidates.join("·")}년도 평가계획 첨부파일을 찾지 못했습니다. (다른 연도를 지정하거나 ${DISCLOSURE_PORTAL} 직접 확인)`
  );
}

/** 특정 첨부파일을 다운로드 + kordoc 파싱 */
export async function fetchEvaluationBySeq(
  downloadParams: Record<string, string>,
  file: EvaluationFile
): Promise<EvaluationResult> {
  const { buffer, filename } = await downloadEvaluationFile(downloadParams, file.seq);
  // filePath를 넘기지 않는다: 다운로드 파일명은 디스크에 없는 가짜 경로라
  // kordoc의 배포용 HWP COM 폴백이 존재하지 않는 파일을 열려 시도할 수 있음.
  // 포맷은 매직바이트로 자동 감지되므로 ArrayBuffer만으로 충분.
  const parsed = await parse(buffer);
  const markdown = parsed.success ? parsed.markdown ?? "" : "";
  return {
    filename: filename || file.filename,
    fileType: parsed.fileType ?? "unknown",
    markdown,
    evaluationSections: extractEvaluationSections(markdown),
  };
}

/**
 * 학교의 평가계획을 **자동으로** 다운로드하고 kordoc으로 파싱한다.
 * - 기본: 우선순위 1순위 파일 1개
 * - opts.all: 전체 과목 파일
 * - opts.seq: 특정 파일만 (과목 선택)
 */
export async function autoFetchEvaluation(
  school: School,
  year?: number,
  opts: { all?: boolean; seq?: string } = {}
): Promise<EvaluationResult[]> {
  const { docs, downloadParams } = await listEvaluationDocs(school, year);

  if (opts.seq) {
    const f = docs.find((d) => d.seq === opts.seq);
    return f ? [await fetchEvaluationBySeq(downloadParams, f)] : [];
  }
  if (opts.all) {
    const results: EvaluationResult[] = [];
    for (const f of docs.slice(0, MAX_ALL_DOCS)) results.push(await fetchEvaluationBySeq(downloadParams, f));
    if (docs.length > MAX_ALL_DOCS) {
      results.push({
        filename: `(이하 ${docs.length - MAX_ALL_DOCS}개 파일 생략)`,
        fileType: "info",
        markdown: `> 평가계획 파일이 ${docs.length}개로 많아 앞쪽 ${MAX_ALL_DOCS}개만 표시했습니다. 특정 과목은 과목명으로 지정해 조회하세요.`,
        evaluationSections: [],
      });
    }
    return results;
  }
  // 기본: 우선순위대로 시도하되, 이미지 PDF 등으로 내용이 빈약하면 다음 파일로 폴백
  let best: EvaluationResult | null = null;
  for (const f of docs.slice(0, 6)) {
    const r = await fetchEvaluationBySeq(downloadParams, f);
    if (r.markdown.trim().length >= MIN_USEFUL_MD) return [r];
    if (!best) best = r;
  }
  // 모든 후보가 빈약 → 이미지 PDF 추정. 호출부가 수동 안내를 노출하도록 플래그를 싣는다.
  if (best && best.markdown.trim().length < MIN_USEFUL_MD) best.needsOcr = true;
  return best ? [best] : [];
}

/** 파일명 기반 수행평가 관련성 점수 (낮을수록 우선) */
function evalScore(filename: string): number {
  if (/교수.?학습|평가\s*계획|평가\s*운영/.test(filename)) return 0;
  if (/학업성적관리/.test(filename)) return 2;
  return 1;
}

/** 평가계획 찾는 법 안내 (자동 다운로드 실패 시 폴백) */
export function evaluationGuide(school: School, year = new Date().getFullYear()): string {
  return [
    `📋 "${school.name}"의 교수·학습 및 평가 운영 계획(수행평가) 수동 확인`,
    ``,
    `1. 학교별 공시정보: ${DISCLOSURE_PORTAL}`,
    `2. "${school.name}" 검색 → 연도 ${year}`,
    `3. "학업성취사항" → "교과별(학년별) 교수·학습 및 평가계획"`,
    `4. 학년별 .hwp 다운로드`,
    `   학교 홈페이지: ${school.homepage || "(미등록)"}`,
  ].join("\n");
}

/** 내려받은(혹은 업로드된) 평가계획 문서를 kordoc으로 파싱 */
export async function parseEvaluationDocument(
  input: ArrayBuffer | Buffer,
  filePath?: string
): Promise<{ fileType: string; markdown: string; evaluationSections: string[] }> {
  const buf = input instanceof ArrayBuffer ? input : toArrayBuffer(input);
  const result = await parse(buf, filePath ? { filePath } : undefined);
  if (!result.success) throw new Error("문서 파싱 실패");
  const markdown = result.markdown ?? "";
  return {
    fileType: result.fileType ?? "unknown",
    markdown,
    evaluationSections: extractEvaluationSections(markdown),
  };
}

/** 마크다운에서 수행평가/평가 관련 구간 추출 */
export function extractEvaluationSections(markdown: string): string[] {
  const KEYWORDS = ["수행평가", "평가기준", "평가요소", "평가방법", "평가영역", "반영비율", "평가시기", "성취기준", "지필", "정기시험"];
  const blocks = markdown.split(/\n\s*\n/);
  const hits: string[] = [];
  for (const block of blocks) {
    if (KEYWORDS.some((k) => block.includes(k))) hits.push(block.trim());
  }
  return hits;
}

// ─── 학년별 종합 평가표 구조화 (통합 1파일 학교용) ───────────────────────────
//
// 통합형 학교(전학년·전과목 한 파일)는 변환 마크다운이 수백 KB·표 수백 개라
// 통째로 렌더하면 모바일이 죽는다. kordoc 변환물엔 #헤딩이 없고 <table>로만 구성되므로,
// "학년 종합표"(한 학년 전과목 요약표)를 찾아 학년 라벨·교과를 뽑아낸다.
// 웹앱은 이 구조로 학년/과목 단위만 선택 렌더 → 거대 DOM 일괄 생성을 피한다.

// 교과명 (긴 이름 우선 매칭: "기술ㆍ가정"이 "기술"보다 먼저 잡혀야 함)
const SUBJECTS = [
  "과학탐구실험", "기술ㆍ가정", "진로와 직업", "제2외국어", "통합사회", "통합과학",
  "국어", "도덕", "사회", "역사", "수학", "과학", "기술", "가정", "정보",
  "체육", "음악", "미술", "영어", "한문", "일본어", "중국어", "진로", "보건", "환경",
].sort((a, b) => b.length - a.length);

export interface GradeOverview {
  grade: number | null; // 1~6 (매핑 실패 시 null)
  label: string;        // 화면 라벨 (예: "1학년")
  subjects: string[];   // 이 종합표에서 추출된 교과 (등장 순서)
  tableHtml: string;    // 종합표 HTML (각 교과 행에 data-subject 주입됨)
  details?: Record<string, string>; // 교과명 → 상세 평가표(성취기준 포함) HTML
}

/** 성취기준 코드 약자 → 교과 (캡션이 과목을 안 줄 때 보조 판별) */
const CRITERIA_ABBR: Record<string, string> = {
  국: "국어", 도: "도덕", 사: "사회", 역: "역사", 수: "수학", 과: "과학",
  영: "영어", 체: "체육", 음: "음악", 미: "미술", 정: "정보", 한: "한문", 한문: "한문",
  기가: "기술ㆍ가정", 가정: "기술ㆍ가정", 기술: "기술ㆍ가정", 일: "일본어", 중: "중국어",
};

/** 헤더에 '성취기준' 컬럼이 있는 과목별 상세 평가표인지 */
function isSubjectDetailTable(tableHtml: string): boolean {
  const firstRow = (tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i) || [])[1] || "";
  return /성취\s*기준/.test(plainText(firstRow));
}

/** 텍스트에서 교과명 탐지 — 단어 경계 기반(부분일치 오탐 방지) */
function subjectInText(text: string): string | null {
  for (const s of SUBJECTS) {
    const pat = s.replace(/[·ㆍ]/g, "[·ㆍ]").replace(/\s+/g, "\\s*");
    // 앞: 시작/비한글, 뒤: 끝/(과)?/비한글. 단 합성 구분자(·ㆍ)는 경계로 인정하지 않아
    // '사회·문화'→'사회', '과학사'→'과학' 같은 부분일치 오탐을 차단한다.
    const re = new RegExp(`(?:^|[^가-힣])${pat}(?:과)?(?:$|[^가-힣ㆍ·])`);
    if (re.test(text)) return s;
  }
  return null;
}

/** 성취기준 코드([9국05-01]) 약자 최빈값으로 교과 추정 */
function subjectByCode(tableHtml: string): string | null {
  // 성취기준 코드 학교급 prefix를 모두 인식: 초[4/6]·중[9]·고[10/12]
  const codes = [...tableHtml.matchAll(/\[\d{1,2}\s*([가-힣]{1,3})\d/g)].map((m) => m[1]);
  const freq: Record<string, number> = {};
  for (const c of codes) {
    const s = CRITERIA_ABBR[c];
    if (s) freq[s] = (freq[s] || 0) + 1;
  }
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : null;
}

/**
 * 과목별 상세 평가표(성취기준 포함)를 학년/과목에 매핑해 grades[].details에 담는다.
 * 통합 문서는 "N학년 과목 N학기" 캡션을 선언하고 이후 표가 그에 귀속되는 구조라
 * 순차 상태(현재 학년/과목)를 유지하되, 표 내용의 성취기준 코드로 과목을 보정한다.
 * 오매핑 방지: 종합표에서 이미 확인된 학년·과목 조합에만 붙인다.
 */
function attachSubjectDetails(markdown: string, grades: GradeOverview[]): void {
  const byGrade = new Map<number, GradeOverview>();
  for (const g of grades) if (g.grade != null) byGrade.set(g.grade, g);
  if (!byGrade.size) return;
  let curGrade: number | null = null;
  let curSubject: string | null = null;
  let lastIdx = 0;
  for (const { html, index } of topLevelTables(markdown)) {
    const between = plainText(markdown.slice(lastIdx, index));
    lastIdx = index + html.length;
    // 본문 각주('2학년 때 이수' 등)의 'N학년' 오인 방지: 종합표로 구조화된 학년만 채택
    const gm = [...between.matchAll(/([1-6])\s*학년/g)];
    for (let i = gm.length - 1; i >= 0; i--) {
      const g = Number(gm[i][1]);
      if (byGrade.has(g)) { curGrade = g; break; }
    }
    // 캡션은 '운영 계획' 뒤 전체에서 탐지 (좁은 윈도우는 캡션이 표보다 멀 때 놓침)
    const capPart = between.split(/운영\s*계획/).pop() || between;
    const subj = subjectInText(capPart);
    if (subj) curSubject = subj;
    if (!isSubjectDetailTable(html)) continue;
    const useSubj = subjectByCode(html) || curSubject;
    if (curGrade == null || !useSubj) continue;
    const g = byGrade.get(curGrade);
    if (!g || !g.subjects.includes(useSubj)) continue;
    (g.details ??= {})[useSubj] = (g.details[useSubj] || "") + html;
  }
}

export interface StructuredEvaluation {
  grades: GradeOverview[];
  allSubjects: string[];
}

function plainText(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
}

/** 셀 텍스트가 교과명이면 정규 교과명 반환 (공백·중점 변형 흡수) */
function matchSubject(cell: string): string | null {
  const c = cell.replace(/\s/g, "").replace(/·/g, "ㆍ");
  for (const s of SUBJECTS) {
    const k = s.replace(/\s/g, "").replace(/·/g, "ㆍ");
    if (c === k || c === k + "과") return s;
  }
  return null;
}

/** 중첩을 고려해 최상위 <table>…</table> 블록만 추출 (위치 포함) */
function topLevelTables(md: string): { html: string; index: number }[] {
  const out: { html: string; index: number }[] = [];
  const re = /<\/?table[^>]*>/gi;
  let depth = 0, start = -1, m: RegExpExecArray | null;
  while ((m = re.exec(md))) {
    if (m[0][1] !== "/") {
      if (depth === 0) start = m.index;
      depth++;
    } else if (depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) {
        out.push({ html: md.slice(start, m.index + m[0].length), index: start });
        start = -1;
      }
    }
  }
  return out;
}

/**
 * 표의 데이터 행 rowspan을 펼쳐(셀 복제) 각 행을 독립적으로 만든다.
 * 통합형 종합표는 "학기" 등 공통 셀을 rowspan으로 한 행에만 두는데, 과목 칩 필터가
 * 그 행을 display:none 하면 나머지 행의 컬럼이 한 칸씩 밀려 헤더와 어긋난다.
 * rowspan을 펼치면 어느 행을 숨겨도 정렬이 유지된다. (헤더 th 행은 원본 유지)
 */
function expandRowspanCells(tableHtml: string): string {
  interface Cell {
    tag: string;
    attrs: string;
    html: string;
    colspan: number;
    rowspan: number;
  }
  // 셀 안 중첩 <table>이 있으면 non-greedy 정규식이 안쪽 </tr>/</td>에서 조기 매칭해
  // 바깥 셀이 잘리고 마크업이 깨진다 → 변형 없이 원본 유지 (정렬 위험보다 무손상 우선)
  if ((tableHtml.match(/<table/gi) || []).length > 1) return tableHtml;

  const trRe = /<tr(\s[^>]*)?>([\s\S]*?)<\/tr>/gi;
  const cellRe = /<(t[dh])([^>]*)>([\s\S]*?)<\/t[dh]>/gi;
  const numAttr = (s: string, name: string): number => {
    const m = new RegExp(name + '=["\']?(\\d+)', "i").exec(s);
    return m ? Math.max(1, parseInt(m[1], 10)) : 1;
  };
  const rawRows = [...tableHtml.matchAll(trRe)];
  if (!rawRows.length) return tableHtml;
  const rows = rawRows.map((r) => {
    const cells: Cell[] = [...r[2].matchAll(cellRe)].map((c) => ({
      tag: c[1], attrs: c[2] || "", html: c[3],
      colspan: numAttr(c[2] || "", "colspan"), rowspan: numAttr(c[2] || "", "rowspan"),
    }));
    const isHeader = cells.length > 0 && cells.every((c) => c.tag.toLowerCase() === "th");
    return { attr: r[1] || "", cells, isHeader };
  });
  const dataStart = rows.findIndex((r) => !r.isHeader);
  if (dataStart < 0) return tableHtml; // 데이터 행이 없으면 펼칠 것 없음

  const stripRs = (a: string) => a.replace(/\s*rowspan=["']?\d+["']?/i, "");
  const setRs = (a: string, n: number) =>
    /rowspan=/i.test(a) ? a.replace(/rowspan=["']?\d+["']?/i, `rowspan="${n}"`) : `${a} rowspan="${n}"`;
  const tag = (c: Cell, attrs: string) => `<${c.tag}${attrs}>${c.html}</${c.tag}>`;

  // pending[col] = 위 행에서 내려오는 rowspan 셀 (시작 컬럼에만 보관)
  const pending: ({ cell: Cell; left: number } | null)[] = [];
  const outTrs: string[] = [];

  for (let ri = 0; ri < rows.length; ri++) {
    const { attr, cells, isHeader } = rows[ri];
    const out: string[] = [];
    let col = 0, ci = 0, guard = 0;
    while (guard++ < 3000) {
      const p = pending[col];
      if (p && p.left > 0) {
        // 위에서 내려온 셀: 데이터 행이면 복제(정렬 유지), 헤더 행이면 병합 유지(출력 생략)
        if (!isHeader) out.push(tag(p.cell, stripRs(p.cell.attrs)));
        p.left--;
        col += p.cell.colspan;
        continue;
      }
      if (ci < cells.length) {
        const c = cells[ci++];
        if (isHeader) {
          const endRow = ri + c.rowspan - 1;
          if (c.rowspan > 1 && endRow >= dataStart) {
            // 헤더 셀이 데이터 행까지 걸침 → 헤더 출력은 헤더 영역까지로 클램프, 초과분은 데이터에 복제
            const headerRows = dataStart - ri;
            out.push(tag(c, headerRows > 1 ? setRs(c.attrs, headerRows) : stripRs(c.attrs)));
            pending[col] = { cell: c, left: endRow - (dataStart - 1) };
          } else {
            // 헤더 내부 rowspan(다른 헤더 행 덮음) 또는 단일 행 → 원본 유지, 헤더 영역에서 소비
            out.push(tag(c, c.attrs));
            pending[col] = c.rowspan > 1 ? { cell: c, left: c.rowspan - 1 } : null;
          }
        } else {
          out.push(tag(c, stripRs(c.attrs)));
          pending[col] = c.rowspan > 1 ? { cell: c, left: c.rowspan - 1 } : null;
        }
        col += c.colspan;
        continue;
      }
      // 원본 셀 소진 — 뒤쪽 컬럼에 활성 rowspan이 남았으면 그 컬럼으로 점프
      let next = -1;
      for (let cc = col; cc < pending.length; cc++) {
        const pc = pending[cc];
        if (pc && pc.left > 0) { next = cc; break; }
      }
      if (next < 0) break;
      col = next;
    }
    outTrs.push(`<tr${attr}>${out.join("")}</tr>`);
  }

  const first = tableHtml.search(/<tr[\s>]/i);
  const last = tableHtml.toLowerCase().lastIndexOf("</tr>");
  if (first < 0 || last < 0) return tableHtml;
  return tableHtml.slice(0, first) + outTrs.join("") + tableHtml.slice(last + 5);
}

/** 종합표의 각 교과 행에 data-subject 속성을 주입하고 교과 순서를 수집 */
function annotateSubjectRows(tableHtml: string): { html: string; subjects: string[] } {
  const subjects: string[] = [];
  const seen = new Set<string>();
  const html = tableHtml.replace(/<tr(\s[^>]*)?>([\s\S]*?)<\/tr>/gi, (full, attr, inner) => {
    const cells = [...inner.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => plainText(c[1]));
    let subj: string | null = null;
    for (const c of cells) {
      const hit = matchSubject(c);
      if (hit) { subj = hit; break; }
    }
    if (!subj) return full;
    if (!seen.has(subj)) { seen.add(subj); subjects.push(subj); }
    return `<tr data-subject="${subj}"${attr || ""}>${inner}</tr>`;
  });
  return { html, subjects };
}

/** 종합표 직전 텍스트에서 학년 라벨 추론 */
function gradeBefore(md: string, index: number): { grade: number | null; label: string } {
  const before = plainText(md.slice(Math.max(0, index - 400), index));
  // "N학년 (교과별) 평가/운영 계획" 형태 캡션 우선 (가장 표에 가까운 매칭)
  const cap = [...before.matchAll(/([1-6])\s*학년[^0-9]{0,10}(?:평가|운영)/g)];
  if (cap.length) {
    const g = Number(cap[cap.length - 1][1]);
    return { grade: g, label: `${g}학년` };
  }
  return { grade: null, label: "" };
}

/** 평가표 내용을 담은 표인지 (편제·시수표 등 비평가표 제외) */
function looksLikeEvalTable(tableHtml: string): boolean {
  // 자유학기제 1학년처럼 "과정 중심 평가 내용"만 있는 표도 평가표로 인정.
  // 편제·시수표엔 이런 평가 어휘가 없어 자연히 걸러진다.
  return /수행평가|반영\s*비율|정기시험|평가\s*요소|평가\s*방법|평가\s*영역|평가\s*기준|평가\s*내용|과정\s*중심\s*평가/.test(
    tableHtml
  );
}

/**
 * GFM 파이프표(| a | b |)를 HTML <table>로 변환한다 (PDF 마크다운 정규화용).
 * 표 외 텍스트(학년 캡션 등)는 그대로 둬 gradeBefore의 위치 추론이 유지된다.
 * GFM 표엔 rowspan/colspan이 없어 expandRowspanCells는 자연히 no-op이 된다.
 */
function gfmTablesToHtml(md: string): string {
  const lines = md.split("\n");
  const isRow = (s: string) => s.trim().startsWith("|") && s.includes("|", 1);
  // 구분선 행: | --- | :--: | … (대시 필수, 정렬 콜론 허용)
  const isSep = (s: string) => /-/.test(s) && /^\s*\|?(\s*:?-+:?\s*\|)+\s*:?-*:?\s*$/.test(s);
  const splitCells = (s: string) => {
    let t = s.trim();
    if (t.startsWith("|")) t = t.slice(1);
    if (t.endsWith("|")) t = t.slice(0, -1);
    return t.split("|").map((c) => c.trim());
  };
  // 셀 텍스트 이스케이프 — XSS 방어(클라 DOMPurify가 최종 게이트지만 서버단도 정제).
  // 단 줄바꿈 토큰 <br>은 hwpx 표와 동일하게 살린다 (평가요소 다중 항목 가독성).
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/&lt;br\s*\/?&gt;/gi, "<br>");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (i + 1 < lines.length && isRow(lines[i]) && isSep(lines[i + 1])) {
      const header = splitCells(lines[i]);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isRow(lines[i]) && !isSep(lines[i])) {
        rows.push(splitCells(lines[i]));
        i++;
      }
      const th = `<tr>${header.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>`;
      const trs = rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("");
      out.push(`<table>${th}${trs}</table>`);
      continue;
    }
    out.push(lines[i]);
    i++;
  }
  return out.join("\n");
}

/**
 * 통합형 평가계획 마크다운을 학년별 종합표로 구조화한다.
 * 학년이 매핑된 종합표가 1개 이상일 때만 결과를 반환(아니면 null → 호출부가 폴백 렌더).
 */
export function structureEvaluation(markdown: string): StructuredEvaluation | null {
  // 과대 문서(이상치)는 동기 정규식 스캔이 이벤트 루프를 길게 점유(CPU DoS)하므로 구조화하지 않고
  // 폴백(slim doc/원본 다운로드)으로 보낸다. 정상 통합문서는 수백KB라 2MB 여유 충분.
  if (markdown.length > 2_000_000) return null;
  // PDF는 표가 GFM 파이프표(| … |)로 나와 이 파이프라인(topLevelTables 등 <table> 전용)이 못 본다.
  // <table>가 없고 GFM 표만 있는 문서(=PDF)면 HTML <table>로 정규화해 hwpx와 동일 경로를 태운다.
  if (!/<table/i.test(markdown) && /^\s*\|.*\|\s*$/m.test(markdown)) {
    markdown = gfmTablesToHtml(markdown);
  }
  const grades: GradeOverview[] = [];
  const subjUnion = new Set<string>();
  for (const { html, index } of topLevelTables(markdown)) {
    if (!looksLikeEvalTable(html)) continue;
    // rowspan(학기 등 공통 셀)을 먼저 펼쳐야 과목 필터로 행을 숨겨도 컬럼이 안 밀린다
    const expanded = expandRowspanCells(html);
    const { html: annotated, subjects } = annotateSubjectRows(expanded);
    if (subjects.length < 5) continue; // 한 학년 전과목 종합표만 (과목별 세부표 제외)
    const { grade, label } = gradeBefore(markdown, index);
    if (grade == null) continue; // 학년 라벨 못 찾으면 구조화 대상 제외
    grades.push({ grade, label, subjects, tableHtml: annotated });
    subjects.forEach((s) => subjUnion.add(s));
  }
  if (!grades.length) return null;
  grades.sort((a, b) => (a.grade ?? 99) - (b.grade ?? 99));
  // 같은 학년이 중복 매핑되면 교과가 더 많은 표 1개만 유지
  const byGrade = new Map<number, GradeOverview>();
  for (const g of grades) {
    const key = g.grade as number;
    const prev = byGrade.get(key);
    if (!prev || g.subjects.length > prev.subjects.length) byGrade.set(key, g);
  }
  const deduped = [...byGrade.values()].sort((a, b) => (a.grade ?? 99) - (b.grade ?? 99));
  // 과목별 상세 평가표(성취기준)를 학년/과목에 매핑해 details에 부착
  attachSubjectDetails(markdown, deduped);
  return { grades: deduped, allSubjects: [...subjUnion] };
}

function toArrayBuffer(b: Buffer): ArrayBuffer {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}
