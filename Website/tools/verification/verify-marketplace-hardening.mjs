#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  check,
  finish,
  includes,
  marketplaceSourceText,
  marketplaceSql,
  matches,
  notMatches,
  readRepo,
  readWebsite,
  websiteRoot,
} from "./marketplace-verification-helpers.mjs";

const sql = marketplaceSql();
const compactSql = sql.replace(/\s+/g, " ").toLowerCase();
const source = marketplaceSourceText();
const webhookRoute = readWebsite("src/app/api/ynot/marketplace/payments/webhook/route.ts");
const requestGuard = readWebsite("src/lib/marketplace/request-guard.ts");
const mutationGuard = readWebsite("src/lib/marketplace/mutation-guard.ts");
const ops = readWebsite("src/lib/marketplace/ops-hardening.ts");
const supabaseAdapter = readWebsite("src/lib/marketplace/supabase-adapter.ts");
const orders = readWebsite("src/lib/marketplace/orders.ts");
const money = readWebsite("src/lib/marketplace/money.ts");
const listings = readWebsite("src/lib/marketplace/listings.ts");
const serverAddresses = readWebsite("src/features/ynot/server-addresses.ts");
const productBrowse = readWebsite("src/lib/marketplace/product-browse.ts");
const publicProjection = readWebsite("src/lib/marketplace/public-projection.ts");
const buyerOrderSelect = orders.slice(
  orders.indexOf("const ORDER_SELECT"),
  orders.indexOf("const LISTING_SUMMARY_SELECT"),
);
// MarketplaceCheckoutClient.tsx was retired by the marketplace-ui redesign
// (the listing checkout section now renders CheckoutFlow).
const checkoutFlow = readWebsite("src/features/marketplace-ui/checkout/CheckoutFlow.tsx");
const paymentProofRoute = readWebsite("src/app/api/ynot/marketplace/checkout/pending-orders/[pendingOrderId]/payment-proof/route.ts");
const sellerPhotoRoute = readWebsite("src/app/api/ynot/marketplace/seller/submissions/[submissionId]/photos/route.ts");
const watchlistItemRoute = readWebsite("src/app/api/ynot/marketplace/watchlist/items/[listingId]/route.ts");
const cartRoute = readWebsite("src/app/api/ynot/marketplace/cart/route.ts");
const cartSummaryRoute = readWebsite("src/app/api/ynot/marketplace/cart/summary/route.ts");
const cartItemRoute = readWebsite("src/app/api/ynot/marketplace/cart/items/route.ts");
const cartItemTargetRoute = readWebsite("src/app/api/ynot/marketplace/cart/items/[listingId]/route.ts");
const watchlistRoute = readWebsite("src/app/api/ynot/marketplace/watchlist/route.ts");
const cartWatchlist = readWebsite("src/lib/marketplace/cart-watchlist.ts");
const customerCartSql = readRepo(
  "Database/marketplace-supabase/migrations/20260630133000_marketplace_customer_cart_rpc.sql",
);
const sellerConsignment = readWebsite("src/lib/marketplace/seller-consignment.ts");
const refundTransitionRoute = readWebsite("src/app/api/ynot/marketplace/admin/refunds/[refundRequestId]/transition/route.ts");
const officialInventoryCreateRoute = readWebsite("src/app/api/ynot/marketplace/admin/official-inventory/route.ts");
const officialInventoryRoute = readWebsite("src/app/api/ynot/marketplace/admin/official-inventory/[inventoryId]/route.ts");
const officialListingRoute = readWebsite("src/app/api/ynot/marketplace/admin/official-listings/[listingId]/route.ts");
const officialArchiveRoute = readWebsite("src/app/api/ynot/marketplace/admin/official-inventory/[inventoryId]/archive/route.ts");
const officialHideRoute = readWebsite("src/app/api/ynot/marketplace/admin/official-listings/[listingId]/hide/route.ts");

function sqlFunctionBlock(name) {
  const marker = `create or replace function public.${name}`;
  const start = compactSql.indexOf(marker);
  check(`${name} SQL function exists`, start >= 0);
  const next = compactSql.indexOf(" create or replace function public.", start + marker.length);
  return compactSql.slice(start, next === -1 ? undefined : next);
}

