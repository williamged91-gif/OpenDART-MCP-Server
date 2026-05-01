export interface CorpCodeEntry {
  corp_code: string;
  corp_name: string;
  stock_code: string;
  modify_date: string;
}

export interface OpenDartResponse {
  status: string;
  message: string;
  [key: string]: unknown;
}

export interface DisclosureItem {
  corp_code: string;
  corp_name: string;
  stock_code: string;
  corp_cls: string;
  report_nm: string;
  rcept_no: string;
  flr_nm: string;
  rcept_dt: string;
  rm: string;
}

export interface DisclosureListResponse extends OpenDartResponse {
  page_no: number;
  page_count: number;
  total_count: number;
  total_page: number;
  list: DisclosureItem[];
}

export interface CompanyInfo {
  corp_code: string;
  corp_name: string;
  corp_name_eng: string;
  stock_name: string;
  stock_code: string;
  ceo_nm: string;
  corp_cls: string;
  jurir_no: string;
  bizr_no: string;
  adres: string;
  hm_url: string;
  ir_url: string;
  phn_no: string;
  fax_no: string;
  induty_code: string;
  est_dt: string;
  acc_mt: string;
  [key: string]: unknown;
}

export interface FinancialAccountItem {
  rcept_no: string;
  reprt_code: string;
  bsns_year: string;
  corp_code: string;
  sj_div: string;
  sj_nm: string;
  account_id: string;
  account_nm: string;
  account_detail: string;
  thstrm_nm: string;
  thstrm_amount: string;
  thstrm_add_amount: string;
  frmtrm_nm: string;
  frmtrm_amount: string;
  frmtrm_add_amount: string;
  bfefrmtrm_nm: string;
  bfefrmtrm_amount: string;
  bfefrmtrm_add_amount: string;
  ord: string;
  currency: string;
  [key: string]: unknown;
}

export interface FinancialIndexItem {
  rcept_no: string;
  corp_code: string;
  corp_name: string;
  sj_div: string;
  sj_nm: string;
  idx_cl_nm: string;
  idx_nm: string;
  idx_val: string;
  [key: string]: unknown;
}

export const REPORT_CODES: Record<string, string> = {
  "11011": "사업보고서 (Annual)",
  "11012": "반기보고서 (Semi-annual)",
  "11013": "1분기보고서 (Q1)",
  "11014": "3분기보고서 (Q3)",
};

export const CORP_CLS_MAP: Record<string, string> = {
  Y: "유가증권 (KOSPI)",
  K: "코스닥 (KOSDAQ)",
  N: "코넥스 (KONEX)",
  E: "기타",
};
