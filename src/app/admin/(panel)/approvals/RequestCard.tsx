import Link from "next/link";
import { Badge } from "@/components/admin/ui";
import { cancelRequest, decide } from "./actions";

export type ApprovalRow = {
  id: string; subject: string; title: string; summary: string | null; link: string | null; amount: number | null; status: string;
  current_step: number; steps: { step_no: number; label: string }[]; requested_by: string | null; created_at: string;
};

const TONE = { pending: "amber", approved: "green", rejected: "red", cancelled: "grey" } as const;
const when = (v: string) => new Date(v).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "short" });

export function RequestCard({ r, who, canDecide, canCancel }: { r: ApprovalRow; who: string; canDecide: boolean; canCancel: boolean }) {
  const steps = Array.isArray(r.steps) ? r.steps : [];
  return (
    <li className="rounded border border-grey-200 bg-white p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-semibold text-navy">{r.title} <Badge tone={TONE[r.status as keyof typeof TONE] ?? "grey"}>{r.status}</Badge></p>
          {r.summary && <p className="mt-0.5 break-words text-sm text-charcoal">{r.summary}</p>}
          <p className="mt-1 text-xs text-grey-500">Requested by {who} · {when(r.created_at)}{r.amount ? ` · amount ${Number(r.amount).toLocaleString("en-KE")}` : ""}</p>
          {steps.length > 0 && (
            <p className="mt-1 text-xs text-grey-500">
              {steps.map((s) => `${s.step_no}. ${s.label}`).join("  →  ")}{r.status === "pending" ? ` (waiting at step ${r.current_step})` : ""}
            </p>
          )}
        </div>
        {r.link && <Link href={r.link} className="shrink-0 rounded border border-navy px-3 py-1.5 text-sm font-medium text-navy hover:bg-navy hover:text-white">View record</Link>}
      </div>
      {canDecide && (
        <form action={decide} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <input type="hidden" name="id" value={r.id} />
          <label className="min-w-0 flex-1 text-sm">
            <span className="mb-1 block text-xs font-medium text-grey-500">Comment (required if you reject)</span>
            <input name="comment" maxLength={1000} className="w-full rounded border border-grey-300 px-3 py-2 text-sm" />
          </label>
          <button name="decision" value="approved" className="btn-primary px-4 py-2 text-sm">Approve</button>
          <button name="decision" value="rejected" className="rounded border border-red-600 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50">Reject</button>
        </form>
      )}
      {canCancel && (
        <form action={cancelRequest} className="mt-3"><input type="hidden" name="id" value={r.id} /><button className="text-sm font-medium text-red-700 underline underline-offset-2">Cancel this request</button></form>
      )}
    </li>
  );
}
