import { NextResponse } from "next/server";
import { checkPermission, requireStepUp } from "@/lib/auth/session";
import { logSecurityEvent } from "@/lib/security/events";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
const csv = (name: string, body: string) => new NextResponse(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });

export async function GET(req: Request) {
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const rep = await checkPermission("reports.view", "reports");
  if (!rep.ok) return new NextResponse(rep.error, { status: 403 });
  const ctx = await requireStepUp(`${url.pathname}${url.search}`); // data export: fresh authenticator code
  await logSecurityEvent("export_data", { actor: ctx.userId, detail: { what: `report:${(type ?? "").slice(0, 30)}` } });
  const sb = await createSupabaseServerClient();
  if (type === "enquiries") {
    const a = await checkPermission("enquiries.export", "crm");
    if (!a.ok) return new NextResponse(a.error, { status: 403 });
    const { data, error } = await sb.from("enquiries").select("reference, created_at, status, source, product_text, quantity_text, required_by, customer:customers(company_name, contact_name)").is("deleted_at", null).order("created_at", { ascending: false }).limit(5000);
    if (error) return new NextResponse("Export failed.", { status: 500 });
    return csv("enquiries-report.csv", toCsv(["Reference", "Received", "Status", "Source", "Organisation", "Contact", "Request", "Quantity", "Required by"],
      (data ?? []).map((r: any) => { const c = one<any>(r.customer); return [r.reference, r.created_at, r.status, r.source, c?.company_name, c?.contact_name, r.product_text, r.quantity_text, r.required_by]; }))); // eslint-disable-line @typescript-eslint/no-explicit-any
  }
  if (type === "quotations") {
    const a = await checkPermission("quotations.view", "quotations");
    if (!a.ok) return new NextResponse(a.error, { status: 403 });
    const { data, error } = await sb.from("quotations").select("number, status, currency, issue_date, valid_until, decision_at, customer:customers(company_name, contact_name), totals:quotation_totals(subtotal, tax, total)").order("created_at", { ascending: false }).limit(5000);
    if (error) return new NextResponse("Export failed.", { status: 500 });
    return csv("quotations-report.csv", toCsv(["Number", "Status", "Currency", "Issued", "Valid until", "Decision date", "Organisation", "Contact", "Subtotal", "Tax", "Total"],
      (data ?? []).map((r: any) => { const c = one<any>(r.customer), t = one<any>(r.totals); return [r.number, r.status, r.currency, r.issue_date, r.valid_until, r.decision_at, c?.company_name, c?.contact_name, t?.subtotal, t?.tax, t?.total]; }))); // eslint-disable-line @typescript-eslint/no-explicit-any
  }
  return new NextResponse("Unknown report.", { status: 400 });
}
