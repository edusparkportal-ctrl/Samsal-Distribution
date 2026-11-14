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
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
