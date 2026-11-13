import Link from "next/link";
import { Clock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { QuoteForm } from "@/components/QuoteForm";
import { JsonLd, PageHero } from "@/components/ui";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { placeholders, site } from "@/config/site";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Contact Us",
  description:
    "Contact SAMSAL Supply & Distribution in Nairobi, Kenya for business enquiries, procurement support and product information.",
  path: "/contact",
});

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const raw = sp.topic;
  const topic = (Array.isArray(raw) ? raw[0] : raw)?.slice(0, 100) ?? "";
  const { contact } = site;

  const items = [
    {
      icon: MapPin,
      label: "Service location",
      value: <>{site.serviceLocation}</>,
    },
    {
      icon: Phone,
      label: "Telephone",
      value: contact.phone ? (
        <a className="font-semibold text-navy hover:underline" href={`tel:${contact.phone.replace(/\s/g, "")}`}>{contact.phone}</a>
      ) : (
        <span className="text-grey-500">{placeholders.phone}</span>
      ),
    },
    {
      icon: Mail,
      label: "Email",
      value: contact.email ? (
        <a className="font-semibold text-navy hover:underline" href={`mailto:${contact.email}`}>{contact.email}</a>
      ) : (
        <span className="text-grey-500">{placeholders.email}</span>
      ),
    },
    {
      icon: MessageCircle,
      label: "WhatsApp",
      value: contact.whatsappNumber ? <WhatsAppButton className="font-semibold text-teal-dark hover:underline" label={`+${contact.whatsappNumber}`} /> : <span className="text-grey-500">{placeholders.whatsapp}</span>,
    },
    {
      icon: Clock,
      label: "Business hours",
      value: contact.hours ? <>{contact.hours}</> : <span className="text-grey-500">{placeholders.hours}</span>,
    },
  ];

  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Contact", path: "/contact" }])} />
      <PageHero
        eyebrow="Contact"
        crumb="Contact"
        title="Talk to SAMSAL"
        intro="Send a business enquiry or ask about a product. For pricing on specific items, please use our quotation form."
      />
      <section className="section">
        <div className="container-x grid gap-10 lg:grid-cols-[1fr_380px] lg:gap-14">
          <div>
            <div className="card p-5 sm:p-8">
              <h2 className="mb-6 text-2xl">Business enquiry</h2>
              <QuoteForm
                kind="enquiry"
                initialMessage={topic ? `I would like to request a copy of: ${topic}.` : ""}
                turnstileSiteKey={site.turnstileSiteKey}
              />
            </div>
          </div>

          <aside className="space-y-6">
            <div className="card p-6">
              <h2 className="text-lg">Contact details</h2>
              <ul className="mt-5 space-y-5">
                {items.map(({ icon: Icon, label, value }) => (
                  <li key={label} className="flex gap-3.5">
                    <Icon aria-hidden="true" size={20} className="mt-0.5 shrink-0 text-teal" />
                    <div className="text-sm">
                      <p className="font-semibold text-navy">{label}</p>
                      <p className="mt-0.5">{value}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="card p-6">
              <h2 className="text-lg">General enquiry information</h2>
              <p className="mt-2 text-sm leading-relaxed">
                We are starting in Nairobi and surrounding areas. If you need a price, use the{" "}
                <Link href="/quote" className="font-semibold text-teal-dark underline">
                  Request a Quote
                </Link>{" "}
                form with your product list or specification.
              </p>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
