// next/image must be allowed to load backend-served images (S3-backed material
// images, seller avatars) in addition to Google avatars and the stock/avatar/
// placeholder hosts used by seed data. The API host is derived from
// NEXT_PUBLIC_API_URL, falling back to the local dev API the same way the app's
// API client does (apps/web/src/app/providers.tsx) so API-served images render
// in dev even when NEXT_PUBLIC_API_URL is unset.
const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "production" ? "" : "http://localhost:8000");
const apiRemotePatterns = [];
if (apiUrl) {
  try {
    const u = new URL(apiUrl);
    apiRemotePatterns.push({
      protocol: u.protocol.replace(":", ""),
      hostname: u.hostname,
      ...(u.port ? { port: u.port } : {}),
    });
  } catch {
    /* ignore malformed NEXT_PUBLIC_API_URL */
  }
}

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Clickjacking protection without constraining script/style sources (a full
  // script-src CSP would need per-env nonces for Clerk/Next — tighten later).
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    return [
      {
        source: "/materials/:id",
        destination: "/material/:id",
        permanent: true,
      },
    ];
  },
  transpilePackages: ["@repo/ui", "@repo/core", "nativewind"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "**.amazonaws.com" },
      // Stock photos, generated avatars, and placeholders referenced by seed data.
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "api.dicebear.com" },
      { protocol: "https", hostname: "via.placeholder.com" },
      ...apiRemotePatterns,
    ],
    // DiceBear serves avatars as SVG; next/image refuses to optimize SVG by
    // default (400). The host allowlist above is restricted to trusted avatar
    // services, and next renders these under a no-script sandbox CSP, so this
    // is safe for our controlled set of remote patterns.
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "react-native$": "react-native-web",
    };
    
    // Explicitly map react-native to react-native-web
    config.resolve.alias["react-native"] = "react-native-web";

    config.resolve.extensions = [
      ".web.tsx",
      ".web.ts",
      ".web.jsx",
      ".web.js",
      ...config.resolve.extensions,
    ];

    // Important: Avoid webpack trying to bundle native modules
    config.resolve.fallback = {
      ...config.resolve.fallback,
      "react-native": false,
    };

    return config;
  },
};

export default nextConfig;
