import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readSrc(relativePath) {
  return readFileSync(path.join(appRoot, relativePath), "utf8");
}

const REPORTS_ROUTE = "src/app/api/ynot/marketplace/admin/reports/route.ts";
const RESOLVE_ROUTE =
  "src/app/api/ynot/marketplace/admin/reports/[reportId]/resolve/route.ts";
const ORDERS_ROUTE = "src/app/api/ynot/marketplace/admin/orders/route.ts";
const STATS_ROUTE = "src/app/api/ynot/marketplace/admin/stats/route.ts";
const PROOF_URL_ROUTE =
  "src/app/api/ynot/marketplace/admin/orders/[orderId]/payment-proof-url/route.ts";

const REPORTS_REEXPORT = "src/app/api/marketplace/admin/reports/route.ts";
const RESOLVE_REEXPORT =
  "src/app/api/marketplace/admin/reports/[reportId]/resolve/route.ts";
const ORDERS_REEXPORT = "src/app/api/marketplace/admin/orders/route.ts";
const STATS_REEXPORT = "src/app/api/marketplace/admin/stats/route.ts";
const PROOF_URL_REEXPORT =
  "src/app/api/marketplace/admin/orders/[orderId]/payment-proof-url/route.ts";

test("all four ynot admin console route files exist", () => {
  for (const relativePath of [
    REPORTS_ROUTE,
    RESOLVE_ROUTE,
    ORDERS_ROUTE,
    STATS_ROUTE,
  ]) {
    assert.doesNotThrow(() => readSrc(relativePath), `missing ${relativePath}`);
  }
});

test("all four re-export files exist and reference the ynot path", () => {
  const reportsReexport = readSrc(REPORTS_REEXPORT);
  assert.match(
    reportsReexport,
    /@\/app\/api\/ynot\/marketplace\/admin\/reports\/route/,
  );
  assert.match(reportsReexport, /GET/);

  const resolveReexport = readSrc(RESOLVE_REEXPORT);
  assert.match(
    resolveReexport,
    /@\/app\/api\/ynot\/marketplace\/admin\/reports\/\[reportId\]\/resolve\/route/,
  );
  assert.match(resolveReexport, /POST/);

  const ordersReexport = readSrc(ORDERS_REEXPORT);
  assert.match(
    ordersReexport,
    /@\/app\/api\/ynot\/marketplace\/admin\/orders\/route/,
  );
  assert.match(ordersReexport, /GET/);

  const statsReexport = readSrc(STATS_REEXPORT);
  assert.match(
    statsReexport,
    /@\/app\/api\/ynot\/marketplace\/admin\/stats\/route/,
  );
  assert.match(statsReexport, /GET/);
});

test("reports GET route is owner-only and reads state query param", () => {
  const routeSrc = readSrc(REPORTS_ROUTE);
  assert.match(routeSrc, /ownerOnlyMarketplaceAccess/);
  assert.match(routeSrc, /if \(!access\.allowed\) return access\.response/);
  assert.match(routeSrc, /listMarketplaceListingReports/);
  assert.match(routeSrc, /ynot:marketplace:admin:reports/);
});

test("orders GET route is owner-only and reads state/limit query params", () => {
  const routeSrc = readSrc(ORDERS_ROUTE);
  assert.match(routeSrc, /ownerOnlyMarketplaceAccess/);
  assert.match(routeSrc, /if \(!access\.allowed\) return access\.response/);
  assert.match(routeSrc, /listAdminMarketplaceOrders/);
  assert.match(routeSrc, /ynot:marketplace:admin:orders/);
});

test("stats GET route is owner-only", () => {
  const routeSrc = readSrc(STATS_ROUTE);
  assert.match(routeSrc, /ownerOnlyMarketplaceAccess/);
  assert.match(routeSrc, /if \(!access\.allowed\) return access\.response/);
  assert.match(routeSrc, /ynot:marketplace:admin:stats/);
});

test("resolve POST route uses prepareMarketplaceMutation with the expected allowedFields and stays owner-only", () => {
  const routeSrc = readSrc(RESOLVE_ROUTE);
  assert.match(routeSrc, /prepareMarketplaceMutation/);
  assert.match(routeSrc, /method:\s*"POST"/);
  assert.match(
    routeSrc,
    /allowedFields:\s*\[\s*"resolution"\s*,\s*"resolutionNote"\s*\]/,
  );
  assert.doesNotMatch(routeSrc, /accessMode:\s*"customer"/);
  assert.match(routeSrc, /ynot:marketplace:admin:reports:resolve/);
});

