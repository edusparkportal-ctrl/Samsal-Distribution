import Link from "next/link";
import { Badge, PageHeader, Panel, StatCard } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { money } from "@/lib/finance/format";

export const metadata = { title: "Finance overview" };
export const dynamic = "force-dynamic";

type CF = { month: string; currency: string; income: number; expense: number; net: number };
type Age = { currency: string; balance: number; bucket: string };
type BvA = { budget_id: string; name: string; category: string; kind: string; currency: string; budget: number; actual: number; period_start: string; period_end: string };
const BUCKETS = ["current", "1-30", "31-60", "61-90", "90+"];

function ageing(rows: Age[]) {
  const out = new Map<string, Record<string, number>>();
  for (const r of rows) { const o = out.get(r.currency) ?? {}; o[r.bucket] = (o[r.bucket] ?? 0) + Number(r.balance); out.set(r.currency, o); }
  return out;
}

export default async function FinanceOverview() {
  const ctx = await requirePermission("finance.view", "finance");
  const sb = await createSupabaseServerClient();
  const thisMonth = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" }).slice(0, 7) + "-01";
  const [cf, ar, ap, bva, claims, bills] = await Promise.all([
    sb.from("cash_flow_monthly").select("month, currency, income, expense, net").order("month", { ascending: false }).limit(36),
    sb.from("ar_ageing").select("currency, balance, bucket"),
    sb.from("ap_ageing").select("currency, balance, bucket"),
    sb.from("budget_vs_actual").select("budget_id, name, category, kind, currency, budget, actual, period_start, period_end").order("period_start", { ascending: false }).limit(30),
    sb.from("expense_claims").select("id", { count: "exact", head: true }).eq("status", "pending"),
    sb.from("supplier_bills").select("id", { count: "exact", head: true }).eq("status", "pending_approval"),
  ]);
  const flows = ((cf.data ?? []) as CF[]);
  const now = flows.filter((f) => f.month === thisMonth);
  const arA = ageing((ar.data ?? []) as Age[]);
  const apA = ageing((ap.data ?? []) as Age[]);
  const sum = (m: Map<string, Record<string, number>>, cur: string, from = 0) => BUCKETS.slice(from).reduce((a, b) => a + (m.get(cur)?.[b] ?? 0), 0);
  const currencies = Array.from(new Set([...arA.keys(), ...apA.keys(), ...flows.map((f) => f.currency)]));

  return (
    <>
      <PageHeader title="Finance overview" description="Figures come straight from the ledger, invoices and bills. Nothing here is estimated." />
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(now.length ? now : [{ month: thisMonth, currency: "KES", income: 0, expense: 0, net: 0 }]).map((f) => (
            <StatCard key={f.currency} label={`Net this month (${f.currency})`} value={money(f.net, f.currency).replace(`${f.currency} `, "")} hint={`In ${Number(f.income).toLocaleString("en-KE")} · out ${Number(f.expense).toLocaleString("en-KE")}`} href="/admin/finance/ledger" />
          ))}
          <StatCard label="Claims awaiting approval" value={claims.count ?? 0} href="/admin/finance/claims" />
          <StatCard label="Bills awaiting approval" value={bills.count ?? 0} href="/admin/finance/bills?status=pending_approval" />
        </div>

        <Panel title="Money owed to you and by you">
          {currencies.length === 0 ? <p className="text-sm text-grey-500">Nothing outstanding yet.</p> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm">
              <thead><tr className="border-b border-grey-200 text-xs uppercase text-grey-500"><th className="py-2 pr-3">Currency</th><th className="pr-3 text-right">Customers owe you</th><th className="pr-3 text-right">of which overdue</th><th className="pr-3 text-right">You owe suppliers</th><th className="text-right">of which overdue</th></tr></thead>
              <tbody>{currencies.map((c) => (
                <tr key={c} className="border-b border-grey-100"><td className="py-2 pr-3 font-medium text-navy">{c}</td>
                  <td className="pr-3 text-right">{Number(sum(arA, c)).toLocaleString("en-KE", { minimumFractionDigits: 2 })}</td><td className="pr-3 text-right">{Number(sum(arA, c, 1)).toLocaleString("en-KE", { minimumFractionDigits: 2 })}</td>
                  <td className="pr-3 text-right">{Number(sum(apA, c)).toLocaleString("en-KE", { minimumFractionDigits: 2 })}</td><td className="text-right">{Number(sum(apA, c, 1)).toLocaleString("en-KE", { minimumFractionDigits: 2 })}</td></tr>
              ))}</tbody></table></div>
          )}
          <p className="mt-3 text-xs text-grey-500">Overdue = past the due date. <Link href="/admin/finance/invoices" className="underline">Invoices</Link> · <Link href="/admin/finance/bills" className="underline">Bills</Link></p>
        </Panel>

        <Panel title="Cash flow by month">
          {flows.length === 0 ? <p className="text-sm text-grey-500">No ledger entries yet. Receipts, payments and manual entries appear here.</p> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[480px] text-left text-sm">
              <thead><tr className="border-b border-grey-200 text-xs uppercase text-grey-500"><th className="py-2 pr-3">Month</th><th className="pr-3">Cur.</th><th className="pr-3 text-right">Money in</th><th className="pr-3 text-right">Money out</th><th className="text-right">Net</th></tr></thead>
              <tbody>{flows.slice(0, 12).map((f) => (
                <tr key={f.month + f.currency} className="border-b border-grey-100"><td className="py-2 pr-3">{new Date(f.month + "T00:00:00").toLocaleDateString("en-KE", { month: "long", year: "numeric" })}</td><td className="pr-3">{f.currency}</td>
                  <td className="pr-3 text-right">{Number(f.income).toLocaleString("en-KE", { minimumFractionDigits: 2 })}</td><td className="pr-3 text-right">{Number(f.expense).toLocaleString("en-KE", { minimumFractionDigits: 2 })}</td>
                  <td className={`text-right font-semibold ${Number(f.net) < 0 ? "text-red-700" : "text-navy"}`}>{Number(f.net).toLocaleString("en-KE", { minimumFractionDigits: 2 })}</td></tr>
              ))}</tbody></table></div>
          )}
        </Panel>

        <Panel title="Budget against actual">
          {(bva.data ?? []).length === 0 ? <p className="text-sm text-grey-500">No budgets yet. <Link href="/admin/finance/budgets?new=1" className="underline">Add one</Link>.</p> : (
            <ul className="space-y-3 text-sm">
              {((bva.data ?? []) as BvA[]).map((b) => {
                const pct = Number(b.budget) > 0 ? Math.round((Number(b.actual) / Number(b.budget)) * 100) : 0;
                const over = b.kind === "expense" && pct > 100;
                return (
                  <li key={b.budget_id}>
                    <div className="flex flex-wrap justify-between gap-2"><span className="font-medium text-navy">{b.name} <span className="font-normal text-grey-500">· {b.category} · {b.period_start} to {b.period_end}</span></span>
                      <span>{money(b.actual, b.currency)} of {money(b.budget, b.currency)} <Badge tone={over ? "red" : pct >= 80 && b.kind === "expense" ? "amber" : "green"}>{pct}%</Badge></span></div>
                    <div className="mt-1 h-2 overflow-hidden rounded bg-grey" role="img" aria-label={`${pct}% of budget`}><div className={`h-2 ${over ? "bg-red-600" : "bg-teal"}`} style={{ width: `${Math.min(pct, 100)}%` }} /></div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
        {!ctx.has("finance.reports") && null}
      </div>
    </>
  );
}
