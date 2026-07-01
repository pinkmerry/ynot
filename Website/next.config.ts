import type { NextConfig } from "next";

const buildSurface =
  process.env.YNOT_CLOUDFLARE_TARGET ?? process.env.YNOT_WORKER_SURFACE;

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
  assetPrefix:
    buildSurface === "marketplace" ? "/marketplace-assets" : undefined,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;

import("@opennextjs/cloudflare").then((m) =>
  m.initOpenNextCloudflareForDev({
    configPath: process.env.NEXT_DEV_WRANGLER_CONFIG ?? "wrangler.website.jsonc",
  }),
);
