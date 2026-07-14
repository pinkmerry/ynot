import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readApp(relPath) {
  return readFileSync(path.join(appRoot, relPath), "utf8");
}

function cssRule(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "s"));
  assert.ok(match, `missing CSS rule for ${selector}`);
  return match[1];
}

test("package exposes the focused Marketplace product-media regression", () => {
  const packageJson = JSON.parse(readApp("package.json"));
  assert.equal(
    packageJson.scripts["test:marketplace-product-media"],
    "node --test scripts/test-marketplace-product-media.mjs",
  );
});

test("Marketplace theme defines reusable contain-fit contracts for product photos", () => {
  const theme = readApp("src/features/marketplace-ui/theme/marketplace-theme.css");
  const backgroundRule = cssRule(theme, ".mp-product-media");
  const imageRule = cssRule(theme, ".mp-product-media-image");

  assert.match(backgroundRule, /background-size:\s*contain\s*;/);
  assert.match(backgroundRule, /background-position:\s*center\s*;/);
  assert.match(backgroundRule, /background-repeat:\s*no-repeat\s*;/);
  assert.match(imageRule, /object-fit:\s*contain\s*;/);
  assert.match(imageRule, /object-position:\s*center\s*;/);
  assert.ok(
    theme.indexOf(".mp-product-media {") > theme.indexOf(".mp-thumb {"),
    "contain utility must follow detail/thumb background shorthands so the cascade cannot reset it to auto",
  );
});

test("active Marketplace product-photo surfaces opt into contain fit and remove crop-first overrides", () => {
  const surfaces = [
    ["src/features/marketplace-ui/browse/BrowsePage.tsx", "mp-product-media"],
    ["src/features/marketplace-ui/product/ProductDetail.tsx", "mp-product-media"],
    ["src/features/marketplace-ui/checkout/CheckoutFlow.tsx", "mp-product-media"],
    ["src/features/marketplace-ui/sell/PhotoUploader.tsx", "mp-product-media-image"],
    ["src/features/marketplace-ui/sell/SellSummaryRail.tsx", "mp-product-media-image"],
    ["src/features/marketplace-ui/admin/StockModalFields.tsx", "mp-product-media-image"],
  ];

  for (const [relPath, contractClass] of surfaces) {
    const source = readApp(relPath);
    assert.match(source, new RegExp(contractClass), `${relPath} must use ${contractClass}`);
    assert.doesNotMatch(
      source,
      /(?:objectFit|backgroundSize):\s*["']cover["']/,
      `${relPath} must not crop Marketplace product photos with cover`,
    );
  }
});

test("Marketplace browse uses named responsive grids so product media stays visible on phones", () => {
  const browse = readApp("src/features/marketplace-ui/browse/BrowsePage.tsx");
  const theme = readApp("src/features/marketplace-ui/theme/marketplace-theme.css");

  assert.match(browse, /className="mp-browse-layout"/);
  assert.match(browse, /className="mp-browse-products-grid"/);
  assert.doesNotMatch(browse, /gridTemplateColumns:\s*"230px 1fr"/);
  assert.doesNotMatch(browse, /gridTemplateColumns:\s*"repeat\(4, 1fr\)"/);

  assert.match(cssRule(theme, ".mp-browse-layout"), /grid-template-columns:\s*230px minmax\(0, 1fr\)\s*;/);
  assert.match(cssRule(theme, ".mp-browse-products-grid"), /grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)\s*;/);
  assert.match(
    theme,
    /@media\s*\(max-width:\s*860px\)[\s\S]*?\.mp-browse-layout\s*\{[^}]*grid-template-columns:\s*1fr\s*;/,
  );
  assert.match(
    theme,
    /@media\s*\(max-width:\s*640px\)[\s\S]*?\.mp-browse-products-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)\s*;/,
  );
  assert.match(
    theme,
    /@media\s*\(max-width:\s*420px\)[\s\S]*?\.mp-browse-products-grid\s*\{[^}]*grid-template-columns:\s*1fr\s*;/,
  );
});

test("legacy and shared Marketplace product-card CSS also shows the complete image", () => {
  const globals = readApp("src/app/globals.css");

  for (const selector of [
    ".marketplace-card-art",
    ".marketplace-detail-art",
    ".marketplace-cart-drawer-link > span",
    ".marketplace-product-listing-image",
    ".marketplace-related-card span",
  ]) {
    const rule = cssRule(globals, selector);
    assert.match(rule, /(?:background-size:\s*contain|\/\s*contain\s+no-repeat)/, `${selector} must use contain fit`);
  }

  const imageRule = cssRule(globals, ".marketplace-card-art img");
  assert.match(imageRule, /object-fit:\s*contain\s*;/);
  assert.match(imageRule, /object-position:\s*center\s*;/);
});
