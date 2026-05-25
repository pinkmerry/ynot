import "server-only";

/**
 * Decide whether to mark cookies as `Secure`. The previous implementation tied
 * this to `process.env.NODE_ENV === "production"`, which is brittle: if NODE_ENV
 * is misconfigured (or unset on a particular Worker build), production traffic
 * could end up with non-Secure cookies that travel in plaintext.
 *
 * Strategy now:
 *   1. If the configured site URL is HTTPS, return true. (Production wrangler
 *      configs set NEXT_PUBLIC_SITE_URL to https://www.ynotopen.com / liff.)
 *   2. Otherwise, fall through to the original NODE_ENV check so dev/test
 *      environments without HTTPS continue to set non-Secure cookies.
 *
 * Pass the incoming `Request` when available — we additionally inspect the
 * X-Forwarded-Proto / cf-visitor headers Cloudflare injects, which catches the
 * case where NEXT_PUBLIC_SITE_URL is missing but the actual request arrived
 * over HTTPS.
 */
export function shouldUseSecureCookies(request?: Request): boolean {
  // Prefer the actual request protocol when we have a request — this is the
  // ground truth for the connection that will receive the cookie. A dev
  // running locally with a prod-config NEXT_PUBLIC_SITE_URL still gets
  // non-Secure cookies on http://localhost this way.
  if (request) {
    const forwardedProto = request.headers
      .get("x-forwarded-proto")
      ?.split(",")[0]
      ?.trim()
      .toLowerCase();
    if (forwardedProto === "https") return true;
    if (forwardedProto === "http") return false;

    const cfVisitor = request.headers.get("cf-visitor");
    if (cfVisitor && cfVisitor.includes('"scheme":"https"')) return true;
    if (cfVisitor && cfVisitor.includes('"scheme":"http"')) return false;

    try {
      const url = new URL(request.url);
      if (url.protocol === "https:") return true;
      if (url.protocol === "http:") return false;
    } catch {
      // Ignore — request.url is normally a valid absolute URL but be defensive.
    }
  }

  // No request available (e.g. signOutAction server action): fall back to the
  // configured site URL. Production wrangler configs set this to https.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (siteUrl) {
    try {
      if (new URL(siteUrl).protocol === "https:") return true;
    } catch {
      // Malformed env value — fall through to the NODE_ENV gate.
    }
  }

  // Last-resort fallback: keep the historical NODE_ENV gate so local HTTP dev
  // still gets non-Secure cookies. Production builds always set
  // NODE_ENV=production, so this is a safe floor — but the HTTPS-derived
  // branches above are the primary signal.
  return process.env.NODE_ENV === "production";
}
