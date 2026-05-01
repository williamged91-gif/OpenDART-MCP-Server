import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getJson, resolveApiKey } from "@/lib/opendart/client";
import { formatApiError } from "@/lib/opendart/errors";
import { formatCompanyInfoMd, formatDisclosureListMd, formatPagination } from "@/lib/opendart/formatters";
import { isNoData } from "@/lib/opendart/errors";

export function registerCompanyTools(server: McpServer) {
  server.registerTool(
    "opendart_get_company_info",
    {
      title: "기업 개황 조회 (Company Info)",
      description: `Get company overview information from OpenDART.
Returns company name, CEO, address, industry code, establishment date, fiscal month, listing status, and more.
Requires corp_code (8-digit unique company identifier). Use opendart_search_company to find corp_code by name.

Args:
  - corp_code: 8-digit company unique code (e.g., "00126380" for Samsung Electronics)
  - api_key (optional): Override the server's OpenDART API key`,
      inputSchema: {
        corp_code: z.string().length(8).describe("8-digit company unique code (고유번호)"),
        api_key: z.string().optional().describe("Optional: your own OpenDART API key"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ corp_code, api_key }) => {
      try {
        const key = resolveApiKey(api_key);
        const data = await getJson("company", { corp_code }, key);

        if (isNoData(data.status as string)) {
          return { content: [{ type: "text" as const, text: `No company found for corp_code: ${corp_code}` }] };
        }

        const md = formatCompanyInfoMd(data);
        return { content: [{ type: "text" as const, text: md }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: formatApiError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    "opendart_search_disclosure",
    {
      title: "공시 검색 (Search Disclosures)",
      description: `Search DART disclosures with various filters.
Returns a list of disclosure reports with company name, report title, filing date, and receipt number.

Args:
  - corp_code (optional): 8-digit company code to filter by
  - bgn_de (optional): Start date (YYYYMMDD)
  - end_de (optional): End date (YYYYMMDD)
  - last_reprt_at (optional): "Y" for final reports only, "N" for all
  - pblntf_ty (optional): Disclosure type - A:정기공시, B:주요사항, C:발행공시, D:지분공시, E:기타공시, F:외부감사, G:펀드공시, H:자산유동화, I:거래소공시, J:공정위공시
  - pblntf_detail_ty (optional): Detailed disclosure type code
  - corp_cls (optional): Market type - Y:유가증권, K:코스닥, N:코넥스, E:기타
  - sort (optional): Sort field - date, crp, rpt (default: date)
  - sort_mth (optional): Sort order - asc or desc (default: desc)
  - page_no (optional): Page number (default: 1)
  - page_count (optional): Items per page (default: 20, max: 100)`,
      inputSchema: {
        corp_code: z.string().length(8).optional().describe("8-digit company code"),
        bgn_de: z.string().regex(/^\d{8}$/).optional().describe("Start date YYYYMMDD"),
        end_de: z.string().regex(/^\d{8}$/).optional().describe("End date YYYYMMDD"),
        last_reprt_at: z.enum(["Y", "N"]).optional().describe("Final reports only"),
        pblntf_ty: z.enum(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]).optional().describe("Disclosure type"),
        pblntf_detail_ty: z.string().optional().describe("Detailed disclosure type code"),
        corp_cls: z.enum(["Y", "K", "N", "E"]).optional().describe("Market type"),
        sort: z.enum(["date", "crp", "rpt"]).optional().describe("Sort field"),
        sort_mth: z.enum(["asc", "desc"]).optional().describe("Sort order"),
        page_no: z.number().int().min(1).default(1).describe("Page number"),
        page_count: z.number().int().min(1).max(100).default(20).describe("Items per page"),
        api_key: z.string().optional().describe("Optional: your own OpenDART API key"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const key = resolveApiKey(params.api_key);
        const queryParams: Record<string, string> = {};
        if (params.corp_code) queryParams.corp_code = params.corp_code;
        if (params.bgn_de) queryParams.bgn_de = params.bgn_de;
        if (params.end_de) queryParams.end_de = params.end_de;
        if (params.last_reprt_at) queryParams.last_reprt_at = params.last_reprt_at;
        if (params.pblntf_ty) queryParams.pblntf_ty = params.pblntf_ty;
        if (params.pblntf_detail_ty) queryParams.pblntf_detail_ty = params.pblntf_detail_ty;
        if (params.corp_cls) queryParams.corp_cls = params.corp_cls;
        if (params.sort) queryParams.sort = params.sort;
        if (params.sort_mth) queryParams.sort_mth = params.sort_mth;
        queryParams.page_no = String(params.page_no);
        queryParams.page_count = String(params.page_count);

        const data = await getJson("list", queryParams, key);

        if (isNoData(data.status as string)) {
          return { content: [{ type: "text" as const, text: "No disclosures found for the given criteria. / 검색 결과가 없습니다." }] };
        }

        const items = (data.list || []) as Array<Record<string, unknown>>;
        const totalCount = data.total_count as number;
        const totalPage = data.total_page as number;
        const md = formatDisclosureListMd(items, totalCount, params.page_no, totalPage);
        const pagination = formatPagination(params.page_no, totalCount, totalPage);

        return { content: [{ type: "text" as const, text: md + pagination }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: formatApiError(err) }], isError: true };
      }
    }
  );
}
