import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function source(path) {
  return readFileSync(join(appRoot, path), "utf8");
}

function optionalSource(path) {
  const fullPath = join(appRoot, path);
  return existsSync(fullPath) ? readFileSync(fullPath, "utf8") : "";
}

function candidateSource(paths) {
  return paths.map(optionalSource).join("\n");
}

function between(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  assert.ok(start > -1, `${startMarker} must exist`);
  const end = text.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `${endMarker} must exist after ${startMarker}`);
  return text.slice(start, end);
}

function assertRawErrorMessageIsNotReturned(route) {
  assert.doesNotMatch(
    route,
    /Response\.json\(\s*\{\s*error\s*:\s*error\.message\s*\}/,
  );
  assert.doesNotMatch(
    route,
    /Response\.json\(\s*\{\s*error\s*:\s*[^}]*\b(?:uploadError|rpcError|mutationError)\.message\b/,
  );
}

test("admin top-up route keeps review RPCs stable and adds bounded list protections", () => {
  const route = source("src/app/api/ynot/admin/top-ups/route.ts");
  assert.match(route, /approve_top_up_request/);
  assert.match(route, /reject_top_up_request/);
  assert.match(route, /export\s+async\s+function\s+GET\s*\([^)]*\)/);
  assert.match(route, /ynot:admin:top-ups:list/);
  assert.match(route, /(?:URLSearchParams|searchParams|\.url\b)/);
  assert.match(route, /status(?:es)?/i);
  assert.match(route, /cursor/i);
  assert.match(route, /limit/i);
  assert.match(route, /getTopUps\([\s\S]*\{[\s\S]*(?:status(?:es)?|cursor|limit)/i);
});

test("getTopUps supports admin status and cursor filtering without changing public redaction", () => {
  const data = source("src/features/ynot/data.ts");
  const getTopUps = between(data, "export async function getTopUps", "export function toTopUp");
  assert.match(getTopUps, /status(?:es)?/i);
  assert.match(getTopUps, /cursor/i);
  assert.match(getTopUps, /\.in\(\s*["']status["']/);
  assert.match(getTopUps, /\.(?:lt|lte)\(\s*["']created_at["']/);

  const publicTopUp = between(data, "export function publicTopUp", "export async function getCollection");
  assert.match(publicTopUp, /delete publicFields\.id/);
  assert.match(publicTopUp, /delete publicFields\.profileId/);
  assert.match(publicTopUp, /delete publicFields\.adminNote/);

  const publicPaymentMethod = between(
    publicTopUp,
    "paymentMethod: topUp.paymentMethod",
    "slipVerification: topUp.slipVerification",
  );
  assert.match(publicPaymentMethod, /type: topUp\.paymentMethod\.type/);
  assert.match(publicPaymentMethod, /displayName: topUp\.paymentMethod\.displayName/);
  assert.doesNotMatch(publicPaymentMethod, /id:/);
  assert.doesNotMatch(publicPaymentMethod, /code:/);
});

test("admin payment method routes require high privilege and return safe failures", () => {
  const paymentRoute = source("src/app/api/ynot/admin/payment-methods/route.ts");
  const qrRoute = source("src/app/api/ynot/admin/payment-methods/qr-image/route.ts");

  for (const route of [paymentRoute, qrRoute]) {
    assert.match(route, /enforceSameOriginMutation/);
    assert.match(route, /requireAdminRoleResponse/);
    assertRawErrorMessageIsNotReturned(route);
  }
});

test("admin shipping route validates IDs and maps RPC errors safely", () => {
  const shippingRoute = source("src/app/api/ynot/admin/shipping/route.ts");
  assert.match(shippingRoute, /const UUID_RE/);
  assert.match(shippingRoute, /adminShippingErrorMessage/);
  assert.match(shippingRoute, /update_shipping_request_status/);
  assertRawErrorMessageIsNotReturned(shippingRoute);
});

test("admin top-up UI removes reviewed rows without a full duplicate fetch", () => {
  const topUpUiSource = candidateSource([
    "src/features/ynot/admin/AdminTopUpConsole.tsx",
    "src/features/ynot/client.tsx",
    "src/app/admin/top-ups/page.tsx",
    "src/app/admin/page.tsx",
  ]);
  assert.match(topUpUiSource, /useState\([^)]*topUps|setTopUps|handleReviewed|onReviewed/i);
  assert.match(topUpUiSource, /setTopUps|filter\([^)]*topUp|filter\([^)]*t\s*=>/);
  assert.doesNotMatch(topUpUiSource, /handleReviewed[\s\S]{0,500}router\.refresh\(\)/);
});

test("settings and category admin screens update local state after saves", () => {
  const settingsSource = candidateSource([
    "src/features/ynot/admin/AdminPaymentMethodForm.tsx",
    "src/features/ynot/client.tsx",
    "src/app/admin/settings/page.tsx",
  ]);
  assert.match(
    settingsSource,
    /useState\([^)]*paymentMethods|set[A-Za-z]*Payment[A-Za-z]*Methods/i,
  );
  assert.match(settingsSource, /set[A-Za-z]*Payment[A-Za-z]*Methods|onSaved\?\./i);

  const categorySource = candidateSource([
    "src/features/ynot/admin/AdminCategoryWorkspace.tsx",
    "src/features/ynot/client.tsx",
    "src/app/admin/categories/page.tsx",
  ]);
  assert.match(categorySource, /useState\([^)]*categor|setCategories/i);
});
