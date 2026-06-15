import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function source(path) {
  return readFileSync(join(appRoot, path), "utf8");
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
    /Response\.json\(\s*\{\s*error\s*:\s*(?:[A-Za-z_$][\w$]*\??\.)+message\s*(?:[,}])/,
  );
}

const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);

function sourceExtension(path) {
  const match = path.match(/\.[^.]+$/);
  return match?.[0] ?? "";
}

function sourceTree(paths) {
  const files = [];
  for (const path of paths) {
    collectSourceFiles(join(appRoot, path), files);
  }
  return files.map((path) => readFileSync(path, "utf8")).join("\n");
}

function collectSourceFiles(path, files) {
  if (!existsSync(path)) return;
  const stats = statSync(path);
  if (stats.isFile()) {
    if (!path.endsWith(".d.ts") && SOURCE_EXTENSIONS.has(sourceExtension(path))) {
      files.push(path);
    }
    return;
  }
  if (!stats.isDirectory()) return;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = join(path, entry.name);
    if (entry.isDirectory()) {
      if (["__generated__", "__snapshots__", "node_modules"].includes(entry.name)) continue;
      collectSourceFiles(fullPath, files);
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name.endsWith(".d.ts")) continue;
    if (!SOURCE_EXTENSIONS.has(sourceExtension(entry.name))) continue;
    files.push(fullPath);
  }
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
  const adminUiSource = sourceTree([
    "src/features/ynot",
    "src/app/admin",
  ]);
  const topUpUiSource = adminUiSource
    .split(/\n(?=(?:export\s+)?(?:function|const|class)\s+)/)
    .filter((block) => /topUp|top-up|TopUp/.test(block))
    .join("\n");
  assert.match(topUpUiSource, /useState\([^)]*topUps|setTopUps|handleReviewed|onReviewed/i);
  assert.match(topUpUiSource, /setTopUps|filter\([^)]*topUp|filter\([^)]*t\s*=>/);
  assert.doesNotMatch(topUpUiSource, /handleReviewed[\s\S]{0,500}router\.refresh\(\)/);
});

test("settings and category admin screens update local state after saves", () => {
  const adminUiSource = sourceTree([
    "src/features/ynot",
    "src/app/admin",
  ]);
  const settingsSource = adminUiSource
    .split(/\n(?=(?:export\s+)?(?:function|const|class)\s+)/)
    .filter((block) => /paymentMethod|payment-method|PaymentMethod/.test(block))
    .join("\n");
  assert.match(
    settingsSource,
    /useState\([^)]*paymentMethods|set[A-Za-z]*Payment[A-Za-z]*Methods/i,
  );
  assert.match(settingsSource, /set[A-Za-z]*Payment[A-Za-z]*Methods|onSaved\?\./i);

  const categorySource = adminUiSource
    .split(/\n(?=(?:export\s+)?(?:function|const|class)\s+)/)
    .filter((block) => /categor|Category/.test(block))
    .join("\n");
  assert.match(categorySource, /useState\([^)]*categor|setCategories/i);
});
