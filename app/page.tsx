export default function Home() {
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui", maxWidth: "780px" }}>
      <h1>OpenDART MCP Server</h1>
      <p>
        한국 금융감독원{" "}
        <a href="https://opendart.fss.or.kr/">OpenDART API</a>를 Claude에서 바로
        사용할 수 있는 MCP 서버입니다. 공시 본문(사업보고서·주요사항보고서 등)과
        그 안의 임의 섹션을 추출하는 도구도 포함되어 있습니다.
      </p>

      <h2>1. 접속 토큰 설정 (필수)</h2>
      <p>
        Vercel 환경 변수 <code>MCP_ACCESS_TOKEN</code>을 임의의 긴 무작위 문자열
        (32자 이상 권장)로 설정하세요. 이 토큰이 없으면 URL을 알아낸 누구나
        당신의 OpenDART 일일 쿼터를 소진할 수 있습니다.
      </p>

      <h2>2. Claude에 연결</h2>
      <ol>
        <li>
          <a href="https://claude.ai">claude.ai</a> &gt; Settings &gt;
          Connectors &gt; Add custom connector
        </li>
        <li>
          URL 입력:
          <pre style={{ background: "#f5f5f5", padding: "1rem", overflow: "auto" }}>
{`https://your-project.vercel.app/api/mcp?token=YOUR_ACCESS_TOKEN&opendart_key=YOUR_OPENDART_KEY`}
          </pre>
        </li>
      </ol>
      <p>
        <code>opendart_key</code>는{" "}
        <a href="https://opendart.fss.or.kr/">opendart.fss.or.kr</a>에서 무료로
        발급받습니다. 서버에 <code>OPENDART_API_KEY</code> 환경 변수를 설정해 둔
        경우 URL에서 <code>opendart_key</code>는 생략 가능합니다.
      </p>

      <h2>주요 도구</h2>
      <ul>
        <li>
          <code>opendart_search_company</code> · <code>opendart_search_disclosure</code> —
          기업 / 공시 검색
        </li>
        <li>
          <code>opendart_get_disclosure_outline</code> — 공시 본문 목차 (섹션 트리)
        </li>
        <li>
          <code>opendart_get_disclosure_body</code> — 공시 본문 전체 (페이지네이션)
        </li>
        <li>
          <code>opendart_get_disclosure_section</code> — 경로(<code>2.1</code>) 또는
          제목(<code>사업의 내용</code>)으로 섹션 단위 추출
        </li>
        <li>
          <code>opendart_search_disclosure_body</code> — 본문 내 키워드 위치 검색
        </li>
      </ul>
    </main>
  );
}
