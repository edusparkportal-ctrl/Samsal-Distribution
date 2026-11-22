import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCustomer } from "@/lib/portal/session";
import { PageHeader, Panel } from "@/components/admin/ui";
import { PortalFlash } from "@/components/portal/PortalFlash";
import type { CartRow } from "@/lib/portal/types";
import { requestQuote } from "../actions";

export const metadata = { title: "Request a quotation" };
const ROWS = 8;

export default async function Page({ searchParams }: { searchParams: Promise<{ from?: string; ok?: string; error?: string }> }) {
  const sp = await searchParams;
  await requireCustomer();
  let prefill: { id: string | null; name: string; qty: string }[] = [];
  if (sp.from === "cart") {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.rpc("portal_cart");
    prefill = ((data as CartRow[] | null) ?? []).slice(0, ROWS).map((r) => ({ id: r.product_id, name: r.name, qty: String(r.quantity) }));
  }
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <p className="mb-4 text-sm"><Link href="/portal/quotes" className="font-semibold text-teal-dark underline underline-offset-2">← Quotations</Link></p>
      <PageHeader title="Request a quotation" description="List what you need. Our team replies with a price, usually within one working day." />
      <PortalFlash ok={sp.ok} error={sp.error} />
      <form action={requestQuote} className="space-y-6">
        <Panel title="What do you need?">
          <div className="space-y-3">
            {Array.from({ length: ROWS }, (_, i) => (
              <div key={i} className="grid grid-cols-[1fr_7.5rem] gap-2 sm:grid-cols-[1fr_10rem]">
                {prefill[i]?.id && <input type="hidden" name={`product_${i}`} value={prefill[i].id!} />}
                <div><label htmlFor={`d${i}`} className="sr-only">Product {i + 1}</label><input id={`d${i}`} name={`description_${i}`} maxLength={200} defaultValue={prefill[i]?.name ?? ""} placeholder={i === 0 ? "Product, size or brand" : "Another product (optional)"} className="field-input" required={i === 0} /></div>
                <div><label htmlFor={`q${i}`} className="sr-only">Quantity {i + 1}</label><input id={`q${i}`} name={`quantity_${i}`} maxLength={40} defaultValue={prefill[i]?.qty ?? ""} placeholder="Quantity" className="field-input" /></div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Delivery and notes">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label htmlFor="location" className="field-label">Delivery location</label><input id="location" name="location" maxLength={300} className="field-input" /></div>
            <div><label htmlFor="needed_by" className="field-label">Needed by (optional)</label><input id="needed_by" name="needed_by" type="date" min={today} className="field-input" /></div>
            <div className="sm:col-span-2"><label htmlFor="notes" className="field-label">Anything else we should know?</label><textarea id="notes" name="notes" rows={4} maxLength={3000} className="field-input" /></div>
          </div>
        </Panel>
        <button className="btn-primary w-full sm:w-auto">Send request</button>
      </form>
    </>
  );
}
