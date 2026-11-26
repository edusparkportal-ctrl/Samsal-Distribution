import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BRAND, CHAIN_LABEL, STATUS_LABEL } from "@/lib/trade";
import { TradeHeader, goldBtn, goldStyle } from "../../TradeHeader";
import { loadTypes } from "../../data";

export const metadata = { title: "Document chain" };
export const dynamic = "force-dynamic";
const COLOUR: Record<string, string> = { draft: "#9aa5b1", pending_approval: "#d9a400", approved: BRAND.blueLight, rejected: "#c0392b", issued: BRAND.blue, completed: "#1e8e4f", cancelled: "#cfd6dd" };

/** One row per chain (a whole purchase from requisition to supplier invoice), one cell per step. */
export default async function ChainPage({ params }: { params: Promise<{ chain: string }> }) {
  const { chain } = await params;
  await requirePermission("trade.view", "trade");
  const types = (await loadTypes()).filter((t) => t.chain === chain).sort((a, b) => a.step_no - b.step_no);
  if (types.length === 0) notFound();
  const sb = await createSupabaseServerClient();
  const { data } = await sb.from("trade_docs").select("id, number, doc_type, status, root_id, title, created_at").in("doc_type", types.map((t) => t.key)).neq("status", "cancelled").order("created_at", { ascending: false }).limit(600);
  const byRoot = new Map<string, { title: string | null; docs: Map<string, { id: string; number: string; status: string }> }>();
  for (const d of data ?? []) {
    const k = d.root_id ?? d.id;
    if (!byRoot.has(k)) byRoot.set(k, { title: d.title, docs: new Map() });
    byRoot.get(k)!.docs.set(d.doc_type, { id: d.id, number: d.number, status: d.status });
  }
  const first = types[0];
  return (
    <>
      <TradeHeader title={CHAIN_LABEL[chain] ?? chain} subtitle="Each row is one transaction. Click a step to open the document; grey steps have not been created yet."
        actions={<Link href={`/admin/trade/new?type=${first.key}`} className={goldBtn} style={goldStyle}>New {first.name}</Link>} />
      <div className="card overflow-x-auto p-4">
        <table className="w-full min-w-[900px] border-separate border-spacing-y-2 text-xs">
          <thead><tr className="text-left text-grey-500"><th className="pr-2">Transaction</th>{types.map((t) => <th key={t.key} className="px-1 font-semibold">{t.step_no}. {t.name}</th>)}</tr></thead>
          <tbody>
            {Array.from(byRoot.entries()).map(([root, r]) => (
              <tr key={root}><td className="pr-2 font-medium text-navy">{r.title ?? "Untitled"}</td>
                {types.map((t) => { const d = r.docs.get(t.key); return (
                  <td key={t.key} className="px-1">{d ? <Link href={`/admin/trade/doc/${d.id}`} title={STATUS_LABEL[d.status]} className="block rounded px-2 py-1.5 text-center font-semibold text-white" style={{ background: COLOUR[d.status] }}>{d.number}</Link>
                    : <span className="block rounded bg-grey-100 px-2 py-1.5 text-center text-grey-400">-</span>}</td>); })}
              </tr>))}
            {byRoot.size === 0 && <tr><td colSpan={types.length + 1} className="py-6 text-center text-sm text-grey-500">No documents in this chain yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-3 flex flex-wrap gap-3 text-xs text-grey-500">{Object.entries(STATUS_LABEL).filter(([k]) => k !== "cancelled").map(([k, v]) => <span key={k}><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: COLOUR[k] }} />{v}</span>)}</p>
    </>
  );
}
