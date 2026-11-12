import { QuoteForm } from "@/components/QuoteForm";
import { ProductCatalogue } from "@/components/ProductCatalogue";
import { CtaBanner, JsonLd, PageHero } from "@/components/ui";
import { categories, productsByCategory } from "@/config/products";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Products: Cleaning, Hygiene and Stationery Supplies",
  description: "Wholesale cleaning supplies, hygiene supplies, office stationery and general institutional supplies for businesses in Nairobi and across Kenya. Request a quote.",
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

      <section className="section">
        <div className="container-x">
          <div className="max-w-3xl">
            <p className="eyebrow">Catalogue</p>
            <h2 className="text-3xl text-navy sm:text-4xl">Search and filter core supplies</h2>
            <p className="mt-4 text-lg leading-relaxed text-slate-600">Use the search and category filters below to find the right product and send a pre-filled quotation request.</p>
          </div>
          <div className="mt-8">
            <ProductCatalogue />
          </div>
        </div>
      </section>

      {categories.map((category, idx) => (
        <section key={category.slug} id={category.slug} className={`section ${idx % 2 === 1 ? "bg-slate-50" : ""}`}>
          <div className="container-x">
            <div className="max-w-2xl">
              <p className="eyebrow">{category.name}</p>
              <h2 className="text-3xl text-navy">{category.name}</h2>
              <p className="mt-3 text-lg leading-relaxed text-slate-600">{category.summary}</p>
            </div>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {productsByCategory(category.slug).map((product) => (
                <ProductCard key={product.slug} product={product} />
              ))}
            </div>
          </div>
        </section>
      ))}

      <CtaBanner />
    </>
  );
}
