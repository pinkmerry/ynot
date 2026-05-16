import type { NextConfig } from "next";

// CSP intentionally deferred to a follow-up PR — requires frame-src for the
// YouTube livestream embed, a /api/csp/report endpoint, and dev-only
// 'unsafe-eval' gating before it can be enforced safely.
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "ynottcg.com",
          },
        ],
        destination: "https://www.ynottcg.com/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
