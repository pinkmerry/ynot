import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("site session cookies require current versioned JWT payloads", () => {
  const session = source("../src/lib/lucky-draw/session.ts");

  assert.doesNotMatch(
    session,
    /cookieStore\.get\(legacyLuckyDrawSessionCookie\)\?\.value/,
    "legacy two-part cookies must not be accepted as active sessions",
  );
  assert.match(
    session,
    /typeof parsed\.sessionVersion !== "number"[\s\S]*return null/,
    "reader rejects cookies that predate sessionVersion",
  );
  assert.match(
    session,
    /typeof session\.sessionVersion !== "number"[\s\S]*return false/,
    "sessionVersion validation fails closed when the cookie has no version",
  );
  assert.doesNotMatch(
    session,
    /isLegacySchemaError\(error\)[\s\S]*return true/,
    "sessionVersion validation must not fail open on missing DB schema",
  );
});

test("auth profile resolution only accepts active profiles", () => {
  const resolver = source("../src/lib/auth/resolve-current-profile.ts");
  const profile = source("../src/lib/auth/profile.ts");
  const lineIdentity = source("../src/lib/line/link-identity.ts");

  assert.match(
    resolver,
    /profileRow\.profile_status !== "active"/,
    "LINE/site session resolver rejects merged and disabled profiles",
  );
  assert.match(
    profile,
    /\.eq\("profile_status", "active"\)/,
    "Supabase profile lookup requires active profile status",
  );
  assert.doesNotMatch(
    profile,
    /\.neq\("profile_status", "disabled"\)/,
    "Supabase profile lookup must not treat merged profiles as active",
  );
  assert.match(
    lineIdentity,
    /\.eq\("profile_status", "active"\)/,
    "LINE identity linking only targets active profiles",
  );
  assert.doesNotMatch(
    lineIdentity,
    /\.neq\("profile_status", "disabled"\)/,
    "LINE identity linking must not treat merged profiles as active",
  );
});

test("LIFF session minting requires fresh LINE claims and coarse rate limit", () => {
  const route = source("../src/app/api/line/session/route.ts");

  assert.match(
    route,
    /enforceRateLimit\(\s*request,\s*"line:session:mint:ip"/,
    "LIFF session mint has an IP fallback rate limit before provider verification",
  );
  assert.match(
    route,
    /!preClaims[\s\S]*typeof preClaims\.iat !== "number"[\s\S]*typeof preClaims\.exp !== "number"[\s\S]*!preClaims\.sub[\s\S]*preClaims\.aud !== lineChannelId/,
    "LIFF session mint rejects missing iat/exp/sub/aud claims before LINE verify",
  );
  assert.match(
    route,
    /Date\.now\(\) >= preClaims\.exp \* 1000/,
    "LIFF session mint rejects expired id tokens locally",
  );
  assert.match(
    route,
    /preClaims\.sub !== verified\.sub/,
    "LIFF session mint compares verified LINE subject to pre-verified subject",
  );
});

test("all API mutations receive a global same-origin guard", () => {
  const middleware = source("../src/middleware.ts");

  assert.match(
    middleware,
    /API_MUTATION_METHODS = new Set/,
    "middleware defines mutating methods",
  );
  assert.match(
    middleware,
    /request\.nextUrl\.pathname\.startsWith\("\/api\/"\)/,
    "middleware applies the guard to API routes",
  );
  assert.match(
    middleware,
    /Cross-origin mutation requests are not allowed/,
    "middleware returns the shared cross-origin mutation error",
  );
  assert.doesNotMatch(
    middleware,
    /api\/auth/,
    "auth API routes must not be excluded from the API mutation guard",
  );
});
