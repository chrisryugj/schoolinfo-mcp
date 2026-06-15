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

/** AbortController 기반 타임아웃 fetch */
async function fetchT(url: string, init: RequestInit = {}, timeout = FETCH_TIMEOUT): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeout);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error("학교알리미 응답이 지연되어 시간 초과되었습니다.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
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

function toArrayBuffer(b: Buffer): ArrayBuffer {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}
