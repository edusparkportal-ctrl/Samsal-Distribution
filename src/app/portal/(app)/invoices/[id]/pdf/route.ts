import { NextResponse } from "next/server";
import { pdfLogo } from "@/lib/brand-logo";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPortalSession } from "@/lib/portal/session";
import { isUuid } from "@/lib/admin/forms";
import { buildInvoicePdf } from "@/lib/invoice-pdf";
import type { CompanyInfo, InvoiceDetail, PayInfo } from "@/lib/portal/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The customer's own invoice as a PDF. Everything comes from portal_* functions, so it can only ever be theirs. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getPortalSession();
  if (s.status !== "ok") return new NextResponse("Not available", { status: 403 });
  if (!isUuid(id)) return new NextResponse("Not found", { status: 404 });
  const sb = await createSupabaseServerClient();
  const [{ data: i }, { data: c }, { data: p }] = await Promise.all([sb.rpc("portal_invoice", { p_invoice: id }), sb.rpc("portal_company"), sb.rpc("portal_pay_info")]);
  const inv = i as InvoiceDetail | null;
  if (!inv) return new NextResponse("Not found", { status: 404 });
  const co = (c ?? {}) as Partial<CompanyInfo>;
  const pay = (p ?? null) as PayInfo | null;
  const instr = [pay?.mpesa_number ? `M-Pesa ${pay.mpesa_kind === "till" ? "Till" : "Paybill"} ${pay.mpesa_number}${pay.mpesa_kind === "paybill" ? ` (account ${inv.number})` : ""}` : null, pay?.bank_instructions, pay?.payment_note].filter(Boolean).join("\n") || null;
  const pdf = buildInvoicePdf({
    logo: await pdfLogo(),
    number: inv.number, status: inv.status, currency: inv.currency, issueDate: inv.issue_date, dueDate: inv.due_date, taxRatePercent: Number(inv.tax_rate), orderNumber: inv.order_number,
    company: { legalName: co.legal_name ?? "SAMSAL Supply & Distribution Limited", address: co.address ?? null, city: co.city ?? null, country: co.country ?? null, registrationDetails: co.registration_details ?? null, taxPin: co.tax_pin ?? null, phone: co.phone ?? null, email: co.email ?? null },
    customer: inv.customer,
    lines: inv.items.map((x) => ({ description: x.description, quantity: Number(x.quantity), unitPrice: Number(x.unit_price) })),
    payments: inv.payments.map((x) => ({ paidOn: x.paid_on, amount: Number(x.amount), method: x.method, reference: x.reference })),
    notes: inv.notes, paymentInstructions: instr,
  });
  const safe = String(inv.number).replace(/[^A-Za-z0-9._-]/g, "_");
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${safe}.pdf"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
