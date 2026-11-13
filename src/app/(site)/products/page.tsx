import Link from "next/link";
import { ProductCatalogue } from "@/components/ProductCatalogue";
import { CtaBanner, JsonLd, PageHero } from "@/components/ui";
import { categories, plannedCategories, products } from "@/config/products";
import { absoluteUrl } from "@/config/site";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Products: Cleaning, Hygiene and Stationery Supplies",
  description:
    "Wholesale cleaning, hygiene, stationery and institutional supplies for businesses in Nairobi and across Kenya. Search the catalogue and request a quote.",
  path: "/products",
});

export default function ProductsPage() {
  // Catalogue list as structured data. Deliberately no prices, brands or availability (none are published).
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "SAMSAL product catalogue",
    itemListElement: products.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: p.name,
      url: absoluteUrl(`/products?category=${p.category}`),
    })),
  };

  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Products", path: "/products" }])} />
      <JsonLd data={itemList} />
      <PageHero
        eyebrow="Products"
        crumb="Products"
        title="Products for businesses and institutions"
        intro={`Browse ${categories.length} product categories. We do not publish fixed prices, because wholesale pricing and availability change. Request a quote for current pricing against your exact requirement.`}
      />

      <ProductCatalogue />

      <section className="border-t border-grey-200 bg-grey py-12 sm:py-14">
        <div className="container-x grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
          <div className="max-w-2xl">
            <h2 className="text-2xl">Looking for something not listed?</h2>
            <p className="mt-3 text-lg">
              Our catalogue is growing
              {plannedCategories.length > 0 ? `, with ${plannedCategories.join(", ").toLowerCase()} planned` : ""}. Send
              us your list or specification and we will source it and quote.
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
