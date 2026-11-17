import { Flash } from "@/components/admin/Flash";
import { Badge, PageHeader, Panel } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dispatchNow, retryOutbox } from "../actions";

export const metadata = { title: "Email outbox" };

type Row = { id: string; kind: string; to_email: string; subject: string; status: string; attempts: number; max_attempts: number; next_attempt_at: string; last_error: string | null; sent_at: string | null; created_at: string };
const when = (v: string) => new Date(v).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "short" });
const TONE: Record<string, "green" | "amber" | "red" | "grey"> = { sent: "green", pending: "amber", sending: "amber", failed: "red" };

export default async function OutboxPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  await requirePermission("automation.manage", "automation");
  const sb = await createSupabaseServerClient();
  const { data } = await sb.from("notification_outbox").select("id, kind, to_email, subject, status, attempts, max_attempts, next_attempt_at, last_error, sent_at, created_at").order("created_at", { ascending: false }).limit(100);
  const rows = (data ?? []) as Row[];
  return (
    <>
      <PageHeader title="Email outbox" description="Emails queued by automations. Failed sends retry automatically (5, 10, 20 minutes and so on) and are reported to administrators when they run out of attempts." actions={
        <form action={dispatchNow}><button className="btn-primary px-4 py-2 text-sm">Send queued emails now</button></form>
      } />
      <Flash ok={sp.ok} error={sp.error} />
      <Panel>
        {rows.length === 0 ? <p className="text-sm text-grey-500">Nothing has been queued. Emails are only queued while email automation is switched on in the Control Centre.</p> : (
          <ul className="divide-y divide-grey-200">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="break-words font-semibold text-navy">{r.subject}</p>
                  <p className="break-all text-sm text-charcoal">To {r.to_email} <span className="text-xs text-grey-500">({r.kind})</span></p>
                  <p className="text-xs text-grey-500">Queued {when(r.created_at)} · attempts {r.attempts}/{r.max_attempts}{r.status === "pending" ? ` · next ${when(r.next_attempt_at)}` : ""}{r.sent_at ? ` · sent ${when(r.sent_at)}` : ""}</p>
                  {r.last_error && <p className="mt-1 break-words text-sm text-red-800">{r.last_error}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={TONE[r.status] ?? "grey"}>{r.status}</Badge>
                  {r.status === "failed" && (
                    <form action={retryOutbox}><input type="hidden" name="id" value={r.id} /><button className="btn-outline px-3 py-1.5 text-sm">Retry</button></form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
