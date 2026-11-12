"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PackageSearch, Search, X } from "lucide-react";
import { CategoryIcon } from "@/components/Icons";
import { ProductCard } from "@/components/ProductCard";
import { categories, getCategory, products } from "@/config/products";

const ALL = "all";

function matches(q: string, p: (typeof products)[number]) {
  const cat = getCategory(p.category)?.name ?? "";
  const haystack = [p.name, p.description, cat, ...p.specs.map((s) => s.label)].join(" ").toLowerCase();
  // every word typed must appear somewhere (so "floor cleaner" and "cleaner floor" both work)
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => haystack.includes(w));
}

export function ProductCatalogue() {
  const [category, setCategory] = useState<string>(ALL);
  const [query, setQuery] = useState("");

  // Read ?category= / ?q= (and legacy #category links) once on load.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromHash = window.location.hash.replace("#", "");
    const c = params.get("category") ?? fromHash;
    if (c && categories.some((x) => x.slug === c)) setCategory(c);
    const q = params.get("q");
    if (q) setQuery(q.slice(0, 80));
  }, []);

  // Keep the URL shareable without adding history entries.
  useEffect(() => {
    const params = new URLSearchParams();
    if (category !== ALL) params.set("category", category);
    if (query.trim()) params.set("q", query.trim());
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [category, query]);

  const counts = useMemo(() => {
    const m: Record<string, number> = { [ALL]: 0 };
    for (const p of products) {
      if (query.trim() && !matches(query, p)) continue;
      m[ALL] += 1;
      m[p.category] = (m[p.category] ?? 0) + 1;
    }
    return m;
  }, [query]);

  const visible = useMemo(
    () => products.filter((p) => (category === ALL || p.category === category) && (!query.trim() || matches(query, p))),
    [category, query],
  );

  const grouped = category === ALL && !query.trim();
  const activeCategory = category === ALL ? null : getCategory(category);

  return (
    <>
      {/* Filter bar */}
      <div className="sticky top-16 z-30 border-b border-grey-200 bg-white/95 backdrop-blur sm:top-[72px]">
        <div className="container-x py-3 lg:flex lg:items-center lg:gap-6">
          <div className="relative lg:w-80 lg:shrink-0">
            <label htmlFor="product-search" className="sr-only">
              Search products
            </label>
            <Search aria-hidden="true" size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-grey-500" />
            <input
              id="product-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value.slice(0, 80))}
              placeholder="Search products"
              autoComplete="off"
              className="field-input pl-10 pr-10"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-grey-500 hover:text-navy"
              >
                <X aria-hidden="true" size={18} />
              </button>
            )}
          </div>

          <div role="group" aria-label="Filter by category" className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:mx-0 lg:mt-0 lg:px-0 lg:pb-0">
            {[{ slug: ALL, name: "All products", icon: null }, ...categories].map((c) => {
              const active = category === c.slug;
              const n = counts[c.slug] ?? 0;
              return (
                <button
                  key={c.slug}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCategory(c.slug)}
                  className={`inline-flex min-h-[44px] shrink-0 items-center gap-2 whitespace-nowrap rounded border px-3.5 text-sm font-semibold transition-colors ${
                    active
                      ? "border-navy bg-navy text-white"
                      : "border-grey-300 bg-white text-navy hover:border-teal hover:bg-teal-tint"
                  }`}
                >
                  {"icon" in c && c.icon ? <CategoryIcon name={c.icon} size={16} /> : null}
                  {c.name}
                  <span className={`text-xs ${active ? "text-white/70" : "text-grey-500"}`}>{n}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <section className="section" aria-labelledby="catalogue-heading">
        <div className="container-x">
          <div className="mb-8 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
            <div>
              <h2 id="catalogue-heading" className="text-2xl sm:text-3xl">
                {activeCategory ? activeCategory.name : query.trim() ? "Search results" : "All products"}
              </h2>
              {activeCategory && <p className="mt-2 max-w-2xl text-base">{activeCategory.summary}</p>}
            </div>
            <p aria-live="polite" className="text-sm font-semibold text-grey-500">
              {visible.length} {visible.length === 1 ? "product" : "products"}
            </p>
          </div>

          {visible.length === 0 ? (
            <div className="card mx-auto max-w-xl p-8 text-center">
              <PackageSearch aria-hidden="true" size={40} strokeWidth={1.5} className="mx-auto text-teal" />
              <h3 className="mt-4 text-xl">No matching products</h3>
              <p className="mt-2">
                We source items against your requirements, so a product not listed here may still be available. Send us
                the details and we will quote.
              </p>
              <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                <Link
                  href={query.trim() ? `/quote?product=${encodeURIComponent(query.trim().slice(0, 150))}` : "/quote"}
                  className="btn-accent"
                >
                  Request a quote{query.trim() ? ` for "${query.trim().slice(0, 30)}"` : ""}
                </Link>
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => {
                    setQuery("");
                    setCategory(ALL);
                  }}
                >
                  Clear filters
                </button>
              </div>
            </div>
          ) : grouped ? (
            <div className="space-y-14">
              {categories.map((c) => {
                const items = visible.filter((p) => p.category === c.slug);
                if (items.length === 0) return null;
                return (
                  <div key={c.slug} id={c.slug} className="scroll-mt-40">
                    <div className="mb-5 flex items-center justify-between gap-4 border-b border-grey-200 pb-3">
                      <h3 className="text-xl sm:text-2xl">{c.name}</h3>
                      <button
                        type="button"
                        onClick={() => {
                          setCategory(c.slug);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        className="text-sm font-semibold text-teal-dark hover:underline"
                      >
                        View only
                      </button>
                    </div>
                    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                      {items.map((p) => (
                        <ProductCard key={p.slug} product={p} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((p) => (
                <ProductCard key={p.slug} product={p} />
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
