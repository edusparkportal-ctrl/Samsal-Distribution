import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCustomer } from "@/lib/portal/session";
import { PageHeader } from "@/components/admin/ui";
import { PortalFlash } from "@/components/portal/PortalFlash";
import { ProductCard } from "@/components/portal/ProductCard";
import type { CatalogueRow, CategoryRow } from "@/lib/portal/types";

export const metadata = { title: "Catalogue" };
const PAGE = 24;

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string; page?: string; ok?: string; error?: string }> }) {
  const sp = await searchParams;
  await requireCustomer();
  const q = (sp.q ?? "").slice(0, 80);
  const cat = /^[0-9a-f-]{36}$/i.test(sp.cat ?? "") ? sp.cat! : null;
  const page = Math.min(Math.max(Number.parseInt(sp.page ?? "1", 10) || 1, 1), 500);
  const supabase = await createSupabaseServerClient();
  const [{ data: rows }, { data: cats }] = await Promise.all([
    supabase.rpc("portal_catalog", { p_search: q || null, p_category: cat, p_limit: PAGE, p_offset: (page - 1) * PAGE }),
    supabase.rpc("portal_categories"),
  ]);
  const products = (rows as CatalogueRow[] | null) ?? [];
  const categories = (cats as CategoryRow[] | null) ?? [];
  const total = Number(products[0]?.total_count ?? 0);
  const pages = Math.max(Math.ceil(total / PAGE), 1);
  const qs = (over: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const v = { q: q || null, cat, page: null as string | null, ...over };
    Object.entries(v).forEach(([k, val]) => val && p.set(k, val));
    const s = p.toString();
    return `/portal/catalogue${s ? `?${s}` : ""}`;
  };
  const here = qs({ page: page > 1 ? String(page) : null });

  return (
    <>
      <PageHeader title="Catalogue" description="Your prices and current availability. Prices exclude VAT unless your invoice states otherwise." />
      <PortalFlash ok={sp.ok} error={sp.error} />
      <form action="/portal/catalogue" method="get" role="search" className="mb-4 flex gap-2">
        {cat && <input type="hidden" name="cat" value={cat} />}
        <label htmlFor="q" className="sr-only">Search products</label>
        <input id="q" name="q" type="search" defaultValue={q} placeholder="Search products, packs or categories" className="field-input" />
        <button className="btn-primary shrink-0">Search</button>
      </form>
      <div className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-2 whitespace-nowrap pb-1">
          <li><Link href={qs({ cat: null })} aria-current={!cat ? "true" : undefined} className={`inline-flex min-h-[40px] items-center rounded-full border px-4 text-sm font-semibold ${!cat ? "border-navy bg-navy text-white" : "border-grey-300 bg-white text-navy hover:border-navy"}`}>All</Link></li>
          {categories.filter((c) => Number(c.product_count) > 0).map((c) => (
            <li key={c.id}><Link href={qs({ cat: c.id })} aria-current={cat === c.id ? "true" : undefined} className={`inline-flex min-h-[40px] items-center rounded-full border px-4 text-sm font-semibold ${cat === c.id ? "border-navy bg-navy text-white" : "border-grey-300 bg-white text-navy hover:border-navy"}`}>{c.name}</Link></li>
          ))}
        </ul>
      </div>
      {products.length === 0 ? (
        <div className="card p-8 text-center text-sm text-charcoal">
          <p>No products match{q ? ` “${q}”` : ""}.</p>
          <p className="mt-2"><Link href="/portal/catalogue" className="font-semibold text-teal-dark underline">Clear the search</Link> or <Link href={q ? `/portal/quotes/new?name=${encodeURIComponent(q.slice(0, 150))}` : "/portal/quotes/new"} className="font-semibold text-teal-dark underline">request a quotation</Link> for something specific.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((p) => <li key={p.product_id} className="flex"><ProductCard row={p} back={here} /></li>)}
        </ul>
      )}
      {pages > 1 && (
        <nav aria-label="Pages" className="mt-8 flex items-center justify-between text-sm">
          {page > 1 ? <Link href={qs({ page: String(page - 1) })} className="btn-outline">Previous</Link> : <span />}
          <span className="text-grey-500">Page {page} of {pages}</span>
          {page < pages ? <Link href={qs({ page: String(page + 1) })} className="btn-outline">Next</Link> : <span />}
        </nav>
      )}
    </>
  );
}
