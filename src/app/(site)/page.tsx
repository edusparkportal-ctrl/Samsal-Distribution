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
import { categories, productsByCategory } from "@/config/products";
import { processSteps, services } from "@/config/services";
import { site } from "@/config/site";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Procurement and Wholesale Supply in Nairobi, Kenya",
  description:
    "Nairobi-based procurement and wholesale supply for Kenyan businesses and institutions: cleaning, hygiene and stationery supplies, sourcing and delivery.",
  path: "/",
});

const principles = [
  { icon: Search, title: "Dependable product sourcing", text: "We source against your requirement, not just what is easiest to supply." },
  { icon: FileCheck2, title: "Clear quotations", text: "Itemised quotations so you can compare and decide with confidence." },
  { icon: MessagesSquare, title: "Responsive communication", text: "Straightforward updates from enquiry to delivery." },
  { icon: ClipboardCheck, title: "Product specification checks", text: "Products are checked against the agreed specification before dispatch." },
  { icon: PackageCheck, title: "Order coordination", text: "From confirmation to hand-over, we keep the order moving." },
  { icon: Truck, title: "Reliable delivery arrangements", text: "Delivery planned to your location and required date." },
];

const heroPoints = ["Itemised quotations", "Specification checks", "Delivery coordination"];

export default function HomePage() {
  return (
    <>
      {/* HERO */}
      <section className="on-dark relative overflow-hidden bg-navy bg-grid text-white">
        <div className="container-x grid items-center gap-10 pb-14 pt-12 sm:pb-20 sm:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:pb-24 lg:pt-24">
          <div className="animate-fade-up">
            <p className="mb-5 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.2em] text-teal-light">
              <span aria-hidden="true" className="h-0.5 w-8 bg-amber" />
              {site.tagline}
            </p>
            <h1 className="text-[2.5rem] font-extrabold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-[4rem]">
              Reliable Supply.
              <br />
              <span className="text-amber">Smarter Procurement.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-white/90 sm:text-lg">{site.heroText}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href={quoteHref} className="btn-accent px-7 py-3.5 text-base">
                Request a Quote <ArrowRight aria-hidden="true" size={18} />
              </Link>
              <Link href="/products" className="btn-outline-light px-7 py-3.5 text-base">
                Explore Our Products
              </Link>
            </div>
            <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/80">
              {heroPoints.map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <span aria-hidden="true" className="h-1.5 w-1.5 bg-teal-light" />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative animate-fade-up [animation-delay:150ms]">
            <div aria-hidden="true" className="absolute -bottom-3 -right-3 hidden h-full w-full border-2 border-amber/70 sm:block" />
            <Photo
              slot={photos.hero}
              priority
              sizes="(min-width: 1024px) 46vw, 100vw"
              tone="dark"
              className="relative aspect-[4/3] border border-white/15"
            />
          </div>
        </div>
        <div aria-hidden="true" className="h-1 w-full bg-amber" />
      </section>

      {/* INTRODUCTION */}
      <section className="section">
        <div className="container-x grid items-center gap-10 lg:grid-cols-2 lg:gap-20">
          <div>
            <SectionHeading eyebrow="Who we are" title="A procurement partner for businesses and institutions" />
            <div className="mt-6 space-y-4 text-base leading-relaxed sm:text-lg">
              <p>
                {site.legalName} is a Kenya-based procurement, wholesale supply and distribution company, starting in
                Nairobi and surrounding areas.
              </p>
              <p>{site.promise}</p>
            </div>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/about" className="btn-primary">
                About SAMSAL
              </Link>
              <Link href="/services" className="btn-outline">
                Our services
              </Link>
            </div>
          </div>
          <div className="relative">
            <div aria-hidden="true" className="absolute -left-3 -top-3 hidden h-full w-full border-2 border-teal/40 sm:block" />
            <Photo slot={photos.introduction} sizes="(min-width: 1024px) 45vw, 100vw" className="relative aspect-[4/3]" />
          </div>
        </div>
      </section>

      {/* PRODUCT CATEGORIES */}
      <section className="section bg-grey">
        <div className="container-x">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <SectionHeading
              eyebrow="Products"
              title="What we supply"
              intro="Core categories for offices, schools, hospitality and facilities, with more being added."
            />
            <Link href="/products" className="btn-outline self-start sm:self-auto">
              View full catalogue <ArrowRight aria-hidden="true" size={16} />
            </Link>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {categories.map((c) => {
              const names = productsByCategory(c.slug).map((p) => p.name);
              return (
                <Link
                  key={c.slug}
                  href={`/products?category=${c.slug}`}
                  className="card group flex flex-col overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                >
                  <Photo
                    slot={photos[c.slug]}
                    sizes="(min-width: 1024px) 24vw, (min-width: 640px) 45vw, 100vw"
                    className="aspect-[4/3] border-b border-grey-200"
                    fallback={<CategoryIcon name={c.icon} size={40} strokeWidth={1.5} />}
                  />
                  <div className="flex flex-1 flex-col p-5">
                    <h3 className="text-lg">{c.name}</h3>
                    <p className="mt-2 text-sm leading-relaxed">{c.summary}</p>
                    <p className="mt-3 text-xs leading-relaxed text-grey-500">
                      {names.slice(0, 3).join(" · ")}
                      {names.length > 3 ? ` · +${names.length - 3} more` : ""}
                    </p>
                    <span className="mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-semibold text-teal-dark transition-all group-hover:gap-2.5">
                      Browse {c.name.toLowerCase()} <ArrowRight aria-hidden="true" size={16} />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section className="section">
        <div className="container-x grid gap-10 lg:grid-cols-[0.8fr_1.4fr] lg:gap-16">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <SectionHeading
              eyebrow="Services"
              title="From requirement to receiving bay"
              intro="Six services that cover the steps between knowing what you need and having it delivered."
            />
            <Link href="/services" className="btn-primary mt-8">
              Explore our services
            </Link>
          </div>
          <div className="grid gap-px overflow-hidden border border-grey-200 bg-grey-200 sm:grid-cols-2">
            {services.map((s, i) => (
              <div key={s.slug} className="bg-white p-6">
                <div className="mb-4 flex items-center justify-between">
                  <span className="flex h-11 w-11 items-center justify-center bg-teal-tint text-teal-dark">
                    <ServiceIconView name={s.icon} size={22} strokeWidth={1.75} />
                  </span>
                  <span aria-hidden="true" className="text-sm font-bold text-grey-300">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="text-lg">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed">{s.summary}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PROCESS */}
      <section className="on-dark bg-navy bg-grid py-14 text-white sm:py-20">
        <div className="container-x">
          <SectionHeading eyebrow="How it works" title="One clear path from enquiry to delivery" />
          <ol className="mt-10 grid gap-8 md:grid-cols-5 md:gap-4">
            {processSteps.map((s, i) => (
              <li key={s.title} className="relative flex gap-4 md:block">
                {i < processSteps.length - 1 && (
                  <>
                    <span aria-hidden="true" className="absolute left-[19px] top-11 h-[calc(100%+0.5rem)] w-px bg-white/25 md:hidden" />
                    <span aria-hidden="true" className="absolute left-12 right-0 top-[19px] hidden h-px bg-white/25 md:block" />
                  </>
                )}
                <span
                  className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center text-sm font-bold ${
                    i === processSteps.length - 1 ? "bg-amber text-navy" : "bg-teal text-white"
                  }`}
                >
                  {i + 1}
                </span>
                <div className="md:mt-5 md:pr-3">
                  <h3 className="text-base font-bold text-white">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-white/75">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* INDUSTRIES */}
      <section className="section bg-grey">
        <div className="container-x">
          <SectionHeading eyebrow="Industries" title="Industries we serve" intro="Different sectors buy differently. We tailor quotations and supply to how you operate." />
          <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {industries.map((i) => (
              <li key={i.slug}>
                <Link
                  href={`/industries#${i.slug}`}
                  className="card group flex h-full items-center justify-between gap-4 border-l-4 border-l-teal p-5 transition-colors hover:border-l-amber"
                >
                  <span>
                    <span className="block font-bold text-navy">{i.name}</span>
                    <span className="mt-1 block text-sm text-grey-500">{i.needs[0]}</span>
                  </span>
                  <ArrowRight aria-hidden="true" size={18} className="shrink-0 text-teal-dark transition-transform group-hover:translate-x-1" />
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
          <div className="mt-10 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
            {principles.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center bg-navy text-white">
                  <Icon aria-hidden="true" size={22} strokeWidth={1.75} />
                </span>
                <div>
                  <h3 className="text-lg">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CtaBanner />
    </>
  );
}
