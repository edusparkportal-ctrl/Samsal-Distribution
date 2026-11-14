import type { MetadataRoute } from "next";
import { absoluteUrl, site } from "@/config/site";
import { getSiteContent } from "@/lib/content/load";

const routes = [
  { path: "/", priority: 1 },
  { path: "/about", priority: 0.7 },
  { path: "/products", priority: 0.9 },
  { path: "/services", priority: 0.8 },
  { path: "/industries", priority: 0.7 },
  { path: "/contact", priority: 0.7 },
  { path: "/quote", priority: 0.9 },
];
// Legal pages are listed only once they have been reviewed and approved (see site.legal.reviewed).
if (site.legal.reviewed) {
  routes.push({ path: "/privacy", priority: 0.3 }, { path: "/terms", priority: 0.3 });
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { seo } = await getSiteContent();
  const lastModified = new Date();
  return routes
    .filter((r) => !seo[r.path]?.noindex) // pages an admin marked "do not list" stay out of the sitemap
    .map((r) => ({ url: absoluteUrl(r.path), lastModified, changeFrequency: "monthly", priority: r.priority }));
}
