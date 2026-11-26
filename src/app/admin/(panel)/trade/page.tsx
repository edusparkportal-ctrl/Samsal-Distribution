import Link from "next/link";
import { Flash } from "@/components/admin/Flash";
import { Badge, Panel, StatCard } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BRAND, CHAIN_LABEL, GROUP_LABEL, STATUS_LABEL, STATUS_TONE, money, when, type TradeDoc } from "@/lib/trade";
import { TradeHeader, blueBtn, blueStyle } from "./TradeHeader";
import { loadTypes } from "./data";

export const metadata = { title: "Trade documents" };
export const dynamic = "force-dynamic";

export default async function TradeDashboard({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("trade.view", "trade");
  const sb = await createSupabaseServerClient();
  const types = await loadTypes();
  const [{ data: dash }, { data: pending }, { data: recent }, { data: unpaidBills }] = await Promise.all([
    sb.rpc("trade_dashboard"),
    sb.from("trade_docs").select("id, number, doc_type, title, total, currency, created_at").eq("status", "pending_approval").order("created_at").limit(10),
    sb.from("trade_docs").select("id, number, doc_type, title, status, total, currency, created_at").order("created_at", { ascending: false }).limit(12),
    sb.from("bill_totals").select("balance").gt("balance", 0).limit(500),
  ]);
  const d = (dash ?? {}) as Record<string, number & Record<string, number>>;
  const byType = (d.by_type ?? {}) as unknown as Record<string, number>;
  const typeName = new Map(types.map((t) => [t.key, t.name]));
  const groups = Object.keys(GROUP_LABEL).map((g) => ({ g, items: types.filter((t) => t.module_group === g) })).filter((x) => x.items.length);
  const outstanding = (unpaidBills ?? []).reduce((a: number, b: { balance: number }) => a + Number(b.balance), 0);
  const chains = Array.from(new Set(types.map((t) => t.chain)));
  return (
    <>
      <TradeHeader title="Documents dashboard" subtitle="Every trading and operations document, numbered, approved, signed and linked, from requisition to supplier invoice."
        actions={<Link href="/admin/trade/archive" className={blueBtn} style={blueStyle}>Search the archive</Link>} />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Awaiting approval" value={Number(d.pending_approvals ?? 0)} href="/admin/approvals" />
        <StatCard label="Drafts in progress" value={Number(d.drafts ?? 0)} href="/admin/trade/archive?status=draft" />
        <StatCard label="Completed (30 days)" value={Number(d.completed_30d ?? 0)} href="/admin/trade/archive?status=completed" />
        <StatCard label="Payment vouchers unpaid" value={Number(d.unpaid_vouchers ?? 0)} hint={money(Number(d.unpaid_amount ?? 0))} href="/admin/trade/archive?type=payment_voucher&status=issued" />
      </div>
      {outstanding > 0 && <p className="mb-6 text-sm text-grey-500">Supplier bills still to be paid: <strong className="text-navy">{money(outstanding)}</strong></p>}

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Panel title={`Waiting for approval (${(pending ?? []).length})`}>
          {(pending ?? []).length === 0 ? <p className="text-sm text-grey-500">Nothing is waiting.</p> : (
            <ul className="divide-y divide-grey-200 text-sm">{(pending ?? []).map((p: { id: string; number: string; doc_type: string; title: string | null; total: number; currency: string }) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2"><Link href={`/admin/trade/doc/${p.id}`} className="min-w-0 font-medium text-navy underline-offset-2 hover:underline">{typeName.get(p.doc_type)} {p.number}{p.title ? ` · ${p.title}` : ""}</Link><span className="shrink-0 text-grey-500">{money(p.total, p.currency)}</span></li>
            ))}</ul>
          )}
          <p className="mt-3 text-xs text-grey-500">Approvers decide on the <Link href="/admin/approvals" className="underline">Approvals</Link> page.</p>
        </Panel>
        <Panel title="Latest documents">
          <ul className="divide-y divide-grey-200 text-sm">{(recent ?? []).map((r: Pick<TradeDoc, "id" | "number" | "doc_type" | "title" | "status" | "total" | "currency" | "created_at">) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2">
              <Link href={`/admin/trade/doc/${r.id}`} className="min-w-0 truncate font-medium text-navy hover:underline">{typeName.get(r.doc_type)} {r.number}</Link>
              <span className="flex shrink-0 items-center gap-2"><Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge><span className="hidden text-xs text-grey-500 sm:inline">{when(r.created_at)}</span></span>
            </li>))}
            {(recent ?? []).length === 0 && <li className="py-2 text-grey-500">No documents yet. Start with a purchase requisition below.</li>}
          </ul>
        </Panel>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {chains.map((c) => (
          <Link key={c} href={`/admin/trade/chain/${c}`} className="rounded border px-3 py-1.5 text-sm font-semibold" style={{ borderColor: BRAND.gold, color: BRAND.black }}>
            {CHAIN_LABEL[c] ?? c}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map(({ g, items }) => (
          <section key={g} className="card overflow-hidden">
            <h2 className="px-4 py-2.5 text-sm font-bold text-white" style={{ background: BRAND.black, borderBottom: `2px solid ${BRAND.gold}` }}>{GROUP_LABEL[g]}</h2>
            <ul className="divide-y divide-grey-200 text-sm">
              {items.map((t) => (
                <li key={t.key} className="flex items-center justify-between gap-2 px-4 py-2">
                  <Link href={`/admin/trade/archive?type=${t.key}`} className="min-w-0 truncate text-navy hover:underline">{t.name}</Link>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-grey-500">{byType[t.key] ?? 0}</span>
                    {(ctx.has(t.permission as never) || ctx.isSuper) && <Link href={`/admin/trade/new?type=${t.key}`} className="rounded px-2 py-0.5 text-xs font-semibold text-black" style={{ background: BRAND.gold }}>New</Link>}
                  </span>
                </li>))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
