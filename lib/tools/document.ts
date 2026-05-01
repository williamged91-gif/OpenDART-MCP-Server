import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { resolveApiKey } from "@/lib/opendart/client";
import { formatApiError } from "@/lib/opendart/errors";
import {
  fetchDocumentXmlFiles,
  parseDocumentSections,
  renderDocumentMarkdown,
  flattenOutline,
  findSection,
  sliceMarkdown,
} from "@/lib/opendart/document";

const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

const DEFAULT_MAX = 30000;
const HARD_MAX = 200000;

export function registerDocumentTools(server: McpServer) {
  // 1) Outline / table of contents — cheap discovery before extracting bodies.
  server.registerTool(
    "opendart_get_disclosure_outline",
    {
      title: "공시 본문 목차 (Disclosure Outline)",
      description: `Return the section tree (table of contents) of a disclosure body.
Use this BEFORE fetching the full body — pick a section path or title from here, then call opendart_get_disclosure_section.

Args:
  - rcept_no: 14-digit DART receipt number (from opendart_search_disclosure)
  - api_key (optional): override API key`,
      inputSchema: {
        rcept_no: z
          .string()
          .regex(/^\d{14}$/)
          .describe("14-digit DART receipt number (접수번호)"),
        api_key: z.string().optional(),
      },
      annotations,
    },
    async ({ rcept_no, api_key }) => {
      try {
        const key = resolveApiKey(api_key);
        const files = await fetchDocumentXmlFiles(rcept_no, key);
        const lines: string[] = [
          `## 공시 본문 목차 (rcept_no: ${rcept_no})`,
          `XML files: ${files.length}`,
          "",
        ];
        files.forEach((f, i) => {
          const sections = parseDocumentSections(f.xml);
          const outline = flattenOutline(sections);
          lines.push(`### [${i}] ${f.filename}`);
          if (outline.length === 0) {
            lines.push("_(no sections detected — use opendart_get_disclosure_body to read full text)_");
          } else {
            lines.push("| Path | Title | Length |");
            lines.push("|------|-------|--------|");
            for (const o of outline) {
              const safe = o.title.replace(/\|/g, "\\|");
              lines.push(`| ${o.path} | ${safe} | ${o.length.toLocaleString()} |`);
            }
          }
          lines.push("");
        });
        lines.push(
          "_Tip: pass `path` (e.g. \"2.1\") or a title substring to opendart_get_disclosure_section._"
        );
        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: formatApiError(err) }],
          isError: true,
        };
      }
    }
  );

  // 2) Full body — chunkable via offset/max_chars.
  server.registerTool(
    "opendart_get_disclosure_body",
    {
      title: "공시 본문 전체 (Full Disclosure Body)",
      description: `Fetch the full body of a disclosure rendered as markdown.
DART filings can be very long (사업보고서 routinely 100k+ chars). Use offset + max_chars to page through, or call opendart_get_disclosure_outline first to extract just the section you need.

Args:
  - rcept_no: 14-digit receipt number
  - file_index (optional): which inner XML file to render (default 0). Most filings have 1 file.
  - offset (optional): character offset to start at (default 0)
  - max_chars (optional): max chars to return (default ${DEFAULT_MAX}, hard cap ${HARD_MAX})
  - api_key (optional): override API key`,
      inputSchema: {
        rcept_no: z.string().regex(/^\d{14}$/),
        file_index: z.number().int().min(0).default(0),
        offset: z.number().int().min(0).default(0),
        max_chars: z.number().int().min(500).max(HARD_MAX).default(DEFAULT_MAX),
        api_key: z.string().optional(),
      },
      annotations,
    },
    async ({ rcept_no, file_index, offset, max_chars, api_key }) => {
      try {
        const key = resolveApiKey(api_key);
        const files = await fetchDocumentXmlFiles(rcept_no, key);
        if (file_index >= files.length) {
          return {
            content: [
              {
                type: "text" as const,
                text: `file_index ${file_index} out of range — body has ${files.length} XML file(s).`,
              },
            ],
          };
        }
        const md = renderDocumentMarkdown(files[file_index].xml);
        const { text, truncated, total } = sliceMarkdown(md, offset, max_chars);
        const header = [
          `## 공시 본문 (rcept_no: ${rcept_no})`,
          `File: ${files[file_index].filename} (${file_index + 1}/${files.length})`,
          `Range: ${offset}–${offset + text.length} of ${total} chars${truncated ? " (truncated)" : ""}`,
          "",
        ].join("\n");
        const footer = truncated
          ? `\n\n---\n_More remaining. Continue with offset=${offset + text.length}._`
          : "";
        return { content: [{ type: "text" as const, text: header + text + footer }] };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: formatApiError(err) }],
          isError: true,
        };
      }
    }
  );

  // 3) Single section — by path ("2.1") or title substring ("사업의 내용").
  server.registerTool(
    "opendart_get_disclosure_section",
    {
      title: "공시 본문 섹션 추출 (Disclosure Section)",
      description: `Extract one section of a disclosure by path ("2.1") or by title substring ("사업의 내용").
Output is markdown that includes the section heading, paragraphs, and tables. Use opendart_get_disclosure_outline first to discover available paths and titles.

Args:
  - rcept_no: 14-digit receipt number
  - section: path ("2", "2.1", "1.2.3") OR title substring (case-insensitive, whitespace-insensitive)
  - file_index (optional): which inner XML file (default 0)
  - offset (optional): char offset within the section (default 0)
  - max_chars (optional): max chars (default ${DEFAULT_MAX}, hard cap ${HARD_MAX})
  - api_key (optional): override API key`,
      inputSchema: {
        rcept_no: z.string().regex(/^\d{14}$/),
        section: z
          .string()
          .min(1)
          .describe("Section path like '2.1' OR title substring like '사업의 내용'"),
        file_index: z.number().int().min(0).default(0),
        offset: z.number().int().min(0).default(0),
        max_chars: z.number().int().min(500).max(HARD_MAX).default(DEFAULT_MAX),
        api_key: z.string().optional(),
      },
      annotations,
    },
    async ({ rcept_no, section, file_index, offset, max_chars, api_key }) => {
      try {
        const key = resolveApiKey(api_key);
        const files = await fetchDocumentXmlFiles(rcept_no, key);
        if (file_index >= files.length) {
          return {
            content: [
              {
                type: "text" as const,
                text: `file_index ${file_index} out of range — body has ${files.length} XML file(s).`,
              },
            ],
          };
        }
        const tree = parseDocumentSections(files[file_index].xml);
        const hit = findSection(tree, section);
        if (!hit) {
          const flat = flattenOutline(tree)
            .slice(0, 30)
            .map((o) => `- ${o.path}: ${o.title}`)
            .join("\n");
          return {
            content: [
              {
                type: "text" as const,
                text: `No section matching "${section}".\n\nAvailable (top 30):\n${flat || "_(no sections found — try opendart_get_disclosure_body)_"}`,
              },
            ],
          };
        }
        const { text, truncated, total } = sliceMarkdown(
          hit.markdown,
          offset,
          max_chars
        );
        const header = [
          `## 섹션: ${hit.path} — ${hit.title}`,
          `rcept_no: ${rcept_no} · file: ${files[file_index].filename}`,
          `Range: ${offset}–${offset + text.length} of ${total} chars${truncated ? " (truncated)" : ""}`,
          "",
        ].join("\n");
        const footer = truncated
          ? `\n\n---\n_More remaining. Continue with offset=${offset + text.length}._`
          : "";
        return { content: [{ type: "text" as const, text: header + text + footer }] };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: formatApiError(err) }],
          isError: true,
        };
      }
    }
  );

  // 4) Search — locate where a phrase appears across the whole body.
  server.registerTool(
    "opendart_search_disclosure_body",
    {
      title: "공시 본문 내 검색 (Search Body Text)",
      description: `Search the rendered disclosure body for a phrase and return matching snippets with their section path.
Useful when you don't know which section a topic is in (e.g. "전환사채" or "최대주주 변경").

Args:
  - rcept_no: 14-digit receipt number
  - query: substring to search for (case-insensitive)
  - context_chars (optional): chars of surrounding context per hit (default 200, max 1000)
  - max_hits (optional): max matches to return (default 10, max 50)
  - file_index (optional): which inner XML file (default 0)
  - api_key (optional): override API key`,
      inputSchema: {
        rcept_no: z.string().regex(/^\d{14}$/),
        query: z.string().min(1),
        context_chars: z.number().int().min(40).max(1000).default(200),
        max_hits: z.number().int().min(1).max(50).default(10),
        file_index: z.number().int().min(0).default(0),
        api_key: z.string().optional(),
      },
      annotations,
    },
    async ({ rcept_no, query, context_chars, max_hits, file_index, api_key }) => {
      try {
        const key = resolveApiKey(api_key);
        const files = await fetchDocumentXmlFiles(rcept_no, key);
        if (file_index >= files.length) {
          return {
            content: [
              {
                type: "text" as const,
                text: `file_index ${file_index} out of range — body has ${files.length} XML file(s).`,
              },
            ],
          };
        }
        const tree = parseDocumentSections(files[file_index].xml);
        const flat: Array<{ path: string; title: string; markdown: string }> = [];
        const walk = (s: typeof tree) => {
          for (const x of s) {
            flat.push({ path: x.path, title: x.title, markdown: x.markdown });
            if (x.children.length) walk(x.children);
          }
        };
        walk(tree);

        // If we have no sections, fall back to searching the whole body.
        if (flat.length === 0) {
          const md = renderDocumentMarkdown(files[file_index].xml);
          flat.push({ path: "0", title: "(전체)", markdown: md });
        }

        const q = query.toLowerCase();
        const hits: string[] = [];
        for (const s of flat) {
          const hay = s.markdown.toLowerCase();
          let from = 0;
          while (hits.length < max_hits) {
            const idx = hay.indexOf(q, from);
            if (idx < 0) break;
            const start = Math.max(0, idx - Math.floor(context_chars / 2));
            const end = Math.min(s.markdown.length, idx + q.length + Math.floor(context_chars / 2));
            const snippet = s.markdown.slice(start, end).replace(/\s+/g, " ").trim();
            hits.push(`**[${s.path}] ${s.title}** … ${snippet} …`);
            from = idx + q.length;
          }
          if (hits.length >= max_hits) break;
        }

        if (hits.length === 0) {
          return {
            content: [
              { type: "text" as const, text: `No matches for "${query}" in the body.` },
            ],
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: `## "${query}" 검색 결과 (${hits.length} hits)\n\n${hits.join("\n\n")}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: formatApiError(err) }],
          isError: true,
        };
      }
    }
  );
}
