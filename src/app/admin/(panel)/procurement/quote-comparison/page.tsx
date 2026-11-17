import Link from "next/link";
import { Badge, PageHeader, Panel } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Supplier quote comparison" };
export const dynamic = "force-dynamic";

type Q = {
  supplier_quote_id: string; enquiry_id: string; supplier_name: string | null; product_text: string; item_key: string; currency: string;
  unit_price: number | string; quantity: number | string | null; additional_costs: number | string; landed_unit_cost: number | string;
  valid_until: string | null; expired: boolean; value_rank: number | string | null; quotes_compared: number | string | null; best_landed_unit_cost: number | string | null;
  extras_not_spread: boolean;
};

const num = (v: number | string | null | undefined) => (v == null ? 0 : Number(v));
const money = (v: number | string, cur: string) => `${cur} ${num(v).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function QuoteComparisonPage() {
  await requirePermission("purchasing.view", "procurement");
  const sb = await createSupabaseServerClient();
  const [{ data }, { data: enqs }] = await Promise.all([
    sb.from("supplier_quote_comparison").select("*").order("enquiry_id").order("item_key").order("landed_unit_cost"),
    sb.from("enquiries").select("id, reference"),
  ]);
  const refs: Record<string, string> = {};
  (enqs ?? []).forEach((e: { id: string; reference: string }) => (refs[e.id] = e.reference));
  const rows = (data ?? []) as Q[];

  // Group: enquiry + currency + item
  const groups = new Map<string, Q[]>();
  for (const r of rows) {
    const k = `${r.enquiry_id}|${r.currency}|${r.item_key}`;
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }

  return (
    <>
      <PageHeader title="Supplier quote comparison" description="Quotes recorded against the same enquiry, currency and item, ranked by landed cost per unit (unit price plus extra costs spread over the quoted quantity). Expired quotes are shown but never ranked. Quotes in different currencies are not compared. Price is not the only thing that matters: check validity, delivery and the supplier before you decide." />
      {groups.size === 0 ? (
        <Panel><p className="text-sm text-grey-500">Nothing to compare yet. Record supplier quotes against an enquiry under Supplier quotes and they will appear here.</p></Panel>
      ) : (
        <div className="space-y-5">
          {[...groups.entries()].map(([k, list]) => {
            const first = list[0];
            const live = list.filter((x) => !x.expired);
            return (
              <Panel key={k}>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold text-navy">{first.product_text}</h2>
                  <Badge tone="teal">{refs[first.enquiry_id] ?? "Enquiry"}</Badge>
                  <Badge tone="grey">{first.currency}</Badge>
                  {live.length < 2 && <span className="text-xs text-grey-500">Needs at least two valid quotes to compare</span>}
                </div>
                <ul className="space-y-2">
                  {list.map((q) => {
                    const best = !q.expired && num(q.value_rank) === 1 && live.length >= 2;
                    const over = !q.expired && num(q.best_landed_unit_cost) > 0 ? ((num(q.landed_unit_cost) - num(q.best_landed_unit_cost)) / num(q.best_landed_unit_cost)) * 100 : 0;
                    return (
                      <li key={q.supplier_quote_id} className={`rounded-md border p-3 ${best ? "border-teal bg-teal-tint" : "border-grey-200"} ${q.expired ? "opacity-60" : ""}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold text-navy">{q.supplier_name ?? "Supplier"} {best && <Badge tone="green">Best value</Badge>} {q.expired && <Badge tone="red">Expired</Badge>}</p>
                          <p className="text-lg font-bold text-navy">{money(q.landed_unit_cost, q.currency)} <span className="text-xs font-normal text-grey-500">per unit, landed</span></p>
                        </div>
                        <p className="mt-1 text-sm text-charcoal">
                          Unit price {money(q.unit_price, q.currency)}
                          {num(q.additional_costs) > 0 && <> · extra costs {money(q.additional_costs, q.currency)}{q.extras_not_spread ? " (quantity missing, not spread over units)" : ""}</>}
                          {q.quantity != null && <> · quantity {num(q.quantity)}</>}
                          {q.valid_until && <> · valid until {q.valid_until}</>}
                          {!q.expired && !best && over > 0 && live.length >= 2 && <> · <strong>{over.toFixed(1)}% above the best</strong></>}
                        </p>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 text-xs"><Link href="/admin/procurement/supplier-quotes" className="text-teal-dark hover:underline">Manage supplier quotes</Link></p>
              </Panel>
            );
          })}
        </div>
      )}
    </>
  );
}
