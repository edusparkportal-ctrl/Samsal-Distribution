import { PdfDoc } from "@/lib/pdf";

export type DeliveryNotePdfData = {
  number: string; status: string; orderNumber: string; customerReference: string | null; scheduledDate: string | null; deliveredAt: string | null;
  driverName: string | null; vehicleReg: string | null; deliveryAddress: string | null; notes: string | null;
  company: { legalName: string; address: string | null; city: string | null; country: string | null; registrationDetails: string | null; taxPin: string | null; phone: string | null; email: string | null };
  customer: { company: string | null; contact: string | null; email: string | null; phone: string | null; location: string | null };
  lines: { description: string; quantity: number; unit: string | null }[];
};

const NAVY: [number, number, number] = [20, 45, 78];
const GREY: [number, number, number] = [107, 120, 133];
const TEAL: [number, number, number] = [11, 143, 135];
const qty = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3))));

/**
 * Delivery note the customer signs on receipt (Terms and Conditions 7.5 and 9.1). Deliberately shows NO prices.
 * It has a "received" column and a remarks column for shortages or damage, then a signature block for the driver and the customer.
 */
export function buildDeliveryNotePdf(d: DeliveryNotePdfData): Buffer {
  const doc = new PdfDoc(`${d.company.legalName}  |  Delivery note ${d.number}`);
  const L = doc.left, R = doc.right;
  doc.y -= 4;
  doc.text(L, doc.y - 18, d.company.legalName, 17, true, NAVY);
  doc.text(R, doc.y - 18, "DELIVERY NOTE", 17, true, TEAL, "r");
  doc.y -= 26;
  const addr = [d.company.address, d.company.city, d.company.country].filter(Boolean).join(", ");
  for (const line of [addr, d.company.phone, d.company.email, d.company.registrationDetails, d.company.taxPin && `PIN: ${d.company.taxPin}`]) if (line) doc.para(line, 9, false, GREY);
  doc.gap(6); doc.rule(doc.y); doc.gap(10);

  const colX = L + doc.width / 2, topY = doc.y;
  doc.text(L, topY - 10, "Deliver to", 8, true, GREY);
  doc.text(colX, topY - 10, "Details", 8, true, GREY);
  let yl = topY - 24, yr = topY - 24;
  const who = d.customer.company ?? d.customer.contact ?? "";
  for (const ln of [d.customer.company, d.customer.contact, d.customer.phone].filter(Boolean) as string[]) { doc.text(L, yl, ln, 10, ln === who); yl -= 13; }
  if (d.deliveryAddress) {
    const lines = d.deliveryAddress.split("\n").flatMap((x) => x.match(/.{1,48}(\s|$)/g) ?? [x]).map((x) => x.trim()).filter(Boolean);
    for (const ln of lines.slice(0, 5)) { doc.text(L, yl, ln, 9, false, GREY); yl -= 12; }
  }
  const meta: [string, string][] = [["Delivery note", d.number], ["Order no.", d.orderNumber]];
  if (d.customerReference) meta.push(["Your reference", d.customerReference]);
  meta.push(["Date", d.deliveredAt ? d.deliveredAt.slice(0, 10) : d.scheduledDate ?? "-"]);
  if (d.driverName) meta.push(["Driver", d.driverName]);
  if (d.vehicleReg) meta.push(["Vehicle", d.vehicleReg]);
  for (const [k, v] of meta) { doc.text(colX, yr, k, 9, false, GREY); doc.text(colX + 78, yr, v, 10, true); yr -= 13; }
  doc.y = Math.min(yl, yr) - 8;

  const fixed = [28, 52, 62, 70, 110];
  const cols = [fixed[0], doc.width - fixed.reduce((a, b) => a + b, 0), fixed[1], fixed[2], fixed[3], fixed[4]];
  doc.table(["No.", "Description", "Unit", "Qty sent", "Received", "Remarks"], d.lines.map((l, i) => [String(i + 1), l.description, l.unit ?? "", qty(l.quantity), "", ""]), cols, ["l", "l", "l", "r", "r", "l"]);
  doc.gap(10);

  if (d.notes) { doc.para("Notes", 8, true, GREY); doc.para(d.notes, 9); doc.gap(6); }
  doc.para("The customer must inspect the goods on delivery and note any shortage or damage in the Remarks column before signing. A signed delivery note is evidence that the goods were delivered in the quantity stated.", 8.5, false, GREY);
  doc.gap(14);

  doc.ensure(150);
  const half = doc.width / 2 - 12, rx = L + doc.width / 2 + 12;
  let y = doc.y - 12;
  doc.text(L, y, "DELIVERED BY (SAMSAL)", 8.5, true, NAVY);
  doc.text(rx, y, "RECEIVED BY (CUSTOMER)", 8.5, true, NAVY);
  const rows: [string, string][] = [["Name", "Name"], ["Signature", "ID / staff no."], ["Date and time", "Signature"], ["", "Date and time"]];
  y -= 6;
  for (const [a, b] of rows) {
    y -= 26;
    if (a) { doc.hline(L + 70, L + half, y); doc.text(L, y + 2, a, 9, false, GREY); }
    if (b) { doc.hline(rx + 80, R, y); doc.text(rx, y + 2, b, 9, false, GREY); }
  }
  y -= 30;
  doc.text(rx, y, "Company stamp", 8.5, false, GREY);
  doc.frame(rx + 80, y - 34, 110, 44);
  doc.y = y - 44;
  return doc.build();
}
