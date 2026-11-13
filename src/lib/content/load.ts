import "server-only";
import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";
import { supabasePublicEnv } from "@/lib/supabase/env";
import { site } from "@/config/site";
import { staticContent } from "./static";
import { CATEGORY_ICONS, SERVICE_ICONS, type IconName, type Img, type ServiceIcon, type SiteContent } from "./types";

type Media = { bucket: string; storage_path: string; alt_text: string | null } | null;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped Supabase rows are validated field by field below

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/** Public URL of a file in the PUBLIC bucket only. Private documents never get a public URL. */
export function publicMediaUrl(m: Media): string | null {
  const env = supabasePublicEnv();
  if (!env || !m || m.bucket !== "public-media") return null;
  return `${env.url}/storage/v1/object/public/public-media/${m.storage_path.split("/").map(encodeURIComponent).join("/")}`;
}
const img = (m: Media, fallbackSrc: string | null, fallbackAlt: string | null, altOverride?: string | null): Img => {
  const url = publicMediaUrl(m);
  if (url) return { src: url, alt: m?.alt_text || altOverride || fallbackAlt || "" };
  return fallbackSrc ? { src: fallbackSrc, alt: fallbackAlt || altOverride || "" } : null;
};
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const internalOrHttps = (v: unknown) => (typeof v === "string" && /^(\/|https:\/\/)/.test(v) ? v : null);

