import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCustomer } from "@/lib/portal/session";
import { PageHeader, Panel } from "@/components/admin/ui";
import { PortalFlash } from "@/components/portal/PortalFlash";
import { TICKET_CATEGORIES } from "@/lib/portal/format";
import { isUuid } from "@/lib/admin/forms";
import type { InvoiceRow, OrderRow } from "@/lib/portal/types";
import { createTicket } from "../actions";

export const metadata = { title: "New support ticket" };

export default async function Page({ searchParams }: { searchParams: Promise<{ order?: string; invoice?: string; ok?: string; error?: string }> }) {
  const sp = await searchParams;
  await requireCustomer();
  const supabase = await createSupabaseServerClient();
  const [{ data: o }, { data: i }] = await Promise.all([supabase.rpc("portal_orders", { p_status: null, p_limit: 30, p_offset: 0 }), supabase.rpc("portal_invoices", { p_status: null, p_limit: 30, p_offset: 0 })]);
  const orders = (o as OrderRow[] | null) ?? [], invoices = (i as InvoiceRow[] | null) ?? [];
  const pre = { order: sp.order && isUuid(sp.order) ? sp.order : "", invoice: sp.invoice && isUuid(sp.invoice) ? sp.invoice : "" };
  return (
    <>
      <p className="mb-4 text-sm"><Link href="/portal/support" className="font-semibold text-teal-dark underline underline-offset-2">← Support</Link></p>
      <PageHeader title="New support ticket" description="Tell us what happened. The more detail, the faster we can help." />
      <PortalFlash ok={sp.ok} error={sp.error} />
      <form action={createTicket} className="space-y-6">
        <Panel>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label htmlFor="category" className="field-label">What is it about?</label>
              <select id="category" name="category" required className="field-input" defaultValue={pre.invoice ? "invoice" : pre.order ? "order" : "other"}>{TICKET_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div><label htmlFor="subject" className="field-label">Subject</label><input id="subject" name="subject" required minLength={3} maxLength={150} className="field-input" /></div>
            <div><label htmlFor="order_id" className="field-label">Related order (optional)</label>
              <select id="order_id" name="order_id" className="field-input" defaultValue={pre.order}><option value="">None</option>{orders.map((x) => <option key={x.id} value={x.id}>{x.number}</option>)}</select></div>
            <div><label htmlFor="invoice_id" className="field-label">Related invoice (optional)</label>
              <select id="invoice_id" name="invoice_id" className="field-input" defaultValue={pre.invoice}><option value="">None</option>{invoices.map((x) => <option key={x.id} value={x.id}>{x.number}</option>)}</select></div>
            <div className="sm:col-span-2"><label htmlFor="body" className="field-label">Message</label><textarea id="body" name="body" required rows={6} maxLength={4000} className="field-input" /></div>
          </div>
        </Panel>
        <button className="btn-primary w-full sm:w-auto">Send ticket</button>
      </form>
    </>
  );
}
