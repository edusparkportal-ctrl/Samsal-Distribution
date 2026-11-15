import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { MobileCtaBar } from "@/components/MobileCtaBar";
import { JsonLd } from "@/components/ui";
import { getSiteContent } from "@/lib/content/load";
import { whatsappHref } from "@/lib/content/helpers";
import { organizationJsonLd, websiteJsonLd } from "@/lib/seo";

/** The public website frame (header, footer, mobile CTA bar, announcement banner). Not used by /admin. */
export async function SiteChrome({ children }: { children: React.ReactNode }) {
  const content = await getSiteContent();
  const banner = content.announcements[0];
  return (
    <>
      <JsonLd data={organizationJsonLd(content)} />
      <JsonLd data={websiteJsonLd()} />
      {banner && (
        <div role="region" aria-label="Announcement" className="bg-amber px-4 py-2 text-center text-sm font-semibold text-navy">
          {banner.href ? <Link href={banner.href} className="underline underline-offset-2 hover:no-underline">{banner.message}</Link> : banner.message}
        </div>
      )}
      <Header
        social={content.social.filter((s) => s.header)}
        categories={content.categories.map((c) => ({ slug: c.slug, name: c.name, summary: c.summary }))}
        tagline={content.company.tagline}
        location={content.contact.address ?? content.company.coverage}
        phone={content.contact.phone}
        email={content.contact.email}
      />
      <main id="main">{children}</main>
      <Footer content={content} />
      <MobileCtaBar whatsapp={whatsappHref(content.contact.whatsappNumber)} />
    </>
  );
}
