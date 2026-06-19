import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("customer top-up remains stricter than pack-opening request bursts", () => {
  const walletRoute = readSource("../src/app/api/ynot/wallet/route.ts");
  const gachaOpenRoute = readSource("../src/app/api/ynot/gacha/open/route.ts");

  assert.match(
    walletRoute,
    /enforceRateLimit\(request,\s*"ynot:wallet:top-up",\s*\{\s*limit:\s*6,\s*windowMs:\s*60_000\s*\}/,
  );
  assert.match(gachaOpenRoute, /const gachaOpenRequestRateLimit = \{[\s\S]*scope: "ynot:gacha:open",[\s\S]*limit: 120,[\s\S]*windowMs: 60_000,/);
  assert.match(gachaOpenRoute, /const gachaOpenProfileUnitRateLimit = \{[\s\S]*scope: "ynot:gacha:open:units",[\s\S]*limit: 1_200,[\s\S]*windowMs: 60_000,/);
  assert.match(gachaOpenRoute, /const gachaOpenIpUnitRateLimit = \{[\s\S]*scope: "ynot:gacha:open:units:ip",[\s\S]*limit: 6_000,[\s\S]*windowMs: 60_000,/);
  assert.match(gachaOpenRoute, /gachaOpenRequestRateLimit\.scope/);
  assert.match(gachaOpenRoute, /gachaOpenProfileUnitRateLimit\.scope[\s\S]*cost: quantity/);
  assert.match(gachaOpenRoute, /gachaOpenIpUnitRateLimit\.scope[\s\S]*cost: quantity/);
});

test("rate-limit backend failures do not expose internal details", () => {
  const rateLimit = readSource("../src/lib/security/rate-limit.ts");

  assert.match(rateLimit, /console\.warn\(\s*"rate_limit_backend_unavailable"/);
  assert.match(rateLimit, /\{\s*error:\s*"Rate-limit backend is unavailable\."\s*\}/);
  assert.doesNotMatch(rateLimit, /detail:\s*error instanceof Error/);
});

test("admin catalog stock workflow supports bulk-safe operator limits", () => {
  const cardImageRoute = readSource("../src/app/api/ynot/admin/cards/image/route.ts");
  const cardRoute = readSource("../src/app/api/ynot/admin/cards/route.ts");
  const cardStockRoute = readSource("../src/app/api/ynot/admin/card-stock/route.ts");
  const cardStockUnitRoute = readSource("../src/app/api/ynot/admin/card-stock/unit/route.ts");
  const gemrateRoute = readSource("../src/app/api/ynot/admin/gemrate-cert/route.ts");

  assert.match(
    cardImageRoute,
    /"ynot:admin:cards:image"[\s\S]*\{\s*limit:\s*120,\s*windowMs:\s*60_000\s*\}/,
  );
  assert.match(cardRoute, /const adminCardMutationRateLimit = \{\s*limit:\s*180,\s*windowMs:\s*60_000\s*\}/);
  assert.match(cardRoute, /"ynot:admin:cards",\s*adminCardMutationRateLimit,/);
  assert.match(
    cardStockRoute,
    /"ynot:admin:card-stock"[\s\S]*\{\s*limit:\s*240,\s*windowMs:\s*60_000\s*\}/,
  );
  assert.match(
    cardStockUnitRoute,
    /"ynot:admin:card-stock-unit"[\s\S]*\{\s*limit:\s*240,\s*windowMs:\s*60_000\s*\}/,
  );
  assert.match(
    gemrateRoute,
    /"ynot:admin:gemrate-cert"[\s\S]*\{\s*limit:\s*120,\s*windowMs:\s*60_000\s*\}/,
  );
});
