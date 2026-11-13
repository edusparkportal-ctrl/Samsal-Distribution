import { Eye, HandCoins, Handshake, Repeat2, ShieldCheck, Target, Zap } from "lucide-react";
import { DocumentsList } from "@/components/DocumentsList";
import { CtaBanner, PageHero, SectionHeading } from "@/components/ui";
import { site } from "@/config/site";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "About Us",
  description:
    "Learn about SAMSAL Supply & Distribution Limited, our mission, vision, values and our approach to procurement and distribution in Kenya.",
  path: "/about",
});

const values = [
  { icon: ShieldCheck, title: "Integrity", text: "Honest dealing in every quotation, order and conversation." },
  { icon: Repeat2, title: "Reliability", text: "Doing what we say we will do, when we say we will do it." },
  { icon: HandCoins, title: "Accountability", text: "Owning outcomes and putting things right when they go wrong." },
  { icon: Zap, title: "Efficiency", text: "Removing delay and effort from procurement for our customers." },
  { icon: Handshake, title: "Customer commitment", text: "Treating each customer's requirement as our own." },
  { icon: Target, title: "Continuous improvement", text: "Learning from every order to serve better the next time." },
];

const approach = [
  { title: "Understand the requirement", text: "We start with what you need, in what quantity, to what specification and by when." },
  { title: "Source and quote", text: "We source suitable products and present a clear, itemised quotation." },
  { title: "Confirm and check", text: "Once you confirm, we check the order against the agreed specification." },
  { title: "Supply and deliver", text: "We coordinate supply and delivery to your location and keep you informed." },
];

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="About us"
        crumb="About Us"
        title="Simplifying procurement for businesses and institutions"
        intro={site.promise}
      />

      <section className="section">
        <div className="container-x grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:gap-16">
          <div>
            <SectionHeading eyebrow="Company overview" title="Who we are" />
            <div className="mt-5 space-y-4 text-lg leading-relaxed">
              <p>
                {site.legalName} is a Kenya-based procurement, wholesale supply and distribution company. We are
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
              <div><dt className="font-semibold text-navy">Initial market</dt><dd>{site.serviceLocation} and surrounding areas</dd></div>
              <div><dt className="font-semibold text-navy">Tagline</dt><dd>{site.tagline}</dd></div>
            </dl>
          </aside>
        </div>
      </section>

      <section className="section bg-grey">
        <div className="container-x grid gap-6 md:grid-cols-2">
          <div className="card p-8">
            <Target aria-hidden="true" className="mb-4 text-teal" size={32} strokeWidth={1.5} />
            <h2 className="text-2xl">Our mission</h2>
            <p className="mt-3 text-lg leading-relaxed">
              To simplify procurement and improve access to dependable products through efficient sourcing,
              competitive supply solutions and reliable distribution.
            </p>
          </div>
          <div className="card p-8">
            <Eye aria-hidden="true" className="mb-4 text-teal" size={32} strokeWidth={1.5} />
            <h2 className="text-2xl">Our vision</h2>
            <p className="mt-3 text-lg leading-relaxed">
              To become a trusted and recognised procurement and distribution partner for businesses and
              institutions across Africa.
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container-x">
          <SectionHeading eyebrow="Core values" title="What we stand for" />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {values.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex gap-4 border-t-2 border-navy pt-5">
                <Icon aria-hidden="true" className="mt-0.5 shrink-0 text-teal" size={26} strokeWidth={1.75} />
                <div>
                  <h3 className="text-lg">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section bg-grey">
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
            <DocumentsList />
          </div>
        </div>
      </section>

      <CtaBanner />
    </>
  );
}
