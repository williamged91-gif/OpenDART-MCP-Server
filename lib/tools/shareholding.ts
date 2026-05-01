import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getJson, resolveApiKey } from "@/lib/opendart/client";
import { formatApiError, isNoData } from "@/lib/opendart/errors";
import { formatGenericTableMd } from "@/lib/opendart/formatters";

export function registerShareholdingTools(server: McpServer) {
  server.registerTool(
    "opendart_major_stockholding",
    {
      title: "대량보유 상황보고 (Major Stockholding)",
      description: `Get major stockholding disclosure reports (5%+ ownership changes).

Args:
  - corp_code: 8-digit company code`,
      inputSchema: {
        corp_code: z.string().length(8).describe("8-digit company code"),
        api_key: z.string().optional().describe("Optional: your own API key"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const key = resolveApiKey(params.api_key);
        const data = await getJson("majorstock", { corp_code: params.corp_code }, key);

        if (isNoData(data.status as string)) {
          return { content: [{ type: "text" as const, text: "No major stockholding reports found." }] };
        }

        const items = data.list as Array<Record<string, unknown>>;
        const md = formatGenericTableMd(items, "대량보유 상황보고 (Major Stockholding)", [
          { key: "rcept_no", label: "접수번호" },
          { key: "rcept_dt", label: "접수일" },
          { key: "corp_name", label: "회사명" },
          { key: "report_tp", label: "보고유형" },
          { key: "repror", label: "보고자" },
          { key: "stkqy", label: "보유주식수" },
          { key: "stkqy_irds", label: "증감" },
          { key: "stkrt", label: "지분율(%)" },
          { key: "stkrt_irds", label: "지분율증감" },
        ]);
        return { content: [{ type: "text" as const, text: md }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: formatApiError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    "opendart_executive_stockholding",
    {
      title: "임원 주요주주 소유보고 (Executive Stockholding)",
      description: `Get executive and major shareholder stock ownership change reports.

Args:
  - corp_code: 8-digit company code`,
      inputSchema: {
        corp_code: z.string().length(8).describe("8-digit company code"),
        api_key: z.string().optional().describe("Optional: your own API key"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const key = resolveApiKey(params.api_key);
        const data = await getJson("elestock", { corp_code: params.corp_code }, key);

        if (isNoData(data.status as string)) {
          return { content: [{ type: "text" as const, text: "No executive stockholding reports found." }] };
        }

        const items = data.list as Array<Record<string, unknown>>;
        const md = formatGenericTableMd(items, "임원 주요주주 소유보고 (Executive Stockholding)", [
          { key: "rcept_no", label: "접수번호" },
          { key: "rcept_dt", label: "접수일" },
          { key: "corp_name", label: "회사명" },
          { key: "repror", label: "보고자" },
          { key: "isu_exctv_rgist_at", label: "등기임원여부" },
          { key: "isu_exctv_ofcps", label: "직위" },
          { key: "isu_exctv_rgist_sttus", label: "주요주주여부" },
        ]);
        return { content: [{ type: "text" as const, text: md }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: formatApiError(err) }], isError: true };
      }
    }
  );
}
