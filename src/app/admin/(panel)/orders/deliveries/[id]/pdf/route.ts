import { NextResponse } from "next/server";
import { checkPermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/admin/forms";
import { buildDeliveryNotePdf } from "@/lib/delivery-note-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

/** Printable delivery note for the driver. Staff only (orders.view). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await checkPermission("orders.view", "orders");
  if (!auth.ok) return new NextResponse(auth.error, { status: 403 });
  if (!isUuid(id)) return new NextResponse("Not found", { status: 404 });
  const sb = await createSupabaseServerClient();
  const { data: d } = await sb.from("deliveries").select("*").eq("id", id).maybeSingle();
  if (!d || d.status === "cancelled") return new NextResponse("Not found", { status: 404 });
  const { data: o } = await sb.from("sales_orders").select("number, delivery_address, customer_reference, customer:customers(company_name, contact_name, email, phone, location)").eq("id", d.sales_order_id).maybeSingle();
  if (!o) return new NextResponse("Not found", { status: 404 });
  const [{ data: items }, { data: co }, { data: contacts }] = await Promise.all([
    sb.from("sales_order_items").select("description, quantity, unit:units(abbreviation)").eq("order_id", d.sales_order_id).order("line_no"),
    sb.from("company_settings").select("registered_name, address_line, city, country, registration_details, tax_pin").eq("id", 1).maybeSingle(),
    sb.from("contact_channels").select("kind, value, is_primary").eq("is_public", true).eq("is_active", true).order("is_primary", { ascending: false }),
  ]);
  const c = one<any>(o.customer); // eslint-disable-line @typescript-eslint/no-explicit-any
  const pick = (k: string) => (contacts ?? []).find((x: { kind: string; value: string }) => x.kind === k)?.value ?? null;
  const pdf = buildDeliveryNotePdf({
    number: d.number, status: d.status, orderNumber: o.number, customerReference: o.customer_reference, scheduledDate: d.scheduled_date, deliveredAt: d.delivered_at,
    driverName: d.driver_name, vehicleReg: d.vehicle_reg, deliveryAddress: o.delivery_address, notes: d.notes,
    company: { legalName: co?.registered_name ?? "SAMSAL Supply & Distribution Limited", address: co?.address_line ?? null, city: co?.city ?? null, country: co?.country ?? null, registrationDetails: co?.registration_details ?? null, taxPin: co?.tax_pin ?? null, phone: pick("phone"), email: pick("email") },
    customer: { company: c?.company_name ?? null, contact: c?.contact_name ?? null, email: c?.email ?? null, phone: c?.phone ?? null, location: c?.location ?? null },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lines: (items ?? []).map((i: any) => ({ description: i.description, quantity: Number(i.quantity), unit: one<any>(i.unit)?.abbreviation ?? null })),
  });
  const safe = String(d.number).replace(/[^A-Za-z0-9._-]/g, "_");
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${safe}.pdf"`, "Cache-Control": "private, no-store" } });
}
