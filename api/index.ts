// Vercel 진입점 — rewrite가 모든 요청을 여기로 보내며, 원래 경로를 __vpath 쿼리로 전달한다.
// (Vercel rewrite는 고정 destination으로 보내면 req.url을 destination으로 덮어쓰므로,
//  원래 경로를 명시적으로 실어 보내고 여기서 복원해야 handleRequest의 자체 라우팅이 살아난다.)
import type { IncomingMessage, ServerResponse } from "http";
import { handleRequest } from "../src/server.js";

export default function handler(req: IncomingMessage, res: ServerResponse) {
  const host = req.headers.host ?? "localhost";
  const u = new URL(req.url ?? "/", `http://${host}`);
  const vpath = u.searchParams.get("__vpath");
  if (vpath) {
    u.searchParams.delete("__vpath");
    const qs = u.searchParams.toString();
    req.url = vpath + (qs ? `?${qs}` : "");
  }
  return handleRequest(req, res);
}
