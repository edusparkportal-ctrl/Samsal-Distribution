import { NextResponse } from "next/server";
import { checkPermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";
import { isEnquiryStatus } from "@/lib/crm";

export const dynamic = "force-dynamic";
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

/** CSV of enquiries (honours the status filter). Needs enquiries.export; RLS still applies. */
export async function GET(req: Request) {
  const auth = await checkPermission("enquiries.export", "crm");
  if (!auth.ok) return new NextResponse(auth.error, { status: 403 });
  const status = new URL(req.url).searchParams.get("status") ?? "";
  const sb = await createSupabaseServerClient();
  let q = sb.from("enquiries").select("reference, created_at, status, source, product_text, quantity_text, delivery_location, required_by, follow_up_date, customer:customers(company_name, contact_name, email, phone)").is("deleted_at", null).order("created_at", { ascending: false }).limit(5000);
  if (isEnquiryStatus(status)) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return new NextResponse("Export failed.", { status: 500 });
  const rows = (data ?? []).map((r: any) => { const c = one<any>(r.customer); return [r.reference, r.created_at, r.status, r.source, c?.company_name, c?.contact_name, c?.email, c?.phone, r.product_text, r.quantity_text, r.delivery_location, r.required_by, r.follow_up_date]; }); // eslint-disable-line @typescript-eslint/no-explicit-any
  return new NextResponse(toCsv(["Reference", "Received", "Status", "Source", "Organisation", "Contact", "Email", "Telephone", "Request", "Quantity", "Delivery location", "Required by", "Follow-up"], rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="enquiries.csv"', "Cache-Control": "no-store" },
  });
}
