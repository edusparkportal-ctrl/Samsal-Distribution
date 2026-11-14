import { Badge, PageHeader, Panel } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Stock balances" };
type Row = { variant_id: string; warehouse_id: string; quantity_on_hand: number; reorder_level: number | null; needs_reorder: boolean };

export default async function BalancesPage() {
  await requirePermission("inventory.view", "inventory");
  const sb = await createSupabaseServerClient();
  const { data } = await sb.from("inventory_balances").select("variant_id, warehouse_id, quantity_on_hand, reorder_level, needs_reorder").limit(1000);
  const rows = (data ?? []) as Row[];
  const [v, w] = await Promise.all([
    sb.from("product_variants").select("id, name, sku").in("id", [...new Set(rows.map((r) => r.variant_id))]),
    sb.from("warehouses").select("id, name").in("id", [...new Set(rows.map((r) => r.warehouse_id))]),
  ]);
  const vn = Object.fromEntries((v.data ?? []).map((x: { id: string; name: string; sku: string | null }) => [x.id, x.sku ? `${x.name} (${x.sku})` : x.name]));
  const wn = Object.fromEntries((w.data ?? []).map((x: { id: string; name: string }) => [x.id, x.name]));
  rows.sort((a, b) => Number(b.needs_reorder) - Number(a.needs_reorder) || (vn[a.variant_id] ?? "").localeCompare(vn[b.variant_id] ?? ""));
  return (
    <>
      <PageHeader title="Stock balances" description="Calculated from the stock movement records, so they can never drift from the history." />
      <Panel>
        {rows.length === 0 ? <p className="text-sm text-grey-500">No stock has been recorded yet. Add a warehouse and a stock item, then record a receipt under Stock movements.</p> : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-grey-500"><tr><th className="py-2 pr-3">Stock item</th><th className="pr-3">Warehouse</th><th className="pr-3 text-right">On hand</th><th className="pr-3 text-right">Reorder at</th><th /></tr></thead>
            <tbody className="divide-y divide-grey-200">
              {rows.map((r) => (
                <tr key={`${r.variant_id}-${r.warehouse_id}`}><td className="py-2.5 pr-3 font-medium text-navy">{vn[r.variant_id] ?? "-"}</td><td className="pr-3">{wn[r.warehouse_id] ?? "-"}</td>
                  <td className="pr-3 text-right">{Number(r.quantity_on_hand)}</td><td className="pr-3 text-right">{r.reorder_level ?? "-"}</td><td>{r.needs_reorder && <Badge tone="amber">Reorder</Badge>}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </>
  );
}
