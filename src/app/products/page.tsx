import Link from "next/link";
import { CategoryIcon } from "@/components/Icons";
import { ProductCard } from "@/components/ProductCard";
import { CtaBanner, JsonLd, PageHero } from "@/components/ui";
import { categories, plannedCategories, productsByCategory } from "@/config/products";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Products: Cleaning, Hygiene and Stationery Supplies",
  description:
    "Wholesale cleaning supplies, hygiene supplies, office stationery and general institutional supplies for businesses in Nairobi and across Kenya. Request a quote.",
  path: "/products",
});

export default function ProductsPage() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Products", path: "/products" }])} />
      <PageHero
        eyebrow="Products"
        crumb="Products"
        title="Products for businesses and institutions"
        intro="Browse our product categories. We do not publish fixed prices, as wholesale pricing and availability change. Request a quote for current pricing against your exact requirement."
      />

      {/* Sticky category navigation */}
      <div className="sticky top-16 z-30 border-b border-grey-200 bg-white/95 backdrop-blur sm:top-[72px]">
        <nav aria-label="Product categories" className="container-x flex gap-2 overflow-x-auto py-3">
          {categories.map((c) => (
            <a
              key={c.slug}
              href={`#${c.slug}`}
              className="inline-flex shrink-0 items-center gap-2 rounded border border-grey-300 px-3.5 py-2 text-sm font-semibold text-navy hover:border-teal hover:bg-teal-tint"
            >
              <CategoryIcon name={c.icon} size={16} />
              {c.name}
            </a>
          ))}
        </nav>
      </div>

      {categories.map((c, idx) => (
        <section key={c.slug} id={c.slug} className={`section scroll-mt-32 ${idx % 2 === 1 ? "bg-grey" : ""}`}>
          <div className="container-x">
            <div className="max-w-2xl">
              <h2 className="text-3xl">{c.name}</h2>
              <p className="mt-3 text-lg">{c.summary}</p>
            </div>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {productsByCategory(c.slug).map((p) => (
                <ProductCard key={p.slug} product={p} />
              ))}
            </div>
          </div>
        </section>
      ))}

      <section className="section border-t border-grey-200">
        <div className="container-x grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
          <div className="max-w-2xl">
            <h2 className="text-2xl">Looking for something not listed?</h2>
            <p className="mt-3 text-lg">
              Our catalogue is growing{plannedCategories.length > 0 ? `, with ${plannedCategories.join(", ").toLowerCase()} planned` : ""}. Send us your list
              or specification and we will source it and quote.
            </p>
          </div>
          <Link href="/quote" className="btn-accent px-7 py-3.5 text-base">
            Send your requirements
          </Link>
        </div>
      </section>

      <CtaBanner />
    </>
  );
}
