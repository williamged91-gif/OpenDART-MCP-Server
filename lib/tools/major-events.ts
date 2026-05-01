import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getJson, resolveApiKey } from "@/lib/opendart/client";
import { formatApiError, isNoData } from "@/lib/opendart/errors";
import { formatGenericTableMd } from "@/lib/opendart/formatters";

const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

function registerEventTool(
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
];

export function registerMajorEventTools(server: McpServer) {
  // --- Capital ---
  registerEventTool(server,
    "opendart_capital_increase", "유상증자 결정 (Paid Capital Increase)",
    "Get paid-in capital increase decision reports.\nArgs: corp_code, bgn_de, end_de",
    "piicDecsn",
    [...defaultColumns,
     { key: "nstk_ostk_cnt", label: "신주보통주수" }, { key: "nstk_estk_cnt", label: "신주우선주수" },
     { key: "fv_ps", label: "액면가" }, { key: "bfic_tisstk_ostk", label: "증자전보통주총수" },
     { key: "fdpp_fclt", label: "자금조달-시설" }, { key: "fdpp_bsninh", label: "자금조달-운영" }]
  );

  registerEventTool(server,
    "opendart_free_capital_increase", "무상증자 결정 (Free Capital Increase)",
    "Get free capital increase decision reports.\nArgs: corp_code, bgn_de, end_de",
    "fricDecsn",
    [...defaultColumns,
     { key: "nstk_ostk_cnt", label: "신주보통주수" }, { key: "nstk_estk_cnt", label: "신주우선주수" },
     { key: "nstk_asstd", label: "재원" }]
  );

  registerEventTool(server,
    "opendart_mixed_capital_increase", "유무상증자 결정 (Mixed Capital Increase)",
    "Get mixed paid/free capital increase decision reports.\nArgs: corp_code, bgn_de, end_de",
    "pifricDecsn",
    [...defaultColumns,
     { key: "piic_nstk_ostk_cnt", label: "유상신주보통주" }, { key: "fric_nstk_ostk_cnt", label: "무상신주보통주" }]
  );

  registerEventTool(server,
    "opendart_capital_decrease", "감자 결정 (Capital Decrease)",
    "Get capital reduction decision reports.\nArgs: corp_code, bgn_de, end_de",
    "crDecsn",
    [...defaultColumns,
     { key: "crstk_ostk_cnt", label: "감소보통주수" }, { key: "crstk_estk_cnt", label: "감소우선주수" },
     { key: "cr_re", label: "감자사유" }, { key: "cr_std_dt", label: "감자기준일" }]
  );

  // --- Merger & Division ---
  registerEventTool(server,
    "opendart_merger", "합병 결정 (Merger Decision)",
    "Get merger decision reports.\nArgs: corp_code, bgn_de, end_de",
    "cmpMgDecsn",
    [...defaultColumns,
     { key: "mgnm", label: "합병상대방" }, { key: "mgsc", label: "합병비율" },
     { key: "mghlsc", label: "합병형태" }, { key: "mgmthn", label: "합병방법" },
     { key: "mg_pp", label: "합병목적" }]
  );

  registerEventTool(server,
    "opendart_division", "회사분할 결정 (Division Decision)",
    "Get corporate division decision reports.\nArgs: corp_code, bgn_de, end_de",
    "cmpDvDecsn",
    [...defaultColumns,
     { key: "dvnm", label: "분할상대방" }, { key: "dvsc", label: "분할비율" },
     { key: "dvhlsc", label: "분할형태" }]
  );

  registerEventTool(server,
    "opendart_division_merger", "분할합병 결정 (Division-Merger Decision)",
    "Get corporate division-merger decision reports.\nArgs: corp_code, bgn_de, end_de",
    "cmpDvmgDecsn",
    [...defaultColumns,
     { key: "dvmgnm", label: "분할합병상대방" }, { key: "dvmgsc", label: "비율" }]
  );

  // --- Business/Asset Transfer ---
  registerEventTool(server,
    "opendart_business_acquisition", "영업양수 결정 (Business Acquisition)",
    "Get business acquisition decision reports.\nArgs: corp_code, bgn_de, end_de",
    "bsnInhDecsn",
    [...defaultColumns,
     { key: "bsninh_trfnm", label: "양도인" }, { key: "bsninh_pp", label: "양수목적" }]
  );

  registerEventTool(server,
    "opendart_business_transfer", "영업양도 결정 (Business Transfer)",
    "Get business transfer decision reports.\nArgs: corp_code, bgn_de, end_de",
    "bsnTrfDecsn",
    [...defaultColumns,
     { key: "bsntrf_inhnm", label: "양수인" }, { key: "bsntrf_pp", label: "양도목적" }]
  );

  registerEventTool(server,
    "opendart_tangible_asset_acquisition", "유형자산 양수 결정 (Tangible Asset Acquisition)",
    "Get tangible asset acquisition decision reports.\nArgs: corp_code, bgn_de, end_de",
    "tgastInhDecsn",
    [...defaultColumns,
     { key: "tgastinh_trfnm", label: "양도인" }, { key: "tgastinh_pp", label: "양수목적" }]
  );

  registerEventTool(server,
    "opendart_tangible_asset_transfer", "유형자산 양도 결정 (Tangible Asset Transfer)",
    "Get tangible asset transfer decision reports.\nArgs: corp_code, bgn_de, end_de",
    "tgastTrfDecsn",
    [...defaultColumns,
     { key: "tgasttrf_inhnm", label: "양수인" }, { key: "tgasttrf_pp", label: "양도목적" }]
  );

  registerEventTool(server,
    "opendart_other_stock_acquisition", "타법인 주식 취득 결정 (Other Corp Stock Acquisition)",
    "Get other corporation stock acquisition decision reports.\nArgs: corp_code, bgn_de, end_de",
    "otcprStkInvscrInhDecsn",
    [...defaultColumns,
     { key: "otcprstkinhtrfnm", label: "양도인" }, { key: "otcprsstkinhpp", label: "취득목적" }]
  );

  registerEventTool(server,
    "opendart_other_stock_transfer", "타법인 주식 처분 결정 (Other Corp Stock Transfer)",
    "Get other corporation stock transfer decision reports.\nArgs: corp_code, bgn_de, end_de",
    "otcprStkInvscrTrfDecsn",
    [...defaultColumns,
     { key: "otcprstktrfinhnm", label: "양수인" }, { key: "otcprstktrfpp", label: "처분목적" }]
  );

  registerEventTool(server,
    "opendart_asset_transfer_putback", "자산양수도 (풋백옵션) (Asset Transfer/Putback)",
    "Get asset transfer and put-back option details.\nArgs: corp_code, bgn_de, end_de",
    "astInhtrfEtcPtbkOpt",
    [...defaultColumns]
  );

  registerEventTool(server,
    "opendart_stock_exchange_transfer", "주식교환/이전 결정 (Stock Exchange Transfer)",
    "Get stock exchange and transfer decision reports.\nArgs: corp_code, bgn_de, end_de",
    "stkExtrDecsn",
    [...defaultColumns,
     { key: "stkextrnm", label: "상대방" }, { key: "stkextrsc", label: "교환비율" }]
  );

  // --- Treasury Stock ---
  registerEventTool(server,
    "opendart_treasury_acquisition_decision", "자기주식 취득 결정 (Treasury Stock Acquisition)",
    "Get treasury stock acquisition decision reports.\nArgs: corp_code, bgn_de, end_de",
    "tsstkAqDecsn",
    [...defaultColumns,
     { key: "aq_stk_knd", label: "주식종류" }, { key: "aq_stk_cnt", label: "취득주식수" },
     { key: "aq_pp", label: "취득목적" }]
  );

  registerEventTool(server,
    "opendart_disposal_treasury_stock", "자기주식 처분 결정 (Treasury Stock Disposal)",
    "Get treasury stock disposal decision reports.\nArgs: corp_code, bgn_de, end_de",
    "tsstkDpDecsn",
    [...defaultColumns,
     { key: "dp_stk_knd", label: "주식종류" }, { key: "dp_stk_cnt", label: "처분주식수" },
     { key: "dp_prc", label: "처분가격" }, { key: "dp_pp", label: "처분목적" }]
  );

  registerEventTool(server,
    "opendart_treasury_trust_contract", "자기주식신탁 체결 (Treasury Trust Contract)",
    "Get treasury stock trust contract decision reports.\nArgs: corp_code, bgn_de, end_de",
    "tsstkAqTrctrCnsDecsn",
    [...defaultColumns]
  );

  registerEventTool(server,
    "opendart_treasury_trust_termination", "자기주식신탁 해지 (Treasury Trust Termination)",
    "Get treasury stock trust contract termination decision reports.\nArgs: corp_code, bgn_de, end_de",
    "tsstkAqTrctrCcDecsn",
    [...defaultColumns]
  );

  // --- Bonds ---
  registerEventTool(server,
    "opendart_convertible_bond", "전환사채 발행 결정 (Convertible Bond)",
    "Get convertible bond issuance decision reports.\nArgs: corp_code, bgn_de, end_de",
    "cvbdIsDecsn",
    [...defaultColumns,
     { key: "bd_tm", label: "사채종류" }, { key: "bd_fta", label: "발행총액" },
     { key: "atcsc", label: "전환비율" }]
  );

  registerEventTool(server,
    "opendart_bond_with_warrant", "신주인수권부사채 발행 결정 (Bond with Warrant)",
    "Get warrant bond issuance decision reports.\nArgs: corp_code, bgn_de, end_de",
    "bdwtIsDecsn",
    [...defaultColumns,
     { key: "bd_tm", label: "사채종류" }, { key: "bd_fta", label: "발행총액" }]
  );

  registerEventTool(server,
    "opendart_exchangeable_bond", "교환사채 발행 결정 (Exchangeable Bond)",
    "Get exchangeable bond issuance decision reports.\nArgs: corp_code, bgn_de, end_de",
    "exbdIsDecsn",
    [...defaultColumns,
     { key: "bd_tm", label: "사채종류" }, { key: "bd_fta", label: "발행총액" }]
  );

  registerEventTool(server,
    "opendart_contingent_bond", "조건부자본증권 발행 결정 (Contingent Bond)",
    "Get contingent capital securities issuance decision reports.\nArgs: corp_code, bgn_de, end_de",
    "wdCocobdIsDecsn",
    [...defaultColumns,
     { key: "bd_tm", label: "증권종류" }, { key: "bd_fta", label: "발행총액" }]
  );

  registerEventTool(server,
    "opendart_stock_bond_acquisition", "주식관련사채 양수 결정 (Stock Bond Acquisition)",
    "Get stock-related bond acquisition decision reports.\nArgs: corp_code, bgn_de, end_de",
    "stkrtbdInhDecsn",
    [...defaultColumns]
  );

  registerEventTool(server,
    "opendart_stock_bond_transfer", "주식관련사채 양도 결정 (Stock Bond Transfer)",
    "Get stock-related bond transfer decision reports.\nArgs: corp_code, bgn_de, end_de",
    "stkrtbdTrfDecsn",
    [...defaultColumns]
  );

  // --- Stock Dividend ---
  registerEventTool(server,
    "opendart_stock_dividend", "주식배당 결정 (Stock Dividend)",
    "Get stock dividend decision reports.\nArgs: corp_code, bgn_de, end_de",
    "stDecsn",
    [...defaultColumns,
     { key: "stk_knd", label: "주식종류" }, { key: "stk_co", label: "주식수" },
     { key: "stk_fv", label: "액면가" }, { key: "stk_std_dt", label: "배당기준일" }]
  );

  // --- Overseas Listing ---
  registerEventTool(server,
    "opendart_overseas_listing_decision", "해외상장 결정 (Overseas Listing Decision)",
    "Get overseas securities market listing decision reports.\nArgs: corp_code, bgn_de, end_de",
    "ovLstDecsn",
    [...defaultColumns]
  );

  registerEventTool(server,
    "opendart_overseas_delisting_decision", "해외상장폐지 결정 (Overseas Delisting Decision)",
    "Get overseas securities market delisting decision reports.\nArgs: corp_code, bgn_de, end_de",
    "ovDlstDecsn",
    [...defaultColumns]
  );

  registerEventTool(server,
    "opendart_overseas_listing", "해외상장 (Overseas Listing)",
    "Get overseas securities market listing status.\nArgs: corp_code, bgn_de, end_de",
    "ovLst",
    [...defaultColumns]
  );

  registerEventTool(server,
    "opendart_overseas_delisting", "해외상장폐지 (Overseas Delisting)",
    "Get overseas securities market delisting status.\nArgs: corp_code, bgn_de, end_de",
    "ovDlst",
    [...defaultColumns]
  );

  // --- Creditor / Legal / Business ---
  registerEventTool(server,
    "opendart_creditor_management_start", "채권은행관리절차 개시 (Creditor Management Start)",
    "Get creditor bank management procedure initiation reports.\nArgs: corp_code, bgn_de, end_de",
    "bnkMngtPcbg",
    [...defaultColumns]
  );

  registerEventTool(server,
    "opendart_creditor_management_stop", "채권은행관리절차 중단 (Creditor Management Stop)",
    "Get creditor bank management procedure termination reports.\nArgs: corp_code, bgn_de, end_de",
    "bnkMngtPcsp",
    [...defaultColumns]
  );

  registerEventTool(server,
    "opendart_default_occurrence", "채무불이행 (Default Occurrence)",
    "Get information on corporate defaults.\nArgs: corp_code, bgn_de, end_de",
    "dfOcr",
    [...defaultColumns]
  );

  registerEventTool(server,
    "opendart_lawsuit", "소송 제기 (Lawsuit Filing)",
    "Get lawsuit filings and legal actions.\nArgs: corp_code, bgn_de, end_de",
    "lwstLg",
    [...defaultColumns]
  );

  registerEventTool(server,
    "opendart_business_suspension", "영업정지 (Business Suspension)",
    "Get business suspension details.\nArgs: corp_code, bgn_de, end_de",
    "bsnSp",
    [...defaultColumns]
  );

  registerEventTool(server,
    "opendart_rehabilitation", "회생절차 개시 (Rehabilitation Filing)",
    "Get rehabilitation procedure filing reports.\nArgs: corp_code, bgn_de, end_de",
    "ctrcvsBgrq",
    [...defaultColumns]
  );

  registerEventTool(server,
    "opendart_dissolution", "해산사유 발생 (Dissolution Event)",
    "Get dissolution event occurrence reports.\nArgs: corp_code, bgn_de, end_de",
    "dsRsOcr",
    [...defaultColumns]
  );
}
