/**
 * CENTRAL BUSINESS CONFIGURATION
 * ------------------------------
 * Edit this file (and the .env values) to change business information
 * everywhere on the site. Items marked CONFIRM need the owner's input.
 */

const env = (v: string | undefined) => (v && v.trim() !== "" ? v.trim() : null);

export const site = {
  name: "SAMSAL",
  legalName: "SAMSAL Supply & Distribution Limited",
  tagline: "Procurement. Supply. Delivery.",
  headline: "Reliable Supply. Smarter Procurement.",
  heroText:
    "SAMSAL Supply & Distribution connects businesses and institutions with dependable sourcing, quality products and efficient delivery solutions.",
  promise:
    "SAMSAL connects businesses and institutions with dependable product sourcing, competitive quotations and reliable supply and delivery solutions.",
  description:
    "SAMSAL Supply & Distribution Limited is a Nairobi-based procurement, wholesale supply and distribution company serving businesses and institutions in Kenya.",

  // Canonical primary domain. samsal.com is redirected to it (see next.config.mjs).
  url: (env(process.env.NEXT_PUBLIC_SITE_URL) ?? "https://samsal.co.ke").replace(/\/$/, ""),
  alternateDomain: "https://samsal.com",
  locale: "en_KE",

  serviceLocation: "Nairobi, Kenya", // initial service area; CONFIRM wording for surrounding areas

  // CONFIRM: all contact details are intentionally empty until supplied.
  contact: {
    phone: env(process.env.NEXT_PUBLIC_CONTACT_PHONE),
    email: env(process.env.NEXT_PUBLIC_CONTACT_EMAIL),
    whatsappNumber: env(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER)?.replace(/\D/g, "") ?? null,
    hours: env(process.env.NEXT_PUBLIC_BUSINESS_HOURS),
    address: null as string | null, // CONFIRM: physical address (not published until provided)
  },

  // CONFIRM: add real profile URLs only when they exist.
  social: {
    linkedin: null as string | null,
    facebook: null as string | null,
    instagram: null as string | null,
    x: null as string | null,
  },

  turnstileSiteKey: env(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY),
} as const;

export const placeholders = {
  phone: "[Telephone number to be added]",
  email: "[Business email to be added]",
  whatsapp: "[WhatsApp number to be added]",
  hours: "[Business hours to be added]",
};

export function whatsappLink(message?: string): string | null {
  const n = site.contact.whatsappNumber;
  if (!n) return null;
  const text = message ?? "Hello SAMSAL, I would like to make a procurement enquiry.";
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

export function absoluteUrl(path = "/") {
  return `${site.url}${path.startsWith("/") ? path : `/${path}`}`;
}
