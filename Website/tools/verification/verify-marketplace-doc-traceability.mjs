#!/usr/bin/env node
import {
  check,
  fileExists,
  finish,
  includes,
  notMatches,
  readRepo,
  readWebsite,
  websiteRoot,
} from "./marketplace-verification-helpers.mjs";
import { readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const docs = [
  "Website/docs/plans/marketplace/00-marketplace-mvp-architecture.md",
  "Website/docs/plans/marketplace/01-account-identity-bridge.md",
  "Website/docs/plans/marketplace/02-data-and-service-boundary.md",
  "Website/docs/plans/marketplace/one-account-runtime-seam.md",
  "Website/docs/plans/marketplace/03-buyer-journey.md",
  "Website/docs/plans/marketplace/04-seller-journey.md",
  "Website/docs/plans/marketplace/05-official-shop-journey.md",
  "Website/docs/plans/marketplace/06-admin-middleman-journey.md",
  "Website/docs/plans/marketplace/07-payment-fee-shipping-payout-flow.md",
  "Website/docs/plans/marketplace/08-mvp-function-list-and-release-plan.md",
  "Website/docs/plans/marketplace/09-test-spec-and-risk-checklist.md",
];

const evidenceByDoc = {
  "00-marketplace-mvp-architecture.md": [
    "wrangler.marketplace.jsonc",
    "src/lib/marketplace/config.ts",
    "src/lib/marketplace/supabase-adapter.ts",
  ],
  "01-account-identity-bridge.md": [
    "src/lib/marketplace/account-bridge.ts",
    "src/app/api/ynot/marketplace/account/ensure/route.ts",
    "tools/ops/backfill-marketplace-accounts.mjs",
    "src/features/ynot/cr/HistoryExperience.tsx",
  ],
  "02-data-and-service-boundary.md": [
    "src/app/api/ynot/marketplace/bag/summary/route.ts",
    "src/app/api/ynot/marketplace/checkout/pending-orders/route.ts",
    "src/lib/marketplace/inventory-source-guard.ts",
  ],
  "one-account-runtime-seam.md": [
    "src/lib/marketplace/actor-context.ts",
    "src/lib/marketplace/mutation-guard.ts",
    "wrangler.marketplace.jsonc",
  ],
  "03-buyer-journey.md": [
    "src/app/(store)/marketplace/page.tsx",
    "src/app/api/ynot/marketplace/products/route.ts",
    "src/app/api/marketplace/products/route.ts",
    "src/lib/marketplace/product-browse.ts",
    "src/app/(store)/marketplace/products/[productSlug]/page.tsx",
    "src/app/api/ynot/marketplace/products/[productSlug]/route.ts",
    "src/lib/marketplace/product-market.ts",
    "src/app/(store)/marketplace/listings/[listingId]/page.tsx",
    "src/app/(store)/marketplace/orders/page.tsx",
    "src/app/(store)/marketplace/orders/[orderId]/page.tsx",
    "src/app/api/ynot/marketplace/orders/[orderId]/route.ts",
  ],
  "04-seller-journey.md": [
    "src/app/(store)/marketplace/seller/page.tsx",
    "src/app/api/ynot/marketplace/seller/submissions/[submissionId]/submit/route.ts",
    "src/app/api/ynot/marketplace/seller/submissions/[submissionId]/photos/route.ts",
    "src/app/api/ynot/marketplace/seller/submissions/[submissionId]/handoff/route.ts",
  ],
  "05-official-shop-journey.md": [
    "src/lib/marketplace/official-shop.ts",
    "src/app/api/ynot/marketplace/admin/official-inventory/route.ts",
    "src/app/api/ynot/marketplace/admin/official-inventory/[inventoryId]/route.ts",
    "src/app/api/ynot/marketplace/admin/official-inventory/[inventoryId]/archive/route.ts",
    "src/app/api/ynot/marketplace/admin/official-listings/[listingId]/route.ts",
    "src/app/api/ynot/marketplace/admin/official-listings/[listingId]/hide/route.ts",
    "src/app/api/ynot/marketplace/checkout/official/route.ts",
  ],
  "06-admin-middleman-journey.md": [
    "src/app/admin/marketplace/page.tsx",
    "src/app/api/ynot/marketplace/admin/seller-consignments/[submissionId]/transition/route.ts",
    "src/app/api/ynot/marketplace/admin/refunds/[refundRequestId]/transition/route.ts",
    "src/app/api/ynot/marketplace/admin/audit/[targetType]/[targetId]/route.ts",
  ],
  "07-payment-fee-shipping-payout-flow.md": [
    "src/app/api/ynot/marketplace/checkout/pending-orders/[pendingOrderId]/payment-proof/route.ts",
    "src/app/api/ynot/marketplace/admin/seller-payouts/[payoutId]/release/route.ts",
    "src/lib/marketplace/payouts.ts",
  ],
  "08-mvp-function-list-and-release-plan.md": [
    "src/lib/marketplace/config.ts",
    "tools/verification/verify-marketplace-launch-gates.mjs",
    "tools/verification/verify-marketplace-doc-traceability.mjs",
  ],
  "09-test-spec-and-risk-checklist.md": [
    "scripts/test-marketplace-foundation.mjs",
    "scripts/test-marketplace-product-market-architecture.mjs",
    "scripts/test-marketplace-product-grouping-architecture.mjs",
    "scripts/test-marketplace-seller-consignment.mjs",
    "scripts/test-marketplace-user-seller-purchase.mjs",
    "tools/verification/verify-marketplace-doc-traceability.mjs",
  ],
};

for (const doc of docs) {
  check(`${doc} exists`, fileExists(doc.replace(/^Website\//, "")));
  const text = readRepo(doc);
  check(`${doc} is not empty`, text.trim().length > 1000);
  notMatches(
    text,
    /Current runtime is still Phase 0|does not have a marketplace account bridge|placeholder card template|future seller journey|no listing backend yet|No marketplace admin console exists yet|placeholder filters\/cards|coin-style marketplace card/,
    `${doc} has no stale placeholder implementation wording`,
  );
}

for (const [docName, evidenceFiles] of Object.entries(evidenceByDoc)) {
  check(`${docName} has evidence mapping`, evidenceFiles.length >= 3);
  for (const evidenceFile of evidenceFiles) {
    check(`${docName} evidence exists: ${evidenceFile}`, fileExists(evidenceFile));
  }
}

const oneAccountDoc = readWebsite("docs/plans/marketplace/one-account-runtime-seam.md");
includes(
  oneAccountDoc,
  "current YNOT profile -> Marketplace Account -> allowed action",
  "one-account doc states backend identity chain",
);
includes(
  oneAccountDoc,
  "bank transfer",
  "one-account doc covers bank transfer payment flow",
);
includes(
  oneAccountDoc,
  "marketplace Worker route set",
  "one-account doc covers marketplace route ownership",
);

const marketplaceAdr = readRepo("docs/adr/0003-marketplace-separate-service-and-database.md");
includes(
  marketplaceAdr,
  "one YNOT login and website experience",
  "marketplace ADR preserves one-account UX",
);
includes(
  marketplaceAdr,
  "Browser requests must not supply trusted marketplace account IDs",
  "marketplace ADR rejects browser-supplied marketplace identity",
);

const packageJson = JSON.parse(readWebsite("package.json"));
includes(
  packageJson.scripts["verify:marketplace"],
  "verify:marketplace-product-grouping",
  "full marketplace verification includes product grouping verification",
);
includes(
  packageJson.scripts["verify:marketplace"],
  "verify:marketplace-doc-traceability",
  "full marketplace verification includes doc traceability",
);
includes(
  packageJson.scripts["verify:marketplace"],
  "verify:marketplace-customer-cart-sql",
  "full marketplace verification includes customer cart SQL verification",
);
check(
  "verify:marketplace-customer-cart-sql package script exists",
  Boolean(packageJson.scripts["verify:marketplace-customer-cart-sql"]),
);
includes(
  packageJson.scripts["verify:marketplace-customer-cart-sql"],
  "verify-marketplace-customer-cart-sql.mjs",
  "customer cart SQL verifier is wired to package scripts",
);
for (const scriptName of [
  "test:marketplace-current-gate",
  "test:marketplace-product-grouping",
  "test:marketplace-api-contracts",
  "test:marketplace-rpc-transactions",
  "test:marketplace-inventory",
  "test:marketplace-gacha-separation",
  "test:marketplace-checkout",
  "test:marketplace-payment",
  "test:marketplace-shipping",
  "test:marketplace-payout",
  "test:marketplace-admin-ops",
  "test:marketplace-visual",
  "test:marketplace-responsive",
  "test:marketplace-a11y",
  "test:marketplace-copy-guard",
]) {
  check(`${scriptName} package script exists`, Boolean(packageJson.scripts[scriptName]));
}
check(
  "verify:marketplace-product-grouping package script exists",
  Boolean(packageJson.scripts["verify:marketplace-product-grouping"]),
);
includes(
  packageJson.scripts["verify:marketplace-product-grouping"],
  "test:marketplace-product-grouping",
  "product grouping verification runs the grouping architecture test",
);
includes(
  packageJson.scripts["verify:marketplace-product-grouping"],
  "verify:marketplace-rpc-contracts",
  "product grouping verification includes marketplace RPC contracts",
);

const customerCartPlan = readRepo(
  "docs/superpowers/plans/2026-06-30-marketplace-customer-cart-rpc-ui.md",
);
for (const phrase of [
  "Button To API/RPC Wiring Matrix",
  "HTTP API Contract",
  "RPC To Table Contract",
  "Marketplace Cart Summary",
  "GET /api/ynot/marketplace/cart/summary",
  "POST /api/ynot/marketplace/cart/items",
  "DELETE /api/ynot/marketplace/cart/items/[listingId]",
  "POST /api/ynot/marketplace/watchlist/items/[listingId]",
  "DELETE /api/ynot/marketplace/watchlist/items/[listingId]",
  "marketplace_get_customer_cart_summary",
  "marketplace_list_customer_cart",
  "marketplace_add_customer_cart_item",
  "marketplace_remove_customer_cart_item",
  "marketplace_list_customer_watchlist",
  "marketplace_watch_listing",
  "marketplace_unwatch_listing",
]) {
  includes(customerCartPlan, phrase, `customer cart plan documents ${phrase}`);
}

const config = readWebsite("src/lib/marketplace/config.ts");
for (const flag of [
  "YNOT_MARKETPLACE_PUBLIC_NAV_ENABLED",
  "YNOT_MARKETPLACE_BROWSE_ENABLED",
  "YNOT_MARKETPLACE_CHECKOUT_ENABLED",
  "YNOT_MARKETPLACE_SELLER_SUBMISSION_ENABLED",
  "YNOT_MARKETPLACE_LISTING_ACTIVATION_ENABLED",
  "YNOT_MARKETPLACE_PAYMENT_PROOF_ENABLED",
  "YNOT_MARKETPLACE_PAYOUT_RELEASE_ENABLED",
]) {
  includes(config, flag, `${flag} action flag exists`);
}

const routeGuards = readWebsite("src/lib/marketplace/route-guards.ts");
includes(
  routeGuards,
  "const code = `marketplace_${action}_disabled`",
  "action disabled code is generated from the action enum",
);
for (const action of [
  "publicNav",
  "browse",
  "checkout",
  "sellerSubmission",
  "listingActivation",
  "paymentProof",
  "payoutRelease",
]) {
  includes(routeGuards, `${action}:`, `${action} action label exists`);
}

for (const [file, action] of [
  ["src/app/api/ynot/marketplace/listings/route.ts", "browse"],
  ["src/app/api/ynot/marketplace/listings/[listingId]/route.ts", "browse"],
  ["src/app/api/ynot/marketplace/checkout/pending-orders/route.ts", "checkout"],
  ["src/app/api/ynot/marketplace/seller/submissions/route.ts", "sellerSubmission"],
  [
    "src/app/api/ynot/marketplace/admin/seller-consignments/[submissionId]/activate/route.ts",
    "listingActivation",
  ],
  [
    "src/app/api/ynot/marketplace/admin/official-inventory/[inventoryId]/route.ts",
    "listingActivation",
  ],
  [
    "src/app/api/ynot/marketplace/admin/official-inventory/[inventoryId]/publish/route.ts",
    "listingActivation",
  ],
  [
    "src/app/api/ynot/marketplace/admin/official-inventory/[inventoryId]/archive/route.ts",
    "listingActivation",
  ],
  [
    "src/app/api/ynot/marketplace/admin/official-listings/[listingId]/route.ts",
    "listingActivation",
  ],
  [
    "src/app/api/ynot/marketplace/admin/official-listings/[listingId]/hide/route.ts",
    "listingActivation",
  ],
  [
    "src/app/api/ynot/marketplace/checkout/pending-orders/[pendingOrderId]/payment-proof/route.ts",
    "paymentProof",
  ],
  [
    "src/app/api/ynot/marketplace/admin/official-orders/[orderId]/payment/route.ts",
    "paymentProof",
  ],
  [
    "src/app/api/ynot/marketplace/admin/seller-payouts/[payoutId]/release/route.ts",
    "payoutRelease",
  ],
  [
    "src/app/api/ynot/marketplace/admin/seller-payouts/[payoutId]/paid/route.ts",
    "payoutRelease",
  ],
]) {
  const source = readWebsite(file);
  check(
    `${file} enforces ${action} pause flag`,
    source.includes(`marketplaceActionDeniedResponse("${action}"`) ||
      source.includes(`action: "${action}"`),
  );
}

function routeFiles(dir) {
  const entries = readdirSync(dir);
  return entries.flatMap((entry) => {
    const fullPath = resolve(dir, entry);
    if (statSync(fullPath).isDirectory()) return routeFiles(fullPath);
    return entry === "route.ts" ? [fullPath] : [];
  });
}

for (const routePath of routeFiles(resolve(websiteRoot, "src/app/api/marketplace"))) {
  const relPath = routePath.slice(websiteRoot.length + 1);
  const source = readWebsite(relPath);
  includes(source, "@/app/api/ynot/marketplace", `${relPath} aliases the YNOT marketplace route`);
  notMatches(
    source,
    /export\s+\{\s*dynamic|dynamic\s+from\s+["']@\/app\/api\/ynot\/marketplace/,
    `${relPath} does not re-export Next route config`,
  );
}

finish("marketplace doc traceability");
