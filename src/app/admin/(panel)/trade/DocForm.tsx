import { DATA_FIELDS, type DocType, type TradeDoc, type TradeLine } from "@/lib/trade";
import { goldBtn, goldStyle } from "./TradeHeader";
import { saveDoc } from "./actions";

type Opt = { id: string; name: string };
const input = "w-full rounded border border-grey-300 px-3 py-2 text-sm";
const label = "mb-1 block text-xs font-medium text-grey-500";

export function DocForm({ type, doc, lines, parent, suppliers, customers, warehouses, variants, units }: {
  type: DocType; doc?: TradeDoc; lines?: TradeLine[]; parent?: string; suppliers: Opt[]; customers: Opt[]; warehouses: Opt[]; variants: Opt[]; units: Opt[];
}) {
  const fields = DATA_FIELDS[type.key] ?? [];
  const rows = [...(lines ?? [])];
  const blanks = Math.max(4, 8 - rows.length);
  const total = rows.length + blanks;
  const showAccepted = type.key === "inspection_report";
  const showWarehouse = type.key === "grn";
  return (
    <form action={saveDoc} className="space-y-6">
      <input type="hidden" name="type" value={type.key} />
      {doc && <input type="hidden" name="id" value={doc.id} />}
      {parent && <input type="hidden" name="parent" value={parent} />}
      <div className="card grid gap-4 p-5 sm:grid-cols-2">
        {type.party === "supplier" && (
          <label className="text-sm"><span className={label}>Supplier</span>
            <select name="supplier_id" defaultValue={doc?.supplier_id ?? ""} className={input}><option value="">Choose a supplier</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        )}
        {type.party === "customer" && (
          <label className="text-sm"><span className={label}>Customer</span>
            <select name="customer_id" defaultValue={doc?.customer_id ?? ""} className={input}><option value="">Choose a customer</option>{customers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        )}
        <label className="text-sm"><span className={label}>Title / what it is for</span><input name="title" defaultValue={doc?.title ?? ""} maxLength={200} className={input} /></label>
        <label className="text-sm"><span className={label}>The other party&apos;s reference number (optional)</span><input name="reference" defaultValue={doc?.reference ?? ""} maxLength={120} className={input} /></label>
        <label className="text-sm"><span className={label}>Document date</span><input type="date" name="doc_date" defaultValue={doc?.doc_date ?? new Date().toISOString().slice(0, 10)} className={input} /></label>
        <label className="text-sm"><span className={label}>Due / expected date</span><input type="date" name="due_date" defaultValue={doc?.due_date ?? ""} className={input} /></label>
        <label className="text-sm"><span className={label}>Currency</span><input name="currency" defaultValue={doc?.currency ?? "KES"} maxLength={3} className={input} /></label>
        {showWarehouse && (
          <label className="text-sm"><span className={label}>Warehouse received into</span>
            <select name="warehouse_id" defaultValue={doc?.warehouse_id ?? ""} className={input}><option value="">Choose a warehouse</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
        )}
        {fields.map((f) => (
          <label key={f.key} className={`text-sm ${f.kind === "textarea" ? "sm:col-span-2" : ""}`}><span className={label}>{f.label}{f.required ? " *" : ""}</span>
            {f.kind === "textarea" ? <textarea name={`d_${f.key}`} defaultValue={doc?.data?.[f.key] ?? ""} rows={3} maxLength={1500} className={input} />
              : f.kind === "select" ? <select name={`d_${f.key}`} defaultValue={doc?.data?.[f.key] ?? ""} className={input}><option value="">-</option>{f.options?.map((o) => <option key={o} value={o}>{o}</option>)}</select>
              : <input type={f.kind === "date" ? "date" : "text"} name={`d_${f.key}`} defaultValue={doc?.data?.[f.key] ?? ""} maxLength={1500} className={input} />}
          </label>
        ))}
        <label className="text-sm sm:col-span-2"><span className={label}>Notes</span><textarea name="notes" defaultValue={doc?.notes ?? ""} rows={2} maxLength={2000} className={input} /></label>
      </div>

      {type.has_lines && (
        <div className="card overflow-x-auto p-5">
          <h2 className="mb-3 text-base font-bold text-navy">Items</h2>
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="text-left text-xs text-grey-500">
              <th className="pb-2 pr-2">Description</th><th className="pb-2 pr-2">Stock item (optional)</th><th className="pb-2 pr-2">Unit</th><th className="pb-2 pr-2">Qty</th>
              {type.has_prices && <th className="pb-2 pr-2">Unit price</th>}{showAccepted && <th className="pb-2 pr-2">Accepted</th>}
            </tr></thead>
            <tbody>
              {Array.from({ length: total }, (_, i) => {
                const n = i + 1, l = rows[i];
                return (
                  <tr key={n}>
                    <td className="pb-2 pr-2"><input name={`l_desc_${n}`} defaultValue={l?.description ?? ""} maxLength={300} className={input} />
                      {l?.po_item_id && <input type="hidden" name={`l_po_${n}`} value={l.po_item_id} />}{l?.product_id && <input type="hidden" name={`l_prod_${n}`} value={l.product_id} />}</td>
                    <td className="pb-2 pr-2"><select name={`l_var_${n}`} defaultValue={l?.variant_id ?? ""} className={input}><option value="">-</option>{variants.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></td>
                    <td className="pb-2 pr-2"><select name={`l_unit_${n}`} defaultValue={l?.unit_id ?? ""} className={input}><option value="">-</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></td>
                    <td className="pb-2 pr-2"><input name={`l_qty_${n}`} inputMode="decimal" defaultValue={l?.quantity ?? ""} className={`${input} w-24`} /></td>
                    {type.has_prices && <td className="pb-2 pr-2"><input name={`l_price_${n}`} inputMode="decimal" defaultValue={l?.unit_price ?? ""} className={`${input} w-28`} /></td>}
                    {showAccepted && <td className="pb-2 pr-2"><input name={`l_acc_${n}`} inputMode="decimal" defaultValue={l?.accepted_qty ?? ""} className={`${input} w-24`} /></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-grey-500">Leave unused rows empty. Pick a stock item on lines that should add to inventory when the goods are received.</p>
        </div>
      )}
      {!type.has_lines && type.has_prices && (
        <div className="card p-5"><label className="text-sm"><span className={label}>Amount</span><input name="l_price_1" inputMode="decimal" className={`${input} w-40`} defaultValue={doc?.total ?? ""} />
          <input type="hidden" name="l_desc_1" value={type.name} /><input type="hidden" name="l_qty_1" value="1" /></label>
          <p className="mt-1 text-xs text-grey-500">{type.name} is for the amount above.</p></div>
      )}
      <button className={goldBtn} style={goldStyle}>{doc ? "Save changes" : "Save as draft"}</button>
    </form>
  );
}
