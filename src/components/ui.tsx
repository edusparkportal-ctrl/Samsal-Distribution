import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, ChevronRight } from "lucide-react";
import { Photo } from "@/components/Photo";
import { photos } from "@/config/images";
import { quoteHref } from "@/config/navigation";

export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

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
      <Tag className="text-3xl leading-tight sm:text-4xl">{title}</Tag>
      {intro && <p className="mt-4 text-lg leading-relaxed text-charcoal/90">{intro}</p>}
    </div>
  );
}

/** Navy band used at the top of inner pages. */
export function PageHero({
  eyebrow,
  title,
  intro,
  crumb,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  crumb: string;
}) {
  return (
    <section className="on-dark relative overflow-hidden bg-navy bg-grid text-white">
      <div className="container-x py-14 sm:py-20">
        <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1.5 text-sm text-white/70">
          <Link href="/" className="hover:text-white">
            Home
          </Link>
          <ChevronRight aria-hidden="true" size={14} />
          <span aria-current="page" className="text-white">
            {crumb}
          </span>
        </nav>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="max-w-3xl text-4xl leading-tight text-white sm:text-5xl">{title}</h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/90">{intro}</p>
      </div>
      <div aria-hidden="true" className="h-1 w-full bg-gradient-to-r from-amber via-amber to-teal" />
    </section>
  );
}

export { Photo, photos };

export function BulletList({ items, dark = false }: { items: string[]; dark?: boolean }) {
  return (
    <ul className="space-y-2">
      {items.map((t) => (
        <li key={t} className="flex gap-2.5 text-sm">
          <span aria-hidden="true" className={`mt-2 h-1.5 w-1.5 shrink-0 ${dark ? "bg-teal-light" : "bg-teal"}`} />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

export function QuoteLink({
  product,
  category,
  className = "btn-outline w-full",
  label = "Request a Quote",
}: {
  product?: string;
  category?: string; // category slug
  className?: string;
  label?: string;
}) {
  const params = new URLSearchParams();
  if (product) params.set("product", product);
  if (category) params.set("category", category);
  const qs = params.toString();
  return (
    <Link href={qs ? `${quoteHref}?${qs}` : quoteHref} className={className} aria-label={product ? `${label}: ${product}` : label}>
      {label}
    </Link>
  );
}
