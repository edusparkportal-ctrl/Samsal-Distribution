import { ServiceIconView } from "@/components/Icons";
import { CtaBanner, JsonLd, PageHero, SectionHeading } from "@/components/ui";
import { processSteps, services } from "@/config/services";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Procurement, Wholesale Supply and Distribution Services",
  description:
    "Procurement and sourcing, wholesale and institutional supply, commercial distribution, order fulfilment and delivery coordination for businesses in Nairobi, Kenya.",
  path: "/services",
});

export default function ServicesPage() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Services", path: "/services" }])} />
      <PageHero
        eyebrow="Services"
        crumb="Services"
        title="Procurement, supply and delivery, handled"
        intro="Six services that take you from a requirement to goods received, so your team can focus on running the business."
      />

      <section className="section">
        <div className="container-x grid gap-5 md:grid-cols-2">
          {services.map((s) => (
            <article key={s.slug} id={s.slug} className="card scroll-mt-28 p-7">
              <ServiceIconView name={s.icon} className="mb-4 text-teal" size={32} strokeWidth={1.5} />
              <h2 className="text-xl">{s.title}</h2>
              <p className="mt-2 font-medium text-navy">{s.summary}</p>
              <p className="mt-3 text-sm leading-relaxed">{s.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section bg-grey">
        <div className="container-x">
          <SectionHeading eyebrow="Our process" title="From requirement to delivery" intro="Five clear steps, with you informed at each one." />
          <ol className="mt-10 grid gap-4 md:grid-cols-5">
            {processSteps.map((s, i) => (
              <li key={s.title} className="card relative p-5">
                <span className={`mb-4 flex h-9 w-9 items-center justify-center text-sm font-bold ${i === processSteps.length - 1 ? "bg-amber text-navy" : "bg-navy text-white"}`}>
                  {i + 1}
                </span>
                <h3 className="text-base">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <CtaBanner />
    </>
  );
}
