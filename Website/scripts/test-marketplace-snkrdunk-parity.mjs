import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const appRoot = path.resolve(".");
const repoRoot = path.resolve("..");
const migrationPath = path.join(
  repoRoot,
  "Database/marketplace-supabase/migrations/20260630120000_marketplace_snkrdunk_parity.sql",
);
const productDetailRpcMigrationPath = path.join(
  repoRoot,
  "Database/marketplace-supabase/migrations/20260630123000_marketplace_product_detail_read_model.sql",
);

function appPath(relPath) {
  return path.join(appRoot, relPath);
}

function readApp(relPath) {
  assert.ok(existsSync(appPath(relPath)), `missing ${relPath}`);
  return readFileSync(appPath(relPath), "utf8");
}

function compactLower(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function stripJsTsCommentsOutsideStrings(source) {
  let output = "";
  let mode = "code";
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const nextChar = source[index + 1];

    if (mode === "line-comment") {
      if (char === "\n" || char === "\r") {
        output += char;
        mode = "code";
      }
      continue;
    }

    if (mode === "block-comment") {
      if (char === "*" && nextChar === "/") {
        output += " ";
        index += 1;
        mode = "code";
      }
      continue;
    }

    if (mode === "single-quote" || mode === "double-quote" || mode === "template") {
      output += char;

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (
        (mode === "single-quote" && char === "'") ||
        (mode === "double-quote" && char === '"') ||
        (mode === "template" && char === "`")
      ) {
        mode = "code";
      }
      continue;
    }

    if (char === "/" && nextChar === "/") {
      mode = "line-comment";
      index += 1;
      continue;
    }

    if (char === "/" && nextChar === "*") {
      mode = "block-comment";
      index += 1;
      continue;
    }

    output += char;

    if (char === "'") {
      mode = "single-quote";
    } else if (char === '"') {
      mode = "double-quote";
    } else if (char === "`") {
      mode = "template";
    }
  }

  return output;
}

function compactJsTsLower(source) {
  return stripJsTsCommentsOutsideStrings(source).replace(/\s+/g, " ").toLowerCase();
}

function requireIncludes(source, token, label = token) {
  assert.ok(source.includes(token), `missing ${label}`);
}

test("package exposes the SNKRDUNK marketplace parity guard", () => {
  const packageJson = JSON.parse(readApp("package.json"));
  assert.equal(
    packageJson.scripts["test:marketplace-snkrdunk-parity"],
    "node scripts/test-marketplace-snkrdunk-parity.mjs",
  );
});

test("JS/TS compaction removes comments without stripping string or template contents", () => {
  const commentSource = compactJsTsLower(`
    const harmless = true; // profileId
    /* payout */
  `);

  assert.ok(
    !commentSource.includes("profileid"),
    "line comments must not count as scanned metadata source",
  );
  assert.ok(
    !commentSource.includes("payout"),
    "block comments must not count as scanned metadata source",
  );

  const stringSource = compactJsTsLower(`
    const publicField = "payout";
    const canonical = \`https://www.ynotopen.com/\${listing.marketplaceAccountId}\`;
  `);

  assert.ok(stringSource.includes("payout"), "string literal contents must be scanned");
  assert.ok(
    stringSource.includes("marketplaceaccountid"),
    "template literal contents must be scanned",
  );
});

test("SNKRDUNK parity migration defines cart, watchlist, seller trust, and hardening", () => {
  assert.ok(existsSync(migrationPath), "missing SNKRDUNK parity marketplace migration");

  const sql = compactLower(readFileSync(migrationPath, "utf8"));
  for (const token of [
    "marketplace_cart_items",
    "marketplace_watchlist_items",
    "marketplace_public_seller_profiles",
    "product_id",
    "variant_id",
    "seller_public_profile_id",
    "enable row level security",
    "revoke all",
  ]) {
    requireIncludes(sql, token);
  }
});

