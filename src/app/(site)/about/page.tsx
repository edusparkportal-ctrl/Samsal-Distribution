import Image from "next/image";
import { Eye, HandCoins, Handshake, Linkedin, Mail, Repeat2, ShieldCheck, Target, Zap, type LucideIcon } from "lucide-react";
import { DocumentsList } from "@/components/DocumentsList";
import { CtaBanner, PageHero, SectionHeading } from "@/components/ui";
import { getSiteContent } from "@/lib/content/load";
import { pageMetadata, withSeo } from "@/lib/seo";

export async function generateMetadata() {
  return withSeo(
    pageMetadata({
      title: "About Us",
      description:
        "Learn about SAMSAL Supply & Distribution Limited, our mission, vision, values and our approach to procurement and distribution in Kenya.",
      path: "/about",
    }),
    "/about",
  );
}

// Icons for the well-known values; any value an admin adds later gets the default icon.
const VALUE_ICONS: Record<string, LucideIcon> = {
  integrity: ShieldCheck, reliability: Repeat2, accountability: HandCoins, efficiency: Zap, "customer commitment": Handshake, "continuous improvement": Target,
};

const approach = [
  { title: "Understand the requirement", text: "We start with what you need, in what quantity, to what specification and by when." },
  { title: "Source and quote", text: "We source suitable products and present a clear, itemised quotation." },
  { title: "Confirm and check", text: "Once you confirm, we check the order against the agreed specification." },
  { title: "Supply and deliver", text: "We coordinate supply and delivery to your location and keep you informed." },
];

export default async function AboutPage() {
  const { company, staff, documents } = await getSiteContent();
  const values = company.values;
  const mvCards = [
    company.mission && { Icon: Target, title: "Our mission", text: company.mission },
    company.vision && { Icon: Eye, title: "Our vision", text: company.vision },
  ].filter(Boolean) as { Icon: LucideIcon; title: string; text: string }[];
  return (
    <>
      <PageHero
        eyebrow="About us"
        crumb="About Us"
        title="Simplifying procurement for businesses and institutions"
        intro={company.promise}
      />

      <section className="section">
        <div className="container-x grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:gap-16">
          <div>
            <SectionHeading eyebrow="Company overview" title="Who we are" />
            <div className="mt-5 space-y-4 text-lg leading-relaxed">
              <p>
                {company.legalName} is a Kenya-based procurement, wholesale supply and distribution company. We are
                starting in Nairobi and surrounding areas, with the ambition to grow nationally and, in time,
                across East Africa.
              </p>
              <p>
                Our focus is practical: help organisations get dependable products at competitive prices, without
                the time and effort of chasing multiple suppliers.
              </p>
            </div>
          </div>
          <aside className="card self-start border-l-4 border-l-amber p-6">
            <p className="eyebrow">At a glance</p>
            <dl className="space-y-4 text-sm">
              <div><dt className="font-semibold text-navy">Industry</dt><dd>Procurement, wholesale supply and distribution</dd></div>
              <div><dt className="font-semibold text-navy">Initial market</dt><dd>{company.coverage} and surrounding areas</dd></div>
              <div><dt className="font-semibold text-navy">Tagline</dt><dd>{company.tagline}</dd></div>
            </dl>
          </aside>
        </div>
      </section>

      {mvCards.length > 0 && (
        <section className="section bg-grey">
          <div className={`container-x grid gap-6 ${mvCards.length > 1 ? "md:grid-cols-2" : ""}`}>
            {mvCards.map(({ Icon, title, text }) => (
              <div key={title} className="card p-8">
                <Icon aria-hidden="true" className="mb-4 text-teal" size={32} strokeWidth={1.5} />
                <h2 className="text-2xl">{title}</h2>
                <p className="mt-3 text-lg leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {values.length > 0 && (
        <section className="section">
          <div className="container-x">
            <SectionHeading eyebrow="Core values" title="What we stand for" />
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {values.map((v) => {
                const Icon = VALUE_ICONS[v.title.trim().toLowerCase()] ?? ShieldCheck;
                return (
                  <div key={v.title} className="flex gap-4 border-t-2 border-navy pt-5">
                    <Icon aria-hidden="true" className="mt-0.5 shrink-0 text-teal" size={26} strokeWidth={1.75} />
                    <div>
                      <h3 className="text-lg">{v.title}</h3>
                      {v.description && <p className="mt-1.5 text-sm leading-relaxed">{v.description}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {staff.length > 0 && (
        <section className="section bg-grey" id="management">
          <div className="container-x">
            <SectionHeading eyebrow="Management" title="The people behind SAMSAL" />
            <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {staff.map((p) => (
                <li key={p.id} className="card flex flex-col overflow-hidden">
                  {p.photo && (
                    <div className="relative aspect-[4/3] bg-grey">
                      <Image src={p.photo.src} alt={p.photo.alt || p.name} fill sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw" className="object-cover" />
                    </div>
                  )}
                  <div className="flex flex-1 flex-col p-5">
                    <h3 className="text-lg">{p.name}</h3>
                    <p className="text-sm font-semibold text-teal-dark">{p.position}{p.department ? ` · ${p.department}` : ""}</p>
                    {p.biography && <p className="mt-3 text-sm leading-relaxed">{p.biography}</p>}
                    {(p.linkedin || p.email) && (
                      <div className="mt-auto flex gap-3 pt-4">
                        {p.linkedin && <a href={p.linkedin} target="_blank" rel="noopener noreferrer" aria-label={`${p.name} on LinkedIn`} className="text-navy hover:text-teal-dark"><Linkedin aria-hidden="true" size={20} /></a>}
                        {p.email && <a href={`mailto:${p.email}`} aria-label={`Email ${p.name}`} className="text-navy hover:text-teal-dark"><Mail aria-hidden="true" size={20} /></a>}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className={`section ${staff.length > 0 ? "" : "bg-grey"}`}>
        <div className="container-x">
          <SectionHeading
            eyebrow="Our approach"
            title="Procurement and distribution, done step by step"
            intro="A simple, repeatable process keeps every order clear and accountable."
          />
          <ol className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {approach.map((a, i) => (
              <li key={a.title} className="card p-6">
                <span className="mb-4 flex h-9 w-9 items-center justify-center bg-navy text-sm font-bold text-white">{i + 1}</span>
                <h3 className="text-lg">{a.title}</h3>
                <p className="mt-2 text-sm leading-relaxed">{a.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section">
        <div className="container-x max-w-4xl">
          <SectionHeading
            eyebrow="Our commitment"
            title="Reliability, quality and customer service"
          />
          <div className="mt-5 space-y-4 text-lg leading-relaxed">
            <p>
              We commit to quoting clearly, communicating promptly, checking products against your specification
              and arranging delivery that fits your schedule.
            </p>
            <p>
              If something is not right, we want to hear about it quickly so we can put it right.
            </p>
          </div>
        </div>
      </section>

      <section className="section bg-grey" id="documents">
        <div className="container-x">
          <SectionHeading
            eyebrow="Company documents"
            title="Documents available on request"
            intro="Our company profile, product catalogue and supplier documentation are shared with customers on request."
          />
          <div className="mt-10">
            <DocumentsList documents={documents} />
          </div>
        </div>
      </section>

      <CtaBanner />
    </>
  );
}
