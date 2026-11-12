import type { MetadataRoute } from "next";
import { absoluteUrl, site } from "@/config/site";

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

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return routes.map((r) => ({
    url: absoluteUrl(r.path),
    lastModified,
    changeFrequency: "monthly",
    priority: r.priority,
  }));
}
