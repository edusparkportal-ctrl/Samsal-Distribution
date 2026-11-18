import Link from "next/link";
import { Flash } from "@/components/admin/Flash";
import { PrintButton } from "@/components/admin/PrintButton";
import { PageHeader, Panel } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { money } from "@/lib/finance/format";
import { buildReport } from "./actions";

export const metadata = { title: "Financial reports" };
export const dynamic = "force-dynamic";

type Snap = { id: string; period_start: string; period_end: string; created_at: string; created_by: string | null; data: Data };
type Data = {
  by_currency: { currency: string; income: number; expense: number; net: number }[];
  top_expenses: { category: string; currency: string; amount: number }[];
  receivables: { currency: string; outstanding: number; overdue: number; invoices: number }[];
  payables: { currency: string; outstanding: number; overdue: number; bills: number }[];
  budgets: { name: string; category: string; currency: string; budget: number; actual: number }[];
  pending_claims: number; unapproved_bills: number;
};
const monthName = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-KE", { month: "long", year: "numeric" });

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; month?: string }> }) {
  const sp = await searchParams;
  await requirePermission("finance.reports", "finance");
  const sb = await createSupabaseServerClient();
  const { data } = await sb.from("finance_report_snapshots").select("id, period_start, period_end, created_at, created_by, data").order("period_start", { ascending: false }).limit(36);
  const snaps = (data ?? []) as Snap[];
  const sel = (sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? snaps.find((s) => s.period_start.startsWith(sp.month!)) : undefined) ?? undefined;
  const nowMonth = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" }).slice(0, 7);

  return (
    <>
      <PageHeader title="Financial reports" description="Monthly reports are built from the ledger, invoices and bills. The system prepares one automatically after each month ends (if that automation is on); you can also build or refresh any month. Figures are management information, not audited accounts." actions={sel && <PrintButton label="Print or save as PDF" />} />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="space-y-5">
        <Panel title="Build a report" className="print:hidden">
          <form action={buildReport} className="flex flex-wrap items-end gap-3 text-sm">
            <label><span className="mb-1 block font-medium text-navy">Month</span><input type="month" name="month" required defaultValue={nowMonth} className="field-input" /></label>
            <button className="btn-primary px-4 py-2 text-sm">Build or refresh</button>
          </form>
          {snaps.length > 0 && <p className="mt-3 flex flex-wrap gap-2 text-sm">{snaps.map((s) => <Link key={s.id} href={`/admin/finance/reports?month=${s.period_start.slice(0, 7)}`} className={`rounded border px-3 py-1 ${sel?.id === s.id ? "border-navy bg-navy text-white" : "border-grey-300 text-navy hover:bg-grey"}`}>{monthName(s.period_start)}</Link>)}</p>}
        </Panel>

        {sel ? (
          <Panel title={`Report for ${monthName(sel.period_start)}`}>
            <p className="mb-4 text-xs text-grey-500">Prepared {new Date(sel.created_at).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })} {sel.created_by ? "by a team member" : "automatically"}. Reflects the books at that time.</p>
            <section className="mb-5"><h3 className="mb-2 font-semibold text-navy">Income and expenses</h3>
              {sel.data.by_currency.length === 0 ? <p className="text-sm text-grey-500">No ledger entries this month.</p> : (
                <table className="w-full text-left text-sm"><thead><tr className="border-b border-grey-200 text-xs uppercase text-grey-500"><th className="py-1 pr-3">Currency</th><th className="pr-3 text-right">Money in</th><th className="pr-3 text-right">Money out</th><th className="text-right">Net</th></tr></thead>
                  <tbody>{sel.data.by_currency.map((r) => <tr key={r.currency} className="border-b border-grey-100"><td className="py-1 pr-3">{r.currency}</td><td className="pr-3 text-right">{money(r.income, "").trim()}</td><td className="pr-3 text-right">{money(r.expense, "").trim()}</td><td className="text-right font-semibold">{money(r.net, "").trim()}</td></tr>)}</tbody></table>
              )}</section>
            {sel.data.top_expenses.length > 0 && <section className="mb-5"><h3 className="mb-2 font-semibold text-navy">Biggest expense categories</h3><ul className="text-sm">{sel.data.top_expenses.map((t) => <li key={t.category + t.currency} className="flex justify-between border-b border-grey-100 py-1"><span>{t.category}</span><span>{money(t.amount, t.currency)}</span></li>)}</ul></section>}
            <section className="mb-5"><h3 className="mb-2 font-semibold text-navy">Receivables and payables at the time</h3>
              <ul className="text-sm">
                {sel.data.receivables.map((r) => <li key={"r" + r.currency} className="border-b border-grey-100 py-1">Customers owe you {money(r.outstanding, r.currency)} across {r.invoices} invoice(s); overdue {money(r.overdue, r.currency)}.</li>)}
                {sel.data.payables.map((r) => <li key={"p" + r.currency} className="border-b border-grey-100 py-1">You owe suppliers {money(r.outstanding, r.currency)} across {r.bills} bill(s); overdue {money(r.overdue, r.currency)}.</li>)}
                {sel.data.receivables.length === 0 && sel.data.payables.length === 0 && <li className="text-grey-500">Nothing outstanding.</li>}
              </ul></section>
            {sel.data.budgets.length > 0 && <section className="mb-5"><h3 className="mb-2 font-semibold text-navy">Budgets covering this month</h3><ul className="text-sm">{sel.data.budgets.map((b) => <li key={b.name + b.category} className="flex flex-wrap justify-between border-b border-grey-100 py-1"><span>{b.name} ({b.category})</span><span>{money(b.actual, b.currency)} of {money(b.budget, b.currency)}</span></li>)}</ul></section>}
            <p className="text-sm text-charcoal">Waiting for approval: {sel.data.pending_claims} expense claim(s), {sel.data.unapproved_bills} bill(s).</p>
          </Panel>
        ) : snaps.length === 0 ? <Panel><p className="text-sm text-grey-500">No reports yet. Build the first one above.</p></Panel> : null}
      </div>
    </>
  );
}
