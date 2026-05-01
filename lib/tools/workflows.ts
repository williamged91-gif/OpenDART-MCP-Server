import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatApiError } from "@/lib/opendart/errors";
import { searchCompanies } from "@/lib/opendart/cache";

export function registerWorkflowTools(server: McpServer) {
  server.registerTool(
    "opendart_search_company",
    {
      title: "회사 검색 (Search Company)",
      description: `Search for companies by Korean/English name, stock code, or corp code.
Supports fuzzy matching: chosung search (ㅎㄷㅈㄷㅊ→현대자동차), abbreviations (삼전→삼성전자), and typo tolerance.
Returns matching companies with their corp_code (needed for other tools).

Examples:
  - query="삼성전자" → finds Samsung Electronics
  - query="005930" → finds by stock code
  - query="삼전" → finds Samsung Electronics (abbreviation)
  - query="ㅎㄷㅈㄷㅊ" → finds Hyundai Motor (chosung)

Args:
  - query: Company name, stock code, or corp code
  - limit: Max results (default: 10)`,
      inputSchema: {
        query: z.string().min(1).describe("Company name, stock code, or corp code"),
        limit: z.number().int().min(1).max(30).default(10).describe("Max results"),
        api_key: z.string().optional().describe("Optional: your own API key"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const results = await searchCompanies(params.query, params.api_key, params.limit);

        if (results.length === 0) {
          return { content: [{ type: "text" as const, text: `No companies found for "${params.query}". / "${params.query}"에 대한 검색 결과가 없습니다.\n\nTips: 정확한 회사명, 종목코드(6자리), 또는 기업코드(8자리)를 입력하세요.` }] };
        }

        const lines = [
          `## 회사 검색 결과 (Company Search Results) - "${params.query}"`,
          "",
          "| 회사명 (Company) | 고유번호 (Corp Code) | 종목코드 (Stock) | 시장 (Market) |",
          "|------------------|---------------------|------------------|---------------|",
        ];

        for (const r of results) {
          const market = r.stock_code ? "상장" : "비상장";
          lines.push(`| ${r.corp_name} | ${r.corp_code} | ${r.stock_code || "-"} | ${market} |`);
        }

        lines.push("", `> Use corp_code with other opendart tools to get detailed information.`);

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: formatApiError(err) }], isError: true };
      }
    }
  );
}
