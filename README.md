# OpenDART MCP Server

한국 금융감독원 [OpenDART API](https://opendart.fss.or.kr/)를 Claude에서 바로 사용할 수 있는 MCP(Model Context Protocol) 서버입니다.

API를 발급받아 Claude 커스텀 커넥터로 바로 연결할 수 있습니다.

## Features

- **Open DART API 전부 지원**: Open DART에서 제공하는 API(83개)를 전부 지원합니다.
- **공시 본문/섹션 추출**: 사업보고서·주요사항보고서 등 본문 XML을 다운로드해 마크다운으로 변환하고, 섹션(목차) 단위로 추출합니다.
- **Vercel 배포 + 접속 토큰 보호**: ngrok 없이 커넥터로 연결, `MCP_ACCESS_TOKEN`으로 URL 무단 사용 차단.
- **요청 단위 API 키 격리**: 키는 커넥터 URL에서 매 요청 읽어 AsyncLocalStorage에 저장 — warm 컨테이너 재사용으로 인한 키 누수 없음.
- **마크다운 출력**: Claude에서 깔끔하게 렌더링되는 테이블 형태로 출력합니다.
- **Corp Code 캐싱**: 9만+ 기업 목록을 인메모리 캐싱.

## Quick Start (보안 설정 포함)

### 1. OpenDART API 키 발급

[OpenDART](https://opendart.fss.or.kr/)에서 회원가입 후 API 인증키를 발급받으세요.

### 2. Vercel에 배포

이 레포를 fork → Vercel에서 import → 환경 변수 설정:

| 변수 | 필수 | 설명 |
|------|------|------|
| `MCP_ACCESS_TOKEN` | **필수** | URL 접속 토큰. 32자 이상 무작위 문자열. 미설정 시 URL을 알아낸 누구나 사용 가능. |
| `OPENDART_API_KEY` | 선택 | 서버 측 기본 키. 이 키를 설정하고 URL을 공유하면 다른 사람이 당신의 일일 쿼터를 소진합니다. 본인 전용일 때만 설정. |
| `MCP_VERBOSE_LOGS` | 선택 | 기본 `0`. `1`로 켜면 mcp-handler가 URL(키 포함)을 로그로 남기므로 권장하지 않음. |

### 3. Claude에 연결

1. [claude.ai](https://claude.ai) 접속
2. Settings > Connectors > Add custom connector
3. URL 입력:
   ```
   https://your-project.vercel.app/api/mcp?token=YOUR_ACCESS_TOKEN&opendart_key=YOUR_OPENDART_KEY
   ```
4. 연결 완료. 서버에 `OPENDART_API_KEY`를 이미 설정해둔 경우 `opendart_key`는 생략 가능.

## Tools

### Config (1개)

| Tool | 설명 |
|------|------|
| `get_api_key_status` | 현재 요청에 API 키가 설정되어 있는지 확인 |

> ℹ️ `set_api_key` 도구는 보안 이유로 제거되었습니다 (모듈 전역 상태가 warm 컨테이너 간 공유되어 다른 사용자에게 키가 누출될 수 있었음). 키는 커넥터 URL에 `?opendart_key=...` 형식으로 매 요청 전달하세요.

### 공시 본문 (4개) — 신규

| Tool | 설명 |
|------|------|
| `opendart_get_disclosure_outline` | 공시 본문의 섹션 트리(목차) 반환. 경로/제목 확인용. |
| `opendart_get_disclosure_body` | 본문 전체를 마크다운으로 반환 (offset/max_chars로 페이지네이션) |
| `opendart_get_disclosure_section` | 경로(`2.1`) 또는 제목 부분일치(`사업의 내용`)로 한 섹션만 추출 |
| `opendart_search_disclosure_body` | 본문 내 키워드 위치 검색 (앞뒤 문맥 + 섹션 경로 표시) |

### 회사 검색 & 정보 (3개)

| Tool | 설명 |
|------|------|
| `opendart_search_company` | 한글/영문 이름 또는 종목코드로 회사 검색 → corp_code 획득 |
| `opendart_get_company_info` | 기업 개황 (대표이사, 주소, 업종 등) |
| `opendart_search_disclosure` | 공시 검색 (기간, 유형, 페이지네이션) |

### 재무 정보 (7개)

| Tool | 설명 |
|------|------|
| `opendart_single_financial_accounts` | 단일회사 주요계정 (매출, 영업이익, 자산 등) |
| `opendart_multi_financial_accounts` | 다중회사 주요계정 비교 (최대 100개) |
| `opendart_full_financial_statement` | 전체 재무제표 (BS, IS, CF 전 항목) |
| `opendart_single_financial_index` | 단일회사 재무지표 (수익성, 안정성, 성장성) |
| `opendart_multi_financial_index` | 다중회사 재무지표 비교 |
| `opendart_xbrl_taxonomy` | XBRL 표준 계정과목 분류 |
| `opendart_dividend_info` | 배당 관련 정보 |

### 정기보고서 세부 항목 (24개)

| Category | Tools | 설명 |
|----------|-------|------|
| 주주 | 3 | 최대주주, 최대주주 변동, 소액주주 현황 |
| 임원/직원 | 3 | 임원 현황, 직원 현황, 사외이사 |
| 보수 | 5 | 개인별, 전체, 상위5인, 미등기임원, 승인총액 |
| 주식 | 3 | 발행주식총수, 증자/감자 현황, 자기주식 |
| 감사 | 3 | 감사의견, 회계감사 계약, 비감사 서비스 |
| 채무증권 | 5 | 발행실적, 기업어음, 단기사채, 회사채, 신종자본증권, 조건부자본증권 |
| 투자/자금 | 3 | 타법인 출자, 공모자금, 사모자금 사용내역 |

### 주주 보유 보고 (2개)

| Tool | 설명 |
|------|------|
| `opendart_major_stockholding` | 대량보유 상황보고 (5% 이상) |
| `opendart_executive_stockholding` | 임원/주요주주 보유 보고 |

### 주요사항보고서 (36개)

| Category | Tools | 설명 |
|----------|-------|------|
| 자본 변동 | 4 | 유상증자, 무상증자, 유무상증자, 감자 |
| 조직 변경 | 3 | 합병, 분할, 분할합병 |
| 영업/자산 양수도 | 7 | 영업양수, 영업양도, 유형자산 양수/양도, 타법인 주식 취득/처분, 자산양수도(풋백옵션) |
| 자기주식 | 5 | 취득, 처분, 신탁 체결, 신탁 해지, 주식교환/이전 |
| 사채 | 7 | 전환사채, 신주인수권부사채, 교환사채, 조건부자본증권, 주식관련사채 양수/양도, 주식배당 |
| 해외상장 | 4 | 상장/폐지 결정, 상장/폐지 현황 |
| 법률/경영 | 6 | 채권은행관리 개시/중단, 채무불이행, 소송, 영업정지, 회생절차, 해산 |

### 증권신고서 (6개)

| Tool | 설명 |
|------|------|
| `opendart_equity_securities_reg` | 지분증권 신고서 |
| `opendart_debt_securities_reg` | 채무증권 신고서 |
| `opendart_depositary_receipts_reg` | 예탁증권 신고서 |
| `opendart_merger_reg` | 합병 신고서 |
| `opendart_stock_exchange_reg` | 주식교환 신고서 |
| `opendart_division_reg` | 분할 신고서 |

## Usage Examples

Claude에서 다음과 같이 사용하세요:

- "삼성전자의 20XX년 재무제표를 보여줘"
- "SK하이닉스의 최신 최대주주 현황을 알려줘"
- "카카오의 최근 공시 10개를 검색해줘"
- "현대자동차의 20XX년 임원 보수 현황을 보여줘"
- "LG에너지솔루션에 전환사채 발행 결정이 있었는지 확인해줘"

## Tech Stack

- **Runtime**: Next.js 16 + TypeScript
- **MCP**: mcp-handler + @modelcontextprotocol/sdk
- **Deploy**: Vercel (Streamable HTTP, Seoul region 권장)
- **ZIP**: fflate (corp code XML 압축 해제)

## License

MIT
