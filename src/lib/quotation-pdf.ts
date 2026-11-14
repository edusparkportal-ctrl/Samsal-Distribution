import { PdfDoc } from "@/lib/pdf";
import { computeTotals, lineTotal, money } from "@/lib/quotation";

export type QuotationPdfData = {
  number: string; status: string; currency: string; issueDate: string; validUntil: string | null;
  company: { legalName: string; address: string | null; city: string | null; country: string | null; registrationDetails: string | null; taxPin: string | null; phone: string | null; email: string | null };
  customer: { company: string | null; contact: string; email: string | null; phone: string | null; location: string | null };
  lines: { description: string; quantity: number; unit: string | null; unitPrice: number }[];
  taxRatePercent: number; deliveryTerms: string | null; paymentTerms: string | null; notes: string | null; defaultTerms: string | null;
};

const NAVY: [number, number, number] = [20, 45, 78];
const GREY: [number, number, number] = [107, 120, 133];

/** Builds the quotation PDF. Company registration / tax PIN lines are printed only when an admin has entered them. */
export function buildQuotationPdf(d: QuotationPdfData): Buffer {
  const doc = new PdfDoc(`${d.company.legalName}  |  Quotation ${d.number}`);
  const L = doc.left, R = doc.right;

  doc.y -= 4;
  doc.text(L, doc.y - 18, d.company.legalName, 17, true, NAVY);
  doc.text(R, doc.y - 18, "QUOTATION", 17, true, [11, 143, 135], "r");
  doc.y -= 26;
  const addr = [d.company.address, d.company.city, d.company.country].filter(Boolean).join(", ");
  for (const line of [addr, d.company.phone, d.company.email, d.company.registrationDetails, d.company.taxPin && `PIN: ${d.company.taxPin}`]) {
    if (line) doc.para(line, 9, false, GREY);
  }
  doc.gap(6); doc.rule(doc.y); doc.gap(10);

  // meta block (two columns)
  const colX = L + doc.width / 2;
  const topY = doc.y;
  doc.text(L, topY - 10, "Quotation to", 8, true, GREY);
  doc.text(colX, topY - 10, "Details", 8, true, GREY);
  let yl = topY - 24, yr = topY - 24;
  for (const ln of [d.customer.company, d.customer.contact, d.customer.email, d.customer.phone, d.customer.location].filter(Boolean) as string[]) {
    doc.text(L, yl, ln, 10, ln === (d.customer.company ?? d.customer.contact)); yl -= 13;
  }
  const meta: [string, string][] = [["Number", d.number], ["Date", d.issueDate], ["Valid until", d.validUntil ?? "Not specified"], ["Currency", d.currency]];
  for (const [k, v] of meta) { doc.text(colX, yr, k, 9, false, GREY); doc.text(colX + 70, yr, v, 10, true); yr -= 13; }
  doc.y = Math.min(yl, yr) - 8;

  const cols = [28, doc.width - 28 - 60 - 55 - 80 - 90, 60, 55, 80, 90].map((c) => c);
  cols[1] = doc.width - (28 + 60 + 55 + 80 + 90);
  doc.table(
    ["#", "Description", "Qty", "Unit", "Unit price", "Amount"],
    d.lines.map((l, i) => [String(i + 1), l.description, String(l.quantity), l.unit ?? "", money(l.unitPrice, d.currency).replace(`${d.currency} `, ""), money(lineTotal({ quantity: l.quantity, unitPrice: l.unitPrice }), d.currency).replace(`${d.currency} `, "")]),
    cols, ["l", "l", "r", "l", "r", "r"],
  );

  const t = computeTotals(d.lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice })), d.taxRatePercent);
  doc.ensure(70);
  const labelX = R - 180;
  const row = (label: string, value: string, bold = false) => { doc.y -= 16; doc.text(labelX, doc.y, label, 10, bold); doc.text(R, doc.y, value, 10, bold, [38, 50, 56], "r"); };
  doc.gap(4);
  row("Subtotal", money(t.subtotal, d.currency));
  if (d.taxRatePercent > 0) row(`Tax (${d.taxRatePercent}%)`, money(t.tax, d.currency));
  doc.gap(2); doc.rule(doc.y - 6, NAVY);
  row("Total", money(t.total, d.currency), true);
  doc.gap(14);

  const block = (title: string, body: string | null) => {
    if (!body) return;
    doc.ensure(40); doc.text(L, doc.y - 10, title, 9, true, NAVY); doc.y -= 12; doc.para(body, 9); doc.gap(8);
  };
  block("Delivery terms", d.deliveryTerms);
  block("Payment terms", d.paymentTerms);
  block("Notes", d.notes);
  block("Terms and conditions", d.defaultTerms);
  return doc.build();
}
