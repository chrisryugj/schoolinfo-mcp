// 학교알리미 MCP 서버 — Claude/Cursor에서 "내 아이 학교" 공시정보 조회
//
// 학부모는 학교코드를 몰라도 됨: 시도/시군구/학교명만 입력하면 내부에서 해결.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, statSync, realpathSync } from "fs";
import { resolve, extname } from "path";
import { SchoolInfoClient, School } from "./client.js";
import { API_TYPES, SCHOOL_KIND, SchoolKindName, findApiType } from "./codes.js";
import {
  formatSchool,
  formatDisclosure,
  getParentDigest,
} from "./index.js";
import {
  evaluationGuide,
  parseEvaluationDocument,
  autoFetchEvaluation,
} from "./evaluation.js";

const KINDS = Object.keys(SCHOOL_KIND) as [SchoolKindName, ...SchoolKindName[]];
const ALLOWED_EXT = new Set([".hwp", ".hwpx", ".hwpml", ".pdf", ".xlsx", ".xls", ".docx"]);
const MAX_FILE_SIZE = 200 * 1024 * 1024;

function getClient(): SchoolInfoClient {
  const key = process.env.SCHOOLINFO_API_KEY;
  if (!key) throw new Error("환경변수 SCHOOLINFO_API_KEY가 설정되지 않았습니다.");
  return new SchoolInfoClient(key);
}

