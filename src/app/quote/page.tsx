import { CheckCircle2 } from "lucide-react";
import { QuoteForm } from "@/components/QuoteForm";
import { PageHero } from "@/components/ui";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { getCategory } from "@/config/products";
import { site } from "@/config/site";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Request a Quote",
  description:
    "Request a quotation from SAMSAL Supply & Distribution. Tell us the products, quantities and delivery details you need in Nairobi or across Kenya.",
  path: "/quote",
});

export default async function QuotePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const raw = sp.product;
  const initialProduct = (Array.isArray(raw) ? raw[0] : raw)?.slice(0, 150) ?? "";
  const rawCat = sp.category;
  const catSlug = Array.isArray(rawCat) ? rawCat[0] : rawCat;
  // Only known category slugs are accepted; anything else is ignored.
  const initialCategory = (catSlug && getCategory(catSlug)?.name) || "";

  return (
    <>
      <PageHero
        eyebrow="Request a quote"
        crumb="Request a Quote"
        title="Tell us what you need"
        intro="Complete the form and we will respond with a clear quotation. The more detail you give, the faster and more accurate our quote."
      />
      <section className="section">
        <div className="container-x grid gap-10 lg:grid-cols-[1fr_340px] lg:gap-14">
          <div className="card p-5 sm:p-8">
            <QuoteForm kind="quote" initialProduct={initialProduct} initialCategory={initialCategory} turnstileSiteKey={site.turnstileSiteKey} />
          </div>

          <aside className="space-y-6 lg:sticky lg:top-28 lg:self-start">
            <div className="card p-6">
              <h2 className="text-lg">What happens next</h2>
              <ol className="mt-4 space-y-3 text-sm">
                {[
                  "We review your requirement.",
                  "We source products to your specification.",
                  "You receive a clear quotation.",
                  "You confirm and we arrange supply and delivery.",
                ].map((t) => (
                  <li key={t} className="flex gap-2.5">
                    <CheckCircle2 aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-teal" />
                    {t}
                  </li>
                ))}
              </ol>
            </div>
            <div className="card p-6">
              <h2 className="text-lg">Prefer to chat?</h2>
              <p className="mt-2 text-sm">
                Use WhatsApp for a quick question. For a formal quotation please use the form.
              </p>
              <div className="mt-4">
                <WhatsAppButton message="Hello SAMSAL, I would like to ask about a quotation." className="btn-whatsapp w-full" />
              </div>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
