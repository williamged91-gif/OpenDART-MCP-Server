import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getJson, resolveApiKey } from "@/lib/opendart/client";
import { formatApiError, isNoData } from "@/lib/opendart/errors";
import { formatGenericTableMd } from "@/lib/opendart/formatters";

const periodicParams = {
  corp_code: z.string().length(8).describe("8-digit company code"),
  bsns_year: z.string().regex(/^\d{4}$/).describe(
    "Fiscal year the report COVERS (YYYY). '2025년 사업보고서' → bsns_year='2025'. Do NOT subtract 1 from the year the user mentions."
  ),
  reprt_code: z.enum(["11011", "11012", "11013", "11014"]).describe(
    "11011=Annual, 11012=Semi-annual, 11013=Q1, 11014=Q3"
  ),
  api_key: z.string().optional().describe("Optional: your own OpenDART API key"),
};

const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

function registerPeriodicTool(
  server: McpServer,
  name: string,
  title: string,
  description: string,
  endpoint: string,
  columns: Array<{ key: string; label: string }>
) {
  server.registerTool(
    name,
    { title, description, inputSchema: periodicParams, annotations },
    async (params) => {
      try {
        const key = resolveApiKey(params.api_key);
        const data = await getJson(endpoint, {
          corp_code: params.corp_code,
          bsns_year: params.bsns_year,
          reprt_code: params.reprt_code,
        }, key);

        if (isNoData(data.status as string)) {
          return { content: [{ type: "text" as const, text: `No data found. / 데이터 없음 (${endpoint})` }] };
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

export function registerDisclosureTools(server: McpServer) {
  // --- Shareholders ---
  registerPeriodicTool(server,
    "opendart_largest_shareholder", "최대주주 현황 (Largest Shareholder)",
    "Get largest shareholder status including name, ownership ratio, and relationship.\nArgs: corp_code, bsns_year, reprt_code",
    "hyslrSttus",
    [{ key: "nm", label: "성명" }, { key: "relate", label: "관계" }, { key: "stock_knd", label: "주식종류" },
     { key: "bsis_posesn_stock_co", label: "기초주식수" }, { key: "trmend_posesn_stock_co", label: "기말주식수" },
     { key: "trmend_posesn_stock_qota_rt", label: "지분율(%)" }]
  );

  registerPeriodicTool(server,
    "opendart_largest_shareholder_change", "최대주주 변동 (Shareholder Change)",
    "Get changes in the largest shareholder.\nArgs: corp_code, bsns_year, reprt_code",
    "hyslrChgSttus",
    [{ key: "change_on", label: "변동일" }, { key: "mxmm_shrholdr_nm", label: "최대주주명" },
     { key: "posesn_stock_co", label: "소유주식수" }, { key: "qota_rt", label: "지분율(%)" },
     { key: "change_cause", label: "변동사유" }]
  );

  registerPeriodicTool(server,
    "opendart_minority_shareholder", "소액주주 현황 (Minority Shareholder)",
    "Get minority/small shareholder status.\nArgs: corp_code, bsns_year, reprt_code",
    "mrhlSttus",
    [{ key: "se", label: "구분" }, { key: "shrholdr_co", label: "주주수" },
     { key: "shrholdr_tot_co", label: "전체주주수" }, { key: "shrholdr_rate", label: "비율(%)" },
     { key: "hold_stock_co", label: "보유주식수" }, { key: "stock_tot_co", label: "발행주식총수" },
     { key: "hold_stock_rate", label: "보유비율(%)" }]
  );

  // --- Executives & Employees ---
  registerPeriodicTool(server,
    "opendart_executive_status", "임원 현황 (Executive Status)",
    "Get executive/director roster with positions and compensation.\nArgs: corp_code, bsns_year, reprt_code",
    "exctvSttus",
    [{ key: "nm", label: "성명" }, { key: "sexdstn", label: "성별" }, { key: "birth_ym", label: "출생년월" },
     { key: "ofcps", label: "직위" }, { key: "rgist_exctv_at", label: "등기여부" },
     { key: "fte_at", label: "상근여부" }, { key: "chrg_job", label: "담당업무" }]
  );

  registerPeriodicTool(server,
    "opendart_employee_status", "직원 현황 (Employee Status)",
    "Get employee headcount, average tenure, and average salary.\nArgs: corp_code, bsns_year, reprt_code",
    "empSttus",
    [{ key: "fo_bbm", label: "사업부문" }, { key: "sexdstn", label: "성별" },
     { key: "reform_bfe_emp_co_rgllbr", label: "정규직" }, { key: "reform_bfe_emp_co_cnttk", label: "계약직" },
     { key: "rgllbr_co", label: "합계" }, { key: "avrg_cnwk_sdytrn", label: "평균근속(년)" },
     { key: "jan_salary_am", label: "연간급여총액" }, { key: "sm_avrg_salary_am", label: "1인평균급여" }]
  );

  registerPeriodicTool(server,
    "opendart_outside_director", "사외이사 현황 (Outside Director Status)",
    "Get independent/outside director information and changes.\nArgs: corp_code, bsns_year, reprt_code",
    "outcmpnyDrctrNdChangeSttus",
    [{ key: "nm", label: "성명" }, { key: "main_career", label: "주요경력" },
     { key: "chrg_job", label: "담당업무" }, { key: "maxmm_shrholdr_relate", label: "최대주주관계" }]
  );

  // --- Compensation ---
  registerPeriodicTool(server,
    "opendart_individual_compensation", "이사/감사 개인별 보수 (Individual Compensation)",
    "Get director and auditor individual compensation.\nArgs: corp_code, bsns_year, reprt_code",
    "hmvAuditIndvdlBySttus",
    [{ key: "nm", label: "성명" }, { key: "ofcps", label: "직위" },
     { key: "mendng_totamt", label: "보수총액" }, { key: "mendng_totamt_ct_incls_mendng", label: "근로소득포함" }]
  );

  registerPeriodicTool(server,
    "opendart_total_compensation", "이사/감사 전체 보수 (Total Compensation)",
    "Get aggregate director and auditor compensation.\nArgs: corp_code, bsns_year, reprt_code",
    "hmvAuditAllSttus",
    [{ key: "se", label: "구분" }, { key: "nmpr", label: "인원수" },
     { key: "mendng_totamt", label: "보수총액" }, { key: "jan_avrg_mendng_am", label: "1인당평균보수" }]
  );

  registerPeriodicTool(server,
    "opendart_top5_compensation", "보수 상위 5인 (Top 5 Compensation)",
    "Get individual compensation for top 5 highest-paid executives (500M+ KRW).\nArgs: corp_code, bsns_year, reprt_code",
    "indvdlByPay",
    [{ key: "nm", label: "성명" }, { key: "ofcps", label: "직위" }, { key: "mendng_totamt", label: "보수총액" },
     { key: "mendng_totamt_ct_incls_mendng", label: "근로소득포함" }]
  );

  registerPeriodicTool(server,
    "opendart_unregistered_exec_compensation", "미등기임원 보수 (Unregistered Exec Compensation)",
    "Get unregistered executive compensation.\nArgs: corp_code, bsns_year, reprt_code",
    "unrstExctvMendngSttus",
    [{ key: "se", label: "구분" }, { key: "nmpr", label: "인원수" },
     { key: "mendng_totamt", label: "보수총액" }, { key: "jan_avrg_mendng_am", label: "1인당평균보수" }]
  );

  registerPeriodicTool(server,
    "opendart_compensation_approval", "보수 승인 총액 (Compensation Approval)",
    "Get approved compensation total amounts.\nArgs: corp_code, bsns_year, reprt_code",
    "mendngSttus",
    [{ key: "se", label: "구분" }, { key: "nmpr", label: "인원수" },
     { key: "jan_avrg_mendng_am", label: "1인당평균보수" }, { key: "mendng_totamt", label: "보수총액" }]
  );

  // --- Shares & Treasury ---
  registerPeriodicTool(server,
    "opendart_total_shares", "주식 총수 (Total Shares)",
    "Get total outstanding shares by type.\nArgs: corp_code, bsns_year, reprt_code",
    "stockTotqySttus",
    [{ key: "se", label: "구분" }, { key: "isu_stock_totqy", label: "발행주식총수" },
     { key: "now_to_isu_stock_totqy", label: "현재상장주식수" },
     { key: "now_to_dcrs_stock_co", label: "현재감소주식수" }]
  );

  registerPeriodicTool(server,
    "opendart_stock_issuance_status", "증자/감자 현황 (Stock Issuance Status)",
    "Get capital increase/decrease details.\nArgs: corp_code, bsns_year, reprt_code",
    "irdsSttus",
    [{ key: "isu_dcrs_de", label: "변동일" }, { key: "isu_dcrs_stle", label: "발행/감소형태" },
     { key: "isu_dcrs_stock_knd", label: "주식종류" }, { key: "isu_dcrs_qy", label: "수량" },
     { key: "isu_dcrs_mstvdv_fval_amount", label: "액면가총액" }, { key: "isu_dcrs_mstvdv_amount", label: "발행가총액" }]
  );

  registerPeriodicTool(server,
    "opendart_treasury_stock", "자기주식 (Treasury Stock)",
    "Get treasury stock acquisition and disposal status.\nArgs: corp_code, bsns_year, reprt_code",
    "tesstkAcqsDspsSttus",
    [{ key: "acqs_mth1", label: "취득방법" }, { key: "stock_knd", label: "주식종류" },
     { key: "bsis_qy", label: "기초수량" }, { key: "change_qy_acqs", label: "취득수량" },
     { key: "change_qy_dsps", label: "처분수량" }, { key: "change_qy_incnr", label: "소각수량" },
     { key: "trmend_qy", label: "기말수량" }]
  );

  // --- Audit ---
  registerPeriodicTool(server,
    "opendart_auditor_opinion", "감사인/감사의견 (Auditor Opinion)",
    "Get external auditor name and audit opinion.\nArgs: corp_code, bsns_year, reprt_code",
    "accnutAdtorNmNdAdtOpinion",
    [{ key: "bsns_year", label: "사업연도" }, { key: "adtor", label: "감사인" },
     { key: "adt_opinion", label: "감사의견" }, { key: "adt_reprt_spcmnt_matter", label: "특기사항" }]
  );

  registerPeriodicTool(server,
    "opendart_audit_service_contract", "회계감사 계약 (Audit Service Contract)",
    "Get audit service engagement status.\nArgs: corp_code, bsns_year, reprt_code",
    "adtServiCntrctSttus",
    [{ key: "bsns_year", label: "사업연도" }, { key: "adtor", label: "감사인" },
     { key: "cntrct_de", label: "계약일" }, { key: "cntrct_pd", label: "계약기간" },
     { key: "mendng", label: "보수" }, { key: "bitime", label: "투입시간" }]
  );

  registerPeriodicTool(server,
    "opendart_non_audit_service", "비감사 서비스 (Non-Audit Service)",
    "Get non-audit service engagement details.\nArgs: corp_code, bsns_year, reprt_code",
    "nadtServiCntrctSttus",
    [{ key: "bsns_year", label: "사업연도" }, { key: "adtor", label: "감사인" },
     { key: "cntrct_cn", label: "계약내용" }, { key: "cntrct_pd", label: "계약기간" },
     { key: "mendng", label: "보수" }]
  );

  // --- Investments ---
  registerPeriodicTool(server,
    "opendart_investment_in_others", "타법인 출자 현황 (Investment in Others)",
    "Get investments in other corporations.\nArgs: corp_code, bsns_year, reprt_code",
    "otrCprInvstmntSttus",
    [{ key: "inv_prm", label: "법인명" }, { key: "frst_acqs_de", label: "최초취득일" },
     { key: "invstmnt_purps", label: "출자목적" }, { key: "frst_acqs_amount", label: "최초취득금액" },
     { key: "bsis_blce_qy", label: "기초잔액수량" }, { key: "trmend_blce_qy", label: "기말잔액수량" },
     { key: "trmend_blce_qota_rt", label: "기말지분율(%)" }]
  );

  // --- Debt Securities ---
  registerPeriodicTool(server,
    "opendart_debt_securities", "채무증권 발행실적 (Debt Securities Issued)",
    "Get debt security issuance records.\nArgs: corp_code, bsns_year, reprt_code",
    "detScritsIsuAcmslt",
    [{ key: "se", label: "구분" }, { key: "isu_de", label: "발행일" },
     { key: "isu_fta", label: "발행총액" }, { key: "isu_rate", label: "이율" },
     { key: "nrdmp_de", label: "상환일" }]
  );

  registerPeriodicTool(server,
    "opendart_commercial_paper", "기업어음 잔액 (Commercial Paper Balance)",
    "Get corporate note outstanding balance.\nArgs: corp_code, bsns_year, reprt_code",
    "entrprsBilScritsNrdmpBlce",
    [{ key: "se", label: "구분" }, { key: "isu_de", label: "발행일" },
     { key: "isu_fta", label: "발행총액" }, { key: "nrdmp_blce", label: "미상환잔액" }]
  );

  registerPeriodicTool(server,
    "opendart_short_term_bond", "단기사채 잔액 (Short-term Bond Balance)",
    "Get short-term bond outstanding balance.\nArgs: corp_code, bsns_year, reprt_code",
    "srtpdPsndbtNrdmpBlce",
    [{ key: "se", label: "구분" }, { key: "isu_de", label: "발행일" },
     { key: "isu_fta", label: "발행총액" }, { key: "nrdmp_blce", label: "미상환잔액" }]
  );

  registerPeriodicTool(server,
    "opendart_corporate_bond", "회사채 잔액 (Corporate Bond Balance)",
    "Get corporate bond outstanding balance.\nArgs: corp_code, bsns_year, reprt_code",
    "cprndNrdmpBlce",
    [{ key: "se", label: "구분" }, { key: "isu_de", label: "발행일" },
     { key: "isu_fta", label: "발행총액" }, { key: "nrdmp_blce", label: "미상환잔액" }]
  );

  registerPeriodicTool(server,
    "opendart_new_capital_securities", "신종자본증권 잔액 (New Capital Securities Balance)",
    "Get hybrid security outstanding balance.\nArgs: corp_code, bsns_year, reprt_code",
    "nwCptlScritsNrdmpBlce",
    [{ key: "se", label: "구분" }, { key: "isu_de", label: "발행일" },
     { key: "isu_fta", label: "발행총액" }, { key: "nrdmp_blce", label: "미상환잔액" }]
  );

  registerPeriodicTool(server,
    "opendart_contingent_capital", "조건부자본증권 잔액 (Contingent Capital Balance)",
    "Get contingent capital security outstanding balance.\nArgs: corp_code, bsns_year, reprt_code",
    "wdCocobdNrdmpBlce",
    [{ key: "se", label: "구분" }, { key: "isu_de", label: "발행일" },
     { key: "isu_fta", label: "발행총액" }, { key: "nrdmp_blce", label: "미상환잔액" }]
  );

  // --- Fund Usage ---
  registerPeriodicTool(server,
    "opendart_public_offering_fund", "공모자금 사용내역 (Public Offering Fund Usage)",
    "Get public offering proceeds usage details.\nArgs: corp_code, bsns_year, reprt_code",
    "pifndUseDtls",
    [{ key: "se", label: "구분" }, { key: "thstrm", label: "당기" },
     { key: "frmtrm", label: "전기" }]
  );

  registerPeriodicTool(server,
    "opendart_private_placement_fund", "사모자금 사용내역 (Private Placement Fund Usage)",
    "Get private placement proceeds usage details.\nArgs: corp_code, bsns_year, reprt_code",
    "prfdUseDtls",
    [{ key: "se", label: "구분" }, { key: "thstrm", label: "당기" },
     { key: "frmtrm", label: "전기" }]
  );
}
