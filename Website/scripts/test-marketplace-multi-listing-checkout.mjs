import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appRoot, "..");
const migrationPath = path.join(
  repoRoot,
  "Database/marketplace-supabase/migrations/20260714110000_marketplace_multi_listing_checkout.sql",
);
const cartRestoreMigrationPath = path.join(
  repoRoot,
  "Database/marketplace-supabase/migrations/20260714120000_marketplace_restore_cancelled_checkout_cart.sql",
);
const mixedSourceMigrationPath = path.join(
  repoRoot,
  "Database/marketplace-supabase/migrations/20260721111500_marketplace_mixed_source_checkout.sql",
);

function readApp(relPath) {
  return readFileSync(path.join(appRoot, relPath), "utf8");
}

function readMigration() {
  return existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
}

function readCartRestoreMigration() {
  return existsSync(cartRestoreMigrationPath)
    ? readFileSync(cartRestoreMigrationPath, "utf8")
    : "";
}

function readMixedSourceMigration() {
  return existsSync(mixedSourceMigrationPath)
    ? readFileSync(mixedSourceMigrationPath, "utf8")
    : "";
}

function stripSqlComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
}

function compactSql(source) {
  return stripSqlComments(source).replace(/\s+/g, " ").toLowerCase();
}

test("package exposes the scoped multi-listing checkout contract test", () => {
  const packageJson = JSON.parse(readApp("package.json"));
  assert.equal(
    packageJson.scripts["test:marketplace-multi-listing-checkout"],
    "node --test scripts/test-marketplace-multi-listing-checkout.mjs",
  );
});

test("additive migration exists after the current marketplace migration ledger", () => {
  assert.equal(existsSync(migrationPath), true);
});

