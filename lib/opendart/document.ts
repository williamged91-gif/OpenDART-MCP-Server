import { unzipSync, strFromU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";
import { getBinary } from "./client";

// OpenDART's `document.xml` endpoint returns a ZIP. Inside is one or more XML
// files using DART's tag schema: DOCUMENT > SECTION-1 > SECTION-2 > ... with
// TITLE, P, TABLE/TR/TC/TH leaves. Files in older filings (pre-2010) can be
// declared as EUC-KR; modern filings are UTF-8. We decode defensively.

const MAX_BODY_BYTES = 25 * 1024 * 1024; // hard cap on a single XML payload

export interface DocXmlFile {
  filename: string;
  xml: string;
}

export interface DocSection {
  /** Dotted path like "1.2.3" — top-level sections are "1", "2", ... */
  path: string;
  /** Human-readable title from the section's <TITLE> child, if present. */
  title: string;
  /** Pre-rendered markdown for this section and all of its descendants. */
  markdown: string;
  /** Character length of `markdown` — useful for the LLM to budget context. */
  length: number;
  /** Children (one level down). Used for outlines; may be empty. */
  children: DocSection[];
}

/** Validate that an OpenDART receipt number looks plausible. */
export function assertRceptNo(rceptNo: string): void {
  if (!/^\d{14}$/.test(rceptNo)) {
    throw new Error(
      `[OpenDART] rcept_no must be 14 digits, got "${rceptNo}". / 접수번호는 14자리 숫자여야 합니다.`
    );
  }
}

/** Decode an XML file using its declared encoding when possible. */
function decodeXml(bytes: Uint8Array): string {
  // Peek at the first ~200 bytes (ASCII-safe) to find an encoding declaration.
  const head = new TextDecoder("utf-8", { fatal: false }).decode(
    bytes.subarray(0, Math.min(bytes.length, 200))
  );
  const m = head.match(/encoding\s*=\s*["']([^"']+)["']/i);
  const declared = (m?.[1] ?? "utf-8").toLowerCase();

  // TextDecoder labels: "euc-kr" covers CP949 in Node 20+ with full ICU.
  const label =
    declared === "euc-kr" || declared === "ks_c_5601-1987" || declared === "cp949"
      ? "euc-kr"
      : "utf-8";
  try {
    return new TextDecoder(label, { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
}

/** Fetch and unzip a disclosure body. Returns one entry per inner XML file. */
export async function fetchDocumentXmlFiles(
  rceptNo: string,
  apiKey: string
): Promise<DocXmlFile[]> {
  assertRceptNo(rceptNo);
  const buf = await getBinary("document", { rcept_no: rceptNo }, apiKey);
  if (buf.byteLength === 0) {
    throw new Error("[OpenDART] Empty response from document endpoint.");
  }

  // Defensive: if the server returned a JSON error envelope (status≠000) it
  // arrives as a plain UTF-8 body, not a ZIP. fflate will throw — translate
  // that into a clearer message.
  const u8 = new Uint8Array(buf);
  const isZip = u8.length >= 4 && u8[0] === 0x50 && u8[1] === 0x4b;
  if (!isZip) {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(u8.subarray(0, 2048));
    throw new Error(
      `[OpenDART] document endpoint did not return a ZIP. Body preview: ${text.slice(0, 400)}`
    );
  }

  const entries = unzipSync(u8);
  const files: DocXmlFile[] = [];
  for (const [name, data] of Object.entries(entries)) {
    if (!/\.xml$/i.test(name)) continue;
    if (data.byteLength > MAX_BODY_BYTES) {
      throw new Error(
        `[OpenDART] Inner XML "${name}" is ${data.byteLength} bytes — exceeds ${MAX_BODY_BYTES} byte cap.`
      );
    }
    files.push({ filename: name, xml: decodeXml(data) });
  }
  if (files.length === 0) {
    throw new Error("[OpenDART] document ZIP contained no .xml files.");
  }
  return files;
}

// ---- XML → Markdown rendering ------------------------------------------------

// fast-xml-parser in `preserveOrder: true` mode emits an array of single-key
// objects: e.g. [{ DOCUMENT: [...] }, { "#text": "hi" }]. Children of a tag
// are at obj[tag], and attributes are at obj[":@"].
type OrderedNode = Record<string, unknown>;
type OrderedTree = OrderedNode[];

function makeParser(): XMLParser {
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    preserveOrder: true,
    trimValues: false,
    parseTagValue: false,
    parseAttributeValue: false,
    processEntities: true,
    htmlEntities: true,
    // DART filings include lots of unknown tags; treat all as containers.
    unpairedTags: ["BR", "br", "IMG", "img", "HR", "hr"],
  });
}

function tagOf(node: OrderedNode): string | null {
  for (const k of Object.keys(node)) {
    if (k !== ":@" && k !== "#text") return k;
  }
  return null;
}

function childrenOf(node: OrderedNode, tag: string): OrderedTree {
  const v = node[tag];
  return Array.isArray(v) ? (v as OrderedTree) : [];
}

function getText(nodes: OrderedTree): string {
  let out = "";
  for (const n of nodes) {
    const tag = tagOf(n);
    if (n["#text"] !== undefined) {
      out += String(n["#text"]);
    } else if (tag) {
      out += getText(childrenOf(n, tag));
    }
  }
  return out;
}

function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Render an ordered XML tree to markdown, recognising DART's structural tags. */
function renderNodes(nodes: OrderedTree, sectionDepth: number): string {
  const out: string[] = [];

  for (const node of nodes) {
    if (node["#text"] !== undefined) {
      const t = String(node["#text"]);
      if (t.trim()) out.push(t.trim());
      continue;
    }

    const tag = tagOf(node);
    if (!tag) continue;
    const kids = childrenOf(node, tag);
    const upper = tag.toUpperCase();

    // Section heading container: SECTION-1, SECTION-2, ...
    const sectionMatch = upper.match(/^SECTION-(\d+)$/);
    if (sectionMatch) {
      const depth = Math.min(6, sectionDepth + parseInt(sectionMatch[1], 10));
      const title = sectionTitle(kids);
      if (title) out.push(`\n${"#".repeat(depth)} ${title}\n`);
      out.push(renderNodes(kids, sectionDepth));
      continue;
    }

    if (upper === "TITLE") {
      const t = clean(getText(kids));
      if (t) out.push(`\n**${t}**\n`);
      continue;
    }

    if (upper === "P" || upper === "PARAGRAPH") {
      const t = clean(getText(kids));
      if (t) out.push(`${t}\n`);
      continue;
    }

    if (upper === "TABLE") {
      const md = renderTable(kids);
      if (md) out.push(md + "\n");
      continue;
    }

    if (upper === "BR") {
      out.push("\n");
      continue;
    }

    if (upper === "IMG" || upper === "IMAGE") {
      // We deliberately drop image binaries; surface only the alt/title.
      const attrs = (node[":@"] as Record<string, string>) || {};
      const alt = attrs["@_TITLE"] || attrs["@_ALT"] || attrs["@_DESC"] || "image";
      out.push(`*[${alt}]*`);
      continue;
    }

    // Unknown tag — recurse so we don't drop content.
    out.push(renderNodes(kids, sectionDepth));
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function sectionTitle(kids: OrderedTree): string {
  for (const k of kids) {
    if (tagOf(k)?.toUpperCase() === "TITLE") {
      return clean(getText(childrenOf(k, tagOf(k)!)));
    }
  }
  return "";
}

function renderTable(kids: OrderedTree): string {
  // Collect rows. DART tables use TR/TE rows with TC/TH/TD cells. We treat
  // the first row as the header. Cells with nested structure get their inner
  // text extracted; line breaks become spaces inside the cell.
  const rows: string[][] = [];
  const stack: OrderedTree[] = [kids];
  while (stack.length) {
    const layer = stack.pop()!;
    for (const n of layer) {
      const t = tagOf(n);
      if (!t) continue;
      const u = t.toUpperCase();
      if (u === "TR" || u === "TE") {
        const cells: string[] = [];
        for (const c of childrenOf(n, t)) {
          const ct = tagOf(c);
          if (!ct) continue;
          const cu = ct.toUpperCase();
          if (cu === "TC" || cu === "TH" || cu === "TD") {
            cells.push(clean(getText(childrenOf(c, ct))).replace(/\|/g, "\\|"));
          }
        }
        if (cells.length) rows.push(cells);
      } else {
        stack.push(childrenOf(n, t));
      }
    }
  }
  if (rows.length === 0) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => {
    const out = r.slice();
    while (out.length < width) out.push("");
    return out;
  };
  const header = pad(rows[0]);
  const sep = header.map(() => "---");
  const body = rows.slice(1).map(pad);
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${sep.join(" | ")} |`,
    ...body.map((r) => `| ${r.join(" | ")} |`),
  ];
  return lines.join("\n");
}

/** Parse one XML payload into a section tree (used by outline + section tools). */
export function parseDocumentSections(xml: string): DocSection[] {
  const parsed = makeParser().parse(xml) as OrderedTree;
  // Find the DOCUMENT root (some filings nest it inside DOCUMENT-MULTI).
  const root = findFirst(parsed, "DOCUMENT") ?? parsed;
  return collectSections(rootNodes(root), "");
}

function rootNodes(root: OrderedTree | OrderedNode): OrderedTree {
  if (Array.isArray(root)) return root;
  const tag = tagOf(root as OrderedNode);
  return tag ? childrenOf(root as OrderedNode, tag) : [];
}

function findFirst(nodes: OrderedTree, tagWanted: string): OrderedNode | null {
  for (const n of nodes) {
    const tag = tagOf(n);
    if (!tag) continue;
    if (tag.toUpperCase() === tagWanted.toUpperCase()) return n;
    const found = findFirst(childrenOf(n, tag), tagWanted);
    if (found) return found;
  }
  return null;
}

function collectSections(nodes: OrderedTree, parentPath: string): DocSection[] {
  const sections: DocSection[] = [];
  let topIndex = 0;
  for (const n of nodes) {
    const tag = tagOf(n);
    if (!tag) continue;
    const m = tag.toUpperCase().match(/^SECTION-(\d+)$/);
    if (!m) continue;
    topIndex += 1;
    const path = parentPath ? `${parentPath}.${topIndex}` : String(topIndex);
    const kids = childrenOf(n, tag);
    const title = sectionTitle(kids);
    const children = collectSections(kids, path);
    const markdown = renderNodes([n], 0);
    sections.push({
      path,
      title: title || `(섹션 ${path})`,
      markdown,
      length: markdown.length,
      children,
    });
  }
  return sections;
}

/** Render the entire XML payload as markdown. */
export function renderDocumentMarkdown(xml: string): string {
  const parsed = makeParser().parse(xml) as OrderedTree;
  return renderNodes(parsed, 0);
}

/** Flatten a tree to a `[path, title, length]` outline. */
export function flattenOutline(
  sections: DocSection[]
): Array<{ path: string; title: string; length: number }> {
  const out: Array<{ path: string; title: string; length: number }> = [];
  const walk = (s: DocSection[]) => {
    for (const x of s) {
      out.push({ path: x.path, title: x.title, length: x.length });
      if (x.children.length) walk(x.children);
    }
  };
  walk(sections);
  return out;
}

/** Locate a section by exact path or by case-insensitive title substring. */
export function findSection(
  sections: DocSection[],
  query: string
): DocSection | null {
  // Path lookup (e.g. "1.2.3") first.
  if (/^\d+(\.\d+)*$/.test(query)) {
    const walk = (s: DocSection[]): DocSection | null => {
      for (const x of s) {
        if (x.path === query) return x;
        const found = walk(x.children);
        if (found) return found;
      }
      return null;
    };
    const hit = walk(sections);
    if (hit) return hit;
  }
  // Title substring match (case-insensitive, whitespace-insensitive).
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  const q = norm(query);
  const flat: DocSection[] = [];
  const walk = (s: DocSection[]) => {
    for (const x of s) {
      flat.push(x);
      if (x.children.length) walk(x.children);
    }
  };
  walk(sections);
  return flat.find((x) => norm(x.title).includes(q)) ?? null;
}

/** Slice markdown by `offset`/`max_chars` with a clear truncation footer. */
export function sliceMarkdown(
  md: string,
  offset: number,
  maxChars: number
): { text: string; truncated: boolean; total: number } {
  const total = md.length;
  const start = Math.max(0, Math.min(offset, total));
  const end = Math.min(total, start + maxChars);
  const text = md.slice(start, end);
  const truncated = end < total;
  return { text, truncated, total };
}
