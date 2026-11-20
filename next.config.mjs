import { baseSecurityHeaders, buildCsp, cspHeaderName } from "./src/lib/security/csp.mjs";

// Images uploaded through the admin media library are served from the project's public Storage bucket.
const supabaseHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : null;
  } catch {
    return null;
  }
})();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/public-media/**" }]
      : [],
  },
  async redirects() {
    // Legacy URL from an earlier draft; the Privacy Policy lives at /privacy.
    const legacy = [{ source: "/privacy-policy", destination: "/privacy", permanent: true }];
    // Once samsal.com is added to the Vercel project, everything on it is
    // permanently redirected to the primary domain (samsal.co.ke).
    const primary = "https://samsal.co.ke";
    const domainRedirects = ["samsal.com", "www.samsal.com", "www.samsal.co.ke"].map((host) => ({
      source: "/:path*",
      has: [{ type: "host", value: host }],
      destination: `${primary}/:path*`,
      permanent: true,
    }));
    return [...legacy, ...domainRedirects];
  },
  async headers() {
    const dev = process.env.NODE_ENV !== "production";
    const reportOnly = process.env.CSP_REPORT_ONLY === "1";
    const csp = buildCsp({ dev, supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, reportUri: "/api/csp-report" });
    return [
      // Security headers on every response, including /admin and the API.
      { source: "/:path*", headers: baseSecurityHeaders() },
      // The public site gets the static policy. /admin gets a stricter, nonce-based one from src/middleware.ts.
      { source: "/((?!admin).*)", headers: [{ key: cspHeaderName(reportOnly), value: csp }] },
    ];
  },
};

export default nextConfig;
