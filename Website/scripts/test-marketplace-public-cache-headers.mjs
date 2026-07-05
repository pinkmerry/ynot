import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readSrc(relativePath) {
  return readFileSync(path.join(appRoot, relativePath), "utf8");
}

const PRODUCT_ROUTE =
  "src/app/api/ynot/marketplace/products/[productSlug]/route.ts";
const LISTINGS_ROUTE =
  "src/app/api/ynot/marketplace/products/[productSlug]/listings/route.ts";
const PRICE_HISTORY_ROUTE =
  "src/app/api/ynot/marketplace/products/[productSlug]/price-history/route.ts";

test("public product detail route sets the SWR cache header", () => {
  const routeSrc = readSrc(PRODUCT_ROUTE);
  assert.match(routeSrc, /publicMarketplaceAccess/);
  assert.match(routeSrc, /stale-while-revalidate=45/);
});

test("public product listings route sets the SWR cache header", () => {
  const routeSrc = readSrc(LISTINGS_ROUTE);
  assert.match(routeSrc, /publicMarketplaceAccess/);
  assert.match(routeSrc, /stale-while-revalidate=45/);
});

test("public product price-history route sets the SWR cache header", () => {
  const routeSrc = readSrc(PRICE_HISTORY_ROUTE);
  assert.match(routeSrc, /publicMarketplaceAccess/);
  assert.match(routeSrc, /stale-while-revalidate=45/);
});
