import Link from "next/link";
import { Badge, PageHeader, Panel } from "@/components/admin/ui";
import { requireStaff } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clearRead, markAllRead, markRead } from "./actions";

export const metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

type N = { id: string; title: string; body: string | null; link: string | null; severity: string; read_at: string | null; created_at: string };
const when = (v: string) => new Date(v).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "short" });

export default async function NotificationsPage() {
  await requireStaff();
  const sb = await createSupabaseServerClient();
  const { data } = await sb.from("notifications").select("id, title, body, link, severity, read_at, created_at").order("created_at", { ascending: false }).limit(100);
  const items = (data ?? []) as N[];
  const unread = items.filter((n) => !n.read_at).length;
  return (
    <>
      <PageHeader title="Notifications" description="Reminders and alerts from the automations, addressed to you. Only you can see these." actions={
        <>
          {unread > 0 && <form action={markAllRead}><button className="btn-outline px-3 py-2 text-sm">Mark all as read</button></form>}
          {items.some((n) => n.read_at) && <form action={clearRead}><button className="btn-outline px-3 py-2 text-sm">Clear read</button></form>}
        </>
      } />
      <Panel>
        {items.length === 0 ? <p className="text-sm text-grey-500">You have no notifications.</p> : (
          <ul className="divide-y divide-grey-200">
            {items.map((n) => (
              <li key={n.id} className={`flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between ${n.read_at ? "opacity-70" : ""}`}>
                <div className="min-w-0">
                  <p className="font-semibold text-navy">
                    {!n.read_at && <span aria-label="Unread" className="mr-2 inline-block h-2 w-2 rounded-full bg-amber align-middle" />}
                    {n.title} {n.severity !== "info" && <Badge tone={n.severity === "critical" ? "red" : "amber"}>{n.severity === "critical" ? "Urgent" : "Attention"}</Badge>}
                  </p>
                  {n.body && <p className="mt-0.5 whitespace-pre-line break-words text-sm text-charcoal">{n.body}</p>}
                  <p className="mt-0.5 text-xs text-grey-500">{when(n.created_at)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {n.link && <Link href={n.link} className="rounded border border-navy px-3 py-1.5 text-sm font-medium text-navy hover:bg-navy hover:text-white">Open</Link>}
                  {!n.read_at && <form action={markRead}><input type="hidden" name="id" value={n.id} /><button className="rounded border border-grey-300 px-3 py-1.5 text-sm text-navy hover:bg-grey">Mark read</button></form>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
