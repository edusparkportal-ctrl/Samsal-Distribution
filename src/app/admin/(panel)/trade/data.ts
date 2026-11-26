import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DocType } from "@/lib/trade";

export async function loadTypes(): Promise<DocType[]> {
  const sb = await createSupabaseServerClient();
  const { data } = await sb.from("doc_types").select("*").order("sort_order");
  return (data ?? []) as DocType[];
}

/** Lists used by the document form. All reads go through RLS. */
export async function loadFormLists() {
  const sb = await createSupabaseServerClient();
  const [s, c, w, v, u] = await Promise.all([
    sb.from("suppliers").select("id, name").is("deleted_at", null).order("name").limit(500),
    sb.from("customers").select("id, company_name, contact_name").is("deleted_at", null).order("company_name").limit(500),
    sb.from("warehouses").select("id, name").eq("is_active", true).order("name"),
    sb.from("product_variants").select("id, name, sku, product:products(name)").eq("is_active", true).order("name").limit(800),
    sb.from("units").select("id, name").order("name").limit(200),
  ]);
  const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? x[0] ?? null : x);
  return {
    suppliers: (s.data ?? []).map((x) => ({ id: x.id as string, name: x.name as string })),
    customers: (c.data ?? []).map((x) => ({ id: x.id as string, name: (x.company_name || x.contact_name || "Customer") as string })),
    warehouses: (w.data ?? []).map((x) => ({ id: x.id as string, name: x.name as string })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    variants: (v.data ?? []).map((x: any) => ({ id: x.id as string, name: `${one<any>(x.product)?.name ?? ""} ${x.name}${x.sku ? ` (${x.sku})` : ""}`.trim() })),
    units: (u.data ?? []).map((x) => ({ id: x.id as string, name: x.name as string })),
  };
}
