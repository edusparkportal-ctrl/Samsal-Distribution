import { NextResponse } from "next/server";
import { pdfLogo } from "@/lib/brand-logo";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPortalSession } from "@/lib/portal/session";
import { isUuid } from "@/lib/admin/forms";
import { buildQuotationPdf } from "@/lib/quotation-pdf";
import type { CompanyInfo, QuoteDetail } from "@/lib/portal/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getPortalSession();
  if (s.status !== "ok") return new NextResponse("Not available", { status: 403 });
  if (!isUuid(id)) return new NextResponse("Not found", { status: 404 });
  const sb = await createSupabaseServerClient();
  const [{ data: q }, { data: c }] = await Promise.all([sb.rpc("portal_quote", { p_quote: id }), sb.rpc("portal_company")]);
  const quote = q as QuoteDetail | null;
  if (!quote) return new NextResponse("Not found", { status: 404 });
  const co = (c ?? {}) as Partial<CompanyInfo>;
  const pdf = buildQuotationPdf({
    logo: await pdfLogo(),
    number: quote.number, status: quote.status, currency: quote.currency, issueDate: quote.issue_date, validUntil: quote.valid_until,
    company: { legalName: co.legal_name ?? "SAMSAL Supply & Distribution Limited", address: co.address ?? null, city: co.city ?? null, country: co.country ?? null, registrationDetails: co.registration_details ?? null, taxPin: co.tax_pin ?? null, phone: co.phone ?? null, email: co.email ?? null },
    customer: { company: quote.customer.company, contact: quote.customer.contact ?? "", email: quote.customer.email, phone: quote.customer.phone, location: quote.customer.location },
    lines: quote.items.map((x) => ({ description: x.description, quantity: Number(x.quantity), unit: x.unit, unitPrice: Number(x.unit_price) })),
    taxRatePercent: Number(quote.tax_rate), deliveryTerms: quote.delivery_terms, paymentTerms: quote.payment_terms, notes: quote.notes, defaultTerms: co.quotation_terms ?? null,
  });
  const safe = String(quote.number).replace(/[^A-Za-z0-9._-]/g, "_");
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${safe}.pdf"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