test("later migration lets one checkout group collect official and user-seller items safely", () => {
  assert.equal(existsSync(mixedSourceMigrationPath), true);
  const sql = compactSql(readMixedSourceMigration());

  assert.match(sql, /create or replace function public\.marketplace_create_multi_listing_checkout\(/);
  assert.match(sql, /marketplace_create_pending_payment_order\(/);
  assert.match(sql, /marketplace_create_user_seller_pending_payment_order\(/);
  assert.doesNotMatch(sql, /marketplace_group_user_seller_unsupported/);
  assert.match(sql, /shipping_party_key/);
  assert.match(sql, /cardinality\(charged_shipping_party_keys\)/);
  assert.match(sql, /if not shipping_party_key = any\(charged_shipping_party_keys\) then\s+charged_shipping_party_keys := array_append/);
  assert.match(sql, /marketplace_sync_grouped_user_seller_payout/);
  assert.match(sql, /after update of payment_state on public\.marketplace_orders/);
});

test("migration adds checkout group and ordered child item tables without replacing single-listing orders", () => {
  const sql = compactSql(readMigration());

  assert.match(sql, /create table if not exists public\.marketplace_checkout_groups/);
  assert.match(sql, /create table if not exists public\.marketplace_checkout_items/);
  assert.match(sql, /checkout_group_id uuid not null references public\.marketplace_checkout_groups\(id\) on delete restrict/);
  assert.match(sql, /pending_payment_order_id uuid not null unique references public\.marketplace_pending_payment_orders\(id\) on delete restrict/);
  assert.match(sql, /order_id uuid not null unique references public\.marketplace_orders\(id\) on delete restrict/);
  assert.match(sql, /unique \(checkout_group_id, position\)/);
  assert.match(sql, /unique \(checkout_group_id, listing_id\)/);
  assert.doesNotMatch(sql, /drop table[^;]*marketplace_(pending_payment_orders|orders)/);
});

test("group records carry one aggregate payment obligation and immutable checkout snapshots", () => {
  const sql = compactSql(readMigration());

  for (const required of [
    "buyer_marketplace_account_id",
    "checkout_state",
    "payment_state",
    "item_count",
    "item_subtotal_satang",
    "shipping_fee_satang",
    "buyer_service_fee_satang",
    "buyer_total_satang",
    "currency",
    "shipping_snapshot",
    "money_snapshot",
    "expires_at",
    "idempotency_key",
  ]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.marketplace_checkout_groups[\\s\\S]*?${required}`));
  }
  assert.match(sql, /check \(item_count between 2 and 3\)/);
  assert.match(sql, /check \(currency = 'thb'\)/);
  assert.match(sql, /unique \(buyer_marketplace_account_id, idempotency_key\)/);
});

test("proofs and provider events receive nullable group links while global proof identity remains intact", () => {
  const sql = compactSql(readMigration());

  assert.match(sql, /alter table public\.marketplace_payment_proofs add column if not exists checkout_group_id uuid references public\.marketplace_checkout_groups\(id\) on delete restrict/);
  assert.match(sql, /alter table public\.marketplace_provider_payment_events add column if not exists checkout_group_id uuid references public\.marketplace_checkout_groups\(id\) on delete restrict/);
  assert.match(sql, /marketplace_payment_proofs_checkout_group_idx/);
  assert.match(sql, /marketplace_provider_payment_events_checkout_group_idx/);
});

test("new tables are RLS enabled, default-deny, and service-role owned", () => {
  const sql = compactSql(readMigration());

  assert.match(sql, /alter table public\.marketplace_checkout_groups enable row level security/);
  assert.match(sql, /alter table public\.marketplace_checkout_items enable row level security/);
  assert.match(sql, /revoke all on public\.marketplace_checkout_groups, public\.marketplace_checkout_items from public, anon, authenticated/);
  assert.match(sql, /grant all on public\.marketplace_checkout_groups, public\.marketplace_checkout_items to service_role/);
});

test("create RPC is fixed-search-path, service-role only, and validates two or three distinct listing UUIDs", () => {
  const sql = compactSql(readMigration());

  assert.match(sql, /create or replace function public\.marketplace_create_multi_listing_checkout\(/);
  assert.match(sql, /marketplace_create_multi_listing_checkout[\s\S]*?security definer[\s\S]*?set search_path = public, pg_temp/);
  assert.match(sql, /array_length\(p_listing_ids, 1\) not between 2 and 3/);
  assert.match(sql, /count\(distinct listing_id\)[^;]*<> listing_count/);
  assert.match(sql, /raise exception 'marketplace_checkout_listing_count_invalid'/);
  assert.match(sql, /raise exception 'marketplace_checkout_duplicate_listing'/);
  assert.match(sql, /raise exception 'marketplace_group_user_seller_unsupported'/);
  assert.match(sql, /'checkout_group\.create'/);
  assert.match(sql, /raise exception 'marketplace_idempotency_conflict'/);
});

test("create RPC locks listings and inventories in UUID order before validating availability", () => {
  const sql = compactSql(readMigration());

  assert.match(sql, /from public\.marketplace_listing_snapshots listing where listing\.listing_id = any\(p_listing_ids\) order by listing\.listing_id for update/);
  assert.match(sql, /from public\.marketplace_inventory_items inventory where inventory\.id = any\(inventory_ids\) order by inventory\.id for update/);
  assert.match(sql, /raise exception 'marketplace_listing_not_available'/);
  assert.match(sql, /listing_row\.listing_source <> 'official_shop'/);
  assert.match(sql, /inventory_row\.seller_type <> 'official_shop'/);
});

test("create RPC allocates shipping once, preserves child orders, and removes only selected cart rows", () => {
  const sql = compactSql(readMigration());

  assert.match(sql, /allocated_shipping_fee_satang := case when item_position = 1 then p_shipping_fee_satang else 0 end/);
  assert.match(sql, /insert into public\.marketplace_pending_payment_orders/);
  assert.match(sql, /insert into public\.marketplace_orders/);
  assert.match(sql, /insert into public\.marketplace_checkout_items/);
  assert.match(sql, /delete from public\.marketplace_cart_items where buyer_marketplace_account_id = p_buyer_marketplace_account_id and listing_id = any\(p_listing_ids\)/);
  assert.match(sql, /group_total_satang <> child_total_satang/);
  assert.match(sql, /raise exception 'marketplace_checkout_total_mismatch'/);
});

test("service-fee multiplication promotes item price before arithmetic to prevent integer overflow", () => {
  const sql = compactSql(readMigration());

  assert.match(sql, /inventory_row\.item_price_satang::numeric \* p_buyer_service_fee_bps/);
  assert.match(sql, /child_row\.inventory_price_satang::numeric \* p_buyer_service_fee_bps/);
  assert.doesNotMatch(sql, /\(inventory_row\.item_price_satang \* p_buyer_service_fee_bps\)::numeric/);
  assert.doesNotMatch(sql, /\(child_row\.inventory_price_satang \* p_buyer_service_fee_bps\)::numeric/);
});

test("group RPC row variables never collide with checkout-item table aliases", () => {
  const sql = compactSql(readMigration());

  assert.doesNotMatch(
    sql,
    /checkout_item public\.marketplace_checkout_items%rowtype/,
    "PL/pgSQL treats checkout_item.* as ambiguous when checkout_item is also a row variable",
  );
  assert.match(sql, /checkout_item_row public\.marketplace_checkout_items%rowtype/);
  assert.match(sql, /for checkout_item_row in select checkout_item\.\*/);
});

test("group operation guard only reads checkout_group_id on rows that own that field", () => {
  const sql = compactSql(readMigration());

  assert.doesNotMatch(
    sql,
    /if tg_table_name in \('marketplace_payment_proofs', 'marketplace_provider_payment_events'\) and new\.checkout_group_id/,
    "pending-payment rows do not have checkout_group_id, so the field access must stay inside a table-specific branch",
  );
  assert.match(
    sql,
    /if tg_table_name in \('marketplace_payment_proofs', 'marketplace_provider_payment_events'\) then if new\.checkout_group_id is distinct from linked_group_id then/,
  );
});

test("database guard forces grouped proof, release, manual-result, and provider-event operations through group RPCs", () => {
  const sql = compactSql(readMigration());

  assert.match(sql, /create or replace function public\.marketplace_require_checkout_group_operation\(\)/);
  assert.match(sql, /raise exception 'marketplace_checkout_group_operation_required'/);
  assert.match(sql, /create trigger marketplace_pending_order_group_operation_guard before update of order_state on public\.marketplace_pending_payment_orders/);
  assert.match(sql, /create trigger marketplace_payment_proof_group_operation_guard before insert on public\.marketplace_payment_proofs/);
  assert.match(sql, /create trigger marketplace_provider_event_group_operation_guard before update of order_id, pending_payment_order_id, checkout_group_id on public\.marketplace_provider_payment_events/);
  assert.match(sql, /current_setting\('marketplace\.checkout_group_id', true\)/);
  assert.match(sql, /perform set_config\('marketplace\.checkout_group_id', group_row\.id::text, true\)/);
  assert.match(sql, /comment on function public\.marketplace_apply_provider_payment_event\(text, text, text, text, uuid, text, integer, text, text, jsonb, text\) is 'single-order provider events reject grouped child orders/);
  assert.match(sql, /grouped payment evidence must use marketplace_submit_checkout_payment_proof or marketplace_record_checkout_payment_result/);
});

test("create payload exposes the stable group contract and canonical first child", () => {
  const sql = compactSql(readMigration());

  for (const key of [
    "checkoutgroupid",
    "pendingpaymentorderid",
    "orderid",
    "items",
    "totals",
    "currency",
    "expiresat",
  ]) {
    assert.match(sql, new RegExp(`jsonb_build_object\\([\\s\\S]*?'${key}'`));
  }
  assert.match(sql, /order by checkout_item\.position/);
});

test("release RPC locks the whole group and atomically restores every unpaid child", () => {
  const sql = compactSql(readMigration());

  assert.match(sql, /create or replace function public\.marketplace_release_checkout_group\(/);
  assert.match(sql, /'checkout_group\.release'/);
  assert.match(sql, /normalized_reason not in \('buyer_cancelled', 'expired'\)/);
  assert.match(sql, /from public\.marketplace_checkout_items checkout_item where checkout_item\.checkout_group_id = group_row\.id order by checkout_item\.position for update/);
  assert.match(sql, /update public\.marketplace_inventory_items inventory set quantity_available = least\(inventory\.quantity_total, inventory\.quantity_available \+ pending_order\.quantity\)/);
  assert.match(sql, /update public\.marketplace_pending_payment_orders pending_order set order_state = next_pending_state/);
  assert.match(sql, /update public\.marketplace_orders child_order set payment_state = 'failed', fulfilment_state = 'cancelled'/);
  assert.match(sql, /update public\.marketplace_checkout_groups set checkout_state = next_group_state, payment_state = 'failed'/);
});

test("failed checkout groups restore the cart rows consumed when checkout started", () => {
  assert.equal(existsSync(cartRestoreMigrationPath), true);
  const sql = compactSql(readCartRestoreMigration());

  assert.match(
    sql,
    /create or replace function public\.marketplace_restore_failed_checkout_group_cart\(\)/,
  );
  assert.match(
    sql,
    /if new\.checkout_state not in \('cancelled', 'expired'\) or new\.payment_state <> 'failed' then return new/,
  );
  assert.match(
    sql,
    /insert into public\.marketplace_cart_items\( buyer_marketplace_account_id, listing_id, quantity \) select new\.buyer_marketplace_account_id, checkout_item\.listing_id, 1 from public\.marketplace_checkout_items checkout_item where checkout_item\.checkout_group_id = new\.id on conflict \(buyer_marketplace_account_id, listing_id\) do nothing/,
  );
  assert.match(
    sql,
    /after update of checkout_state, payment_state on public\.marketplace_checkout_groups for each row execute function public\.marketplace_restore_failed_checkout_group_cart\(\)/,
  );
  assert.match(sql, /security definer set search_path = public, pg_temp/);
});

test("group proof RPC inserts one canonical proof and transitions all children together", () => {
  const sql = compactSql(readMigration());

  assert.match(sql, /create or replace function public\.marketplace_submit_checkout_payment_proof\(/);
  assert.match(sql, /'checkout_group\.payment_proof'/);
  assert.match(sql, /proof\.checkout_group_id is distinct from group_row\.id/);
  assert.match(sql, /insert into public\.marketplace_payment_proofs/);
  assert.match(sql, /checkout_group_id/);
  assert.match(sql, /update public\.marketplace_pending_payment_orders pending_order set order_state = 'paid'/);
  assert.match(sql, /update public\.marketplace_orders child_order set payment_state = 'paid'/);
  assert.match(sql, /update public\.marketplace_checkout_groups set checkout_state = 'paid', payment_state = 'paid'/);
  assert.match(sql, /update public\.marketplace_checkout_groups set checkout_state = 'payment_submitted', payment_state = 'payment_submitted'/);
  assert.match(sql, /update public\.marketplace_checkout_groups set checkout_state = 'cancelled', payment_state = 'failed'/);
});

test("group payment result command verifies the aggregate amount before transitioning all child orders", () => {
  const sql = compactSql(readMigration());

  assert.match(sql, /create or replace function public\.marketplace_record_checkout_payment_result\(/);
  assert.match(sql, /p_admin_profile_id is null or p_admin_role <> 'owner'/);
  assert.match(sql, /p_provider_amount_satang <> group_row\.buyer_total_satang/);
  assert.match(sql, /raise exception 'marketplace_payment_amount_mismatch'/);
  assert.match(sql, /'checkout_group\.payment_result'/);
  assert.match(sql, /marketplace_checkout_payment_result_recorded/);
  assert.match(sql, /eligible_pending_count <> group_row\.item_count or eligible_order_count <> group_row\.item_count/);
  assert.match(sql, /raise exception 'marketplace_checkout_group_invalid'/);
  assert.match(sql, /get diagnostics affected_pending_count = row_count/);
  assert.match(sql, /get diagnostics affected_order_count = row_count/);
  assert.match(sql, /affected_pending_count <> group_row\.item_count or affected_order_count <> group_row\.item_count/);
});

test("group expiry job locks expired groups and releases every child as one transaction", () => {
  const sql = compactSql(readMigration());

  assert.match(sql, /create or replace function public\.marketplace_expire_checkout_groups\( p_request_id text default null, p_limit integer default 100 \)/);
  assert.match(sql, /where checkout_state = 'pending_payment' and payment_state = 'pending_payment' and expires_at <= now\(\) order by expires_at asc, id asc limit bounded_limit for update skip locked/);
  assert.match(sql, /from public\.marketplace_checkout_items checkout_item where checkout_item\.checkout_group_id = group_row\.id order by checkout_item\.position for update/);
  assert.match(sql, /update public\.marketplace_pending_payment_orders pending_order set order_state = 'expired'/);
  assert.match(sql, /update public\.marketplace_orders child_order set payment_state = 'failed', fulfilment_state = 'cancelled'/);
  assert.match(sql, /update public\.marketplace_checkout_groups set checkout_state = 'expired', payment_state = 'failed'/);
  assert.match(sql, /'expiredcount', expired_count/);
  assert.match(sql, /'expiredcheckoutgroupids', expired_checkout_group_ids/);
  assert.match(sql, /insert into public\.marketplace_reconciliation_items/);
  assert.match(sql, /'checkout_group_expiry_inconsistent'/);
  assert.match(sql, /'marketplace_checkout_group_expiry_skipped'/);
  assert.match(sql, /continue/);
});

test("legacy pending-order expiry excludes grouped children to prevent partial group release", () => {
  const sql = compactSql(readMigration());

  assert.match(sql, /create or replace function public\.marketplace_expire_pending_payment_orders\(/);
  assert.match(sql, /and not exists \( select 1 from public\.marketplace_checkout_items checkout_item where checkout_item\.pending_payment_order_id = pending_row\.id \)/);
});

test("admin order reads expose the aggregate payment-review amount without changing child GMV totals", () => {
  const sql = compactSql(readMigration());

  assert.match(sql, /create or replace function public\.marketplace_admin_list_orders\( p_state text default null, p_limit integer default 100 \)/);
  assert.match(sql, /left join public\.marketplace_checkout_items checkout_item on checkout_item\.order_id = ord\.id/);
  assert.match(sql, /left join public\.marketplace_checkout_groups checkout_group on checkout_group\.id = checkout_item\.checkout_group_id/);
  assert.match(sql, /checkout_item\.checkout_group_id/);
  assert.match(sql, /coalesce\(checkout_group\.buyer_total_satang, ord\.buyer_total_satang\) as payment_review_amount_satang/);
  assert.match(sql, /ord\.buyer_total_satang/);
  assert.doesNotMatch(sql, /update public\.marketplace_orders[\s\S]*?buyer_total_satang\s*=/);
  assert.match(sql, /revoke all on function public\.marketplace_admin_list_orders\(text, integer\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.marketplace_admin_list_orders\(text, integer\) to service_role/);
});

test("all group RPCs are revoked from clients and executable only by service_role", () => {
  const sql = compactSql(readMigration());

  for (const fn of [
    "marketplace_create_multi_listing_checkout",
    "marketplace_release_checkout_group",
    "marketplace_submit_checkout_payment_proof",
    "marketplace_record_checkout_payment_result",
    "marketplace_expire_checkout_groups",
  ]) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn}\\([^;]+from public, anon, authenticated`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn}\\([^;]+to service_role`));
  }
});
