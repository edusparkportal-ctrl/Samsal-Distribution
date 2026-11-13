import type { IconName } from "@/config/products";
import type { ServiceIcon } from "@/config/services";

export type { IconName, ServiceIcon };
export type Img = { src: string; alt: string } | null;

export const CATEGORY_ICONS: IconName[] = ["spray", "hand", "file", "boxes", "package", "utensils", "wrench"];
export const SERVICE_ICONS: ServiceIcon[] = ["search", "boxes", "building", "truck", "clipboard", "map"];

export type ContentCategory = { slug: string; name: string; summary: string; icon: IconName; seoDescription: string; image: Img };
export type ContentProduct = {
  slug: string; name: string; category: string; description: string;
  specs: { label: string; value: string }[]; packaging: string | null; image?: { src: string; alt: string }; featured: boolean;
};
export type ContentService = { slug: string; title: string; icon: ServiceIcon; summary: string; detail: string; featured: boolean };
export type ContentIndustry = { slug: string; name: string; summary: string; needs: string[]; categories: string[]; image: Img };
export type ContentStaff = {
  id: string; name: string; position: string; department: string | null; biography: string | null;
  photo: Img; email: string | null; linkedin: string | null;
};
export type ContentSocial = { id: string; platform: string; url: string; header: boolean; footer: boolean; contact: boolean };
export type ContentContact = { id: string; kind: "phone" | "email" | "whatsapp"; label: string; value: string; primary: boolean };
export type ContentDocument = { title: string; description: string; file: string | null };
export type ContentAnnouncement = { id: string; message: string; href: string | null };
export type ContentStep = { title: string; text: string };

export type SiteContent = {
  source: "database" | "static";
  company: {
    legalName: string; name: string; tagline: string; promise: string; description: string;
    mission: string | null; vision: string | null; values: { title: string; description: string | null }[];
    address: string | null; city: string | null; country: string | null; hours: string | null; coverage: string;
    footerText: string | null; logo: Img;
    // Shown on quotations only when an admin has entered them. Never invented.
    registrationDetails: string | null; taxPin: string | null;
  };
  contact: { phone: string | null; email: string | null; whatsappNumber: string | null; hours: string | null; address: string | null };
  contacts: ContentContact[];
  social: ContentSocial[];
  staff: ContentStaff[];
  homepage: {
    headline: string; subheadline: string; heroImage: Img;
    primaryCta: { label: string; href: string } | null; secondaryCta: { label: string; href: string } | null;
    productsHeading: string; servicesHeading: string; industriesHeading: string;
  };
  categories: ContentCategory[];
  products: ContentProduct[];
  services: ContentService[];
  industries: ContentIndustry[];
  processSteps: ContentStep[];
  documents: ContentDocument[];
  announcements: ContentAnnouncement[];
  seo: Record<string, { title: string | null; description: string | null; ogImage: string | null; canonical: string | null; noindex: boolean }>;
};
