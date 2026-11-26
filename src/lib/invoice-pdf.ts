import { PdfDoc, type PdfImage } from "@/lib/pdf";
import { placeLogo } from "@/lib/brand-logo";
import { computeTotals, lineTotal, money } from "@/lib/quotation";

export type InvoicePdfData = {
  logo?: PdfImage | null;
  number: string; status: string; currency: string; issueDate: string | null; dueDate: string | null; taxRatePercent: number; orderNumber: string | null;
  company: { legalName: string; address: string | null; city: string | null; country: string | null; registrationDetails: string | null; taxPin: string | null; phone: string | null; email: string | null };
  customer: { company: string | null; contact: string | null; email: string | null; phone: string | null; location: string | null };
  lines: { description: string; quantity: number; unitPrice: number }[];
  payments: { paidOn: string; amount: number; method: string; reference: string | null }[];
  notes: string | null; paymentInstructions: string | null;
};

const NAVY: [number, number, number] = [20, 45, 78];
const GREY: [number, number, number] = [107, 120, 133];
const TEAL: [number, number, number] = [11, 143, 135];

/** Customer-facing invoice PDF. Totals are recomputed from the lines; the paid amount comes from the recorded payments. */
export function buildInvoicePdf(d: InvoicePdfData): Buffer {
  const doc = new PdfDoc(`${d.company.legalName}  |  Invoice ${d.number}`);
  const L = doc.left, R = doc.right;
  doc.y -= 4;
  const lw = placeLogo(doc, d.logo);
  if (!lw) doc.text(L, doc.y - 18, d.company.legalName, 17, true, NAVY);
  doc.text(R, doc.y - 18, d.status === "paid" ? "INVOICE - PAID" : "INVOICE", 17, true, TEAL, "r");
  doc.y -= lw ? 54 : 26;
  const addr = [d.company.address, d.company.city, d.company.country].filter(Boolean).join(", ");
  for (const line of [addr, d.company.phone, d.company.email, d.company.registrationDetails, d.company.taxPin && `PIN: ${d.company.taxPin}`]) if (line) doc.para(line, 9, false, GREY);
  doc.gap(6); doc.rule(doc.y); doc.gap(10);

  const colX = L + doc.width / 2, topY = doc.y;
  doc.text(L, topY - 10, "Invoice to", 8, true, GREY);
  doc.text(colX, topY - 10, "Details", 8, true, GREY);
  let yl = topY - 24, yr = topY - 24;
  const who = d.customer.company ?? d.customer.contact ?? "";
  for (const ln of [d.customer.company, d.customer.contact, d.customer.email, d.customer.phone, d.customer.location].filter(Boolean) as string[]) { doc.text(L, yl, ln, 10, ln === who); yl -= 13; }
  const meta: [string, string][] = [["Invoice no.", d.number], ["Issued", d.issueDate ?? "-"], ["Due", d.dueDate ?? "-"], ["Currency", d.currency]];
  if (d.orderNumber) meta.push(["Order", d.orderNumber]);
  for (const [k, v] of meta) { doc.text(colX, yr, k, 9, false, GREY); doc.text(colX + 70, yr, v, 10, true); yr -= 13; }
  doc.y = Math.min(yl, yr) - 8;

  const cols = [28, 0, 60, 80, 90];
  cols[1] = doc.width - (28 + 60 + 80 + 90);
  const num = (n: number) => money(n, d.currency).replace(`${d.currency} `, "");
  doc.table(["#", "Description", "Qty", "Unit price", "Amount"], d.lines.map((l, i) => [String(i + 1), l.description, String(l.quantity), num(l.unitPrice), num(lineTotal({ quantity: l.quantity, unitPrice: l.unitPrice }))]), cols, ["l", "l", "r", "r", "r"]);

  const t = computeTotals(d.lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice })), d.taxRatePercent);
  const paid = Math.round(d.payments.reduce((s, p) => s + p.amount, 0) * 100) / 100;
  doc.ensure(100);
  const labelX = R - 190;
  const row = (label: string, value: string, bold = false) => { doc.y -= 16; doc.text(labelX, doc.y, label, 10, bold); doc.text(R, doc.y, value, 10, bold, [38, 50, 56], "r"); };
  doc.gap(4);
  row("Subtotal", money(t.subtotal, d.currency));
  if (d.taxRatePercent > 0) row(`Tax (${d.taxRatePercent}%)`, money(t.tax, d.currency));
  doc.gap(2); doc.rule(doc.y - 6, NAVY);
  row("Total", money(t.total, d.currency), true);
  if (paid > 0) row("Paid", money(paid, d.currency));
  row("Balance due", money(Math.max(Math.round((t.total - paid) * 100) / 100, 0), d.currency), true);
  doc.gap(14);

  if (d.payments.length) {
    doc.ensure(40 + d.payments.length * 14);
    doc.text(L, doc.y - 10, "Payments received", 9, true, NAVY); doc.y -= 12;
    for (const p of d.payments) doc.para(`${p.paidOn}  -  ${p.method}${p.reference ? `  -  ${p.reference}` : ""}  -  ${money(p.amount, d.currency)}`, 9);
    doc.gap(8);
  }
  const block = (title: string, body: string | null) => { if (!body) return; doc.ensure(40); doc.text(L, doc.y - 10, title, 9, true, NAVY); doc.y -= 12; doc.para(body, 9); doc.gap(8); };
  if (d.status !== "paid") block("How to pay", d.paymentInstructions ? `${d.paymentInstructions}\nPlease quote ${d.number} as the reference.` : null);
  block("Notes", d.notes);
  return doc.build();
}
