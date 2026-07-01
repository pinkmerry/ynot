#!/usr/bin/env node
import {
  check,
  fileExists,
  finish,
  includes,
  marketplaceMigrationFiles,
  marketplaceSql,
  matches,
  notMatches,
  readRepo,
  readWebsite,
} from "./marketplace-verification-helpers.mjs";

const sql = marketplaceSql();
const compactSql = sql.replace(/\s+/g, " ").toLowerCase();
const snkrdunkParityMigration = readRepo(
  "Database/marketplace-supabase/migrations/20260630120000_marketplace_snkrdunk_parity.sql",
);
const compactSnkrdunkParityMigration = snkrdunkParityMigration.replace(/\s+/g, " ").toLowerCase();
const money = readWebsite("src/lib/marketplace/money.ts");
const config = readRepo("Database/marketplace-supabase/config.toml");

check("marketplace Supabase project config exists", fileExists("../Database/marketplace-supabase/config.toml"));
includes(config, 'project_id = "ynott-marketplace"', "marketplace uses separate Supabase project id");
check("marketplace has ordered migration slices", marketplaceMigrationFiles().length >= 6);

for (const table of [
  "marketplace_accounts",
  "marketplace_idempotency_keys",
  "marketplace_audit_events",
  "marketplace_inventory_sources",
  "marketplace_inventory_items",
  "marketplace_products",
  "marketplace_product_variants",
  "marketplace_price_history_points",
  "marketplace_listing_snapshots",
  "marketplace_pending_payment_orders",
  "marketplace_orders",
  "marketplace_payment_proofs",
  "marketplace_refund_requests",
  "marketplace_reconciliation_items",
  "marketplace_seller_terms_acceptances",
  "marketplace_seller_submissions",
  "marketplace_seller_submission_photos",
  "marketplace_seller_submission_events",
  "marketplace_seller_handoff_confirmations",
  "marketplace_seller_payouts",
  "marketplace_provider_payment_events",
  "marketplace_admin_commands",
  "marketplace_audit_event_targets",
  "marketplace_money_policies",
  "marketplace_public_seller_profiles",
  "marketplace_cart_items",
  "marketplace_watchlist_items",
]) {
  includes(compactSql, `create table if not exists public.${table}`, `${table} table exists`);
}

for (const column of [
  "item_price_satang",
  "shipping_fee_satang",
  "buyer_service_fee_satang",
  "seller_marketplace_fee_satang",
  "seller_payout_satang",
  "buyer_total_satang",
]) {
  includes(compactSql, column, `${column} minor-unit money column exists`);
}

matches(compactSql, /currency text not null default 'thb' check \(currency = 'thb'\)/, "marketplace money is locked to THB");
includes(money, "DEFAULT_MARKETPLACE_SHIPPING_FEE_SATANG = 15_000", "shipping default is 150 THB");
includes(money, "DEFAULT_MARKETPLACE_SELLER_FEE_BPS = 1_000", "seller fee default is 10 percent");
includes(money, "DEFAULT_MARKETPLACE_BUYER_SERVICE_FEE_BPS = 1_000", "buyer service fee default is 10 percent");
includes(compactSql, "constraint marketplace_accounts_ynot_profile_unique unique (ynot_profile_id)", "marketplace account is unique per YNOTT profile");
matches(compactSql, /source_kind text not null check \(source_kind in \('official_stock', 'seller_consignment', 'marketplace_purchase'\)\)/, "inventory source kinds are marketplace-owned only");
matches(compactSql, /item_type .*check \(item_type in \('card', 'sealed_box', 'sealed_pack'\)\)/, "MVP item types include card, sealed box, and sealed pack");

