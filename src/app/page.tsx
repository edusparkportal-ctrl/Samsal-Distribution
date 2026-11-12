import Link from "next/link";
import {
  ArrowRight,
  ClipboardCheck,
  FileCheck2,
  MessagesSquare,
  PackageCheck,
  Search,
  Truck,
} from "lucide-react";
import { CategoryIcon, ServiceIconView } from "@/components/Icons";
import { CtaBanner, Photo, SectionHeading } from "@/components/ui";
import { photos } from "@/config/images";
import { industries } from "@/config/industries";
import { quoteHref } from "@/config/navigation";
import { categories } from "@/config/products";
import { processSteps, services } from "@/config/services";
import { site } from "@/config/site";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Procurement and Wholesale Supply in Nairobi, Kenya",
  description:
    "SAMSAL Supply & Distribution connects Kenyan businesses and institutions with dependable sourcing, cleaning, hygiene and stationery supplies, and efficient delivery from Nairobi.",
  path: "/",
});

const principles = [
  { icon: Search, title: "Dependable product sourcing", text: "We source against your requirement, not just what is easiest to supply." },
  { icon: FileCheck2, title: "Clear quotations", text: "Itemised quotations so you can compare and decide with confidence." },
  { icon: MessagesSquare, title: "Responsive communication", text: "A named point of contact and straightforward updates on your order." },
  { icon: ClipboardCheck, title: "Product specification checks", text: "Products are checked against the agreed specification before dispatch." },
  { icon: PackageCheck, title: "Order coordination", text: "From confirmation to hand-over, we keep the order moving." },
  { icon: Truck, title: "Reliable delivery arrangements", text: "Delivery planned to your location and required date." },
];

export default function HomePage() {
  return (
    <>
      {/* HERO */}
      <section className="on-dark relative overflow-hidden bg-navy bg-grid text-white">
        <div className="container-x grid items-center gap-12 py-16 sm:py-24 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="animate-fade-up">
            <p className="eyebrow">{site.tagline}</p>
            <h1 className="text-4xl font-extrabold leading-[1.1] text-white sm:text-5xl lg:text-6xl">
              Reliable Supply.
              <br />
              <span className="text-amber">Smarter Procurement.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/90">{site.heroText}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href={quoteHref} className="btn-accent px-7 py-3.5 text-base">
                Request a Quote <ArrowRight aria-hidden="true" size={18} />
              </Link>
              <Link href="/products" className="btn-outline-light px-7 py-3.5 text-base">
                Explore Our Products
              </Link>
            </div>
            <p className="mt-8 text-sm text-white/70">Serving businesses and institutions in {site.serviceLocation}.</p>
          </div>

          {/* Right: photo if configured, otherwise the order-flow panel */}
          <div className="relative animate-fade-up [animation-delay:150ms]">
            {photos.hero ? (
              <Photo slot={photos.hero} priority sizes="(min-width: 1024px) 45vw, 100vw" className="aspect-[4/3] rounded-lg" />
            ) : (
              <div className="rounded-lg border border-white/20 bg-white/[0.04] p-6 sm:p-8">
                <p className="mb-5 text-xs font-bold uppercase tracking-[0.18em] text-teal-light">How an order flows</p>
                <ol className="space-y-0">
                  {processSteps.map((s, i) => (
                    <li key={s.title} className="relative flex gap-4 pb-6 last:pb-0">
                      {i < processSteps.length - 1 && (
                        <span aria-hidden="true" className="absolute left-[15px] top-8 h-[calc(100%-2rem)] w-px bg-white/20" />
                      )}
                      <span
                        className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center text-sm font-bold ${
                          i === processSteps.length - 1 ? "bg-amber text-navy" : "bg-teal text-white"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <div>
                        <p className="font-semibold text-white">{s.title}</p>
                        <p className="text-sm text-white/70">{s.text}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </div>
        <div aria-hidden="true" className="h-1 w-full bg-amber" />
      </section>

      {/* INTRODUCTION */}
      <section className="section">
        <div className="container-x grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionHeading
              eyebrow="Who we are"
              title="A procurement partner for businesses and institutions"
            />
            <div className="mt-5 space-y-4 text-lg leading-relaxed">
              <p>
                {site.legalName} is a Kenya-based procurement, wholesale supply and distribution company, starting
                in Nairobi and surrounding areas.
              </p>
              <p>{site.promise}</p>
            </div>
            <Link href="/about" className="btn-outline mt-7">
              About SAMSAL
            </Link>
          </div>
          <Photo
            slot={photos.introduction}
            className="aspect-[4/3] rounded-lg"
            fallback={
              <ul className="space-y-4 p-8 text-navy">
                {["Procurement", "Supply", "Delivery"].map((w, i) => (
                  <li key={w} className="flex items-center gap-4">
                    <span className="flex h-10 w-10 items-center justify-center bg-navy text-base font-bold text-white">{i + 1}</span>
                    <span className="text-2xl font-extrabold tracking-tight">{w}.</span>
                  </li>
                ))}
              </ul>
            }
          />
        </div>
      </section>

      {/* PRODUCT CATEGORIES */}
      <section className="section bg-grey">
        <div className="container-x">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <SectionHeading eyebrow="Products" title="What we supply" intro="Core categories for offices, schools, hospitality and facilities, with more being added." />
            <Link href="/products" className="btn-outline self-start sm:self-auto">
              View all products
            </Link>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {categories.map((c) => (
              <Link
                key={c.slug}
                href={`/products#${c.slug}`}
                className="card group flex flex-col p-6 transition-shadow hover:shadow-md"
              >
                <span className="mb-5 flex h-12 w-12 items-center justify-center bg-navy text-white">
                  <CategoryIcon name={c.icon} size={24} strokeWidth={1.75} />
                </span>
                <h3 className="text-lg">{c.name}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed">{c.summary}</p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-teal-dark group-hover:gap-2.5">
                  Browse <ArrowRight aria-hidden="true" size={16} />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section className="section">
        <div className="container-x">
          <SectionHeading eyebrow="Services" title="Core services" intro="From sourcing to delivery, we handle the steps between your requirement and your receiving bay." />
          <div className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s) => (
              <div key={s.slug} className="flex gap-4 border-t-2 border-navy pt-5">
                <ServiceIconView name={s.icon} size={26} strokeWidth={1.75} className="mt-0.5 shrink-0 text-teal" />
                <div>
                  <h3 className="text-lg">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed">{s.summary}</p>
                </div>
              </div>
            ))}
          </div>
          <Link href="/services" className="btn-outline mt-10">
            Explore our services
          </Link>
        </div>
      </section>

      {/* INDUSTRIES */}
      <section className="section bg-grey">
        <div className="container-x">
          <SectionHeading eyebrow="Industries" title="Industries we serve" />
          <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {industries.map((i) => (
              <li key={i.slug}>
                <Link
                  href={`/industries#${i.slug}`}
                  className="card flex items-center justify-between gap-4 p-5 font-semibold text-navy transition-colors hover:border-teal"
                >
                  {i.name}
                  <ArrowRight aria-hidden="true" size={18} className="shrink-0 text-teal" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* WHY SAMSAL */}
      <section className="section">
        <div className="container-x">
          <SectionHeading eyebrow="Why choose SAMSAL" title="How we work" intro="Six operating principles guide every enquiry, quotation and order." />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {principles.map(({ icon: Icon, title, text }) => (
              <div key={title} className="card p-6">
                <Icon aria-hidden="true" className="mb-4 text-teal" size={28} strokeWidth={1.75} />
                <h3 className="text-lg">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CtaBanner />
    </>
  );
}
