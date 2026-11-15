import Link from "next/link";
import { Building2, GraduationCap, Hotel, Landmark, Building, HeartHandshake } from "lucide-react";
import { BulletList, JsonLd, PageHero, Photo } from "@/components/ui";
import { CtaBanner } from "@/components/CtaBanner";
import { photos } from "@/config/images";
import { getSiteContent } from "@/lib/content/load";
import { breadcrumbJsonLd, pageMetadata, withSeo } from "@/lib/seo";

export async function generateMetadata() {
  return withSeo(
    pageMetadata({
      title: "Industries We Serve",
      description:
        "Supplies for corporate offices, schools, hospitality, property management, NGOs and public institutions in Nairobi and across Kenya.",
      path: "/industries",
    }),
    "/industries",
  );
}

const icons = {
  "corporate-offices": Building2,
  "educational-institutions": GraduationCap,
  "hospitality-businesses": Hotel,
  "property-management": Building,
  "ngos-development-organisations": HeartHandshake,
  "government-public-institutions": Landmark,
} as const;

export default async function IndustriesPage() {
  const { industries, categories } = await getSiteContent();
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Industries", path: "/industries" }])} />
      <PageHero
        eyebrow="Industries"
        crumb="Industries"
        title="Supply that fits how your sector buys"
        intro="Different organisations buy differently. Here is how we approach the supply needs of the sectors we serve."
      />

      {industries.map((ind, idx) => {
        const Icon = icons[ind.slug as keyof typeof icons] ?? Building2;
        return (
          <section key={ind.slug} id={ind.slug} className={`section scroll-mt-20 ${idx % 2 === 1 ? "bg-grey" : ""}`}>
            <div className={`container-x grid items-center gap-10 lg:grid-cols-2 lg:gap-16 ${idx % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""}`}>
              <Photo
                slot={ind.image ?? photos[ind.slug] ?? null}
                className="aspect-[4/3] rounded-lg"
                fallback={<Icon size={72} strokeWidth={1} />}
              />
              <div>
                <h2 className="text-3xl">{ind.name}</h2>
                <p className="mt-3 text-lg leading-relaxed">{ind.summary}</p>
                <h3 className="mb-3 mt-6 text-sm font-bold uppercase tracking-wider text-teal-dark">Typical supply needs</h3>
                <BulletList items={ind.needs} />
                <div className="mt-6 flex flex-wrap gap-2">
                  {ind.categories.map((slug) => {
                    const c = categories.find((x) => x.slug === slug);
                    return c ? (
                      <Link key={slug} href={`/products?category=${slug}`} className="rounded border border-grey-300 bg-white px-3 py-1.5 text-xs font-semibold text-navy hover:border-teal">
                        {c.name}
                      </Link>
                    ) : null;
                  })}
                </div>
              </div>
            </div>
          </section>
        );
      })}

      <CtaBanner title="Tell us what your organisation needs" />
    </>
  );
}