for (const indexName of [
  "marketplace_accounts_ynot_profile_idx",
  "marketplace_idempotency_account_idx",
  "marketplace_listing_browse_idx",
  "marketplace_products_slug_idx",
  "marketplace_variants_product_idx",
  "marketplace_inventory_product_idx",
  "marketplace_listing_product_active_idx",
  "marketplace_products_search_trgm_idx",
  "marketplace_listing_product_active_browse_idx",
  "marketplace_listing_product_variant_active_browse_idx",
  "marketplace_price_history_product_idx",
  "marketplace_price_history_product_recent_idx",
  "marketplace_price_history_listing_idx",
  "marketplace_price_history_product_source_condition_idx",
  "marketplace_public_seller_profiles_account_idx",
  "marketplace_cart_items_buyer_idx",
  "marketplace_cart_items_listing_idx",
  "marketplace_cart_items_buyer_listing_idx",
  "marketplace_watchlist_items_buyer_idx",
  "marketplace_watchlist_items_listing_idx",
  "marketplace_watchlist_items_buyer_listing_idx",
  "marketplace_listing_snapshots_cart_availability_idx",
  "marketplace_pending_orders_state_expiry_idx",
  "marketplace_payment_proofs_file_sha_idx",
  "marketplace_seller_payouts_queue_idx",
  "marketplace_reconciliation_items_target_state_idx",
  "marketplace_audit_event_targets_lookup_idx",
]) {
  includes(compactSql, `create index if not exists ${indexName}`, `${indexName} exists`);
}
includes(
  compactSql,
  "create unique index if not exists marketplace_money_policies_one_active_idx",
  "marketplace_money_policies_one_active_idx exists",
);

includes(compactSql, "unique (ynot_profile_id, scope, idempotency_key)", "idempotency uniqueness is account scoped");
includes(compactSql, "unique (buyer_marketplace_account_id, listing_id)", "cart and watchlist are unique per buyer listing");
includes(compactSql, "unique (provider, provider_event_id)", "provider event replay is unique");
includes(compactSql, "provider_event_key text not null unique", "provider event key is unique");
includes(compactSql, "marketplace_listing_snapshots_one_open_per_inventory_idx", "one open listing per inventory item is enforced");
includes(compactSql, "seller_kind text not null check (seller_kind in ('official_shop', 'user_seller'))", "public seller profiles distinguish official and user sellers");
includes(compactSql, "status text not null default 'active' check (status in ('active', 'paused', 'suspended'))", "public seller profiles have public-safe lifecycle status");
includes(compactSql, "left join public.marketplace_public_seller_profiles seller_profile", "public listing snapshots join public seller profiles");
includes(compactSql, "seller_profile.seller_public_profile_id", "public listing snapshots expose public seller profile id");
includes(compactSql, "listing.product_id", "public listing snapshots expose product id");
includes(compactSql, "listing.variant_id", "public listing snapshots expose variant id");

const publicListingSnapshotViewDropIndex = compactSnkrdunkParityMigration.indexOf(
  "drop view if exists public.marketplace_public_listing_snapshots",
);
const latestPublicListingSnapshotViewStart = compactSnkrdunkParityMigration.search(
  /create(?: or replace)? view public\.marketplace_public_listing_snapshots/,
);
const latestPublicListingSnapshotViewEnd =
  latestPublicListingSnapshotViewStart >= 0
    ? compactSnkrdunkParityMigration.indexOf(
        "where listing.listing_state = 'active';",
        latestPublicListingSnapshotViewStart,
      )
    : -1;
const latestPublicListingSnapshotView =
  latestPublicListingSnapshotViewStart >= 0 && latestPublicListingSnapshotViewEnd >= 0
    ? compactSnkrdunkParityMigration.slice(
        latestPublicListingSnapshotViewStart,
        latestPublicListingSnapshotViewEnd + "where listing.listing_state = 'active';".length,
      )
    : "";
check(
  "SNKRDUNK parity migration drops public listing snapshot view before recreating it",
  publicListingSnapshotViewDropIndex >= 0 &&
    latestPublicListingSnapshotViewStart >= 0 &&
    publicListingSnapshotViewDropIndex < latestPublicListingSnapshotViewStart,
);
check("public listing snapshot view is recreated after product columns exist", latestPublicListingSnapshotView.length > 0);

const publicListingSelectList =
  latestPublicListingSnapshotView.match(/select([\s\S]*?)from public\.marketplace_listing_snapshots listing/)?.[1] ?? "";