/** Fetches every row set the public pages need. Throws on any query error (caller falls back). */
async function fromDatabase(): Promise<SiteContent> {
  const sb = createPublicClient();
  if (!sb) throw new Error("not configured");
  const media = "media_assets(bucket, storage_path, alt_text)";
  const q = async <T,>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>, name: string): Promise<T> => {
    const { data, error } = await p;
    if (error) throw new Error(`${name}: ${error.message}`);
    return (data ?? ([] as unknown)) as T;
  };

  const [company, home, contacts, social, staff, values, cats, prods, svcs, inds, steps, docs, anns, seo] = await Promise.all([
    q<Row[]>(sb.from("company_settings").select(`*, logo:${media.replace("media_assets", "media_assets!company_settings_logo_media_id_fkey")}`).limit(1), "company_settings"),
    q<Row[]>(sb.from("homepage_settings").select(`*, hero:${media.replace("media_assets", "media_assets!homepage_settings_hero_media_id_fkey")}`).limit(1), "homepage_settings"),
    q<Row[]>(sb.from("contact_channels").select("*").order("sort_order"), "contact_channels"),
    q<Row[]>(sb.from("social_links").select("*").order("sort_order"), "social_links"),
    q<Row[]>(sb.from("staff_members").select(`*, photo:${media.replace("media_assets", "media_assets!staff_members_photo_media_id_fkey")}`).order("sort_order"), "staff_members"),
    q<Row[]>(sb.from("company_values").select("*").order("sort_order"), "company_values"),
    q<Row[]>(sb.from("product_categories").select("*").order("sort_order"), "product_categories"),
    q<Row[]>(sb.from("products").select(`*, category:product_categories(slug), photo:${media.replace("media_assets", "media_assets!products_photo_media_id_fkey")}, specs:product_specifications(label, value, sort_order)`).order("sort_order"), "products"),
    q<Row[]>(sb.from("services").select("*").order("sort_order"), "services"),
    q<Row[]>(sb.from("industries").select("*, needs:industry_needs(text, sort_order), cats:industry_categories(sort_order, category:product_categories(slug))").order("sort_order"), "industries"),
    q<Row[]>(sb.from("process_steps").select("*").order("sort_order"), "process_steps"),
    q<Row[]>(sb.from("site_documents").select(`*, file:${media.replace("media_assets", "media_assets!site_documents_media_id_fkey")}`).order("sort_order"), "site_documents"),
    q<Row[]>(sb.from("announcements").select("*").order("created_at", { ascending: false }), "announcements"),
    q<Row[]>(sb.from("seo_pages").select("path, title, description, canonical_url, noindex, og:media_assets(bucket, storage_path, alt_text)"), "seo_pages"),
  ]);

  const fallback = staticContent();
  const c = company[0];
  const h = home[0];
  if (!c || !h) throw new Error("company/homepage settings missing: run supabase/seed.sql");

  const primary = (kind: string) => contacts.find((x) => x.kind === kind && x.is_primary) ?? contacts.find((x) => x.kind === kind);
  const phone = primary("phone")?.value ?? null;
  const email = primary("email")?.value ?? null;
  const wa = primary("whatsapp")?.value ?? null;

  const categorySlugs = new Set(cats.map((x) => x.slug));
  const cta = (label: unknown, href: unknown) => (text(label) && internalOrHttps(href) ? { label: label as string, href: href as string } : null);

  return {
    source: "database",
    company: {
      legalName: c.registered_name, name: c.brand_name, tagline: text(c.tagline) ?? fallback.company.tagline,
      promise: text(c.promise) ?? fallback.company.promise, description: text(c.description) ?? fallback.company.description,
      mission: text(c.mission), vision: text(c.vision),
      values: values.map((v) => ({ title: v.title, description: text(v.description) })),
      address: text(c.address_line), city: text(c.city), country: text(c.country), hours: text(c.business_hours),
      coverage: text(c.service_coverage) ?? fallback.company.coverage, footerText: text(c.footer_text),
      logo: img(one(c.logo), null, c.brand_name),
      registrationDetails: text(c.registration_details), taxPin: text(c.tax_pin),
    },
    contact: {
      // A database value wins; the old environment variables remain a fallback so nothing disappears during migration.
      phone: phone ?? site.contact.phone, email: email ?? site.contact.email,
      whatsappNumber: (wa ? wa.replace(/\D/g, "") : null) ?? site.contact.whatsappNumber,
      hours: text(c.business_hours) ?? site.contact.hours, address: text(c.address_line) ?? site.contact.address,
    },
    contacts: contacts.filter((x) => x.is_active && x.is_public).map((x) => ({ id: x.id, kind: x.kind, label: x.label, value: x.value, primary: x.is_primary })),
    social: social.filter((s) => s.enabled).map((s) => ({ id: s.id, platform: s.platform, url: s.url, header: s.show_in_header, footer: s.show_in_footer, contact: s.show_on_contact })),
    staff: staff.map((s) => ({
      id: s.id, name: s.full_name, position: s.position, department: text(s.department), biography: text(s.biography),
      photo: img(one(s.photo), null, s.full_name), email: s.show_email ? text(s.email) : null, linkedin: text(s.linkedin_url),
    })),
    homepage: {
      headline: h.headline, subheadline: text(h.subheadline) ?? "", heroImage: img(one(h.hero), fallback.homepage.heroImage?.src ?? null, fallback.homepage.heroImage?.alt ?? null),
      primaryCta: cta(h.primary_cta_label, h.primary_cta_href), secondaryCta: cta(h.secondary_cta_label, h.secondary_cta_href),
      productsHeading: text(h.products_heading) ?? fallback.homepage.productsHeading,
      servicesHeading: text(h.services_heading) ?? fallback.homepage.servicesHeading,
      industriesHeading: text(h.industries_heading) ?? fallback.homepage.industriesHeading,
    },
    categories: cats.map((x) => ({
      slug: x.slug, name: x.name, summary: text(x.summary) ?? "", icon: (CATEGORY_ICONS.includes(x.icon) ? x.icon : "boxes") as IconName,
      seoDescription: text(x.seo_description) ?? text(x.summary) ?? "", image: img(null, x.fallback_image, x.image_alt, x.name),
    })),
    products: prods
      .filter((p) => one(p.category)?.slug && categorySlugs.has(one(p.category).slug))
      .map((p) => {
        const photo = img(one(p.photo), p.fallback_image, p.image_alt, p.name);
        return {
          slug: p.slug, name: p.name, category: one(p.category).slug, description: text(p.description) ?? text(p.summary) ?? "",
          specs: ((p.specs ?? []) as Row[]).sort((a, b) => a.sort_order - b.sort_order).map((s) => ({ label: s.label, value: s.value })),
          packaging: text(p.packaging), image: photo ?? undefined, featured: Boolean(p.is_featured),
        };
      }),
    services: svcs.map((s) => ({
      slug: s.slug, title: s.title, icon: (SERVICE_ICONS.includes(s.icon) ? s.icon : "boxes") as ServiceIcon,
      summary: text(s.summary) ?? "", detail: text(s.description) ?? text(s.summary) ?? "", featured: Boolean(s.is_featured),
    })),
    industries: inds.map((i) => ({
      slug: i.slug, name: i.title, summary: text(i.summary) ?? "",
      needs: ((i.needs ?? []) as Row[]).sort((a, b) => a.sort_order - b.sort_order).map((n) => n.text),
      categories: ((i.cats ?? []) as Row[]).sort((a, b) => a.sort_order - b.sort_order).map((x) => one(x.category)?.slug).filter(Boolean),
      image: null,
    })),
    processSteps: steps.map((s) => ({ title: s.title, text: s.body })),
    documents: docs.map((d) => ({ title: d.title, description: text(d.description) ?? "", file: publicMediaUrl(one(d.file)) })),
    announcements: anns.map((a) => ({ id: a.id, message: a.message, href: internalOrHttps(a.link_href) })),
    seo: Object.fromEntries(seo.map((s) => [s.path, { title: text(s.title), description: text(s.description), ogImage: publicMediaUrl(one(s.og)), canonical: text(s.canonical_url), noindex: Boolean(s.noindex) }])),
  };
}

/**
 * THE entry point for public pages. Database first, static config as a safety net.
 * Cached per request (React cache) and across requests (fetch revalidate 60s + tag "cms", which admin
 * saves purge immediately via revalidateTag).
 */
export const getSiteContent = cache(async (): Promise<SiteContent> => {
  if (!createPublicClient()) return staticContent();
  try {
    return await fromDatabase();
  } catch (err) {
    console.error("[content] Falling back to static content:", err instanceof Error ? err.message : err);
    return staticContent();
  }
});
