/**
 * Corp code updater script
 * Downloads the full corporate registry from OpenDART API and saves as JSON.
 *
 * Usage:
 *   OPENDART_API_KEY=your_key npx tsx scripts/update-corp-codes.ts
 *
 * Or set OPENDART_API_KEY in .env file first.
 */

import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { XMLParser } from "fast-xml-parser";

// Load .env if present
const envPath = join(process.cwd(), ".env");
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*?)\s*$/);
    if (match) process.env[match[1]] = match[2];
  }
}

const API_KEY = process.env.OPENDART_API_KEY;
if (!API_KEY) {
  console.error("Error: OPENDART_API_KEY environment variable is required.");
  console.error("Usage: OPENDART_API_KEY=your_key npx tsx scripts/update-corp-codes.ts");
  process.exit(1);
}

async function main() {
  console.log("Downloading corp code ZIP from OpenDART...");

  const url = `https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${API_KEY}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });

  if (!response.ok) {
    console.error(`HTTP error: ${response.status} ${response.statusText}`);
    process.exit(1);
  }

  const buffer = await response.arrayBuffer();
  const uint8 = new Uint8Array(buffer);

  // Verify ZIP magic bytes (PK)
  if (uint8[0] !== 0x50 || uint8[1] !== 0x4b) {
    const text = new TextDecoder("utf-8").decode(uint8.slice(0, 500));
    console.error("Response is not a ZIP file:", text);
    process.exit(1);
  }

  console.log(`Downloaded ${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB ZIP`);

  // Unzip using fflate (already a project dependency)
  const { unzipSync } = await import("fflate");
  const unzipped = unzipSync(uint8);
  const fileNames = Object.keys(unzipped);
  const xmlFileName = fileNames.find((f) => f.toLowerCase().endsWith(".xml")) || fileNames[0];

  if (!xmlFileName) {
    console.error("No XML file found in ZIP. Files:", fileNames);
    process.exit(1);
  }

  const rawBytes = unzipped[xmlFileName];
  console.log(`Extracted ${xmlFileName} (${(rawBytes.length / 1024 / 1024).toFixed(1)}MB)`);

  // Detect encoding from XML declaration
  const asciiPreview = new TextDecoder("ascii").decode(rawBytes.slice(0, 200));
  const encMatch = asciiPreview.match(/encoding=["']([^"']+)["']/i);
  const detectedEnc = encMatch?.[1].toLowerCase() ?? "utf-8";
  console.log(`Detected encoding: ${detectedEnc}`);

  const decoder = new TextDecoder(
    detectedEnc === "euc-kr" || detectedEnc === "cp949" ? "euc-kr" : "utf-8"
  );
  const xml = decoder.decode(rawBytes);

  // Parse XML with fast-xml-parser
  const parser = new XMLParser({
    ignoreAttributes: true,
    trimValues: true,
    isArray: (name) => name === "list",
  });
  const parsed = parser.parse(xml);

  // Extract entries - handle both result.list and direct list
  const rawList = parsed?.result?.list || parsed?.list || [];
  const entries = rawList
    .map((item: Record<string, unknown>) => ({
      corp_code: String(item.corp_code || "").trim().padStart(8, "0"),
      corp_name: String(item.corp_name || "").trim(),
      stock_code: String(item.stock_code || "").trim() || "",
      modify_date: String(item.modify_date || "").trim(),
    }))
    .filter((e: { corp_name: string }) => e.corp_name.length > 0);

  console.log(`Parsed ${entries.length} companies`);

  const listedCount = entries.filter((e: { stock_code: string }) => e.stock_code).length;
  console.log(`  Listed (with stock code): ${listedCount}`);
  console.log(`  Unlisted: ${entries.length - listedCount}`);

  // Sample entries
  const samples = entries.slice(0, 5);
  console.log(`  Samples: ${samples.map((e: { corp_name: string }) => e.corp_name).join(", ")}`);

  // Write JSON
  const outputPath = join(process.cwd(), "data", "corp-codes.json");
  writeFileSync(outputPath, JSON.stringify(entries));
  const fileSize = (Buffer.byteLength(JSON.stringify(entries)) / 1024 / 1024).toFixed(1);
  console.log(`\nSaved to ${outputPath} (${fileSize}MB)`);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
