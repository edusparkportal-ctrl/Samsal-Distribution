import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, ChevronRight } from "lucide-react";
import { Photo } from "@/components/Photo";
import { photos } from "@/config/images";
import { quoteHref } from "@/config/navigation";
import { WhatsAppButton } from "@/components/WhatsAppButton";

export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
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

/** Closing quotation call to action, reused across pages. */
export function CtaBanner({
  title = "Ready to get a quotation?",
  text = "Send us your requirements. Tell us what you need, how much and by when, and we will come back with a clear quotation.",
}: {
  title?: string;
  text?: string;
}) {
  return (
    <section className="on-dark bg-navy text-white">
      <div className="container-x grid items-center gap-8 py-14 sm:py-16 lg:grid-cols-[1fr_auto]">
        <div className="max-w-2xl">
          <p className="eyebrow">Request a quotation</p>
          <h2 className="text-3xl text-white sm:text-4xl">{title}</h2>
          <p className="mt-4 text-lg text-white/90">{text}</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
          <Link href={quoteHref} className="btn-accent px-7 py-3.5 text-base">
            Request a Quote <ArrowRight aria-hidden="true" size={18} />
          </Link>
          <WhatsAppButton className="btn-outline-light px-7 py-3.5 text-base" />
        </div>
      </div>
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

export function QuoteLink({ product, className = "btn-outline w-full", label = "Request a Quote" }: { product?: string; className?: string; label?: string }) {
  const href = product ? `${quoteHref}?product=${encodeURIComponent(product)}` : quoteHref;
  return (
    <Link href={href} className={className}>
      {label}
    </Link>
  );
}
