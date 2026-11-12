import { CategoryIcon } from "@/components/Icons";
import { Photo, QuoteLink } from "@/components/ui";
import { photos, productPhotos } from "@/config/images";
import { getCategory, type Product } from "@/config/products";

export function ProductCard({ product }: { product: Product }) {
  const category = getCategory(product.category);
  // Priority: product's own image (products.ts) > per-product photo (images.ts) > category image
  const slot = product.image ?? productPhotos[product.slug] ?? photos[product.category] ?? null;

  return (
    <article className="card group flex h-full flex-col overflow-hidden transition-shadow duration-200 hover:shadow-md">
      <Photo
        slot={slot}
        tone="light"
        sizes="(min-width: 1280px) 30vw, (min-width: 640px) 45vw, 100vw"
        className="aspect-[16/10] border-b border-grey-200"
        fallback={category ? <CategoryIcon name={category.icon} size={40} strokeWidth={1.5} /> : null}
      />
      <div className="flex flex-1 flex-col p-5">
        <p className="text-xs font-bold uppercase tracking-wider text-teal-dark">{category?.name}</p>
        <h3 className="mt-1.5 text-lg leading-snug">{product.name}</h3>
        <p className="mt-2 text-sm leading-relaxed">{product.description}</p>

        <dl className="mt-4 space-y-1.5 border-t border-grey-200 pt-4 text-sm">
          {product.specs.map((s) => (
            <div key={s.label} className="flex justify-between gap-3">
              <dt className="text-grey-500">{s.label}</dt>
              <dd className="text-right font-medium text-navy">{s.value}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-3">
            <dt className="text-grey-500">Packaging</dt>
            <dd className="text-right font-medium text-navy">{product.packaging ?? "Confirmed on quotation"}</dd>
          </div>
        </dl>

        <div className="mt-auto pt-5">
          <QuoteLink product={product.name} category={product.category} />
        </div>
      </div>
    </article>
  );
}