/** 시도/시군구/학교급/이름 → 첫 매칭 학교 (없으면 에러, 여러개면 목록 안내) */
async function resolveSchool(
  client: SchoolInfoClient,
  sido: string,
  sgg: string,
  kind: SchoolKindName,
  name: string
): Promise<{ school?: School; many?: School[] }> {
  const list = await client.searchSchools({ sido, sgg, kind, name });
  if (list.length === 0) return {};
  if (list.length > 1) {
    const exact = list.find((s) => s.name === name);
    if (exact) return { school: exact };
    return { many: list };
  }
  return { school: list[0] };
}

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}
function err(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

const server = new McpServer({ name: "schoolinfo-mcp", version: "0.1.0" });

// ─── 1. 학교 검색 ───────────────────────────────────────
server.tool(
  "search_school",
  "학교알리미에서 학교를 검색합니다. 시도·시군구·학교급·학교명으로 찾아 학교 기본정보를 반환합니다.",
  {
    sido: z.string().describe("시도명 (예: 서울특별시, 경기도, 부산광역시 — 약칭 '서울'도 가능)"),
    sgg: z.string().describe("시군구명 (예: 강남구, 수원시 장안구, 해운대구)"),
    kind: z.enum(KINDS).describe("학교급"),
    name: z.string().optional().describe("학교명 (부분 일치, 생략 시 지역 전체 목록)"),
  },
  async ({ sido, sgg, kind, name }) => {
    try {
      const client = getClient();
      const list = await client.searchSchools({ sido, sgg, kind, name });
      if (!list.length) return ok(`검색 결과가 없습니다: ${sido} ${sgg} ${kind} ${name ?? ""}`);
      if (list.length === 1) return ok(formatSchool(list[0]));
      const head = `검색 결과 ${list.length}개:\n\n`;
      return ok(head + list.map((s) => `- ${s.name} (${s.foundation}, ${s.address})`).join("\n"));
    } catch (e: any) {
      return err(`오류: ${e.message}`);
    }
  }
);

// ─── 2. 공시항목 목록 ───────────────────────────────────
server.tool(
  "list_disclosure_types",
  "조회 가능한 학교알리미 공시정보 항목(급식·학생수·교원·동아리·방과후 등 35종) 목록을 반환합니다.",
  {},
  async () => {
    const lines = Object.entries(API_TYPES).map(([code, name]) => `- ${name} (코드 ${code})`);
    return ok(
      "조회 가능한 공시정보 항목:\n\n" +
        lines.join("\n") +
        "\n\n※ 수행평가 주제·평가기준(교과별 교수·학습 및 평가계획)은 OpenAPI에 없으며, get_evaluation_guide를 사용하세요."
    );
  }
);

// ─── 3. 특정 공시정보 조회 ──────────────────────────────
server.tool(
  "get_disclosure",
  "특정 학교의 특정 공시정보를 조회합니다. 항목명(예: '급식', '학생수', '동아리')으로 찾습니다.",
  {
    sido: z.string(),
    sgg: z.string(),
    kind: z.enum(KINDS),
    name: z.string().describe("학교명"),
    item: z.string().describe("공시항목명 또는 코드 (예: 급식, 학년별·학급별 학생수, 09)"),
    year: z.number().optional().describe("공시연도 (기본: 올해)"),
  },
  async ({ sido, sgg, kind, name, item, year }) => {
    try {
      const client = getClient();
      const { school, many } = await resolveSchool(client, sido, sgg, kind, name);
      if (many) return ok(`여러 학교가 검색됨. 정확한 이름을 지정하세요:\n` + many.map((s) => `- ${s.name}`).join("\n"));
      if (!school) return ok(`학교를 찾을 수 없습니다: ${name}`);

      // 항목 해석: 코드면 그대로, 이름이면 검색
      let apiType = item;
      if (!API_TYPES[item]) {
        const matches = findApiType(item);
        if (!matches.length) return ok(`알 수 없는 공시항목: "${item}". list_disclosure_types로 목록을 확인하세요.`);
        if (matches.length > 1)
          return ok(`여러 항목이 매칭됨:\n` + matches.map((m) => `- ${m.name} (${m.code})`).join("\n"));
        apiType = matches[0].code;
      }

      const { name: itemName, rows } = await client.getDisclosure(school, apiType, year);
      return ok(`# ${school.name} — ${itemName}\n\n` + formatDisclosure(itemName, rows, apiType));
    } catch (e: any) {
      return err(`오류: ${e.message}`);
    }
  }
);

// ─── 4. 학부모 다이제스트 ───────────────────────────────
server.tool(
  "get_parent_digest",
  "학부모가 자주 보는 핵심 공시(학생수·급식·방과후·동아리·상담·학교폭력예방)를 한 번에 모아 보여줍니다.",
  {
    sido: z.string(),
    sgg: z.string(),
    kind: z.enum(KINDS),
    name: z.string().describe("학교명"),
    year: z.number().optional(),
  },
  async ({ sido, sgg, kind, name }) => {
    try {
      const client = getClient();
      const { school, many } = await resolveSchool(client, sido, sgg, kind, name);
      if (many) return ok(`여러 학교가 검색됨:\n` + many.map((s) => `- ${s.name}`).join("\n"));
      if (!school) return ok(`학교를 찾을 수 없습니다: ${name}`);

      const digest = await getParentDigest(client, school);
      const parts = [formatSchool(school), ""];
      for (const d of digest) parts.push(formatDisclosure(d.name, d.rows, d.apiType), "");
      return ok(parts.join("\n"));
    } catch (e: any) {
      return err(`오류: ${e.message}`);
    }
  }
);

// ─── 5. 평가계획(수행평가) 자동 조회 ────────────────────
server.tool(
  "get_evaluation_plan",
  "학교의 '교과별 교수·학습 및 평가 운영 계획'(수행평가 주제·평가기준·반영비율)을 학교알리미에서 자동으로 내려받아 마크다운으로 변환하고 수행평가 표를 추출합니다.",
  {
    sido: z.string(),
    sgg: z.string(),
    kind: z.enum(KINDS),
    name: z.string().describe("학교명"),
    year: z.number().optional().describe("공시연도 (기본: 올해)"),
    full: z.boolean().optional().describe("true면 전체 문서, 기본은 수행평가 섹션 위주"),
  },
  async ({ sido, sgg, kind, name, year, full }) => {
    try {
      const client = getClient();
      const { school, many } = await resolveSchool(client, sido, sgg, kind, name);
      if (many) return ok(`여러 학교가 검색됨:\n` + many.map((s) => `- ${s.name}`).join("\n"));
      if (!school) return ok(`학교를 찾을 수 없습니다: ${name}`);

      const results = await autoFetchEvaluation(school, year);
      const parts: string[] = [`# ${school.name} — 교수·학습 및 평가 운영 계획\n`];
      for (const r of results) {
        parts.push(`## 📄 ${r.filename} (${r.fileType})\n`);
        if (r.evaluationSections.length) {
          parts.push(`### 🎯 수행평가 관련 (${r.evaluationSections.length}개)\n`);
          parts.push(r.evaluationSections.join("\n\n---\n\n"));
        }
        if (full || !r.evaluationSections.length) {
          parts.push(`\n### 전체 문서\n`, r.markdown);
        }
      }
      return ok(parts.join("\n"));
    } catch (e: any) {
      // 자동 다운로드 실패 시 수동 안내로 폴백
      try {
        const client = getClient();
        const { school } = await resolveSchool(client, sido, sgg, kind, name);
        if (school) return ok(`⚠️ 자동 조회 실패: ${e.message}\n\n` + evaluationGuide(school, year));
      } catch {}
      return err(`오류: ${e.message}`);
    }
  }
);

// ─── 6. 내려받은 평가계획 hwp 파싱 ──────────────────────
server.tool(
  "parse_evaluation_file",
  "학교알리미에서 내려받은 평가계획 문서(hwp/hwpx/pdf/docx)를 마크다운으로 변환하고 수행평가 관련 섹션을 추출합니다. (kordoc 기반)",
  {
    file_path: z.string().describe("내려받은 문서 파일의 절대 경로"),
  },
  async ({ file_path }) => {
    try {
      const resolved = realpathSync(resolve(file_path));
      const ext = extname(resolved).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) return err(`지원하지 않는 확장자: ${ext}`);
      if (statSync(resolved).size > MAX_FILE_SIZE) return err("파일이 너무 큽니다 (최대 200MB)");

      const buf = readFileSync(resolved);
      const result = await parseEvaluationDocument(buf, resolved);
      const parts = [`[${result.fileType.toUpperCase()}] ${file_path}`, ""];
      if (result.evaluationSections.length) {
        parts.push(`## 🎯 수행평가 관련 추출 (${result.evaluationSections.length}개 섹션)\n`);
        parts.push(result.evaluationSections.join("\n\n---\n\n"));
        parts.push("\n\n<details><summary>전체 문서</summary>\n");
      }
      parts.push(result.markdown);
      return ok(parts.join("\n"));
    } catch (e: any) {
      return err(`오류: ${e.message}`);
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("schoolinfo-mcp 서버 시작 (stdio)");
}

main().catch((e) => {
  console.error("서버 오류:", e);
  process.exit(1);
});
