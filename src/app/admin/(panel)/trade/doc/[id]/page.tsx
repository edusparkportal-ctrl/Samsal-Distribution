import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/admin/Flash";
import { Badge, Panel } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/admin/forms";
import { BRAND, DATA_FIELDS, STATUS_LABEL, STATUS_TONE, money, one, qtyFmt, when, type DocType, type TradeDoc, type TradeLine } from "@/lib/trade";
import { TradeHeader, blueBtn, blueStyle, goldBtn, goldStyle } from "../../TradeHeader";
import { cancelDoc, completeDoc, nextDoc, signDoc, submitDoc } from "../../actions";
import { loadTypes } from "../../data";

export const metadata = { title: "Trade document" };
export const dynamic = "force-dynamic";
const input = "rounded border border-grey-300 px-3 py-2 text-sm";

export default async function DocPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id } = await params; const sp = await searchParams;
  const ctx = await requirePermission("trade.view", "trade");
  if (!isUuid(id)) notFound();
  const sb = await createSupabaseServerClient();
  const { data } = await sb.from("trade_docs").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const doc = data as TradeDoc;
  const types = await loadTypes();
  const type = types.find((t) => t.key === doc.doc_type) as DocType;
  const typeName = new Map(types.map((t) => [t.key, t.name]));
  const [{ data: lines }, { data: events }, { data: sigs }, { data: chain }, { data: flow }, sup, cus, po, bill, parent] = await Promise.all([
    sb.from("trade_doc_lines").select("*, unit:units(abbreviation)").eq("doc_id", id).order("line_no"),
    sb.from("trade_doc_events").select("id, at, action, detail, actor:profiles(full_name, email)").eq("doc_id", id).order("at"),
    sb.from("trade_doc_signatures").select("id, role, signer_name, signed_at").eq("doc_id", id).order("signed_at"),
    sb.from("trade_docs").select("id, number, doc_type, status").eq("root_id", doc.root_id ?? id).is("deleted_at", null).order("created_at"),
    sb.from("doc_flow").select("to_type").eq("from_type", doc.doc_type),
    doc.supplier_id ? sb.from("suppliers").select("name").eq("id", doc.supplier_id).maybeSingle() : Promise.resolve({ data: null }),
    doc.customer_id ? sb.from("customers").select("company_name, contact_name").eq("id", doc.customer_id).maybeSingle() : Promise.resolve({ data: null }),
    doc.po_id ? sb.from("purchase_orders").select("number, status").eq("id", doc.po_id).maybeSingle() : Promise.resolve({ data: null }),
    doc.bill_id ? sb.from("supplier_bills").select("number, status").eq("id", doc.bill_id).maybeSingle() : Promise.resolve({ data: null }),
    doc.parent_id ? sb.from("trade_docs").select("id, number").eq("id", doc.parent_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const canWrite = ctx.isSuper || ctx.has(type.permission as never) || ctx.has("trade.manage");
  const rows = (lines ?? []) as (TradeLine & { unit: { abbreviation: string } | { abbreviation: string }[] | null })[];
  const children = (chain ?? []).filter((c: { id: string }) => c.id !== id);
  const existingNext = new Set((chain ?? []).filter((c: { id: string }) => true).map((c: { doc_type: string }) => c.doc_type));
  const canNext = ["approved", "issued", "completed"].includes(doc.status) && canWrite;
  const partyName = sup.data?.name ?? (cus.data ? cus.data.company_name || cus.data.contact_name : null);
  const fields = DATA_FIELDS[doc.doc_type] ?? [];
  return (
    <>
      <TradeHeader title={`${type.name} ${doc.number}`} subtitle={doc.title ?? type.description ?? undefined}
        actions={<><a href={`/admin/trade/doc/${id}/pdf`} className={goldBtn} style={goldStyle}>Download PDF</a>
          {["draft", "rejected"].includes(doc.status) && canWrite && <Link href={`/admin/trade/doc/${id}/edit`} className={blueBtn} style={blueStyle}>Edit</Link>}</>} />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Badge tone={STATUS_TONE[doc.status]}>{STATUS_LABEL[doc.status]}</Badge>
        {doc.status === "pending_approval" && <span className="text-sm text-grey-500">Decided on the <Link href="/admin/approvals" className="underline">Approvals</Link> page.</span>}
        {doc.status === "cancelled" && doc.cancel_reason && <span className="text-sm text-grey-500">Reason: {doc.cancel_reason}</span>}
        {canWrite && ["draft", "rejected"].includes(doc.status) && (
          <form action={submitDoc}><input type="hidden" name="id" value={id} /><button className={goldBtn} style={goldStyle}>{type.approval_subject ? "Submit for approval" : "Issue document"}</button></form>
        )}
        {canWrite && doc.status === "issued" && (
          <form action={completeDoc}><input type="hidden" name="id" value={id} /><button className={blueBtn} style={blueStyle}>Mark complete</button></form>
        )}
        {canNext && (flow ?? []).map((f: { to_type: string }) => existingNext.has(f.to_type) && children.some((c: { doc_type: string }) => c.doc_type === f.to_type) ? null : (
          <form key={f.to_type} action={nextDoc}><input type="hidden" name="id" value={id} /><input type="hidden" name="to" value={f.to_type} />
            <button className="rounded border px-3.5 py-2 text-sm font-semibold" style={{ borderColor: BRAND.gold }}>Create {typeName.get(f.to_type)}</button></form>
        ))}
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Panel title="Details" className="lg:col-span-2">
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {partyName && <><dt className="text-grey-500">{doc.supplier_id ? "Supplier" : "Customer"}</dt><dd className="font-medium">{partyName}</dd></>}
            {doc.reference && <><dt className="text-grey-500">Their reference</dt><dd>{doc.reference}</dd></>}
            <dt className="text-grey-500">Document date</dt><dd>{doc.doc_date}</dd>
            {doc.due_date && <><dt className="text-grey-500">Due / expected</dt><dd>{doc.due_date}</dd></>}
            {type.has_prices && <><dt className="text-grey-500">Total</dt><dd className="font-semibold">{money(doc.total, doc.currency)}</dd></>}
            {fields.map((f) => doc.data?.[f.key] ? <><dt key={`k${f.key}`} className="text-grey-500">{f.label}</dt><dd key={`v${f.key}`} className="whitespace-pre-line">{doc.data[f.key]}</dd></> : null)}
            {doc.notes && <><dt className="text-grey-500">Notes</dt><dd className="whitespace-pre-line">{doc.notes}</dd></>}
          </dl>
        </Panel>
        <Panel title="Linked records">
          <ul className="space-y-1.5 text-sm">
            {parent.data && <li>Follows <Link className="text-navy underline" href={`/admin/trade/doc/${parent.data.id}`}>{parent.data.number}</Link></li>}
            {po.data && <li>Purchase order <strong>{po.data.number}</strong> ({po.data.status}) · <Link className="underline" href="/admin/procurement/purchase-orders">open</Link></li>}
            {bill.data && <li>Supplier bill <strong>{bill.data.number}</strong> ({bill.data.status}) · <Link className="underline" href="/admin/finance/bills">open</Link></li>}
            {!parent.data && !po.data && !bill.data && <li className="text-grey-500">Nothing linked yet.</li>}
          </ul>
        </Panel>
      </div>

      {type.has_lines && (
        <Panel title="Items" className="mb-6">
          <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm">
            <thead><tr className="border-b border-grey-200 text-left text-xs text-grey-500"><th className="py-2 pr-2">#</th><th className="pr-2">Description</th><th className="pr-2 text-right">Qty</th>{type.key === "inspection_report" && <th className="pr-2 text-right">Accepted</th>}{type.has_prices && <><th className="pr-2 text-right">Unit price</th><th className="text-right">Amount</th></>}</tr></thead>
            <tbody>{rows.map((l) => (
              <tr key={l.id} className="border-b border-grey-100"><td className="py-2 pr-2">{l.line_no}</td><td className="pr-2">{l.description}{l.variant_id && <span className="ml-1 text-xs text-grey-500">(stock item)</span>}</td>
                <td className="pr-2 text-right">{qtyFmt(l.quantity)} {one(l.unit)?.abbreviation ?? ""}</td>
                {type.key === "inspection_report" && <td className="pr-2 text-right">{l.accepted_qty == null ? "-" : qtyFmt(l.accepted_qty)}</td>}
                {type.has_prices && <><td className="pr-2 text-right">{money(l.unit_price, doc.currency)}</td><td className="text-right">{money(Number(l.quantity) * Number(l.unit_price), doc.currency)}</td></>}</tr>))}</tbody>
          </table></div>
        </Panel>
      )}

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Chain">
          <ol className="space-y-1.5 text-sm">{(chain ?? []).map((c: { id: string; number: string; doc_type: string; status: string }) => (
            <li key={c.id} className="flex items-center justify-between gap-2"><Link href={`/admin/trade/doc/${c.id}`} className={`min-w-0 truncate hover:underline ${c.id === id ? "font-bold" : ""}`} style={{ color: c.id === id ? BRAND.blue : undefined }}>{typeName.get(c.doc_type)} · {c.number}</Link><Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge></li>))}</ol>
        </Panel>
        <Panel title="Signatures">
          <ul className="mb-3 space-y-1 text-sm">{(sigs ?? []).map((s: { id: string; role: string; signer_name: string; signed_at: string }) => <li key={s.id}><strong>{s.role}:</strong> {s.signer_name} <span className="text-xs text-grey-500">{when(s.signed_at)}</span></li>)}
            {(sigs ?? []).length === 0 && <li className="text-grey-500">Not signed yet.</li>}</ul>
          {canWrite && ["approved", "issued", "completed"].includes(doc.status) && (
            <form action={signDoc} className="flex flex-col gap-2 sm:flex-row"><input type="hidden" name="id" value={id} />
              <input name="role" placeholder="Role (e.g. Received by)" maxLength={60} required className={input} /><input name="name" placeholder="Full name" maxLength={120} required className={input} />
              <button className={blueBtn} style={blueStyle}>Sign</button></form>
          )}
        </Panel>
      </div>

      {canWrite && !["cancelled", "completed"].includes(doc.status) && (
        <Panel title="Cancel this document">
          <form action={cancelDoc} className="flex flex-col gap-2 sm:flex-row sm:items-end"><input type="hidden" name="id" value={id} />
            <input name="reason" placeholder="Reason (required)" minLength={3} maxLength={300} required className={`${input} flex-1`} />
            <button className="rounded border border-red-600 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50">Cancel document</button></form>
        </Panel>
      )}

      <Panel title="Audit trail" className="mt-6">
        <ul className="divide-y divide-grey-200 text-sm">{(events ?? []).map((e: { id: string; at: string; action: string; detail: string | null; actor: { full_name: string | null; email: string } | { full_name: string | null; email: string }[] | null }) => {
          const a = one(e.actor);
          return <li key={e.id} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:justify-between"><span><strong>{e.action}</strong>{e.detail ? ` · ${e.detail}` : ""}</span><span className="text-xs text-grey-500">{a ? a.full_name || a.email : "System"} · {when(e.at)}</span></li>;
        })}</ul>
      </Panel>
    </>
  );
}
