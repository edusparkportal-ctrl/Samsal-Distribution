import { CategoryIcon } from "@/components/Icons";
import { Photo, QuoteLink } from "@/components/ui";
import { getCategory, type Product } from "@/config/products";
import { photos } from "@/config/images";

export function ProductCard({ product }: { product: Product }) {
  const category = getCategory(product.category);
  return (
    <article className="card flex h-full flex-col overflow-hidden transition-shadow hover:shadow-md">
      <Photo
        slot={product.image ?? null}
        tone="light"
        sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
        className="aspect-[16/9]"
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
          <QuoteLink product={product.name} />
        </div>
      </div>
    </article>
  );
}

// re-exported so photo slots for categories are discoverable in one import path
export const categoryPhoto = (slug: string) => photos[slug] ?? null;