const publicListingColumns = publicListingSelectList
  .replace(/jsonb_strip_nulls\([\s\S]*?\)\s+as snapshot_payload,/, "snapshot_payload,");
const publicSnapshotPayloadExpression =
  publicListingSelectList.match(/(jsonb_strip_nulls\([\s\S]*?\))\s+as snapshot_payload/)?.[1] ?? "";
const publicListingProjectionPrefix = [
  "listing.listing_id",
  "listing.inventory_item_id",
  "listing.product_id",
  "listing.variant_id",
  "seller_profile.seller_public_profile_id",
  "listing.listing_source",
  "listing.listing_state",
  "listing.public_slug",
  "listing.title",
  "listing.item_price_satang",
  "listing.currency",
  "listing.quantity_available_snapshot",
  "listing.public_description",
  "listing.photo_urls",
  "jsonb_strip_nulls(",
].join(", ");
includes(
  publicListingSelectList,
  publicListingProjectionPrefix,
  "public listing snapshot view uses the intended projection order",
);
includes(publicListingSelectList, "listing.product_id", "public listing snapshot select list includes product_id");
includes(publicListingSelectList, "listing.variant_id", "public listing snapshot select list includes variant_id");
includes(publicListingSelectList, "seller_profile.seller_public_profile_id", "public listing snapshot select list includes seller_public_profile_id");
notMatches(
  publicListingColumns,
  /\b(seller_marketplace_account_id|buyer_marketplace_account_id|ynot_profile_id|email|phone|address|idempotency|request_hash)\b/,
  "public listing snapshot select list excludes private seller and customer columns",
);
includes(publicSnapshotPayloadExpression, "jsonb_build_object", "public listing snapshot payload is allowlisted");
for (const publicPayloadKey of [
  "sourceBadge",
  "itemType",
  "conditionCode",
  "sourceKind",
  "productSlug",
  "variantSlug",
  "variantLabel",
  "conditionBucket",
  "gradeService",
  "gradeValue",
]) {
  includes(
    publicSnapshotPayloadExpression,
    `'${publicPayloadKey.toLowerCase()}', listing.snapshot_payload -> '${publicPayloadKey.toLowerCase()}'`,
    `public listing snapshot allowlists payload key ${publicPayloadKey}`,
  );
}
notMatches(
  publicSnapshotPayloadExpression,
  /\b(privateadminnote|procurementnote|sellerpayoutstate|sellermarketplacefeebps|sellermarketplacefeesatang|sellerpayoutsatang|sellerfeebps|sellerfeesatang|sellerpayoutid|requestid|idempotencykey|requesthash|email|phone|address|selleremail|sellerphone|selleraddress|buyeremail|buyerphone|buyeraddress|shippingemail|shippingphone|shippingaddress)\b/,
  "public listing snapshot payload projection excludes private payload keys",
);
includes(compactSql, "marketplace_get_active_money_policy", "active money policy RPC exists");
includes(compactSql, "marketplace_admin_set_money_policy", "admin money policy RPC exists");
includes(compactSql, "marketplace_record_price_history_for_order", "product market price history trigger function exists");
includes(compactSql, "marketplace_browse_product_markets", "product browse grouped market RPC exists");
includes(compactSql, "marketplace_get_product_market_detail", "product detail read model RPC exists");
includes(
  compactSql,
  "marketplace_orders_record_price_history_after_paid",
  "paid marketplace orders record product market price history",
);
for (const rpc of [
  "marketplace_list_customer_cart",
  "marketplace_get_customer_cart_summary",
  "marketplace_add_customer_cart_item",
  "marketplace_remove_customer_cart_item",
  "marketplace_list_customer_watchlist",
  "marketplace_watch_listing",
  "marketplace_unwatch_listing",
]) {
  includes(compactSql, `create or replace function public.${rpc}`, `${rpc} RPC exists`);
  includes(compactSql, `grant execute on function public.${rpc}`, `${rpc} grants service execution`);
}

finish("marketplace schema");
