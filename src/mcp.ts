// 학교알리미 MCP 서버 (stdio) — Claude/Cursor에서 "내 아이 학교" 공시정보 조회.
//
// 도구 정의는 mcpServer.ts에 있고(원격 HTTP와 공용), 여기서는 stdio로만 연결한다.
// 로컬 실행이므로 서버 로컬 파일을 읽는 parse_evaluation_file도 포함(localFiles: true).

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildMcpServer } from "./mcpServer.js";

async function main() {
  const server = buildMcpServer({ localFiles: true });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("schoolinfo-mcp 서버 시작 (stdio)");
}

main().catch((e) => {
  console.error("서버 오류:", e);
  process.exit(1);
});
