import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("customer top-up remains stricter than pack opening", () => {
  const walletRoute = readSource("../src/app/api/ynot/wallet/route.ts");
  const gachaOpenRoute = readSource("../src/app/api/ynot/gacha/open/route.ts");

  assert.match(
    walletRoute,
    /enforceRateLimit\(request,\s*"ynot:wallet:top-up",\s*\{\s*limit:\s*6,\s*windowMs:\s*60_000\s*\}/,
  );
  assert.match(gachaOpenRoute, /const gachaOpenRateLimit = \{\s*\/\/[\s\S]*limit:\s*120,\s*windowMs:\s*60_000,\s*\}/);
  assert.match(
    gachaOpenRoute,
    /enforceRateLimit\(request,\s*"ynot:gacha:open",\s*gachaOpenRateLimit,\s*session\.profileId\)/,
  );
});

test("rate-limit backend failures do not expose internal details", () => {
  const rateLimit = readSource("../src/lib/security/rate-limit.ts");

  assert.match(rateLimit, /console\.warn\(\s*"rate_limit_backend_unavailable"/);
  assert.match(rateLimit, /\{\s*error:\s*"Rate-limit backend is unavailable\."\s*\}/);
  assert.doesNotMatch(rateLimit, /detail:\s*error instanceof Error/);
});
