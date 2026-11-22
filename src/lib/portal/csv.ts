/**
 * Reads a customer's bulk-order file (CSV). PURE: no database, no framework.
 * It only turns text into {line, ref, quantity} rows. What a row MEANS (product, price, stock, minimums) is decided
 * by the database (portal_bulk_preview / portal_bulk_add), never here.
 *
 * Accepted: comma, semicolon or tab separated; optional header row; quoted fields; Excel's UTF-8 BOM.
 * Columns: the first column is the product code or name, the second is the quantity (a header can reorder them:
 * "code/sku/product/item/name" and "qty/quantity").
 */
export const MAX_BYTES = 200 * 1024;
export const MAX_ROWS = 300;

export type BulkRow = { line: number; ref: string; quantity: string };
export type CsvResult = { ok: true; rows: BulkRow[] } | { ok: false; error: string };

const HEADER_REF = /^(code|sku|product|product code|product name|item|item code|name|description)$/i;
const HEADER_QTY = /^(qty|quantity|qnty|units|amount)$/i;

function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else quoted = false; }
      else cur += ch;
    } else if (ch === '"' && cur === "") quoted = true;
    else if (ch === delim) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Splits into records, keeping newlines that sit inside quotes. */
function records(text: string): string[] {
  const out: string[] = [];
  let cur = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') quoted = !quoted;
    if (!quoted && (ch === "\n" || ch === "\r")) { if (ch === "\r" && text[i + 1] === "\n") i++; out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

export function parseOrderCsv(input: string): CsvResult {
  if (typeof input !== "string") return { ok: false, error: "Could not read the file." };
  if (input.length > MAX_BYTES) return { ok: false, error: "The file is too large. Keep it under 200 KB (about 300 rows)." };
  if (input.includes("\u0000")) return { ok: false, error: "This does not look like a CSV text file. Save your sheet as CSV and try again." };
  const text = input.replace(/^﻿/, "");
  const lines = records(text).map((l, i) => ({ raw: l, no: i + 1 })).filter((l) => l.raw.trim() !== "");
  if (lines.length === 0) return { ok: false, error: "The file is empty." };

  const first = lines[0].raw;
  const counts: [string, number][] = [[",", 0], [";", 0], ["\t", 0]];
  for (const c of first) for (const d of counts) if (c === d[0]) d[1]++;
  const delim = counts.sort((a, b) => b[1] - a[1])[0][1] > 0 ? counts[0][0] : ",";

  let refCol = 0, qtyCol = 1, start = 0;
  const head = splitLine(lines[0].raw, delim);
  const ri = head.findIndex((h) => HEADER_REF.test(h)), qi = head.findIndex((h) => HEADER_QTY.test(h));
  if (ri >= 0 || qi >= 0) {
    start = 1;
    if (ri >= 0) refCol = ri;
    if (qi >= 0) qtyCol = qi;
    if (ri < 0) refCol = qtyCol === 0 ? 1 : 0;
    if (qi < 0) qtyCol = refCol === 0 ? 1 : 0;
  }
  const body = lines.slice(start);
  if (body.length === 0) return { ok: false, error: "The file has a header but no rows." };
  if (body.length > MAX_ROWS) return { ok: false, error: `The file has ${body.length} rows. Please upload up to ${MAX_ROWS} at a time.` };

  const rows: BulkRow[] = body.map((l) => {
    const cells = splitLine(l.raw, delim);
    return { line: l.no, ref: (cells[refCol] ?? "").slice(0, 80), quantity: (cells[qtyCol] ?? "").replace(/\s+/g, "").slice(0, 20) };
  });
  return { ok: true, rows };
}

/** The sample file customers can download. */
export const TEMPLATE_CSV = "code,quantity\r\nRICE50,20\r\nSugar,10\r\n";
