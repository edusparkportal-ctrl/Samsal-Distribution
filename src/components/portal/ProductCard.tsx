import Image from "next/image";
import Link from "next/link";
import { addToCart } from "@/app/portal/(app)/actions";
import { Badge } from "@/components/admin/ui";
import { availability, formatMoney, formatQty, productImage } from "@/lib/portal/format";
import type { CatalogueRow } from "@/lib/portal/types";

export function ProductImage({ row, className = "" }: { row: Pick<CatalogueRow, "photo_path" | "fallback_image" | "image_alt" | "name">; className?: string }) {
  const src = productImage(row.photo_path, row.fallback_image, process.env.NEXT_PUBLIC_SUPABASE_URL);
  return (
    <div className={`relative overflow-hidden bg-grey ${className}`}>
      {src ? (
        <Image src={src} alt={row.image_alt || row.name} fill sizes="(min-width:1024px) 25vw, (min-width:640px) 33vw, 50vw" unoptimized={src.endsWith(".svg")} className="object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-grey-300" aria-hidden>
          <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10" /></svg>
        </div>
      )}
    </div>
  );
}

export function Price({ row }: { row: CatalogueRow }) {
  if (row.unit_price === null) return <p className="text-sm font-semibold text-charcoal">Price on request</p>;
  return (
    <p className="flex flex-wrap items-baseline gap-x-2">
      <span className="text-lg font-bold text-navy">{formatMoney(row.unit_price, row.currency)}</span>
      {row.unit && <span className="text-xs text-grey-500">per {row.unit}</span>}
      {row.special && row.list_price !== null && row.list_price !== row.unit_price && <span className="text-xs text-grey-500 line-through">{formatMoney(row.list_price, row.currency)}</span>}
      {row.special && <Badge tone="teal">Your price</Badge>}
    </p>
  );
}

export function AddToCart({ row, back }: { row: CatalogueRow; back: string }) {
  if (!row.orderable) {
    return <Link href={`/portal/quotes/new?product=${row.product_id}&name=${encodeURIComponent(row.name.slice(0, 150))}`} className="btn-outline w-full justify-center">Request a quotation</Link>;
  }
  const a = availability(row.availability);
  const blocked = row.availability === "out_of_stock";
  return (
    <form action={addToCart} className="flex items-end gap-2">
      <input type="hidden" name="product_id" value={row.product_id} />
      <input type="hidden" name="back" value={back} />
      <div className="w-24 shrink-0">
        <label htmlFor={`q-${row.product_id}`} className="sr-only">Quantity of {row.name}</label>
        <input id={`q-${row.product_id}`} name="quantity" type="number" inputMode="decimal" min={row.min_order_qty ?? 1} step={row.qty_step ?? 1} defaultValue={row.min_order_qty ?? 1} required disabled={blocked} className="field-input !min-h-[44px]" />
      </div>
      <button type="submit" disabled={blocked} className="btn-primary flex-1 justify-center">{blocked ? a.label : "Add to cart"}</button>
    </form>
  );
}

export function ProductCard({ row, back }: { row: CatalogueRow; back: string }) {
  const a = availability(row.availability);
  return (
    <article className="card flex w-full flex-col overflow-hidden">
      <Link href={`/portal/catalogue/${row.slug}`} className="block" aria-label={row.name}>
        <ProductImage row={row} className="aspect-[4/3]" />
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-bold leading-snug text-navy"><Link href={`/portal/catalogue/${row.slug}`} className="hover:underline">{row.name}</Link></h3>
          <Badge tone={a.tone}>{a.label}</Badge>
        </div>
        {row.category_name && <p className="text-xs font-semibold uppercase tracking-wide text-grey-500">{row.category_name}</p>}
        {row.packaging && <p className="text-sm text-charcoal">{row.packaging}</p>}
        <Price row={row} />
        {row.orderable && row.min_order_qty !== null && Number(row.min_order_qty) > 1 && <p className="text-xs text-grey-500">Minimum order {formatQty(row.min_order_qty)}{row.unit ? ` ${row.unit}` : ""}</p>}
        <div className="mt-auto pt-2"><AddToCart row={row} back={back} /></div>
      </div>
    </article>
  );
}
