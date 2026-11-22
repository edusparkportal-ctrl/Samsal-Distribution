"use client";

import { useActionState } from "react";
import { previewBulk, addBulk, type BulkState } from "@/app/portal/(app)/bulk/actions";

const LABEL: Record<string, { text: string; cls: string }> = {
  ok: { text: "Ready", cls: "bg-green-100 text-green-900" },
  duplicate: { text: "Skipped", cls: "bg-grey-200 text-charcoal" },
};
const money = (n: number | null, c: string | null) => (n === null ? "" : `${c ?? "KES"} ${Number(n).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

export default function BulkUploader() {
  const [state, action, pending] = useActionState<BulkState, FormData>(previewBulk, null);
  const preview = state?.preview ?? [];
  const okCount = preview.filter((p) => p.status === "ok").length;
  return (
    <div className="space-y-6">
      <form action={action} className="card space-y-4 p-5 sm:p-6">
        <div>
          <label htmlFor="file" className="field-label">CSV file</label>
          <input id="file" name="file" type="file" accept=".csv,text/csv,text/plain" className="field-input" />
        </div>
        <div>
          <label htmlFor="paste" className="field-label">Or paste rows here</label>
          <textarea id="paste" name="paste" rows={5} placeholder={"code,quantity\nRICE50,20\nSugar,10"} className="field-input font-mono text-sm" />
        </div>
        <button className="btn-primary w-full sm:w-auto" disabled={pending}>{pending ? "Checking…" : "Check my file"}</button>
        {state?.error && <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">{state.error}</p>}
      </form>

      {preview.length > 0 && (
        <section aria-live="polite" className="card p-5 sm:p-6">
          <h2 className="text-base font-bold text-navy">{okCount} of {preview.length} rows are ready</h2>
          <ul className="mt-4 divide-y divide-grey-200 text-sm">
            {preview.map((p) => {
              const l = LABEL[p.status] ?? { text: "Needs attention", cls: "bg-amber/20 text-charcoal" };
              return (
                <li key={p.line} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-charcoal">{p.name ?? (p.ref || "(empty)")} {p.quantity !== null && <span className="font-normal text-grey-500">× {p.quantity}</span>}</p>
                    <p className="text-xs text-grey-500">Line {p.line}{p.name && p.ref && p.name !== p.ref ? ` · ${p.ref}` : ""}{p.unit_price !== null ? ` · ${money(p.unit_price, p.currency)} each` : ""}</p>
                    {p.message && <p className="mt-1 text-xs text-charcoal">{p.message}</p>}
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${l.cls}`}>{l.text}</span>
                </li>
              );
            })}
          </ul>
          {okCount > 0 && (
            <form action={addBulk} className="mt-5 border-t border-grey-200 pt-4">
              <input type="hidden" name="rows" value={JSON.stringify(state?.rows ?? [])} />
              <button className="btn-primary w-full sm:w-auto">Add {okCount} product{okCount === 1 ? "" : "s"} to my cart</button>
              <p className="mt-2 text-xs text-grey-500">Quantities in the file replace any already in your cart for the same product. Prices and stock are checked again when you check out.</p>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
