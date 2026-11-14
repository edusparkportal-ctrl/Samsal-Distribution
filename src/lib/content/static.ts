import { categories, products } from "@/config/products";
import { industries } from "@/config/industries";
import { processSteps, services } from "@/config/services";
import { documents } from "@/config/documents";
import { photos, productPhotos } from "@/config/images";
import { site } from "@/config/site";
import type { SiteContent } from "./types";

/** Existing About-page copy (moved here from the page so the database seed and the fallback share one source). */
export const ABOUT_MISSION =
  "To simplify procurement and improve access to dependable products through efficient sourcing, competitive supply solutions and reliable distribution.";
export const ABOUT_VISION =
  "To become a trusted and recognised procurement and distribution partner for businesses and institutions across Africa.";
export const ABOUT_VALUES = [
  { title: "Integrity", description: "Honest dealing in every quotation, order and conversation." },
  { title: "Reliability", description: "Doing what we say we will do, when we say we will do it." },
  { title: "Accountability", description: "Owning outcomes and putting things right when they go wrong." },
  { title: "Efficiency", description: "Removing delay and effort from procurement for our customers." },
  { title: "Customer commitment", description: "Treating each customer's requirement as our own." },
  { title: "Continuous improvement", description: "Learning from every order to serve better the next time." },
];

/** The original hard-coded content, used when Supabase is not configured or temporarily unreachable. */
export function staticContent(): SiteContent {
  return {
    source: "static",
    company: {
      legalName: site.legalName, name: site.name, tagline: site.tagline, promise: site.promise, description: site.description,
      mission: ABOUT_MISSION, vision: ABOUT_VISION, values: ABOUT_VALUES, address: site.contact.address, city: "Nairobi", country: "Kenya",
      hours: site.contact.hours, coverage: site.serviceLocation, footerText: null, logo: null,
      registrationDetails: site.legal.registeredNumber, taxPin: null,
    },
    contact: { phone: site.contact.phone, email: site.contact.email, whatsappNumber: site.contact.whatsappNumber, hours: site.contact.hours, address: site.contact.address },
    contacts: [],
    social: (Object.entries(site.social) as [string, string | null][])
      .filter(([, url]) => Boolean(url))
      .map(([platform, url]) => ({ id: platform, platform: platform === "x" ? "X" : platform[0].toUpperCase() + platform.slice(1), url: url as string, header: false, footer: true, contact: true })),
    staff: [],
    homepage: {
      headline: site.headline, subheadline: site.heroText, heroImage: photos.hero ?? null,
      primaryCta: { label: "Request a Quote", href: "/quote" }, secondaryCta: { label: "Explore Our Products", href: "/products" },
      productsHeading: "What we supply", servicesHeading: "From requirement to receiving bay", industriesHeading: "Industries we serve",
    },
    categories: categories.map((c) => ({ ...c, image: photos[c.slug] ?? null })),
    products: products.map((p) => ({ ...p, image: p.image ?? productPhotos[p.slug] ?? undefined, featured: false })),
    services: services.map((s) => ({ slug: s.slug, title: s.title, icon: s.icon, summary: s.summary, detail: s.detail, featured: true })),
    industries: industries.map((i) => ({ slug: i.slug, name: i.name, summary: i.summary, needs: i.needs, categories: i.categories, image: photos[i.slug] ?? null, featured: true })),
    processSteps,
    documents,
    announcements: [],
    seo: {},
  };
}
