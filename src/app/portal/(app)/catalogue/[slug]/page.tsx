import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCustomer } from "@/lib/portal/session";
import { Badge } from "@/components/admin/ui";
import { PortalFlash } from "@/components/portal/PortalFlash";
import { AddToCart, Price, ProductImage } from "@/components/portal/ProductCard";
import { availability, formatQty } from "@/lib/portal/format";
import type { CatalogueRow } from "@/lib/portal/types";

export const metadata = { title: "Product" };

export default async function Page({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  await requireCustomer();
  if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(slug)) notFound();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("portal_catalog", { p_slug: slug, p_limit: 1 });
  const row = ((data as CatalogueRow[] | null) ?? [])[0];
  if (!row) notFound();
  const a = availability(row.availability);
  return (
    <>
      <p className="mb-4 text-sm"><Link href="/portal/catalogue" className="font-semibold text-teal-dark underline underline-offset-2">← Catalogue</Link></p>
      <PortalFlash ok={sp.ok} error={sp.error} />
      <div className="grid gap-6 md:grid-cols-2">
        <ProductImage row={row} className="aspect-[4/3] rounded-lg" />
        <div className="space-y-4">
          <div>
            {row.category_name && <p className="text-xs font-semibold uppercase tracking-wide text-grey-500">{row.category_name}</p>}
            <h1 className="text-2xl font-bold text-navy">{row.name}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2"><Badge tone={a.tone}>{a.label}</Badge>{row.packaging && <span className="text-sm text-charcoal">{row.packaging}</span>}</div>
          <Price row={row} />
          {row.orderable && <p className="text-sm text-grey-500">Minimum order {formatQty(row.min_order_qty)}{row.unit ? ` ${row.unit}` : ""}; in steps of {formatQty(row.qty_step)}.</p>}
          <div className="max-w-sm"><AddToCart row={row} back={`/portal/catalogue/${row.slug}`} /></div>
          {(row.summary || row.description) && <div className="border-t border-grey-200 pt-4 text-sm leading-relaxed text-charcoal">{row.description || row.summary}</div>}
        </div>
      </div>
    </>
  );
}
