import { NextResponse } from "next/server";
import { pdfLogo } from "@/lib/brand-logo";
import { checkPermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/admin/forms";
import { buildTradePdf } from "@/lib/trade-pdf";
import { STATUS_LABEL, one } from "@/lib/trade";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Branded PDF of any trade document. Staff with trade.view only; RLS decides what can be read. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await checkPermission("trade.view", "trade");
  if (!auth.ok) return new NextResponse(auth.error, { status: 403 });
  if (!isUuid(id)) return new NextResponse("Not found", { status: 404 });
  const sb = await createSupabaseServerClient();
  const { data: d } = await sb.from("trade_docs").select("*").eq("id", id).maybeSingle();
  if (!d) return new NextResponse("Not found", { status: 404 });
  const [{ data: t }, { data: lines }, { data: sigs }, { data: co }, { data: contacts }, sup, cus, po, bill, parent, by] = await Promise.all([
    sb.from("doc_types").select("name, has_lines, has_prices, party").eq("key", d.doc_type).maybeSingle(),
    sb.from("trade_doc_lines").select("description, quantity, accepted_qty, unit_price, unit:units(abbreviation)").eq("doc_id", id).order("line_no"),
    sb.from("trade_doc_signatures").select("role, signer_name, signed_at").eq("doc_id", id).order("signed_at"),
    sb.from("company_settings").select("registered_name, address_line, city, country, registration_details, tax_pin").eq("id", 1).maybeSingle(),
    sb.from("contact_channels").select("kind, value, is_primary").eq("is_public", true).eq("is_active", true).order("is_primary", { ascending: false }),
    d.supplier_id ? sb.from("suppliers").select("name").eq("id", d.supplier_id).maybeSingle() : Promise.resolve({ data: null }),
    d.customer_id ? sb.from("customers").select("company_name, contact_name").eq("id", d.customer_id).maybeSingle() : Promise.resolve({ data: null }),
    d.po_id ? sb.from("purchase_orders").select("number").eq("id", d.po_id).maybeSingle() : Promise.resolve({ data: null }),
    d.bill_id ? sb.from("supplier_bills").select("number").eq("id", d.bill_id).maybeSingle() : Promise.resolve({ data: null }),
    d.parent_id ? sb.from("trade_docs").select("number").eq("id", d.parent_id).maybeSingle() : Promise.resolve({ data: null }),
    d.created_by ? sb.from("profiles").select("full_name, email").eq("id", d.created_by).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!t) return new NextResponse("Not found", { status: 404 });
  const pick = (k: string) => (contacts ?? []).find((x: { kind: string; value: string }) => x.kind === k)?.value ?? null;
  const stamp = (v: string) => new Date(v).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "short" });
  const pdf = buildTradePdf({
    logo: await pdfLogo(),
    typeKey: d.doc_type, typeName: t.name, number: d.number, status: STATUS_LABEL[d.status] ?? d.status, title: d.title, reference: d.reference, docDate: d.doc_date, dueDate: d.due_date,
    currency: d.currency, total: Number(d.total), hasPrices: t.has_prices, hasLines: t.has_lines, notes: d.notes, data: d.data ?? {},
    partyLabel: t.party === "supplier" ? "Supplier" : t.party === "customer" ? "Customer" : null,
    partyName: sup.data?.name ?? (cus.data ? cus.data.company_name || cus.data.contact_name : null),
    parentNumber: parent.data?.number ?? null, poNumber: po.data?.number ?? null, billNumber: bill.data?.number ?? null,
    issuedAt: d.issued_at ? stamp(d.issued_at) : null, preparedBy: by.data ? by.data.full_name || by.data.email : null, generatedAt: stamp(new Date().toISOString()),
    company: { legalName: co?.registered_name ?? "SAMSAL Supply & Distribution Limited", address: co?.address_line ?? null, city: co?.city ?? null, country: co?.country ?? null, registrationDetails: co?.registration_details ?? null, taxPin: co?.tax_pin ?? null, phone: pick("phone"), email: pick("email") },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lines: (lines ?? []).map((l: any) => ({ description: l.description, quantity: Number(l.quantity), accepted: l.accepted_qty == null ? null : Number(l.accepted_qty), unit: one<any>(l.unit)?.abbreviation ?? null, unitPrice: Number(l.unit_price) })),
    signatures: (sigs ?? []).map((s: { role: string; signer_name: string; signed_at: string }) => ({ role: s.role, name: s.signer_name, at: stamp(s.signed_at) })),
  });
  const safe = String(d.number).replace(/[^A-Za-z0-9._-]/g, "_");
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${safe}.pdf"`, "Cache-Control": "private, no-store" } });
}
