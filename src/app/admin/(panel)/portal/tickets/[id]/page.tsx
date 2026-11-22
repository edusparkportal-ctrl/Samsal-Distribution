import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, PageHeader, Panel } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Flash } from "@/components/admin/Flash";
import { isUuid } from "@/lib/admin/forms";
import { assignToMe, setTicketStatus, staffReply } from "../actions";

export const metadata = { title: "Support ticket" };
type Msg = { id: string; author_type: "customer" | "staff"; body: string; internal: boolean; created_at: string; author_name: string | null };
const STATUSES: [string, string][] = [["open", "Open"], ["in_progress", "In progress"], ["awaiting_customer", "Awaiting customer"], ["resolved", "Resolved"], ["closed", "Closed"]];
const when = (v: string) => new Date(v).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "short" });

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const staff = await requirePermission("portal.view", "portal");
  if (!isUuid(id)) notFound();
  const sb = await createSupabaseServerClient();
  const { data: t } = await sb.from("support_tickets")
    .select("id, reference, subject, category, status, assigned_to, created_at, order:sales_orders(id, number), invoice:invoices(id, number), customer:customers(id, company_name, contact_name, email, phone), assignee:profiles!support_tickets_assigned_to_fkey(full_name)")
    .eq("id", id).maybeSingle();
  if (!t) notFound();
  const { data: msgs } = await sb.from("support_messages").select("id, author_type, body, internal, created_at, author_name").eq("ticket_id", id).order("created_at");
  const manage = staff.isSuper || staff.has("portal.manage");
  const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
  const c = one(t.customer as never) as { company_name: string | null; contact_name: string; email: string | null; phone: string | null } | null;
  const order = one(t.order as never) as { id: string; number: string } | null;
  const invoice = one(t.invoice as never) as { id: string; number: string } | null;
  const assignee = one(t.assignee as never) as { full_name: string | null } | null;
  return (
    <>
      <p className="mb-4 text-sm"><Link href="/admin/portal/tickets" className="font-semibold text-teal-dark underline">← All tickets</Link></p>
      <PageHeader title={t.subject as string} description={`${t.reference} · ${t.category} · Opened ${when(t.created_at as string)}`} actions={<Badge tone="navy">{STATUSES.find(([v]) => v === t.status)?.[1] ?? String(t.status)}</Badge>} />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {((msgs ?? []) as unknown as Msg[]).map((m) => {
            return (
              <div key={m.id} className={`rounded-lg border p-4 text-sm ${m.internal ? "border-amber/60 bg-amber/10" : m.author_type === "customer" ? "border-grey-200 bg-white" : "border-teal/30 bg-teal/5"}`}>
                <p className="mb-1 text-xs font-semibold text-grey-500">{m.author_type === "customer" ? (c?.contact_name ?? "Customer") : m.author_name ?? "Staff"} · {when(m.created_at)}{m.internal ? " · INTERNAL NOTE (customer cannot see)" : ""}</p>
                <p className="whitespace-pre-line break-words text-charcoal">{m.body}</p>
              </div>
            );
          })}
          {manage && (
            <Panel title="Reply">
              <form action={staffReply} className="space-y-3">
                <input type="hidden" name="ticket_id" value={id} />
                <label htmlFor="body" className="sr-only">Message</label>
                <textarea id="body" name="body" required rows={4} maxLength={4000} className="field-input" />
                <label className="flex items-center gap-2 text-sm text-charcoal"><input type="checkbox" name="internal" /> Internal note only (the customer will not see it)</label>
                <button className="btn-primary">Send</button>
              </form>
            </Panel>
          )}
        </div>
        <div className="space-y-6">
          <Panel title="Customer">
            <p className="text-sm font-semibold text-navy">{c?.company_name || c?.contact_name}</p>
            <p className="text-sm text-charcoal">{c?.contact_name}</p>
            {c?.email && <p className="text-sm text-charcoal">{c.email}</p>}
            {c?.phone && <p className="text-sm text-charcoal">{c.phone}</p>}
            {(order || invoice) && <p className="mt-3 text-sm">About: {order && <Link href="/admin/orders/sales-orders" className="font-semibold text-teal-dark underline">{order.number}</Link>}{order && invoice && " · "}{invoice && <Link href={`/admin/finance/invoices/${invoice.id}`} className="font-semibold text-teal-dark underline">{invoice.number}</Link>}</p>}
            <p className="mt-3 text-xs text-grey-500">Assigned to: {assignee?.full_name ?? (t.assigned_to ? "a colleague" : "nobody")}</p>
          </Panel>
          {manage && (
            <Panel title="Manage">
              <form action={setTicketStatus} className="space-y-2">
                <input type="hidden" name="ticket_id" value={id} />
                <label htmlFor="status" className="field-label">Status</label>
                <select id="status" name="status" defaultValue={t.status as string} className="field-input">{STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                <button className="btn-outline w-full">Update status</button>
              </form>
              <form action={assignToMe} className="mt-3"><input type="hidden" name="ticket_id" value={id} /><button className="btn-outline w-full">Assign to me</button></form>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
