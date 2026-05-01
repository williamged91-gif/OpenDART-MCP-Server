import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getJson, resolveApiKey } from "@/lib/opendart/client";
import { formatApiError, isNoData } from "@/lib/opendart/errors";
import { formatFinancialTableMd, formatGenericTableMd } from "@/lib/opendart/formatters";

const reprtCodeSchema = z.enum(["11011", "11012", "11013", "11014"]).describe(
  "Report type: 11011=Annual, 11012=Semi-annual, 11013=Q1, 11014=Q3"
);

const fsDiv = z.enum(["OFS", "CFS"]).default("CFS").describe(
  "Financial statement type: OFS=Individual, CFS=Consolidated (default)"
);

function registerFinancialTool(
  server: McpServer,
  name: string,
  title: string,
  description: string,
  endpoint: string,
  extraSchema: Record<string, z.ZodTypeAny>,
  formatFn: (data: Record<string, unknown>) => string
) {
  server.registerTool(
    name,
    {
      title,
      description,
      inputSchema: {
        corp_code: z.string().length(8).describe("8-digit company code"),
        bsns_year: z.string().regex(/^\d{4}$/).describe(
          "Fiscal year the report COVERS (YYYY). '2025년 사업보고서' → bsns_year='2025'. Do NOT subtract 1 from the year the user mentions."
        ),
        reprt_code: reprtCodeSchema,
        ...extraSchema,
        api_key: z.string().optional().describe("Optional: your own OpenDART API key"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params: Record<string, unknown>) => {
      try {
        const key = resolveApiKey(params.api_key as string | undefined);
        const queryParams: Record<string, string> = {
          corp_code: params.corp_code as string,
          bsns_year: params.bsns_year as string,
          reprt_code: params.reprt_code as string,
        };
        if (params.fs_div) queryParams.fs_div = params.fs_div as string;
        if (params.idx_cl_code) queryParams.idx_cl_code = params.idx_cl_code as string;

        const data = await getJson(endpoint, queryParams, key);
        if (isNoData(data.status as string)) {
          return { content: [{ type: "text" as const, text: `No data found. / 조회된 데이터가 없습니다. (${endpoint})` }] };
        }

        const md = formatFn(data);
        return { content: [{ type: "text" as const, text: md }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: formatApiError(err) }], isError: true };
      }
    }
  );
}

export function registerFinancialTools(server: McpServer) {
  // Single company key accounts
  registerFinancialTool(
    server,
    "opendart_single_financial_accounts",
    "단일회사 주요계정 (Single Company Key Accounts)",
    `Get key financial account items (revenue, operating profit, net income, assets, liabilities, equity) for a single company.
Returns a markdown table with current, prior, and pre-prior period amounts.

Args:
  - corp_code: 8-digit company code
  - bsns_year: Business year (e.g., "2024")
  - reprt_code: Report type (11011=Annual, 11012=Semi-annual, 11013=Q1, 11014=Q3)
  - fs_div: OFS=Individual, CFS=Consolidated (default: CFS)`,
    "fnlttSinglAcnt",
    { fs_div: fsDiv },
    (data) => formatFinancialTableMd(
      data.list as Array<Record<string, unknown>>,
      "단일회사 주요계정 (Key Accounts)",
      { groupByFsDiv: true }
    )
  );

  // Multi company key accounts
  server.registerTool(
    "opendart_multi_financial_accounts",
    {
      title: "다중회사 주요계정 (Multi-Company Key Accounts)",
      description: `Get key financial accounts for multiple companies at once (up to 100).

Args:
  - corp_code: Comma-separated 8-digit codes (e.g., "00126380,00164779")
  - bsns_year: Business year
  - reprt_code: Report type
  - fs_div: OFS or CFS`,
      inputSchema: {
        corp_code: z.string().describe("Comma-separated 8-digit codes (max 100)"),
        bsns_year: z.string().regex(/^\d{4}$/).describe(
          "Fiscal year the report COVERS (YYYY). '2025년 사업보고서' → bsns_year='2025'. Do NOT subtract 1."
        ),
        reprt_code: reprtCodeSchema,
        fs_div: fsDiv,
        api_key: z.string().optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const key = resolveApiKey(params.api_key);
        const data = await getJson("fnlttMultiAcnt", {
          corp_code: params.corp_code,
          bsns_year: params.bsns_year,
          reprt_code: params.reprt_code,
          fs_div: params.fs_div,
        }, key);

        if (isNoData(data.status as string)) {
          return { content: [{ type: "text" as const, text: "No data found." }] };
        }

        const items = data.list as Array<Record<string, unknown>>;
        const md = formatFinancialTableMd(items, "다중회사 주요계정 (Multi-Company Accounts)", {
          groupByFsDiv: true,
        });
        return { content: [{ type: "text" as const, text: md }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: formatApiError(err) }], isError: true };
      }
    }
  );

  // Full financial statement
  registerFinancialTool(
    server,
    "opendart_full_financial_statement",
    "전체 재무제표 (Full Financial Statement)",
    `Get the complete financial statement with all account line items for a company.
Returns comprehensive BS, IS, CF data. May return many rows.

Args:
  - corp_code, bsns_year, reprt_code, fs_div`,
    "fnlttSinglAcntAll",
    { fs_div: fsDiv },
    (data) => formatFinancialTableMd(
      data.list as Array<Record<string, unknown>>,
      "전체 재무제표 (Full Statement)",
      { groupByFsDiv: true }
    )
  );

  // Single company financial index
  registerFinancialTool(
    server,
    "opendart_single_financial_index",
    "주요 재무지표 (Financial Indicators)",
    `Get key financial ratios and indicators for a company.
Returns profitability, stability, growth, and activity ratios.

Args:
  - corp_code, bsns_year, reprt_code, idx_cl_code (optional)`,
    "fnlttSinglIndx",
    {
      fs_div: fsDiv,
      idx_cl_code: z.string().optional().describe("Index class code (optional filter)"),
    },
    (data) => {
      const items = data.list as Array<Record<string, unknown>>;
      return formatGenericTableMd(items, "주요 재무지표 (Financial Indicators)", [
        { key: "sj_nm", label: "재무제표" },
        { key: "idx_cl_nm", label: "지표분류" },
        { key: "idx_nm", label: "지표명" },
        { key: "idx_val", label: "지표값" },
      ]);
    }
  );

  // Multi company financial index
  server.registerTool(
    "opendart_multi_financial_index",
    {
      title: "다중회사 재무지표 (Multi-Company Indicators)",
      description: `Compare financial indicators across multiple companies.

Args:
  - corp_code: Comma-separated codes
  - bsns_year, reprt_code, fs_div`,
      inputSchema: {
        corp_code: z.string().describe("Comma-separated 8-digit codes"),
        bsns_year: z.string().regex(/^\d{4}$/).describe(
          "Fiscal year the report COVERS (YYYY). '2025년 사업보고서' → bsns_year='2025'. Do NOT subtract 1."
        ),
        reprt_code: reprtCodeSchema,
        fs_div: fsDiv,
        idx_cl_code: z.string().optional().describe("Index class code (optional filter)"),
        api_key: z.string().optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const key = resolveApiKey(params.api_key);
        const queryParams: Record<string, string> = {
          corp_code: params.corp_code,
          bsns_year: params.bsns_year,
          reprt_code: params.reprt_code,
          fs_div: params.fs_div,
        };
        if (params.idx_cl_code) queryParams.idx_cl_code = params.idx_cl_code;

        const data = await getJson("fnlttCmpnyIndx", queryParams, key);

        if (isNoData(data.status as string)) {
          return { content: [{ type: "text" as const, text: "No data found." }] };
        }

        const items = data.list as Array<Record<string, unknown>>;
        const md = formatGenericTableMd(items, "다중회사 재무지표", [
          { key: "corp_name", label: "회사명" },
          { key: "idx_cl_nm", label: "분류" },
          { key: "idx_nm", label: "지표명" },
          { key: "idx_val", label: "지표값" },
        ]);
        return { content: [{ type: "text" as const, text: md }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: formatApiError(err) }], isError: true };
      }
    }
  );

  // XBRL Taxonomy
  server.registerTool(
    "opendart_xbrl_taxonomy",
    {
      title: "XBRL 택사노미 (XBRL Taxonomy)",
      description: `Get XBRL taxonomy - standardized account classification codes used in financial statements.

Args:
  - sj_div: Statement type (BS1=BS-individual, BS2=BS-consolidated, IS1=IS-individual, IS2=IS-consolidated, etc.)`,
      inputSchema: {
        sj_div: z.string().describe("Statement division code (e.g., BS1, BS2, IS1, IS2, CF1, CF2)"),
        api_key: z.string().optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const key = resolveApiKey(params.api_key);
        const data = await getJson("xbrlTaxonomy", { sj_div: params.sj_div }, key);

        if (isNoData(data.status as string)) {
          return { content: [{ type: "text" as const, text: "No taxonomy data found." }] };
        }

        const items = data.list as Array<Record<string, unknown>>;
        const md = formatGenericTableMd(items, "XBRL 택사노미", [
          { key: "sj_div", label: "구분" },
          { key: "account_id", label: "계정ID" },
          { key: "account_nm", label: "계정명" },
          { key: "data_tp", label: "데이터유형" },
        ]);
        return { content: [{ type: "text" as const, text: md }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: formatApiError(err) }], isError: true };
      }
    }
  );

  // Dividend info
  registerFinancialTool(
    server,
    "opendart_dividend_info",
    "배당 정보 (Dividend Info)",
    `Get dividend-related information for a company.
Returns dividend per share, payout ratio, yield, and other dividend details.

Args:
  - corp_code, bsns_year, reprt_code`,
    "alotMatter",
    {},
    (data) => {
      const items = data.list as Array<Record<string, unknown>>;
      return formatGenericTableMd(items, "배당 관련 사항 (Dividend Info)", [
        { key: "se", label: "구분" },
        { key: "thstrm", label: "당기" },
        { key: "frmtrm", label: "전기" },
        { key: "lwfr", label: "전전기" },
      ]);
    }
  );
}