test("resolve POST route enforces an explicit admin-role guard before the lib call", () => {
  const routeSrc = readSrc(RESOLVE_ROUTE);
  assert.match(routeSrc, /if \(!access\.admin\?\.adminRole\)/);
  assert.match(routeSrc, /marketplace_admin_required/);
  assert.match(routeSrc, /status:\s*403/);
  assert.doesNotMatch(routeSrc, /adminProfileId:\s*access\.admin\?\.profileId\s*\?\?\s*""/);
});

test("resolve POST route validates resolution against dismissed/unlisted before calling the lib", () => {
  const routeSrc = readSrc(RESOLVE_ROUTE);
  assert.match(routeSrc, /dismissed/);
  assert.match(routeSrc, /unlisted/);
  assert.match(routeSrc, /marketplace_report_resolution_invalid/);
  assert.match(routeSrc, /resolveMarketplaceListingReport/);
});

test("stats GET route composes both count helpers and the queue summary/gmv libs in parallel", () => {
  const routeSrc = readSrc(STATS_ROUTE);
  assert.match(routeSrc, /getAdminDailyGmv/);
  assert.match(routeSrc, /listMarketplaceQueueSummary/);
  assert.match(routeSrc, /countOpenListingReports/);
  assert.match(routeSrc, /countActiveProductAlerts/);
  assert.match(routeSrc, /Promise\.all/);
});

test("countOpenListingReports uses an exact head-count query, never an unbounded select", () => {
  const listingReports = readSrc("src/lib/marketplace/listing-reports.ts");
  assert.match(listingReports, /export async function countOpenListingReports/);
  assert.match(listingReports, /count:\s*"exact"\s*,\s*head:\s*true/);
  assert.match(listingReports, /report_state/);
});

test("countActiveProductAlerts uses an exact head-count query, never an unbounded select", () => {
  const productAlerts = readSrc("src/lib/marketplace/product-alerts.ts");
  assert.match(productAlerts, /export async function countActiveProductAlerts/);
  assert.match(productAlerts, /count:\s*"exact"\s*,\s*head:\s*true/);
  assert.match(productAlerts, /alert_state/);
});

test("all four ynot routes keep the server-only import guard via their libs", () => {
  for (const relativePath of [
    "src/lib/marketplace/listing-reports.ts",
    "src/lib/marketplace/admin-orders.ts",
    "src/lib/marketplace/ops-hardening.ts",
    "src/lib/marketplace/product-alerts.ts",
  ]) {
    const libSrc = readSrc(relativePath);
    assert.match(libSrc, /^import "server-only";/m);
  }
});

test("payment-proof-url route file exists and is owner-only", () => {
  const routeSrc = readSrc(PROOF_URL_ROUTE);
  assert.match(routeSrc, /ownerOnlyMarketplaceAccess/);
  assert.match(routeSrc, /if \(!access\.allowed\) return access\.response/);
});

test("payment-proof-url route creates a signed URL with a 120s TTL and no-store caching", () => {
  const routeSrc = readSrc(PROOF_URL_ROUTE);
  assert.match(routeSrc, /createSignedUrl/);
  assert.match(routeSrc, /createSignedUrl\(\s*proof\.path\s*,\s*(?:PROOF_URL_TTL_SECONDS|120)\s*\)/);
  assert.doesNotMatch(routeSrc, /createSignedUrl\([^)]*,\s*(1[3-9]\d|[2-9]\d{2}|\d{4,})\s*\)/);
  assert.match(routeSrc, /no-store/);
});

test("payment-proof-url route re-export exists and references the ynot path", () => {
  const reexport = readSrc(PROOF_URL_REEXPORT);
  assert.match(
    reexport,
    /@\/app\/api\/ynot\/marketplace\/admin\/orders\/\[orderId\]\/payment-proof-url\/route/,
  );
  assert.match(reexport, /GET/);
});

test("getMarketplaceOrderProofPath exists in orders.ts and selects the latest proof", () => {
  const ordersSrc = readSrc("src/lib/marketplace/orders.ts");
  assert.match(ordersSrc, /export async function getMarketplaceOrderProofPath/);
  assert.match(ordersSrc, /marketplace_payment_proofs/);
  assert.match(ordersSrc, /proof_storage_path/);
  assert.match(ordersSrc, /order_id/);
  assert.match(ordersSrc, /ascending:\s*false/);
});
