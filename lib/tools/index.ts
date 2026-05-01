import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getRequestApiKey } from "@/lib/opendart/request-context";
import { registerCompanyTools } from "./company";
import { registerFinancialTools } from "./financial";
import { registerDisclosureTools } from "./disclosure";
import { registerShareholdingTools } from "./shareholding";
import { registerMajorEventTools } from "./major-events";
import { registerSecuritiesRegTools } from "./securities-reg";
import { registerWorkflowTools } from "./workflows";
import { registerDocumentTools } from "./document";

function registerConfigTools(server: McpServer) {
  // `set_api_key` was removed: storing the key in module-global state on
  // serverless leaks across users via warm-container reuse. The key now comes
  // from the connector URL (?opendart_key=...) and is scoped per request.
  server.tool(
    "get_api_key_status",
    "Check whether an OpenDART API key is configured for this request. / 현재 요청에 OpenDART API 키가 설정되어 있는지 확인합니다.",
    {},
    async () => {
      const hasRequest = !!getRequestApiKey();
      const hasEnv = !!process.env.OPENDART_API_KEY;
      let status: string;
      if (hasRequest) {
        status =
          "Request API key is set (from connector URL). / 커넥터 URL에서 받은 요청 단위 API 키가 설정되어 있습니다.";
      } else if (hasEnv) {
        status =
          "Server fallback API key is configured (env var). / 서버 환경변수의 대체 API 키가 설정되어 있습니다.";
      } else {
        status =
          "No API key configured. Append ?opendart_key=YOUR_KEY to the connector URL. " +
          "Get one free at https://opendart.fss.or.kr/ / " +
          "API 키가 설정되지 않았습니다. 커넥터 URL에 ?opendart_key=YOUR_KEY 를 붙이세요.";
      }
      return { content: [{ type: "text" as const, text: status }] };
    }
  );
}

export function registerAllTools(server: McpServer) {
  registerConfigTools(server);
  registerWorkflowTools(server);
  registerCompanyTools(server);
  registerFinancialTools(server);
  registerDisclosureTools(server);
  registerShareholdingTools(server);
  registerMajorEventTools(server);
  registerSecuritiesRegTools(server);
  registerDocumentTools(server); // body / outline / section / search
}
