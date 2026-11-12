import { ArrowRight, ChevronRight, FileText, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";
import Link from "next/link";
import { CategoryIcon } from "@/components/Icons";
import { Photo } from "@/components/Photo";
import { QuoteLink } from "@/components/ui";
import { photos } from "@/config/images";
import { categories, type Product } from "@/config/products";

export function ProductCard({ product }: { product: Product }) {
  const category = categories.find((c) => c.slug === product.category);

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_10px_30px_rgba(20,45,78,0.06)] transition-all duration-200 hover:-translate-y-1 hover:border-teal hover:shadow-[0_18px_40px_rgba(20,45,78,0.12)]">
      <div className="relative overflow-hidden border-b border-slate-200 bg-slate-100">
        <Photo
          slot={product.image ?? null}
          tone="light"
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
          className="aspect-[16/9]"
          fallback={
            category ? (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-teal-tint via-white to-amber/20 text-navy">
                <CategoryIcon name={category.icon} size={38} strokeWidth={1.7} />
              </div>
            ) : null
          }
        />
      </div>

      <div className="flex flex-1 flex-col p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-teal-dark">{category?.name ?? "Product"}</p>
        <h3 className="mt-2 text-xl font-bold leading-snug text-navy">{product.name}</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{product.description}</p>

        <dl className="mt-4 space-y-2 border-t border-slate-200 pt-4 text-sm">
          {product.specs.map((s) => (
            <div key={s.label} className="flex items-start justify-between gap-3">
              <dt className="text-slate-500">{s.label}</dt>
              <dd className="max-w-[52%] text-right font-semibold text-navy">{s.value}</dd>
            </div>
          ))}
          <div className="flex items-start justify-between gap-3">
            <dt className="text-slate-500">Packaging</dt>
            <dd className="max-w-[52%] text-right font-semibold text-navy">{product.packaging ?? "Confirmed on quotation"}</dd>
          </div>
        </dl>

        <div className="mt-auto pt-5">
          <QuoteLink product={product.name} className="btn-outline w-full justify-center" label="Request a Quote" />
        </div>
      </div>
    </article>
  );
}

export const categoryPhoto = (slug: string) => photos[slug] ?? null;

export function SectionHeading({
  eyebrow,
  title,
  intro,
  align = "left",
  as: Tag = "h2",
}: {
  eyebrow?: string;
  title: string;
  intro?: string;
  align?: "left" | "center";
  as?: "h1" | "h2";
}) {
  return (
    <div className={`max-w-2xl ${align === "center" ? "mx-auto text-center" : ""}`}>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <Tag className="text-3xl leading-tight text-navy sm:text-4xl">{title}</Tag>
      {intro && <p className="mt-4 text-lg leading-relaxed text-slate-600">{intro}</p>}
    </div>
  );
}

export function PageHero({ eyebrow, title, intro, crumb }: { eyebrow: string; title: string; intro: string; crumb: string }) {
  return (
    <section className="on-dark relative overflow-hidden bg-navy bg-grid text-white">
      <div className="container-x py-14 sm:py-20">
        <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1.5 text-sm text-white/70">
          <Link href="/" className="transition-colors hover:text-white">Home</Link>
          <ChevronRight aria-hidden="true" size={14} />
          <span aria-current="page" className="text-white">{crumb}</span>
        </nav>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="max-w-3xl text-4xl leading-tight text-white sm:text-5xl">{title}</h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/90">{intro}</p>
      </div>
      <div aria-hidden="true" className="h-1 w-full bg-gradient-to-r from-amber via-amber to-teal" />
    </section>
  );
}

export function CtaBanner({ title = "Ready to get a quotation?", text = "Send us your requirements. Tell us what you need, how much and by when, and we will come back with a clear quotation." }: { title?: string; text?: string }) {
  return (
    <section className="on-dark bg-navy text-white">
      <div className="container-x grid items-center gap-8 py-14 sm:py-16 lg:grid-cols-[1fr_auto]">
        <div className="max-w-2xl">
          <p className="eyebrow">Request a quotation</p>
          <h2 className="text-3xl text-white sm:text-4xl">{title}</h2>
          <p className="mt-4 text-lg text-white/90">{text}</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
          <Link href="/quote" className="btn-accent px-7 py-3.5 text-base">
            Request a Quote <ArrowRight aria-hidden="true" size={18} />
          </Link>
          <Link href="/contact" className="btn-outline-light px-7 py-3.5 text-base">
            Contact us
          </Link>
        </div>
      </div>
    </section>
  );
}

export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}

export function BulletList({ items, dark = false }: { items: string[]; dark?: boolean }) {
  return (
    <ul className="space-y-2">
      {items.map((t) => (
        <li key={t} className="flex gap-2.5 text-sm leading-relaxed text-slate-600">
          <span aria-hidden="true" className={`mt-2 h-1.5 w-1.5 shrink-0 ${dark ? "bg-teal-light" : "bg-teal"}`} />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

export function QuoteLink({ product, category, className = "btn-outline w-full", label = "Request a Quote" }: { product?: string; category?: string; className?: string; label?: string }) {
  const params = new URLSearchParams();
  if (product) params.set("product", product);
  if (category) params.set("category", category);
  const href = `/quote${params.toString() ? `?${params}` : ""}`;
  return <Link href={href} className={className}>{label}</Link>;
}

export function TrustPill({ icon: Icon, title, text }: { icon: typeof Sparkles; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <Icon aria-hidden="true" className="mb-3 text-teal" size={24} />
      <h3 className="text-lg font-bold text-navy">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{text}</p>
    </div>
  );
}

export { Photo, photos };
