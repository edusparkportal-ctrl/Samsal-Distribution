import Link from "next/link";
import { Plus } from "lucide-react";
import { Flash } from "@/components/admin/Flash";
import { Badge, PageHeader, Panel } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { day, money } from "@/lib/finance/format";
import { invoiceFromOrder } from "./actions";

export const metadata = { title: "Invoices" };
export const dynamic = "force-dynamic";

type Inv = { id: string; number: string; customer_id: string; status: string; currency: string; issue_date: string | null; due_date: string | null };
type Tot = { invoice_id: string; total: number; paid: number; balance: number };
const TONE = { draft: "grey", issued: "amber", partially_paid: "amber", paid: "green", void: "red" } as const;
const FILTERS = ["", "draft", "issued", "partially_paid", "paid", "void"];

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; status?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("finance.view", "finance");
  const canInvoice = ctx.has("finance.invoices") || ctx.isSuper;
  const sb = await createSupabaseServerClient();
  let q = sb.from("invoices").select("id, number, customer_id, status, currency, issue_date, due_date").is("deleted_at", null).order("created_at", { ascending: false }).limit(200);
  if (sp.status && FILTERS.includes(sp.status)) q = q.eq("status", sp.status);
  const [{ data }, { data: tots }, { data: cust }] = await Promise.all([
    q, sb.from("invoice_totals").select("invoice_id, total, paid, balance"), sb.from("customers").select("id, company_name, contact_name"),
  ]);
  const tot = new Map(((tots ?? []) as Tot[]).map((t) => [t.invoice_id, t]));
  const cn = new Map((cust ?? []).map((c: { id: string; company_name: string | null; contact_name: string }) => [c.id, c.company_name || c.contact_name]));
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });

  let orders: { id: string; number: string; customer_id: string }[] = [];
  if (canInvoice && ctx.moduleEnabled("orders")) {
    const [{ data: o }, { data: invd }] = await Promise.all([
      sb.from("sales_orders").select("id, number, customer_id").eq("status", "delivered").is("deleted_at", null).limit(50),
      sb.from("invoices").select("sales_order_id").not("sales_order_id", "is", null).neq("status", "void"),
    ]);
    const done = new Set((invd ?? []).map((i: { sales_order_id: string }) => i.sales_order_id));
    orders = ((o ?? []) as typeof orders).filter((x) => !done.has(x.id));
  }

  return (
    <>
      <PageHeader title="Invoices" description="Customer invoices (money owed to you). Invoices start as drafts and only become real when a person issues them. Payments are recorded when you receive them; this system does not collect money."
        actions={canInvoice && <Link href="/admin/finance/invoices/new" className="btn-primary"><Plus aria-hidden="true" size={16} /> New invoice</Link>} />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="space-y-5">
        {orders.length > 0 && (
          <Panel title="Delivered orders without an invoice">
            <ul className="space-y-2 text-sm">
              {orders.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span><strong className="text-navy">{o.number}</strong> · {cn.get(o.customer_id) ?? "Customer"}</span>
                  <form action={invoiceFromOrder}><input type="hidden" name="order" value={o.id} /><button className="btn-outline px-3 py-1.5 text-sm">Create draft invoice</button></form>
                </li>
              ))}
            </ul>
          </Panel>
        )}
        <nav className="flex flex-wrap gap-2 text-sm">
          {FILTERS.map((s) => <a key={s || "all"} href={s ? `/admin/finance/invoices?status=${s}` : "/admin/finance/invoices"} className={`rounded border px-3 py-1 ${(sp.status ?? "") === s ? "border-navy bg-navy text-white" : "border-grey-300 text-navy hover:bg-grey"}`}>{s ? s.replace("_", " ").replace(/^./, (c) => c.toUpperCase()) : "All"}</a>)}
        </nav>
        <Panel>
          {(data ?? []).length === 0 ? <p className="text-sm text-grey-500">No invoices.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead><tr className="border-b border-grey-200 text-xs uppercase text-grey-500"><th className="py-2 pr-3">Number</th><th className="pr-3">Customer</th><th className="pr-3">Due</th><th className="pr-3 text-right">Total</th><th className="pr-3 text-right">Balance</th><th>Status</th></tr></thead>
                <tbody>
                  {((data ?? []) as Inv[]).map((i) => {
                    const t = tot.get(i.id);
                    const overdue = (i.status === "issued" || i.status === "partially_paid") && i.due_date && i.due_date < today;
                    return (
                      <tr key={i.id} className="border-b border-grey-100">
                        <td className="py-2 pr-3"><Link href={`/admin/finance/invoices/${i.id}`} className="font-semibold text-navy underline underline-offset-2">{i.number}</Link></td>
                        <td className="pr-3">{cn.get(i.customer_id) ?? ""}</td>
                        <td className="pr-3">{day(i.due_date)}{overdue ? <> <Badge tone="red">overdue</Badge></> : null}</td>
                        <td className="pr-3 text-right">{t ? money(t.total, i.currency) : ""}</td>
                        <td className="pr-3 text-right">{t && i.status !== "draft" && i.status !== "void" ? money(t.balance, i.currency) : ""}</td>
                        <td><Badge tone={TONE[i.status as keyof typeof TONE] ?? "grey"}>{i.status.replace("_", " ")}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
