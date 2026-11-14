/** Quotation arithmetic. Mirrors the database view quotation_totals (round per line, then tax on the subtotal). */
export type Line = { description: string; quantity: number; unitPrice: number; unit?: string | null };
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function lineTotal(l: Pick<Line, "quantity" | "unitPrice">) { return r2(l.quantity * l.unitPrice); }
export function computeTotals(lines: Pick<Line, "quantity" | "unitPrice">[], taxRatePercent: number) {
  const subtotal = r2(lines.reduce((s, l) => s + lineTotal(l), 0));
  const tax = r2((subtotal * taxRatePercent) / 100);
  return { subtotal, tax, total: r2(subtotal + tax) };
}
export function money(n: number, currency = "KES") {
  return `${currency} ${n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Parse the line editor text. One line per item: "description | quantity | unit price | unit(optional)".
 * Returns errors with line numbers instead of guessing.
 */
export function parseLineText(text: string): { lines: Line[]; errors: string[] } {
  const lines: Line[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const row = raw.trim();
    if (!row) return;
    const parts = row.split("|").map((p) => p.trim());
    const n = i + 1;
    if (parts.length < 3) return void errors.push(`Line ${n}: use "description | quantity | unit price".`);
    const qty = Number(parts[1].replace(/,/g, ""));
    const price = Number(parts[2].replace(/,/g, ""));
    if (!parts[0] || parts[0].length > 500) return void errors.push(`Line ${n}: description is required (max 500 characters).`);
    if (!Number.isFinite(qty) || qty <= 0 || qty > 1e9) return void errors.push(`Line ${n}: quantity must be a number above zero.`);
    if (!Number.isFinite(price) || price < 0 || price > 1e10) return void errors.push(`Line ${n}: unit price must be zero or more.`);
    lines.push({ description: parts[0], quantity: Math.round(qty * 1000) / 1000, unitPrice: r2(price), unit: parts[3] || null });
  });
  if (lines.length > 200) errors.push("A quotation can have at most 200 lines.");
  return { lines, errors };
}
export function formatLineText(lines: { description: string; quantity: number | string; unit_price: number | string; unit?: string | null }[]) {
  return lines.map((l) => [l.description, Number(l.quantity), Number(l.unit_price), l.unit ?? ""].join(" | ").replace(/ \| $/, "")).join("\n");
}