test("product detail uses one read model RPC for product, offers, and history", () => {
  assert.ok(
    existsSync(productDetailRpcMigrationPath),
    "missing product detail read model marketplace migration",
  );

  const sql = compactLower(readFileSync(productDetailRpcMigrationPath, "utf8"));
  for (const token of [
    "marketplace_get_product_market_detail",
    "returns jsonb",
    "marketplace_public_product_markets",
    "marketplace_public_listing_snapshots",
    "marketplace_price_history_points",
    "grant execute on function public.marketplace_get_product_market_detail",
  ]) {
    requireIncludes(sql, token);
  }

  const productMarket = readApp("src/lib/marketplace/product-market.ts");
  assert.match(
    productMarket,
    /\.rpc\("marketplace_get_product_market_detail"/,
    "product market detail must use the single product detail RPC",
  );
});

test("marketplace parity library modules exist", () => {
  for (const relPath of [
    "src/lib/marketplace/cart-watchlist.ts",
    "src/lib/marketplace/seller-trust.ts",
    "src/lib/marketplace/marketplace-metadata.ts",
    "src/lib/marketplace/mutation-guard.ts",
  ]) {
    assert.ok(existsSync(appPath(relPath)), `missing ${relPath}`);
  }
});

test("canonical and adapter cart/watchlist API routes exist", () => {
  const routePaths = [
    "cart/route.ts",
    "cart/items/route.ts",
    "cart/items/[listingId]/route.ts",
    "watchlist/route.ts",
    "watchlist/items/[listingId]/route.ts",
  ];

  for (const routePath of routePaths) {
    for (const apiRoot of ["src/app/api/ynot/marketplace", "src/app/api/marketplace"]) {
      const relPath = `${apiRoot}/${routePath}`;
      assert.ok(existsSync(appPath(relPath)), `missing ${relPath}`);
    }
  }

  const watchlistRoute = readApp(
    "src/app/api/ynot/marketplace/watchlist/items/[listingId]/route.ts",
  );
  const watchlistService = readApp("src/lib/marketplace/cart-watchlist.ts");
  const listingActions = readApp(
    "src/features/ynot/MarketplaceListingActionsClient.tsx",
  );
  assert.match(watchlistRoute, /watchMarketplaceWatchlistItem/);
  assert.match(watchlistRoute, /watchlist\.item\.watch/);
  assert.match(watchlistRoute, /requestHashForTarget/);
  assert.doesNotMatch(watchlistRoute, /watchlist\.item\.toggle|watchlist:toggle/);
  assert.match(watchlistService, /watchMarketplaceWatchlistItem/);
  assert.doesNotMatch(watchlistService, /toggleMarketplaceWatchlistItem/);
  assert.match(listingActions, /watchlist:watch/);
  assert.doesNotMatch(listingActions, /watchlist:toggle|Removed from watchlist/);
});

test("marketplace cart and watchlist pages exist", () => {
  for (const relPath of [
    "src/app/(store)/marketplace/cart/page.tsx",
    "src/app/(store)/marketplace/watchlist/page.tsx",
  ]) {
    assert.ok(existsSync(appPath(relPath)), `missing ${relPath}`);
  }
});

test("listing detail route delegates to the detail page component and exports metadata", () => {
  const source = readApp("src/app/(store)/marketplace/listings/[listingId]/page.tsx");

  assert.match(
    source,
    /import\s+(?:\{\s*)?MarketplaceListingDetailPage\b/,
    "listing detail route must import MarketplaceListingDetailPage",
  );
  assert.match(
    source,
    /export\s+(async\s+)?function\s+generateMetadata\b|export\s+const\s+metadata\b/,
    "listing detail route must export metadata",
  );
});

test("marketplace metadata builders do not expose private seller or fulfilment fields", () => {
  const source = readApp("src/lib/marketplace/marketplace-metadata.ts");
  const compactSource = compactJsTsLower(source);

  assert.match(
    source,
    /buildMarketplaceListingMetadata|generateMarketplaceListingMetadata|marketplaceListingMetadata/,
    "missing listing metadata builder",
  );
  for (const privateField of [
    "email",
    "phone",
    "address",
    "payout",
    "profile_id",
    "profileId",
    "marketplace_account_id",
    "marketplaceAccountId",
  ]) {
    assert.ok(
      !compactSource.includes(privateField.toLowerCase()),
      `metadata builders must not include private field ${privateField}`,
    );
  }
});
