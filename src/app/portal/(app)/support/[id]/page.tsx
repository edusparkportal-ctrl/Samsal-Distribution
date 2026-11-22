import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCustomer } from "@/lib/portal/session";
import { PageHeader, Panel, Badge } from "@/components/admin/ui";
import { PortalFlash } from "@/components/portal/PortalFlash";
import { formatDateTime, ticketStatus, TICKET_CATEGORIES } from "@/lib/portal/format";
import { isUuid } from "@/lib/admin/forms";
import type { TicketDetail } from "@/lib/portal/types";
import { closeTicket, replyTicket } from "../actions";

export const metadata = { title: "Support ticket" };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  await requireCustomer();
  if (!isUuid(id)) notFound();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("portal_ticket", { p_ticket: id });
  const t = data as TicketDetail | null;
  if (!t) notFound();
  const st = ticketStatus(t.status);
  const cat = TICKET_CATEGORIES.find(([v]) => v === t.category)?.[1] ?? t.category;
  return (
    <>
      <p className="mb-4 text-sm"><Link href="/portal/support" className="font-semibold text-teal-dark underline underline-offset-2">← All tickets</Link></p>
      <PageHeader title={t.subject} description={`${t.reference} · ${cat} · Opened ${formatDateTime(t.created_at)}`} actions={<Badge tone={st.tone}>{st.label}</Badge>} />
      <PortalFlash ok={sp.ok} error={sp.error} />
      {(t.order_id || t.invoice_id) && (
        <p className="mb-4 text-sm text-charcoal">About: {t.order_id && <Link href={`/portal/orders/${t.order_id}`} className="font-semibold text-teal-dark underline">{t.order_number}</Link>}{t.order_id && t.invoice_id && " · "}{t.invoice_id && <Link href={`/portal/invoices/${t.invoice_id}`} className="font-semibold text-teal-dark underline">{t.invoice_number}</Link>}</p>
      )}
      <div className="space-y-3">
        {t.messages.map((m) => (
          <div key={m.id} className={`max-w-[92%] rounded-lg border p-4 text-sm sm:max-w-[80%] ${m.from === "customer" ? "ml-auto border-teal/30 bg-teal/5" : "border-grey-200 bg-white"}`}>
            <p className="mb-1 text-xs font-semibold text-grey-500">{m.author} · {formatDateTime(m.created_at)}</p>
            <p className="whitespace-pre-line break-words text-charcoal">{m.body}</p>
          </div>
        ))}
      </div>
      {t.status !== "closed" ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Panel title={t.status === "resolved" ? "Not fixed? Reply to reopen" : "Reply"}>
              <form action={replyTicket} className="space-y-3">
                <input type="hidden" name="ticket_id" value={t.id} />
                <label htmlFor="body" className="sr-only">Your message</label>
                <textarea id="body" name="body" required rows={4} maxLength={4000} className="field-input" />
                <button className="btn-primary w-full sm:w-auto">Send reply</button>
              </form>
            </Panel>
          </div>
          <form action={closeTicket} className="self-start">
            <input type="hidden" name="ticket_id" value={t.id} />
            <button className="btn-outline w-full">Close this ticket</button>
            <p className="mt-2 text-xs text-grey-500">Close it once your problem is sorted. You can always open a new one.</p>
          </form>
        </div>
      ) : (
        <p className="mt-6 rounded border border-grey-200 bg-grey-100 p-4 text-sm text-charcoal">This ticket is closed. <Link href="/portal/support/new" className="font-semibold text-teal-dark underline">Open a new ticket</Link> if you still need help.</p>
      )}
    </>
  );
}
