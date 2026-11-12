import { ArrowRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { CategoryIcon } from "@/components/Icons";
import { ProductCard } from "@/components/ProductCard";
import { categories, productsByCategory } from "@/config/products";

export function ProductCatalogue() {
  const [selected, setSelected] = useState<string>("all");
  const [query, setQuery] = useState("");

  const visibleProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return categories.flatMap((category) => {
      const items = productsByCategory(category.slug).filter((product) => {
        const matchesCategory = selected === "all" || category.slug === selected;
        const matchesQuery =
          q.length === 0 ||
          product.name.toLowerCase().includes(q) ||
          product.description.toLowerCase().includes(q) ||
          category.name.toLowerCase().includes(q);
        return matchesCategory && matchesQuery;
      });
      return items;
    });
  }, [query, selected]);

  return (
    <>
      <div className="mb-8 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setSelected("all")} className={`rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${selected === "all" ? "bg-navy text-white" : "border border-slate-300 bg-white text-slate-700 hover:border-slate-400"}`}>
            All products
          </button>
          {categories.map((category) => (
            <button key={category.slug} type="button" onClick={() => setSelected(category.slug)} className={`rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${selected === category.slug ? "bg-teal text-white" : "border border-slate-300 bg-white text-slate-700 hover:border-slate-400"}`}>
              <span className="inline-flex items-center gap-2">
                <CategoryIcon name={category.icon} size={15} />
                {category.name}
              </span>
            </button>
          ))}
        </div>

        <label className="relative block w-full max-w-md">
          <span className="sr-only">Search products</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search products or categories"
            className="w-full rounded-full border border-slate-300 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-teal focus:bg-white"
          />
        </label>
      </div>

      {visibleProducts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <p className="text-lg font-semibold text-navy">No products match your search.</p>
          <p className="mt-2 text-sm text-slate-600">Try another product name or browse the category buttons above.</p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {visibleProducts.map((product) => (
            <ProductCard key={product.slug} product={product} />
          ))}
        </div>
      )}
    </>
  );
}

export function CategoryStrip() {
  return (
    <div className="mt-8 flex flex-wrap gap-3">
      {categories.map((category) => (
        <a key={category.slug} href={`#${category.slug}`} className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-teal hover:bg-teal-tint hover:text-navy">
          <CategoryIcon name={category.icon} size={15} />
          {category.name}
          <ArrowRight aria-hidden="true" size={14} />
        </a>
      ))}
    </div>
  );
}
