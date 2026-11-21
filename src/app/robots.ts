import type { MetadataRoute } from "next";
import { absoluteUrl, site } from "@/config/site";

// Draft legal files in /public/legal are kept out of search results until a qualified adviser has approved them
// (site.legal.reviewed in src/config/site.ts).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/portal/", ...(site.legal.reviewed ? [] : ["/legal/"])] }],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
