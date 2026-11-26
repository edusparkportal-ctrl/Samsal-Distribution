import { NextResponse } from "next/server";
import { pdfLogo } from "@/lib/brand-logo";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPortalSession } from "@/lib/portal/session";
import { isUuid } from "@/lib/admin/forms";
import { buildDeliveryNotePdf } from "@/lib/delivery-note-pdf";
import type { CompanyInfo, DeliveryNoteDetail } from "@/lib/portal/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The customer's own delivery note as a PDF. Comes only from portal_* functions, so it can only ever be theirs. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; did: string }> }) {
  const { did } = await params;
  const s = await getPortalSession();
  if (s.status !== "ok") return new NextResponse("Not available", { status: 403 });
  if (!isUuid(did)) return new NextResponse("Not found", { status: 404 });
  const sb = await createSupabaseServerClient();
  const [{ data: n }, { data: c }] = await Promise.all([sb.rpc("portal_delivery_note", { p_delivery: did }), sb.rpc("portal_company")]);
  const dn = n as DeliveryNoteDetail | null;
  if (!dn) return new NextResponse("Not found", { status: 404 });
  const co = (c ?? {}) as Partial<CompanyInfo>;
  const pdf = buildDeliveryNotePdf({
    logo: await pdfLogo(),
    number: dn.number, status: dn.status, orderNumber: dn.order_number, customerReference: dn.customer_reference, scheduledDate: dn.scheduled_date, deliveredAt: dn.delivered_at,
    driverName: dn.driver_name, vehicleReg: dn.vehicle_reg, deliveryAddress: dn.delivery_address, notes: dn.notes,
    company: { legalName: co.legal_name ?? "SAMSAL Supply & Distribution Limited", address: co.address ?? null, city: co.city ?? null, country: co.country ?? null, registrationDetails: co.registration_details ?? null, taxPin: co.tax_pin ?? null, phone: co.phone ?? null, email: co.email ?? null },
    customer: dn.customer,
    lines: dn.items.map((x) => ({ description: x.description, quantity: Number(x.quantity), unit: x.unit })),
  });
  const safe = String(dn.number).replace(/[^A-Za-z0-9._-]/g, "_");
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${safe}.pdf"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
