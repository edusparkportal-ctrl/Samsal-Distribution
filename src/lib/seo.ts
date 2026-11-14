import type { Metadata } from "next";
import { absoluteUrl, site } from "@/config/site";
import { getSiteContent } from "@/lib/content/load";
import type { SiteContent } from "@/lib/content/types";

/** Page-level metadata with canonical URL and Open Graph / Twitter tags. */
export function pageMetadata({
  title,
  description,
  path,
  noindex = false,
}: {
  title: string;
  description: string;
  path: string;
  noindex?: boolean;
}): Metadata {
  const url = absoluteUrl(path);
  return {
    title,
    description,
    alternates: { canonical: url },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: `${title} | ${site.legalName}`,
      description,
      url,
      siteName: site.legalName,
      locale: site.locale,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ${site.legalName}`,
      description,
    },
  };
}

/**
 * Applies admin-entered SEO overrides (Admin > Website > SEO) on top of a page's built-in metadata.
 * A page set to "noindex" in the admin stays noindex; a built-in noindex (unreviewed legal pages)
 * is never removed by an override.
 */
export async function withSeo(base: Metadata, path: string): Promise<Metadata> {
  const o = (await getSiteContent()).seo[path];
  if (!o) return base;
  const title = o.title ?? (typeof base.title === "string" ? base.title : undefined);
  const description = o.description ?? base.description ?? undefined;
  const url = o.canonical ?? absoluteUrl(path);
  const openGraph = {
    ...(base.openGraph ?? {}),
    ...(title ? { title: `${title} | ${site.legalName}` } : {}),
    ...(description ? { description } : {}),
    url,
    ...(o.ogImage ? { images: [{ url: o.ogImage }] } : {}),
  };
  return {
    ...base,
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    alternates: { canonical: url },
    openGraph: openGraph as Metadata["openGraph"],
    twitter: { ...(base.twitter ?? {}), ...(title ? { title: `${title} | ${site.legalName}` } : {}), ...(description ? { description } : {}), ...(o.ogImage ? { images: [o.ogImage] } : {}) } as Metadata["twitter"],
    ...(o.noindex ? { robots: { index: false, follow: true } } : {}),
  };
}

/** Organization structured data. Only includes facts that are configured and true. */
export function organizationJsonLd(c: SiteContent) {
  const sameAs = c.social.map((s) => s.url);
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: c.company.legalName,
    alternateName: c.company.name,
    url: site.url,
    logo: c.company.logo?.src ?? absoluteUrl("/logo/samsal-mark-512.png"),
    slogan: c.company.tagline,
    description: c.company.description,
    areaServed: [
      { "@type": "City", name: "Nairobi" },
      { "@type": "Country", name: "Kenya" },
    ],
    ...(c.contact.email ? { email: c.contact.email } : {}),
    ...(c.contact.phone ? { telephone: c.contact.phone } : {}),
    ...(c.company.address
      ? { address: { "@type": "PostalAddress", streetAddress: c.company.address, ...(c.company.city ? { addressLocality: c.company.city } : {}), addressCountry: "KE" } }
      : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: site.legalName,
    url: site.url,
    inLanguage: "en-KE",
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: absoluteUrl(it.path),
    })),
  };
}
