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

test("admin top-up route keeps review RPCs stable and adds bounded list protections", () => {
  const route = source("src/app/api/ynot/admin/top-ups/route.ts");
  assert.match(route, /approve_top_up_request/);
  assert.match(route, /reject_top_up_request/);
  assert.match(route, /export async function GET\(request: Request\)/);
  assert.match(route, /ynot:admin:top-ups:list/);
  assert.match(route, /new URL\(request\.url\)/);
  assert.match(route, /statuses/);
  assert.match(route, /cursorCreatedAt/);
});

test("getTopUps supports admin status and cursor filtering without changing public redaction", () => {
  const data = source("src/features/ynot/data.ts");
  assert.match(data, /statuses\?: readonly/);
  assert.match(data, /cursorCreatedAt\?: string/);
  assert.match(data, /\.in\("status", statuses\)/);
  assert.match(data, /\.lt\("created_at", options\.cursorCreatedAt\)/);

  const publicTopUpStart = data.indexOf("export function publicTopUp");
  assert.ok(publicTopUpStart > -1, "publicTopUp must exist");
  const publicTopUp = data.slice(publicTopUpStart, publicTopUpStart + 900);
  assert.match(publicTopUp, /delete publicFields\.id/);
  assert.match(publicTopUp, /delete publicFields\.profileId/);
  assert.match(publicTopUp, /delete publicFields\.adminNote/);

  const publicPaymentMethodStart = publicTopUp.indexOf("paymentMethod: topUp.paymentMethod");
  assert.ok(publicPaymentMethodStart > -1, "publicTopUp must rebuild public payment method fields");
  const publicPaymentMethod = publicTopUp.slice(publicPaymentMethodStart, publicPaymentMethodStart + 260);
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
    assert.doesNotMatch(route, /error\.message/);
  }
});

test("admin shipping route validates IDs and maps RPC errors safely", () => {
  const shippingRoute = source("src/app/api/ynot/admin/shipping/route.ts");
  assert.match(shippingRoute, /const UUID_RE/);
  assert.match(shippingRoute, /adminShippingErrorMessage/);
  assert.match(shippingRoute, /update_shipping_request_status/);
  assert.doesNotMatch(shippingRoute, /error\.message/);
});

test("admin top-up UI removes reviewed rows without a full duplicate fetch", () => {
  const consoleSource = optionalSource("src/features/ynot/admin/AdminTopUpConsole.tsx");
  assert.match(consoleSource, /"use client"/);
  assert.match(consoleSource, /useState\(initialTopUps\)/);
  assert.match(consoleSource, /handleReviewed/);
  assert.match(consoleSource, /setTopUps/);
  assert.doesNotMatch(consoleSource, /router\.refresh\(\)/);
});

test("settings and category admin screens update local state after saves", () => {
  const clientSource = source("src/features/ynot/client.tsx");
  assert.match(clientSource, /setMethodOptions/);
  assert.match(clientSource, /onSaved\?\./);

  const categoryWorkspace = optionalSource("src/features/ynot/admin/AdminCategoryWorkspace.tsx");
  assert.match(categoryWorkspace, /"use client"/);
  assert.match(categoryWorkspace, /setCategories/);
});
