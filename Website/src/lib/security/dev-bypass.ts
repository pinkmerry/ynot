import "server-only";

/**
 * Single source of truth for "is a dev-only bypass allowed in this process?"
 *
 * Two factors must BOTH be true:
 *
 *   1. `process.env.NODE_ENV !== "production"` — the historical gate. Next.js
 *      inlines this at build time, so a production build hard-codes `false`
 *      and dead-eliminates the dev branch. Defense in depth against a
 *      misconfigured preview deployment that ships with the dev build.
 *
 *   2. `process.env.YNOTT_ALLOW_DEV_BYPASS === "true"` — explicit, opt-in
 *      flag. Only ever set in a developer's local `.env.local` (or
 *      equivalent). Production wrangler configs never set this. So even if
 *      factor #1 ever flips open (e.g. accidentally shipping a non-prod
 *      build), the bypass stays closed unless someone also flips this flag
 *      — which an attacker cannot do from the network.
 *
 * Use this in place of bare `process.env.NODE_ENV !== "production"` for ALL
 * dev-only auth bypasses, mock data injection, preview-user shortcuts, and
 * admin-gate fallbacks. UI display logic (e.g. "show admin badge in dev")
 * can keep the bare NODE_ENV check — those don't grant trust.
 */
export function isDevBypassAllowed(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.YNOTT_ALLOW_DEV_BYPASS === "true"
  );
}

/**
 * Stricter variant of `isDevBypassAllowed()` for bypasses that write to a
 * Supabase database. Returns true only when the configured Supabase URL
 * looks like a local development instance, NOT a hosted Supabase project.
 *
 * This protects the developer-footgun case where someone runs `next dev`
 * locally with `.env.local` pointing at production Supabase and inadvertently
 * triggers an endpoint that writes test rows into prod.
 */
export function isDevBypassWithLocalSupabaseAllowed(): boolean {
  if (!isDevBypassAllowed()) return false;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  if (!url) return false;
  try {
    const { hostname } = new URL(url);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local")
    );
  } catch {
    return false;
  }
}
