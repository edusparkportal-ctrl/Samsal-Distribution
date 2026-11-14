import Link from "next/link";
import { Flash } from "@/components/admin/Flash";
import { Badge, PageHeader, Panel } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { money } from "@/lib/quotation";

export const metadata = { title: "Quotations" };
const STATUSES = ["draft", "sent", "accepted", "declined", "expired", "cancelled"];
const tone = (s: string) => (s === "accepted" ? "green" : s === "declined" || s === "cancelled" ? "red" : s === "sent" ? "navy" : s === "expired" ? "amber" : "grey") as "green" | "red" | "navy" | "amber" | "grey";
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

export default async function QuotationsPage({ searchParams }: { searchParams: Promise<{ status?: string; ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("quotations.view", "quotations");
  const sb = await createSupabaseServerClient();
  let q = sb.from("quotations").select("id, number, status, currency, issue_date, valid_until, customer:customers(company_name, contact_name), totals:quotation_totals(total)").order("created_at", { ascending: false }).limit(200);
  if (sp.status && STATUSES.includes(sp.status)) q = q.eq("status", sp.status);
  const { data } = await q;
  return (
    <>
      <PageHeader title="Quotations" description="Prepare itemised quotations, download them as PDF and record the customer's decision."
        actions={ctx.has("quotations.manage") ? <Link href="/admin/quotations/new" className="btn-primary px-4 py-2 text-sm">New quotation</Link> : undefined} />
      <Flash ok={sp.ok} error={sp.error} />
      <nav className="mb-4 flex flex-wrap gap-2 text-sm" aria-label="Filter by status">
        <Link href="/admin/quotations" className={`rounded-full px-3 py-1 ${!sp.status ? "bg-navy text-white" : "bg-grey-200"}`}>All</Link>
        {STATUSES.map((s) => <Link key={s} href={`/admin/quotations?status=${s}`} className={`rounded-full px-3 py-1 capitalize ${sp.status === s ? "bg-navy text-white" : "bg-grey-200"}`}>{s}</Link>)}
      </nav>
      <Panel>
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-grey-500"><tr><th className="py-2 pr-3">Number</th><th className="pr-3">Customer</th><th className="pr-3">Status</th><th className="pr-3">Issued</th><th className="pr-3">Valid until</th><th className="text-right">Total</th></tr></thead>
          <tbody className="divide-y divide-grey-200">
            {(data ?? []).map((r: any) => { const c = one<any>(r.customer), t = one<any>(r.totals); return ( // eslint-disable-line @typescript-eslint/no-explicit-any
              <tr key={r.id}><td className="py-2.5 pr-3 font-semibold"><Link className="text-teal-dark hover:underline" href={`/admin/quotations/${r.id}`}>{r.number}</Link></td>
                <td className="pr-3">{c?.company_name ?? c?.contact_name ?? "-"}</td><td className="pr-3"><Badge tone={tone(r.status)}>{r.status}</Badge></td>
                <td className="pr-3">{r.issue_date}</td><td className="pr-3">{r.valid_until ?? "-"}</td><td className="text-right">{money(Number(t?.total ?? 0), r.currency)}</td></tr>); })}
            {(data ?? []).length === 0 && <tr><td colSpan={6} className="py-3 text-grey-500">No quotations.</td></tr>}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
