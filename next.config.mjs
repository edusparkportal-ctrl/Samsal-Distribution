/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  images: {
    formats: ["image/avif", "image/webp"],
  },
  async redirects() {
    // Once samsal.com is added to the Vercel project, everything on it is
    // permanently redirected to the primary domain (samsal.co.ke).
    const primary = "https://samsal.co.ke";
    return ["samsal.com", "www.samsal.com", "www.samsal.co.ke"].map((host) => ({
      source: "/:path*",
      has: [{ type: "host", value: host }],
      destination: `${primary}/:path*`,
      permanent: true,
    }));
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
