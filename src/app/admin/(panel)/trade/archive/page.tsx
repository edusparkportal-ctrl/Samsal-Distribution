import Link from "next/link";
import { Badge } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { STATUS_LABEL, STATUS_TONE, money } from "@/lib/trade";
import { TradeHeader, goldBtn, goldStyle } from "../TradeHeader";
import { loadTypes } from "../data";

export const metadata = { title: "Trade document archive" };
export const dynamic = "force-dynamic";
const input = "rounded border border-grey-300 px-3 py-2 text-sm";

export default async function Archive({ searchParams }: { searchParams: Promise<{ q?: string; type?: string; status?: string; from?: string; to?: string; page?: string }> }) {
  const sp = await searchParams;
  await requirePermission("trade.view", "trade");
  const types = await loadTypes();
  const typeName = new Map(types.map((t) => [t.key, t.name]));
  const sb = await createSupabaseServerClient();
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1), size = 40;
  let q = sb.from("trade_docs").select("id, number, doc_type, status, title, reference, total, currency, doc_date, supplier:suppliers(name), customer:customers(company_name)", { count: "exact" }).order("created_at", { ascending: false }).range((page - 1) * size, page * size - 1);
  if (sp.type && typeName.has(sp.type)) q = q.eq("doc_type", sp.type);
  if (sp.status && STATUS_LABEL[sp.status]) q = q.eq("status", sp.status);
  if (sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from)) q = q.gte("doc_date", sp.from);
  if (sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to)) q = q.lte("doc_date", sp.to);
  const term = (sp.q ?? "").trim().replace(/[%,()*\\]/g, " ").slice(0, 80);
  if (term) q = q.or(`number.ilike.%${term}%,title.ilike.%${term}%,reference.ilike.%${term}%`);
  const { data, count } = await q;
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
  const qs = (p: number) => { const u = new URLSearchParams(); for (const [k, v] of Object.entries({ ...sp, page: String(p) })) if (v) u.set(k, v); return `?${u}`; };
  return (
    <>
      <TradeHeader title="Archive & search" subtitle="Every document ever raised, with its number, status and links. Nothing is deleted; cancelled documents stay on record." />
      <form className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <label className="text-xs text-grey-500">Search<input name="q" defaultValue={sp.q ?? ""} placeholder="Number, title or reference" className={`${input} mt-1 block w-56`} /></label>
        <label className="text-xs text-grey-500">Type<select name="type" defaultValue={sp.type ?? ""} className={`${input} mt-1 block`}><option value="">All</option>{types.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}</select></label>
        <label className="text-xs text-grey-500">Status<select name="status" defaultValue={sp.status ?? ""} className={`${input} mt-1 block`}><option value="">All</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="text-xs text-grey-500">From<input type="date" name="from" defaultValue={sp.from ?? ""} className={`${input} mt-1 block`} /></label>
        <label className="text-xs text-grey-500">To<input type="date" name="to" defaultValue={sp.to ?? ""} className={`${input} mt-1 block`} /></label>
        <button className={goldBtn} style={goldStyle}>Search</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead><tr className="border-b border-grey-200 text-left text-xs text-grey-500"><th className="p-3">Number</th><th>Type</th><th>Party</th><th>Date</th><th className="text-right">Total</th><th className="pr-3">Status</th></tr></thead>
          <tbody>{(data ?? []).map((d) => (
            <tr key={d.id} className="border-b border-grey-100">
              <td className="p-3"><Link href={`/admin/trade/doc/${d.id}`} className="font-medium text-navy hover:underline">{d.number}</Link>{d.title && <div className="text-xs text-grey-500">{d.title}</div>}</td>
              <td>{typeName.get(d.doc_type)}</td><td>{one<{ name: string }>(d.supplier as never)?.name ?? one<{ company_name: string }>(d.customer as never)?.company_name ?? "-"}</td>
              <td>{d.doc_date}</td><td className="text-right">{Number(d.total) > 0 ? money(d.total, d.currency) : "-"}</td><td className="pr-3"><Badge tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status]}</Badge></td></tr>))}
            {(data ?? []).length === 0 && <tr><td colSpan={6} className="p-6 text-center text-grey-500">No documents match.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-3 flex items-center gap-4 text-sm text-grey-500">{count ?? 0} document(s){page > 1 && <Link className="underline" href={qs(page - 1)}>Previous</Link>}{(count ?? 0) > page * size && <Link className="underline" href={qs(page + 1)}>Next</Link>}</p>
    </>
  );
}