function assertNoDuplicateSqlParams(name) {
  const pattern = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\(([\\s\\S]*?)\\)\\s*returns`,
    "i",
  );
  const match = sql.match(pattern);
  check(`${name} SQL signature is parseable`, Boolean(match));
  const params = match[1]
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0]?.toLowerCase())
    .filter(Boolean);
  check(`${name} SQL signature has parameters`, params.length > 0);
  check(`${name} SQL signature has no duplicate parameters`, new Set(params).size === params.length);
}

function marketplaceRouteFiles(dir = resolve(websiteRoot, "src/app/api/ynot/marketplace")) {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) return marketplaceRouteFiles(fullPath);
    if (entry !== "route.ts") return [];
    return [fullPath];
  });
}

const mutationRouteFiles = marketplaceRouteFiles()
  .map((fullPath) => ({
    fullPath,
    relativePath: relative(websiteRoot, fullPath),
    text: readFileSync(fullPath, "utf8"),
  }))
  .filter(({ text }) =>
    /export async function (POST|PATCH|PUT|DELETE)\s*\(/.test(text),
  );

for (const route of mutationRouteFiles) {
  if (route.relativePath.endsWith("src/app/api/ynot/marketplace/payments/webhook/route.ts")) {
    includes(
      route.text,
      "applyMarketplacePaymentWebhook",
      "marketplace payment webhook uses provider signature guard instead of same-origin mutation guard",
    );
    continue;
  }
  if (route.relativePath.endsWith("src/app/api/ynot/marketplace/checkout/pending-orders/expire/route.ts")) {
    includes(
      route.text,
      "MARKETPLACE_PENDING_ORDER_EXPIRY_SECRET",
      "marketplace pending order expiry route uses internal secret guard",
    );
    includes(
      route.text,
      "expireMarketplacePendingPaymentOrders",
      "marketplace pending order expiry route uses bounded expiry RPC",
    );
    continue;
  }
  includes(
    route.text,
    "prepareMarketplaceMutation",
    `${route.relativePath} enters through centralized marketplace mutation guard`,
  );
  if (route.relativePath.includes("[")) {
    includes(
      route.text,
      "requestHashForTarget",
      `${route.relativePath} includes the route target in idempotency hashes`,
    );
  }
}

includes(webhookRoute, 'forwardedProto !== "https"', "production webhook rejects non-HTTPS forwarded requests");
includes(webhookRoute, "enforceRateLimit", "webhook route is rate limited");
includes(ops, "MARKETPLACE_PAYMENT_WEBHOOK_SECRET", "webhook secret is server-side only");
includes(ops, "constantTimeEqual", "webhook signature uses constant-time compare");
includes(ops, "hmacSha256Hex(secret, rawBody)", "webhook verifies raw body HMAC before trusting payload");
includes(ops, "p_provider_amount_satang", "webhook forwards provider amount to RPC");
includes(ops, "p_provider_currency", "webhook forwards provider currency to RPC");
includes(compactSql, "provider_money_mismatch", "payment provider money mismatch opens reconciliation");
includes(compactSql, "provider_payment_requires_admin_review", "provider webhook requires admin payment review");
includes(compactSql, "processing_state = 'reconciliation_required'", "provider webhook does not auto-apply paid state");
notMatches(
  sqlFunctionBlock("marketplace_apply_provider_payment_event"),
  /set payment_state = 'paid'|set payment_state = 'failed'/,
  "provider webhook cannot directly mutate order payment state",
);

includes(requestGuard, "MAX_MARKETPLACE_JSON_BODY_BYTES = 4096", "mutation JSON body has tight byte limit");
includes(requestGuard, "marketplace_unexpected_fields", "mutation JSON rejects unknown fields");
includes(mutationGuard, "enforceSameOriginMutation", "central mutation guard enforces CSRF same-origin checks");
includes(mutationGuard, "ownerOnlyMarketplaceAccess", "central mutation guard applies marketplace launch/access gate");
includes(mutationGuard, "marketplaceActionDeniedResponse", "central mutation guard applies action pause flags");
includes(mutationGuard, "enforceRateLimit", "central mutation guard applies per-route rate limits");
includes(mutationGuard, "marketplaceIdempotencyKey", "central mutation guard validates idempotency keys by default");
includes(mutationGuard, "readMarketplaceJsonBody", "central mutation guard enforces JSON body allowlists");
includes(mutationGuard, "marketplaceRequestHash", "central mutation guard owns canonical request hashing");
includes(mutationGuard, "requestHashForBody", "central mutation guard supports file-upload canonical hashes");
includes(mutationGuard, "requestHashForTarget", "central mutation guard binds path targets into hashes");
includes(supabaseAdapter, "SAFE_RPC_ERRORS", "RPC errors are mapped to safe public messages");
notMatches(supabaseAdapter, /return Response\.json\(.*result\.error|error\.message.*internalMessage/s, "raw Supabase errors are not returned directly");

matches(source, /\.rpc\("marketplace_[a-z0-9_]+"/g, "mutations use parameterized Supabase RPC calls");
notMatches(source, /supabase\.sql|executeSql|rawQuery|\$\{[^}]+sql|from\(.*\+|select\(.*\+/i, "service code avoids raw SQL string concatenation");
notMatches(source, /NEXT_PUBLIC_MARKETPLACE_SUPABASE_SERVICE_ROLE|NEXT_PUBLIC_.*SERVICE_ROLE|MARKETPLACE_PAYMENT_WEBHOOK_SECRET.*NEXT_PUBLIC/i, "marketplace secrets are not public env vars");
notMatches(source, /\[89ab\]\[0-9a-f\]\{12\}/, "marketplace UUID guards preserve the final UUID hyphen");
matches(source, /\[89ab\]\[0-9a-f\]\{3\}-\[0-9a-f\]\{12\}/, "marketplace UUID guards accept standard UUID strings");
matches(compactSql, /security definer set search_path = public, pg_temp/g, "security definer functions pin search_path");
matches(compactSql, /revoke all on function public\.marketplace_/g, "server-only marketplace RPCs revoke public execution");
matches(compactSql, /grant execute on function public\.marketplace_.* to service_role/g, "server-only marketplace RPCs grant service_role only");

includes(compactSql, "marketplace_admin_command_append_only", "admin command append-only trigger exists");
for (const rpc of [
  "marketplace_apply_provider_payment_event",
  "marketplace_resolve_reconciliation_item",
  "marketplace_record_refund_transition",
  "marketplace_release_seller_payout",
  "marketplace_record_official_payment_result",
  "marketplace_update_official_inventory",
  "marketplace_update_official_listing",
  "marketplace_archive_official_inventory",
  "marketplace_hide_official_listing",
  "marketplace_admin_set_money_policy",
  "marketplace_browse_product_markets",
  "marketplace_get_bag_summary",
]) {
  assertNoDuplicateSqlParams(rpc);
}
includes(
  compactSql,
  "old.result_payload is null and new.result_payload is not null",
  "admin command append-only trigger permits one result write",
);
includes(
  compactSql,
  "new.command_payload is not distinct from old.command_payload",
  "admin command result write cannot mutate original command payload",
);
includes(
  compactSql,
  "new.created_at is not distinct from old.created_at",
  "admin command result write cannot rewrite command timestamp",
);
includes(compactSql, "('payout', 'sellerpayoutid')", "audit target projection maps seller payout creation events");
includes(compactSql, "marketplace_audit_event_targets_lookup_idx", "audit target lookup is index-backed");
includes(ops, ".from(\"marketplace_audit_event_targets\")", "audit timeline reads target projection instead of JSON scanning");
notMatches(ops, /event_payload\s*->>|event_payload->>/, "audit timeline service avoids JSON target scans");
includes(orders, "sanitizeBuyerPayload", "buyer order RPC responses are sanitized");
includes(orders, "sellerFeeBps", "buyer sanitizer removes seller fee fields from RPC payloads");
includes(
  orders,
  "const checkoutSnapshot = withMarketplacePaymentReceiverSnapshot(",
  "checkout augments the validated shipping snapshot with the payment receiver",
);
includes(orders, "p_shipping_snapshot: checkoutSnapshot", "checkout sends validated shipping snapshot to RPC");
includes(orders, "mockPendingPaymentOrder", "local mock checkout exercises the server checkout route");
includes(orders, "marketplaceMoneyPreview", "local mock checkout uses the server money policy calculator");
includes(serverAddresses, "previewAddressesForProfile", "marketplace checkout reads local preview shipping addresses");
includes(publicProjection, "PUBLIC_LISTING_SNAPSHOT_PAYLOAD_KEYS", "public listing projection uses an allowlist");
includes(publicProjection, "PUBLIC_PRODUCT_METADATA_KEYS", "public product market projection uses an allowlist");
includes(publicProjection, "PUBLIC_PRICE_HISTORY_KEYS", "public price history projection uses an allowlist");
includes(publicProjection, "projectPublicListingSnapshot", "listing reads pass through the public projection");
includes(publicProjection, "projectPublicProductMarket", "product market reads pass through the public projection");
includes(publicProjection, "projectPublicPriceHistoryPoint", "price history reads pass through the public projection");
includes(listings, "decodeListingCursor", "listing browse decodes opaque keyset cursor");
includes(listings, ".limit(limit + 1)", "listing browse fetches one extra row for keyset pagination");
notMatches(listings, /\.range\(/, "listing browse avoids offset pagination");
includes(productBrowse, '.rpc("marketplace_browse_product_markets"', "product browse uses the grouped RPC");
includes(productBrowse, "projectPublicProductBrowseSummary", "product browse rows pass through public projection");
notMatches(
  productBrowse,
  /seller_marketplace_account_id|ynot_profile_id|sellerPayout/,
  "product browse does not expose private seller/account payout fields",
);
notMatches(
  buyerOrderSelect,
  /seller_payout_satang|seller_payout_state/,
  "buyer order selects do not include seller payout columns",
);
includes(compactSql, "shipping_snapshot jsonb not null default '{}'::jsonb", "pending/order tables snapshot shipping address");
includes(compactSql, "order_row.fulfilment_state not in ('shipped', 'completed')", "seller payout release waits for fulfilment milestone");
includes(money, "marketplace_get_active_money_policy", "server money module reads active DB money policy");
includes(money, "marketplace_admin_set_money_policy", "admin money module updates DB money policy through RPC");
includes(paymentProofRoute, "findLiveDuplicateSlip", "marketplace payment proof cross-checks core payment_slips duplicates");
includes(paymentProofRoute, "createServiceSupabaseClient", "marketplace payment proof duplicate check uses core service client");
includes(paymentProofRoute, "LOCAL_CORE_DUPLICATE", "marketplace payment proof marks reused core slips as duplicate");
includes(paymentProofRoute, "core_payment_slips_duplicate_check_failed", "duplicate-check lookup failure sends proof to admin review");
notMatches(checkoutFlow, /15_000|15000|Math\.floor\(itemPriceSatang|estimated/, "checkout flow does not calculate fees or shipping");
includes(sellerPhotoRoute, "multipart/form-data", "seller photo upload requires multipart form data");
includes(sellerPhotoRoute, "verifyImageMagicBytes", "seller photo upload verifies magic bytes");
includes(sellerPhotoRoute, "marketplace-seller-submission-photos", "seller photos use private marketplace bucket");
includes(sellerPhotoRoute, "storageObjectAlreadyExists", "seller photo upload treats deterministic retry uploads as idempotent");
notMatches(sellerPhotoRoute, /Date\.now\(\)/, "seller photo storage path is stable across retries");
includes(paymentProofRoute, "storageObjectAlreadyExists", "payment proof upload treats deterministic retry uploads as idempotent");
notMatches(paymentProofRoute, /Date\.now\(\)/, "payment proof storage path is stable across retries");
includes(sellerConsignment, "storagePath.includes(\"://\")", "seller photo metadata rejects external URLs");
includes(sellerConsignment, "requiredSha256", "seller photo metadata requires content hash");
includes(cartWatchlist, "watchMarketplaceWatchlistItem", "watchlist service exposes idempotent watch command");
notMatches(cartWatchlist, /toggleMarketplaceWatchlistItem/, "watchlist service does not expose retry-unsafe toggle command");
includes(watchlistItemRoute, "watchlist.item.watch", "watchlist POST uses an idempotent watch command");
includes(watchlistItemRoute, "watchlist.item.unwatch", "watchlist DELETE uses an idempotent unwatch command");
notMatches(watchlistItemRoute, /watchlist\.item\.toggle|watchlist:toggle|toggleMarketplaceWatchlistItem/, "watchlist POST is not retry-unsafe toggle");
notMatches(cartWatchlist, /\.from\("marketplace_cart_items"\)/, "cart live adapter does not access cart table directly");
notMatches(cartWatchlist, /\.from\("marketplace_watchlist_items"\)/, "watchlist live adapter does not access watchlist table directly");
for (const rpc of [
  "marketplace_list_customer_cart",
  "marketplace_get_customer_cart_summary",
  "marketplace_add_customer_cart_item",
  "marketplace_remove_customer_cart_item",
  "marketplace_list_customer_watchlist",
  "marketplace_watch_listing",
  "marketplace_unwatch_listing",
]) {
  includes(cartWatchlist, `.rpc("${rpc}"`, `cart/watchlist live adapter uses ${rpc}`);
}
for (const routeSource of [cartRoute, cartSummaryRoute, watchlistRoute]) {
  includes(routeSource, "customerMarketplaceAccess", "customer read route uses buyer-safe access");
  includes(routeSource, "enforceRateLimit", "customer read route is rate limited");
  notMatches(routeSource, /ownerOnlyMarketplaceAccess/, "customer read route is not hard-coded owner-only");
}
for (const routeSource of [cartItemRoute, cartItemTargetRoute, watchlistItemRoute]) {
  includes(routeSource, "prepareMarketplaceMutation", "customer mutation route uses centralized guard");
  includes(routeSource, 'accessMode: "customer"', "customer mutation route uses buyer-safe access");
  includes(routeSource, "requestHashForTarget", "customer mutation route binds target into request hash");
  matches(routeSource, /assertMarketplaceCartUuid|parse[A-Za-z0-9]+(?:Body|Target)|validate[A-Za-z0-9]+/, "customer mutation route validates input before RPC");
  notMatches(routeSource, /request_hash\s*:|idempotency_key\s*:/, "customer mutation route does not return idempotency internals");
  notMatches(routeSource, /body\.listingId/, "customer mutation route uses parsed listing id input");
}
includes(mutationGuard, 'accessMode?: "customer" | "owner"', "central mutation guard supports customer access mode");
includes(mutationGuard, "publicMarketplaceAccess", "customer mutation mode uses public marketplace access");
notMatches(
  customerCartSql,
  /['"](?:snapshot_payload|snapshotPayload)['"]/i,
  "customer cart RPC response JSON does not expose raw snapshot payload keys",
);
notMatches(
  customerCartSql,
  /['"](?:request_hash|requestHash|idempotency_key|idempotencyKey)['"]/i,
  "customer cart RPC response JSON does not expose idempotency internals",
);
includes(compactSql, "marketplace_seller_photo_required", "seller submission submit requires photo evidence");
includes(compactSql, "marketplace_payment_evidence_required", "official payment paid transition requires provider evidence");
includes(compactSql, "p_provider_amount_satang <> order_row.buyer_total_satang", "official payment result verifies provider amount");
includes(compactSql, "marketplace_archive_official_inventory", "official inventory archive RPC exists");
includes(compactSql, "marketplace_hide_official_listing", "official listing hide RPC exists");
includes(compactSql, "marketplace_update_official_inventory", "official inventory update RPC exists");
includes(compactSql, "marketplace_update_official_listing", "official listing update RPC exists");
includes(compactSql, "official_inventory.update", "official inventory update uses idempotency scope");
includes(compactSql, "official_listing.update", "official listing update uses idempotency scope");
includes(compactSql, "marketplace_official_inventory_updated", "official inventory update writes audit event");
includes(compactSql, "marketplace_official_listing_updated", "official listing update writes audit event");
includes(compactSql, "marketplace_official_active_pending_order_exists", "official archive blocks active pending orders");
includes(compactSql, "marketplace_official_active_order_exists", "official archive blocks active orders");
includes(officialInventoryCreateRoute, "prepareMarketplaceMutation", "official inventory create route uses centralized mutation guard");
includes(officialInventoryCreateRoute, "CREATE_FIELDS", "official inventory create route uses JSON allowlist");
includes(officialInventoryRoute, "getOfficialInventoryDetail", "official inventory detail route exposes admin detail");
includes(officialInventoryRoute, "prepareMarketplaceMutation", "official inventory update route uses centralized mutation guard");
includes(officialInventoryRoute, 'action: "listingActivation"', "official inventory update route respects listing activation pause flag");
includes(officialInventoryRoute, "OFFICIAL_INVENTORY_UPDATE_FIELDS", "official inventory update route uses JSON allowlist");
includes(officialInventoryRoute, "mutation.requestHash", "official inventory update route uses centralized canonical request hash");
includes(officialListingRoute, "prepareMarketplaceMutation", "official listing update route uses centralized mutation guard");
includes(officialListingRoute, 'action: "listingActivation"', "official listing update route respects listing activation pause flag");
includes(officialListingRoute, "OFFICIAL_LISTING_UPDATE_FIELDS", "official listing update route uses JSON allowlist");
includes(officialListingRoute, "mutation.requestHash", "official listing update route uses centralized canonical request hash");
notMatches(officialListingRoute, /itemPriceSatang/, "official listing update route cannot create public price mismatch");
includes(officialArchiveRoute, "prepareMarketplaceMutation", "official archive route uses centralized mutation guard");
includes(officialArchiveRoute, 'action: "listingActivation"', "official archive route respects listing activation pause flag");
includes(officialHideRoute, "prepareMarketplaceMutation", "official hide route uses centralized mutation guard");
includes(officialHideRoute, 'action: "listingActivation"', "official hide route respects listing activation pause flag");
includes(ops, "marketplace_record_refund_transition", "ops service exposes refund result transition RPC");
includes(refundTransitionRoute, "prepareMarketplaceMutation", "refund transition route uses centralized mutation guard");
includes(refundTransitionRoute, "refund.record_result", "refund transition route hashes the refund result command");
includes(compactSql, "marketplace_get_bag_summary", "customer bag marketplace section uses summary projection RPC");

finish("marketplace hardening");
