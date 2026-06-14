// 교과별(학년별) 교수·학습 및 평가 운영 계획 (= 수행평가 주제/평가기준)
//
// ⚠️ 이 항목은 학교알리미 OpenAPI 정형 데이터에 없음. hwp 첨부파일로만 공시됨.
//    따라서 두 가지 경로를 제공한다:
//    1) 학교별 공시정보 페이지 딥링크 — 학부모가 직접 hwp를 내려받는 경로 안내
//    2) 내려받은 hwp/hwpx/pdf 파일을 kordoc으로 파싱 → 마크다운 + 수행평가 섹션 추출

import { parse } from "kordoc";
import type { School } from "./client.js";

/** 학교별 공시정보 검색 페이지 (학교명으로 진입) */
export const DISCLOSURE_PORTAL = "https://www.schoolinfo.go.kr/ei/ss/pneiss_a03_s0.do";

/**
 * 평가계획 hwp를 찾아가는 안내 텍스트 생성.
 * (직접 다운로드 URL은 세션/리퍼러 검증으로 비공개이므로 경로를 안내)
 */
export function evaluationGuide(school: School, year = new Date().getFullYear()): string {
  return [
    `📋 "${school.name}"의 교수·학습 및 평가 운영 계획(수행평가 주제·평가기준) 찾기`,
    ``,
    `1. 학교별 공시정보 접속: ${DISCLOSURE_PORTAL}`,
    `2. "${school.name}" 검색 (앞 2~3글자만 입력하면 자동완성)`,
    `3. 연도를 ${year}으로 맞추기`,
    `4. 우측 "학업성취사항" → 그 아래 "교과별(학년별) 교수·학습 및 평가계획" 클릭`,
    `5. 스크롤하면 학년별 .hwp 파일 다운로드 가능`,
    ``,
    `   학교 홈페이지: ${school.homepage || "(미등록)"}`,
    ``,
    `💡 받은 hwp 파일을 이 도구의 parse_evaluation_file(또는 CLI parse 명령)에 넣으면`,
    `   마크다운으로 변환하고 수행평가 항목만 뽑아드립니다.`,
  ].join("\n");
}

export interface EvaluationParseResult {
  fileType: string;
  markdown: string;
  /** 수행평가/평가 관련으로 추정되는 섹션들 */
  evaluationSections: string[];
  warnings?: string[];
}

/**
 * 내려받은 평가계획 문서(hwp/hwpx/pdf/docx 등)를 kordoc으로 파싱하고
 * 수행평가 관련 섹션을 추출한다.
 */
export async function parseEvaluationDocument(
  input: ArrayBuffer | Buffer,
  filePath?: string
): Promise<EvaluationParseResult> {
  const buf = input instanceof ArrayBuffer ? input : toArrayBuffer(input);
  const result = await parse(buf, filePath ? { filePath } : undefined);
  if (!result.success) {
    throw new Error("문서 파싱 실패");
  }
  const markdown = result.markdown ?? "";
  return {
    fileType: result.fileType ?? "unknown",
    markdown,
    evaluationSections: extractEvaluationSections(markdown),
    warnings: result.warnings?.map((w: any) => (typeof w === "string" ? w : w.message ?? String(w))),
  };
}

/**
 * 마크다운에서 수행평가/평가 관련 구간을 휴리스틱으로 추출.
 * 평가계획 문서는 보통 표 위주라, 평가 키워드가 포함된 표/문단 블록을 모은다.
 */
export function extractEvaluationSections(markdown: string): string[] {
  const KEYWORDS = ["수행평가", "평가기준", "평가요소", "평가방법", "평가영역", "성취기준", "반영비율", "평가시기"];
  const blocks = markdown.split(/\n\s*\n/);
  const hits: string[] = [];
  for (const block of blocks) {
    if (KEYWORDS.some((k) => block.includes(k))) {
      hits.push(block.trim());
    }
  }
  return hits;
}

function toArrayBuffer(b: Buffer): ArrayBuffer {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}
