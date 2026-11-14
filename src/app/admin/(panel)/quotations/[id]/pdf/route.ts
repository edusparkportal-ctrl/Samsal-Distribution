import { NextResponse } from "next/server";
import { checkPermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/admin/forms";
import { buildQuotationPdf } from "@/lib/quotation-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await checkPermission("quotations.view", "quotations");
  if (!auth.ok) return new NextResponse(auth.error, { status: 403 });
  if (!isUuid(id)) return new NextResponse("Not found", { status: 404 });
  const sb = await createSupabaseServerClient();
  const { data: q } = await sb.from("quotations").select("*, customer:customers(company_name, contact_name, email, phone, location)").eq("id", id).maybeSingle();
  if (!q) return new NextResponse("Not found", { status: 404 });
  const [{ data: items }, { data: co }, { data: contacts }] = await Promise.all([
    sb.from("quotation_items").select("description, quantity, unit_price, unit:units(abbreviation)").eq("quotation_id", id).order("line_no"),
    sb.from("company_settings").select("registered_name, address_line, city, country, registration_details, tax_pin, quotation_terms").eq("id", 1).maybeSingle(),
    sb.from("contact_channels").select("kind, value, is_primary").eq("is_public", true).eq("is_active", true).order("is_primary", { ascending: false }),
  ]);
  const c = one<any>(q.customer); // eslint-disable-line @typescript-eslint/no-explicit-any
  const pick = (k: string) => (contacts ?? []).find((x: { kind: string; value: string }) => x.kind === k)?.value ?? null;
  const pdf = buildQuotationPdf({
    number: q.number, status: q.status, currency: q.currency, issueDate: q.issue_date, validUntil: q.valid_until,
    company: { legalName: co?.registered_name ?? "SAMSAL Supply & Distribution Limited", address: co?.address_line ?? null, city: co?.city ?? null, country: co?.country ?? null, registrationDetails: co?.registration_details ?? null, taxPin: co?.tax_pin ?? null, phone: pick("phone"), email: pick("email") },
    customer: { company: c?.company_name ?? null, contact: c?.contact_name ?? "", email: c?.email ?? null, phone: c?.phone ?? null, location: c?.location ?? null },
    lines: (items ?? []).map((i: any) => ({ description: i.description, quantity: Number(i.quantity), unit: one<any>(i.unit)?.abbreviation ?? null, unitPrice: Number(i.unit_price) })), // eslint-disable-line @typescript-eslint/no-explicit-any
    taxRatePercent: Number(q.tax_rate_percent), deliveryTerms: q.delivery_terms, paymentTerms: q.payment_terms, notes: q.notes, defaultTerms: co?.quotation_terms ?? null,
  });
  const safe = String(q.number).replace(/[^A-Za-z0-9._-]/g, "_");
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${safe}.pdf"`, "Cache-Control": "no-store" } });
}
