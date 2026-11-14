import { PageHeader, Panel, StatCard } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ENQUIRY_STATUSES } from "@/lib/crm";
import { money } from "@/lib/quotation";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  const ctx = await requirePermission("reports.view", "reports");
  const sb = await createSupabaseServerClient();
  const head = { count: "exact" as const, head: true };
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const crm = ctx.has("enquiries.view") && ctx.moduleEnabled("crm");
  const quo = ctx.has("quotations.view") && ctx.moduleEnabled("quotations");
  const byStatus = crm ? await Promise.all(ENQUIRY_STATUSES.map(async (s) => ({ ...s, n: (await sb.from("enquiries").select("id", head).eq("status", s.value).is("deleted_at", null)).count ?? 0 }))) : [];
  const last30 = crm ? (await sb.from("enquiries").select("id", head).gte("created_at", since).is("deleted_at", null)).count ?? 0 : 0;
  const { data: accepted } = quo ? await sb.from("quotations").select("currency, totals:quotation_totals(total)").eq("status", "accepted") : { data: [] };
  const sums: Record<string, number> = {};
  for (const q of (accepted ?? []) as any[]) { const t = Array.isArray(q.totals) ? q.totals[0] : q.totals; sums[q.currency] = (sums[q.currency] ?? 0) + Number(t?.total ?? 0); } // eslint-disable-line @typescript-eslint/no-explicit-any
  return (
    <>
      <PageHeader title="Reports" description="Live counts from the database. Figures are only what has been recorded in this system." />
      {crm && (
        <Panel title="Enquiries" className="mb-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Last 30 days" value={last30} />
            {byStatus.map((s) => <StatCard key={s.value} label={s.label} value={s.n} href={`/admin/crm/enquiries?status=${s.value}`} />)}
          </div>
          {ctx.has("enquiries.export") && <a href="/admin/reports/export?type=enquiries" className="btn-outline mt-4 inline-block px-4 py-2 text-sm">Export enquiries (CSV)</a>}
        </Panel>
      )}
      {quo && (
        <Panel title="Quotations">
          <p className="text-sm">Value of accepted quotations: {Object.keys(sums).length ? Object.entries(sums).map(([c, v]) => money(v, c)).join(" · ") : "none recorded yet"}</p>
          <a href="/admin/reports/export?type=quotations" className="btn-outline mt-4 inline-block px-4 py-2 text-sm">Export quotations (CSV)</a>
        </Panel>
      )}
    </>
  );
}
