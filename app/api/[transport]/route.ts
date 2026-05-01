import { createMcpHandler } from "mcp-handler";
import { registerAllTools } from "@/lib/tools";
import { runWithRequestContext } from "@/lib/opendart/request-context";

// Force the Node runtime — AsyncLocalStorage and full ICU (for EUC-KR
// decoding) require Node, not Edge.
export const runtime = "nodejs";

const mcpHandler = createMcpHandler(
  (server) => {
    registerAllTools(server);
  },
  {
    capabilities: {},
  },
  {
    basePath: "/api",
    maxDuration: 60,
    // Verbose logs would echo full URLs (which contain the API key) into
    // Vercel's log stream. Off by default on a public deployment.
    verboseLogs: process.env.MCP_VERBOSE_LOGS === "1",
  }
);

/**
 * Constant-time string compare. Lengths leak only via the timing of the
 * length-mismatch branch — for a casual access token that's acceptable.
 */
function safeEqual(a: string | null, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // 1) Access-token gate. If MCP_ACCESS_TOKEN is set, every request must carry
  //    a matching ?token=... query param. This stops anyone who stumbles onto
  //    the URL from burning the deployer's OpenDART quota.
  const requiredToken = process.env.MCP_ACCESS_TOKEN;
  if (requiredToken) {
    const provided = url.searchParams.get("token");
    if (!safeEqual(provided, requiredToken)) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  // 2) Per-request API key. Read from URL each time — no module-global state,
  //    so warm-container reuse can't leak one user's key to the next.
  const apiKey = url.searchParams.get("opendart_key") ?? undefined;

  return runWithRequestContext({ apiKey }, () => mcpHandler(req));
}

export { handler as GET, handler as POST, handler as DELETE };
