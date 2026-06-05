import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV === "development";

// CSP is enforced. 'unsafe-inline' on script-src is retained because this
// deployment does not yet run the per-request nonce proxy required by Next.js
// for strict inline script CSP. Next's current docs require 'unsafe-eval' only
// for development debugging, so production does not include it.
const scriptSrc = [
  "'self'",
  "'unsafe-inline'",
  ...(isDevelopment ? ["'unsafe-eval'"] : []),
  "https://static.line-scdn.net",
].join(" ");

const cspDirectives = [
  "default-src 'self'",
  // Scripts: self + inline (Next.js runtime). Add hosts as needed for
  // third-party widgets.
  `script-src ${scriptSrc}`,
  // Styles: self + inline (Tailwind injects inline styles in some flows).
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  // Images: self + data URLs + https everywhere (avatar/card images from
  // Supabase storage, LINE picture URLs, etc.).
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  // Outbound XHR/fetch: self + Supabase REST/storage/realtime + LINE API.
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.line.me https://access.line.me",
  // YouTube livestream embed + LIFF iframes.
  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://liff.line.me https://access.line.me",
  // Lock down everything else.
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://access.line.me",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

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
  { key: "Content-Security-Policy", value: cspDirectives },
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
};

export default nextConfig;

import("@opennextjs/cloudflare").then((m) =>
  m.initOpenNextCloudflareForDev({
    configPath: process.env.NEXT_DEV_WRANGLER_CONFIG ?? "wrangler.website.jsonc",
  }),
);
