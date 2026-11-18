import { Flash } from "@/components/admin/Flash";
import { Badge, PageHeader, Panel } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { acknowledgeReview, cancelLeave, clockIn, clockOut, requestLeave } from "./actions";

export const metadata = { title: "My HR" };
export const dynamic = "force-dynamic";

type Bal = { leave_type_id: string; entitlement: number; taken: number; pending: number; remaining: number | null };
type LT = { id: string; name: string; days_per_year: number };
type LR = { id: string; leave_type_id: string; start_date: string; end_date: string; days: number; status: string };
const TONE = { pending: "amber", approved: "green", rejected: "red", cancelled: "grey" } as const;
const d = (v: string) => new Date(v + "T00:00:00").toLocaleDateString("en-KE", { dateStyle: "medium" });
const tm = (v: string | null) => (v ? new Date(v).toLocaleTimeString("en-KE", { timeZone: "Africa/Nairobi", hour: "2-digit", minute: "2-digit" }) : "");

export default async function MyHr({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  await requirePermission("people.self", "people");
  const sb = await createSupabaseServerClient();
  const { data: meId } = await sb.rpc("my_employee_id");
  if (!meId) {
    return (
      <>
        <PageHeader title="My HR" />
        <Panel><p className="text-sm text-charcoal">Your sign-in account is not linked to an employee record yet. Ask HR to link it (Employees, then the Sign-in account field).</p></Panel>
      </>
    );
  }
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
  const [types, bal, leaves, att, tasks, reviews, emp] = await Promise.all([
    sb.from("leave_types").select("id, name, days_per_year").eq("is_active", true).order("name"),
    sb.from("leave_balances").select("leave_type_id, entitlement, taken, pending, remaining").eq("employee_id", meId),
    sb.from("leave_requests").select("id, leave_type_id, start_date, end_date, days, status").eq("employee_id", meId).order("start_date", { ascending: false }).limit(20),
    sb.from("attendance_records").select("check_in, check_out, status").eq("employee_id", meId).eq("work_date", today).maybeSingle(),
    sb.from("onboarding_tasks").select("id, label, due_date, is_done").eq("employee_id", meId).order("due_date"),
    sb.from("performance_reviews").select("id, period_label, review_date, rating, strengths, improvements, goals, status").eq("employee_id", meId).neq("status", "draft").order("created_at", { ascending: false }),
    sb.from("employees").select("full_name, job_title, employee_no").eq("id", meId).maybeSingle(),
  ]);
  const lt = (types.data ?? []) as LT[];
  const nameOf = new Map(lt.map((t) => [t.id, t.name]));
  const a = att.data as { check_in: string | null; check_out: string | null; status: string } | null;
  const openTasks = (tasks.data ?? []).filter((t: { is_done: boolean }) => !t.is_done);

  return (
    <>
      <PageHeader title="My HR" description={`${(emp.data as { full_name?: string } | null)?.full_name ?? ""}. Your own leave, attendance, tasks and reviews. Only you and the people authorised to manage HR can see this information.`} />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Today">
          <p className="mb-3 text-sm text-charcoal">{a ? <>Checked in at {tm(a.check_in)} <Badge tone={a.status === "late" ? "amber" : "green"}>{a.status}</Badge>{a.check_out ? <> · checked out at {tm(a.check_out)}</> : null}</> : "You have not checked in today."}</p>
          <div className="flex gap-2">
            {!a && <form action={clockIn}><button className="btn-primary px-4 py-2 text-sm">Check in</button></form>}
            {a && !a.check_out && <form action={clockOut}><button className="btn-outline px-4 py-2 text-sm">Check out</button></form>}
          </div>
        </Panel>

        <Panel title="Leave balances this year">
          {lt.length === 0 ? <p className="text-sm text-grey-500">HR has not set up any leave types yet.</p> : (
            <ul className="divide-y divide-grey-200 text-sm">
              {((bal.data ?? []) as Bal[]).map((b) => (
                <li key={b.leave_type_id} className="flex items-center justify-between gap-2 py-2">
                  <span className="font-medium text-navy">{nameOf.get(b.leave_type_id) ?? "Leave"}</span>
                  <span className="text-charcoal">{b.entitlement > 0 ? `${b.remaining} of ${b.entitlement} days left` : "No fixed limit"} · {b.taken} taken{b.pending > 0 ? ` · ${b.pending} awaiting approval` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Request leave">
          {lt.length === 0 ? <p className="text-sm text-grey-500">Leave cannot be requested until HR sets up leave types.</p> : (
            <form action={requestLeave} className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm sm:col-span-2"><span className="mb-1 block font-medium text-navy">Leave type</span>
                <select name="leave_type_id" required className="w-full rounded border border-grey-300 px-3 py-2">{lt.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
              <label className="text-sm"><span className="mb-1 block font-medium text-navy">First day</span><input type="date" name="start_date" required className="w-full rounded border border-grey-300 px-3 py-2" /></label>
              <label className="text-sm"><span className="mb-1 block font-medium text-navy">Last day</span><input type="date" name="end_date" required className="w-full rounded border border-grey-300 px-3 py-2" /></label>
              <label className="text-sm sm:col-span-2"><span className="mb-1 block font-medium text-navy">Reason (optional)</span><input name="reason" maxLength={1000} className="w-full rounded border border-grey-300 px-3 py-2" /></label>
              <p className="text-xs text-grey-500 sm:col-span-2">Working days (Monday to Friday) are counted for you. Public holidays are not subtracted automatically. Your line manager is asked to approve.</p>
              <div className="sm:col-span-2"><button className="btn-primary px-4 py-2 text-sm">Send request</button></div>
            </form>
          )}
        </Panel>

        <Panel title="My leave requests">
          {(leaves.data ?? []).length === 0 ? <p className="text-sm text-grey-500">No leave requested yet.</p> : (
            <ul className="divide-y divide-grey-200 text-sm">
              {((leaves.data ?? []) as LR[]).map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span><span className="font-medium text-navy">{nameOf.get(l.leave_type_id) ?? "Leave"}</span> · {d(l.start_date)} to {d(l.end_date)} · {l.days} day(s)</span>
                  <span className="flex items-center gap-2"><Badge tone={TONE[l.status as keyof typeof TONE] ?? "grey"}>{l.status}</Badge>
                    {(l.status === "pending" || l.status === "approved") && <form action={cancelLeave}><input type="hidden" name="id" value={l.id} /><button className="text-xs font-medium text-red-700 underline underline-offset-2">Cancel</button></form>}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {openTasks.length > 0 && (
          <Panel title="My onboarding tasks">
            <ul className="space-y-1 text-sm">{openTasks.map((t: { id: string; label: string; due_date: string | null }) => <li key={t.id}>{t.label}{t.due_date ? <span className="text-grey-500"> · due {d(t.due_date)}</span> : null}</li>)}</ul>
            <p className="mt-2 text-xs text-grey-500">HR ticks these off once they are complete.</p>
          </Panel>
        )}

        {(reviews.data ?? []).length > 0 && (
          <Panel title="My performance reviews" className="lg:col-span-2">
            <ul className="space-y-4 text-sm">
              {(reviews.data ?? []).map((r: { id: string; period_label: string; rating: number | null; strengths: string | null; improvements: string | null; goals: string | null; status: string }) => (
                <li key={r.id} className="rounded border border-grey-200 p-3">
                  <p className="font-semibold text-navy">{r.period_label}{r.rating ? ` · rating ${r.rating}/5` : ""} <Badge tone={r.status === "acknowledged" ? "green" : "amber"}>{r.status === "acknowledged" ? "read" : "to read"}</Badge></p>
                  {r.strengths && <p className="mt-1"><strong>Strengths:</strong> {r.strengths}</p>}
                  {r.improvements && <p className="mt-1"><strong>To improve:</strong> {r.improvements}</p>}
                  {r.goals && <p className="mt-1"><strong>Goals:</strong> {r.goals}</p>}
                  {r.status === "submitted" && <form action={acknowledgeReview} className="mt-2"><input type="hidden" name="id" value={r.id} /><button className="btn-outline px-3 py-1.5 text-sm">I have read this review</button></form>}
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </>
  );
}
