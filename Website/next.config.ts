import type { NextConfig } from "next";

// CSP is enforced. 'unsafe-inline' on script-src is required because Next.js 16
// still emits inline runtime scripts; switching to nonce-based CSP needs
// middleware support that the current Cloudflare Worker setup does not yet
// wire up. 'unsafe-eval' is needed for the LIFF SDK. Other directives
// (frame-ancestors, object-src, base-uri, form-action) still provide
// meaningful clickjacking and form-hijack protection even with relaxed scripts.
const cspDirectives = [
  "default-src 'self'",
  // Scripts: self + inline (Next.js runtime). Add hosts as needed for
  // third-party widgets. unsafe-eval kept for LIFF SDK compatibility.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.line-scdn.net",
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
