import Link from "next/link";
import { Badge, PageHeader, Panel, Notice } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "M-Pesa payments" };

type Row = {
  id: string; status: string; amount: number; phone: string; mpesa_receipt: string | null; result_desc: string | null; created_at: string; completed_at: string | null;
  invoice: { id: string; number: string } | { id: string; number: string }[] | null;
  customer: { company_name: string | null; contact_name: string } | { company_name: string | null; contact_name: string }[] | null;
};
const TONE: Record<string, "green" | "amber" | "red" | "grey" | "teal"> = { succeeded: "green", pending: "teal", created: "grey", failed: "red", cancelled: "grey", needs_review: "amber" };
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
const mask = (p: string) => `${p.slice(0, 5)}****${p.slice(-3)}`;

export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  await requirePermission("portal.view", "portal");
  const sb = await createSupabaseServerClient();
  let q = sb.from("mpesa_payments").select("id, status, amount, phone, mpesa_receipt, result_desc, created_at, completed_at, invoice:invoices(id, number), customer:customers(company_name, contact_name)").order("created_at", { ascending: false }).limit(200);
  if (sp.status && sp.status in TONE) q = q.eq("status", sp.status);
  const { data, error } = await q;
  const rows = (data ?? []) as unknown as Row[];
  const review = rows.filter((r) => r.status === "needs_review").length;
  return (
    <>
      <PageHeader title="M-Pesa payments" description="Online payment requests from customers. Successful payments are applied to the invoice and the finance ledger automatically." />
      {error && <Notice tone="error">You do not have access to these records, or they could not be loaded.</Notice>}
      {review > 0 && <div className="mb-5"><Notice tone="warn">{review} payment{review === 1 ? "" : "s"} need{review === 1 ? "s" : ""} a person to check. Money may have been received but was not applied automatically (different amount, repeated receipt, or no receipt number). Confirm in your M-Pesa statement, then record the payment on the invoice in Finance.</Notice></div>}
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {["", "needs_review", "pending", "succeeded", "failed", "cancelled"].map((s) => (
          <Link key={s} href={s ? `/admin/portal/mpesa?status=${s}` : "/admin/portal/mpesa"} className={`rounded-full border px-3 py-1 font-semibold ${(sp.status ?? "") === s ? "border-navy bg-navy text-white" : "border-grey-300 bg-white text-navy"}`}>{s ? s.replace("_", " ") : "All"}</Link>
        ))}
      </div>
      <Panel>
        {rows.length === 0 ? <p className="text-sm text-charcoal">No M-Pesa requests yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr className="border-b border-grey-200 text-left text-xs uppercase tracking-wide text-grey-500"><th className="py-2 pr-3">When</th><th className="pr-3">Customer</th><th className="pr-3">Invoice</th><th className="pr-3 text-right">Amount</th><th className="pr-3">Phone</th><th className="pr-3">Receipt</th><th>Status</th></tr></thead>
              <tbody className="divide-y divide-grey-200">
                {rows.map((r) => {
                  const inv = one(r.invoice), c = one(r.customer);
                  return (
                    <tr key={r.id} className="align-top">
                      <td className="py-2 pr-3 whitespace-nowrap">{new Date(r.created_at).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "short" })}</td>
                      <td className="pr-3">{c?.company_name || c?.contact_name || "-"}</td>
                      <td className="pr-3">{inv ? <Link href={`/admin/finance/invoices/${inv.id}`} className="font-semibold text-teal-dark underline">{inv.number}</Link> : "-"}</td>
                      <td className="pr-3 text-right font-semibold">KES {Number(r.amount).toLocaleString("en-KE")}</td>
                      <td className="pr-3">{mask(r.phone)}</td>
                      <td className="pr-3">{r.mpesa_receipt ?? "-"}</td>
                      <td><Badge tone={TONE[r.status] ?? "grey"}>{r.status.replace("_", " ")}</Badge>{r.result_desc && <p className="mt-1 max-w-[22ch] text-xs text-grey-500">{r.result_desc}</p>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
