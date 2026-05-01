import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getJson, resolveApiKey } from "@/lib/opendart/client";
import { formatApiError, isNoData } from "@/lib/opendart/errors";
import { formatGenericTableMd } from "@/lib/opendart/formatters";

const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

function registerSecRegTool(
  server: McpServer,
  name: string,
  title: string,
  description: string,
  endpoint: string,
  columns: Array<{ key: string; label: string }>
) {
  server.registerTool(
    name,
    {
      title,
      description,
      inputSchema: {
        corp_code: z.string().length(8).describe("8-digit company code"),
        bgn_de: z.string().regex(/^\d{8}$/).describe("Start date (YYYYMMDD)"),
        end_de: z.string().regex(/^\d{8}$/).describe("End date (YYYYMMDD)"),
        api_key: z.string().optional().describe("Optional: your own API key"),
      },
      annotations,
    },
    async (params) => {
      try {
        const key = resolveApiKey(params.api_key);
        const data = await getJson(endpoint, {
          corp_code: params.corp_code,
          bgn_de: params.bgn_de,
          end_de: params.end_de,
        }, key);

        if (isNoData(data.status as string)) {
          return { content: [{ type: "text" as const, text: `No ${title} data found. / 데이터 없음` }] };
        }

        const items = data.list as Array<Record<string, unknown>>;
        const md = formatGenericTableMd(items, title, columns);
        return { content: [{ type: "text" as const, text: md }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: formatApiError(err) }], isError: true };
      }
    }
  );
}

const defaultColumns = [
  { key: "rcept_no", label: "접수번호" },
  { key: "rcept_dt", label: "접수일" },
  { key: "corp_name", label: "회사명" },
];

export function registerSecuritiesRegTools(server: McpServer) {
  registerSecRegTool(server,
    "opendart_equity_securities_reg", "지분증권 신고서 (Equity Securities Registration)",
    "Get equity securities summary from registration statements.\nArgs: corp_code, bgn_de, end_de",
    "estkRs",
    [...defaultColumns]
  );

  registerSecRegTool(server,
    "opendart_debt_securities_reg", "채무증권 신고서 (Debt Securities Registration)",
    "Get debt securities summary from registration statements.\nArgs: corp_code, bgn_de, end_de",
    "bdRs",
    [...defaultColumns]
  );

  registerSecRegTool(server,
    "opendart_depositary_receipts_reg", "예탁증권 신고서 (Depositary Receipts Registration)",
    "Get depositary receipts summary from registration statements.\nArgs: corp_code, bgn_de, end_de",
    "stkdpRs",
    [...defaultColumns]
  );

  registerSecRegTool(server,
    "opendart_merger_reg", "합병 신고서 (Merger Registration)",
    "Get merger summary from registration statements.\nArgs: corp_code, bgn_de, end_de",
    "mgRs",
    [...defaultColumns]
  );

  registerSecRegTool(server,
    "opendart_stock_exchange_reg", "주식교환 신고서 (Stock Exchange Registration)",
    "Get stock exchange/transfer summary from registration statements.\nArgs: corp_code, bgn_de, end_de",
    "extrRs",
    [...defaultColumns]
  );

  registerSecRegTool(server,
    "opendart_division_reg", "분할 신고서 (Division Registration)",
    "Get company division summary from registration statements.\nArgs: corp_code, bgn_de, end_de",
    "dvRs",
    [...defaultColumns]
  );
}
