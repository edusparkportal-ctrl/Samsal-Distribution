import { PdfDoc, wrap } from "@/lib/pdf";
import { DATA_FIELDS, money, qtyFmt } from "@/lib/trade";

type RGB = [number, number, number];
const BLACK: RGB = [11, 12, 14], BLUE: RGB = [46, 94, 142], GOLD: RGB = [201, 162, 39], GREY: RGB = [107, 120, 133], WHITE: RGB = [255, 255, 255];

export type TradePdfData = {
  typeKey: string; typeName: string; number: string; status: string; title: string | null; reference: string | null; docDate: string; dueDate: string | null;
  currency: string; total: number; hasPrices: boolean; hasLines: boolean; notes: string | null; data: Record<string, string>; partyLabel: string | null; partyName: string | null;
  parentNumber: string | null; poNumber: string | null; billNumber: string | null; issuedAt: string | null; preparedBy: string | null; generatedAt: string;
  company: { legalName: string; address: string | null; city: string | null; country: string | null; registrationDetails: string | null; taxPin: string | null; phone: string | null; email: string | null };
  lines: { description: string; quantity: number; accepted: number | null; unit: string | null; unitPrice: number }[];
  signatures: { role: string; name: string; at: string }[];
};

/** Branded (black, metallic blue, gold) PDF for any trade document. Same layout for every type; fields differ by type. */
export function buildTradePdf(d: TradePdfData): Buffer {
  const doc = new PdfDoc(`${d.company.legalName}  |  ${d.typeName} ${d.number}  |  generated ${d.generatedAt}`);
  const L = doc.left, R = doc.right;
  // header band
  doc.rect(L - 12, doc.y - 54, doc.width + 24, 62, BLACK);
  doc.rect(L - 12, doc.y - 57, doc.width + 24, 3, GOLD);
  doc.text(L, doc.y - 24, d.company.legalName, 15, true, WHITE);
  doc.text(L, doc.y - 40, [d.company.address, d.company.city, d.company.country].filter(Boolean).join(", "), 8.5, false, [200, 205, 212]);
  doc.text(R, doc.y - 24, d.typeName.toUpperCase(), 15, true, GOLD, "r");
  doc.text(R, doc.y - 40, d.number, 11, true, WHITE, "r");
  doc.y -= 74;
  const contact = [d.company.phone, d.company.email, d.company.registrationDetails, d.company.taxPin && `PIN: ${d.company.taxPin}`].filter(Boolean).join("   |   ");
  if (contact) doc.para(contact, 8.5, false, GREY);
  doc.gap(8);

  const colX = L + doc.width / 2, top = doc.y;
  let yl = top - 10, yr = top - 10;
  if (d.partyName) { doc.text(L, yl, d.partyLabel ?? "Party", 8, true, BLUE); yl -= 14; doc.text(L, yl, d.partyName, 11, true); yl -= 14; }
  if (d.title) { doc.text(L, yl, "Subject", 8, true, BLUE); yl -= 13; for (const ln of wrap(d.title, doc.width / 2 - 10, 10)) { doc.text(L, yl, ln, 10); yl -= 12; } }
  const meta: [string, string][] = [["Status", d.status], ["Date", d.docDate]];
  if (d.dueDate) meta.push(["Due / expected", d.dueDate]);
  if (d.reference) meta.push(["Their ref.", d.reference]);
  if (d.parentNumber) meta.push(["Follows", d.parentNumber]);
  if (d.poNumber) meta.push(["Purchase order", d.poNumber]);
  if (d.billNumber) meta.push(["Supplier bill", d.billNumber]);
  if (d.issuedAt) meta.push(["Issued", d.issuedAt]);
  if (d.preparedBy) meta.push(["Prepared by", d.preparedBy]);
  for (const [k, v] of meta) { doc.text(colX, yr, k, 9, false, GREY); doc.text(colX + 84, yr, v, 9.5, true); yr -= 13; }
  doc.y = Math.min(yl, yr) - 8;

  const fields = (DATA_FIELDS[d.typeKey] ?? []).filter((f) => d.data[f.key]);
  for (const f of fields) { doc.para(f.label, 8, true, BLUE); doc.para(d.data[f.key], 9.5); doc.gap(3); }
  if (fields.length) doc.gap(4);

  if (d.hasLines && d.lines.length) {
    const showAcc = d.typeKey === "inspection_report";
    const head = ["No.", "Description", "Unit", "Qty", ...(showAcc ? ["Accepted"] : []), ...(d.hasPrices ? ["Unit price", "Amount"] : [])];
    const fixed = [26, 44, 52, ...(showAcc ? [58] : []), ...(d.hasPrices ? [74, 84] : [])];
    const cols = [fixed[0], doc.width - fixed.reduce((a, b) => a + b, 0), ...fixed.slice(1)];
    const align: ("l" | "r")[] = ["l", "l", "l", "r", ...(showAcc ? (["r"] as const) : []), ...(d.hasPrices ? (["r", "r"] as const) : [])];
    doc.table(head, d.lines.map((l, i) => [String(i + 1), l.description, l.unit ?? "", qtyFmt(l.quantity), ...(showAcc ? [l.accepted == null ? "-" : qtyFmt(l.accepted)] : []),
      ...(d.hasPrices ? [money(l.unitPrice, d.currency).replace(`${d.currency} `, ""), money(l.quantity * l.unitPrice, d.currency).replace(`${d.currency} `, "")] : [])]), cols, align);
  }
  if (d.hasPrices) { doc.gap(8); doc.ensure(30); doc.rect(R - 200, doc.y - 20, 200, 22, BLACK); doc.text(R - 192, doc.y - 14, "TOTAL", 9, true, GOLD); doc.text(R - 8, doc.y - 14, money(d.total, d.currency), 10.5, true, WHITE, "r"); doc.y -= 28; }
  if (d.notes) { doc.gap(6); doc.para("Notes", 8, true, BLUE); doc.para(d.notes, 9.5); }

  doc.gap(14); doc.ensure(130);
  doc.text(L, doc.y - 4, "SIGNATURES", 8.5, true, BLUE); doc.y -= 10; doc.rule(doc.y, GOLD);
  const roles = d.signatures.length ? d.signatures : [];
  let y = doc.y - 8;
  for (const s of roles) { y -= 14; doc.text(L, y, `${s.role}:`, 9, true); doc.text(L + 110, y, `${s.name}   (signed electronically ${s.at})`, 9); }
  const half = doc.width / 2 - 12, rx = L + doc.width / 2 + 12;
  y -= 30; doc.hline(L, L + half, y); doc.hline(rx, R, y);
  doc.text(L, y - 11, "Prepared / issued by (signature, date)", 8, false, GREY); doc.text(rx, y - 11, "Authorised / received by (signature, date)", 8, false, GREY);
  doc.y = y - 24;
  return doc.build();
}
