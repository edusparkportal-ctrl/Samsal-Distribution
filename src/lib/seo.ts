import type { Metadata } from "next";
import { absoluteUrl, site } from "@/config/site";

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

/** Organization structured data. Only includes facts that are configured and true. */
export function organizationJsonLd() {
  const sameAs = Object.values(site.social).filter(Boolean);
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.legalName,
    alternateName: site.name,
    url: site.url,
    logo: absoluteUrl("/logo/samsal-mark-512.png"),
    slogan: site.tagline,
    description: site.description,
    areaServed: [
      { "@type": "City", name: "Nairobi" },
      { "@type": "Country", name: "Kenya" },
    ],
    ...(site.contact.email ? { email: site.contact.email } : {}),
    ...(site.contact.phone ? { telephone: site.contact.phone } : {}),
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
