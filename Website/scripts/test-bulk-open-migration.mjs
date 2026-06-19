import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "../../Database/supabase/migrations/20260619090000_bulk_open_sessions.sql";
const hardeningMigrationPath =
  "../../Database/supabase/migrations/20260619110000_production_security_advisor_hardening.sql";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const packageJson = JSON.parse(read("package.json"));

function migrationSource() {
  return readFileSync(new URL(migrationPath, import.meta.url), "utf8");
}

function hardeningMigrationSource() {
  return readFileSync(new URL(hardeningMigrationPath, import.meta.url), "utf8");
}

function stripSqlComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");
}

function compactSql(source) {
  return stripSqlComments(source).replace(/\s+/g, " ").toLowerCase();
}

function functionBlock(source, functionName) {
  const pattern = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${functionName}\\s*\\([\\s\\S]*?\\n\\$\\$;`,
    "i",
  );
  const match = stripSqlComments(source).match(pattern);
  assert.ok(match, `missing function public.${functionName}`);
  return match[0];
}

function requirePattern(source, pattern, label) {
  assert.match(source, pattern, label);
}

test("package exposes the scoped bulk open migration test script", () => {
  assert.equal(
    packageJson.scripts["test:bulk-open-migration"],
    "node --test scripts/test-bulk-open-migration.mjs",
  );
});

test("bulk open migration creates service-owned session tables and statuses", () => {
  const source = migrationSource();
  const sql = compactSql(source);

  requirePattern(
    sql,
    /create table if not exists public\.gacha_bulk_open_sessions\b/,
    "missing bulk open sessions table",
  );
  requirePattern(
    sql,
    /status text not null default 'queued' check \(status in \('queued', 'processing', 'retry_required', 'completed'\)\)/,
    "bulk open status check must contain exactly queued, processing, retry_required, completed",
  );
  assert.doesNotMatch(sql, /status[^;]*cancelled/, "bulk open status must not include cancelled");

  for (const table of [
    "gacha_bulk_open_start_tokens",
    "gacha_bulk_open_results",
  ]) {
    requirePattern(sql, new RegExp(`create table if not exists public\\.${table}\\b`), `missing ${table}`);
    requirePattern(sql, new RegExp(`alter table public\\.${table} enable row level security`), `${table} must enable RLS`);
  }
  requirePattern(sql, /alter table public\.gacha_bulk_open_sessions enable row level security/, "sessions must enable RLS");
});

test("bulk open migration adds pull-all config and DB-side live/open guards", () => {
  const source = migrationSource();
  const sql = compactSql(source);

  requirePattern(
    sql,
    /alter table public\.draw_rounds add column if not exists pull_all_enabled boolean not null default false/,
    "missing default-disabled Pull All switch",
  );
  for (const column of [
    "pull_all_requested",
    "pull_all_allowlisted",
    "pull_all_readiness_status",
  ]) {
    requirePattern(sql, new RegExp(`add column if not exists ${column}\\b`), `missing ${column}`);
  }

  for (const table of ["gacha_opens", "gacha_open_items", "collection_items", "audit_events"]) {
    requirePattern(
      sql,
      new RegExp(
        `alter table public\\.${table} [^;]*add column if not exists bulk_open_session_id uuid references public\\.gacha_bulk_open_sessions\\(id\\) on delete set null`,
      ),
      `${table} missing nullable bulk_open_session_id`,
    );
  }
  for (const table of ["gacha_open_items", "collection_items"]) {
    requirePattern(
      sql,
      new RegExp(`alter table public\\.${table} [^;]*add column if not exists bulk_open_sequence integer`),
      `${table} missing bulk_open_sequence`,
    );
  }

  requirePattern(
    source,
    /publish_live_campaign_revision_pull_all_patch_anchor_missing/,
    "live revision publish function must be patched for Pull All fields",
  );
  requirePattern(
    source,
    /pull_all_config = case[\s\S]*jsonb_typeof\(revision\.scalar_patch->'pull_all_config'\) = 'object'/,
    "live revision publish must apply sanitized Pull All config from scalar_patch",
  );
  requirePattern(
    source,
    /open_gacha_campaign_active_bulk_guard_anchor_missing/,
    "normal open RPC must be patched with an active Pull All guard",
  );
  requirePattern(
    source,
    /bulk_session\.profile_id = p_profile_id[\s\S]*bulk_session\.draw_round_id = p_draw_round_id/,
    "normal open RPC guard must block both same-user and same-pack active Pull All sessions",
  );
  requirePattern(
    source,
    /publish_live_campaign_revision_active_bulk_guard_anchor_missing/,
    "live revision publish RPC must be patched with an active Pull All guard",
  );
  requirePattern(
    source,
    /bulk_session\.draw_round_id = revision\.draw_round_id[\s\S]*raise exception 'active_bulk_open_session_exists'/,
    "live revision publish must refuse protected changes while Pull All is active",
  );
  assert.doesNotMatch(sql, /create\s+or\s+replace\s+function\s+public\.open_gacha_campaign/);
});

test("bulk open migration has active-session, retry, heartbeat, cursor, and result indexes", () => {
  const sql = compactSql(migrationSource());
  requirePattern(
    sql,
    /create unique index if not exists gacha_bulk_open_sessions_active_profile_idx on public\.gacha_bulk_open_sessions\(profile_id\) where status in \('queued', 'processing', 'retry_required'\)/,
    "missing unique active session by profile",
  );
  requirePattern(
    sql,
    /create index if not exists gacha_bulk_open_sessions_active_round_idx on public\.gacha_bulk_open_sessions\(draw_round_id\) where status in \('queued', 'processing', 'retry_required'\)/,
    "missing active session lookup by draw round",
  );
  requirePattern(sql, /gacha_bulk_open_sessions_retry_idx[^;]*retry_required/, "missing retry lookup index");
  requirePattern(sql, /gacha_bulk_open_sessions_heartbeat_idx[^;]*processing/, "missing heartbeat lookup index");
  requirePattern(
    sql,
    /create unique index if not exists gacha_bulk_open_results_session_slot_unique_idx on public\.gacha_bulk_open_results\(bulk_open_session_id, draw_slot_id\)/,
    "missing result uniqueness by draw slot",
  );
  requirePattern(
    sql,
    /create unique index if not exists gacha_bulk_open_results_session_sequence_unique_idx on public\.gacha_bulk_open_results\(bulk_open_session_id, bulk_open_sequence\)/,
    "missing result uniqueness by sequence",
  );
});

test("bulk open migration locks raw tables and functions to service_role", () => {
  const source = migrationSource();
  const sql = compactSql(source);
  const functions = [
    "has_active_bulk_open_session",
    "create_bulk_open_start_token",
    "bulk_open_settlement_enabled",
    "prepare_bulk_open_quote",
    "mark_bulk_open_highlights_seen",
    "start_bulk_open_session",
    "process_bulk_open_chunk",
    "finalize_bulk_open_session",
    "list_bulk_open_recovery_sessions",
  ];

  requirePattern(
    sql,
    /revoke all on public\.gacha_bulk_open_sessions, public\.gacha_bulk_open_start_tokens, public\.gacha_bulk_open_results from public, anon, authenticated/,
    "raw bulk tables must be revoked from public roles",
  );
  requirePattern(
    sql,
    /grant all on public\.gacha_bulk_open_sessions, public\.gacha_bulk_open_start_tokens, public\.gacha_bulk_open_results to service_role/,
    "raw bulk tables must grant only service_role access",
  );

  for (const fn of functions) {
    const block = functionBlock(source, fn);
    requirePattern(block, /security invoker/i, `${fn} should not be security definer`);
    requirePattern(
      sql,
      new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated`),
      `${fn} execute must be revoked from public roles`,
    );
    requirePattern(
      sql,
      new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to service_role`),
      `${fn} execute must be service_role only`,
    );
  }

  for (const forbidden of ["house_edge", "house edge", "private odds", "secret odds"]) {
    assert.equal(sql.includes(forbidden), false, `${forbidden} must not be exposed`);
  }
});

test("bulk open quote preparation is one conservative service RPC", () => {
  const source = migrationSource();
  const createToken = compactSql(functionBlock(source, "create_bulk_open_start_token"));
  const quote = compactSql(functionBlock(source, "prepare_bulk_open_quote"));

  assert.doesNotMatch(createToken, /on conflict[\s\S]*do update/, "returned quote tokens must not mutate after being issued");
  assert.doesNotMatch(createToken, /set\s+target_slots\s*=/, "start token snapshots must be immutable");
  assert.doesNotMatch(createToken, /set\s+total_cost_coins\s*=/, "start token cost must be immutable");
  assert.doesNotMatch(createToken, /set\s+quote_hash\s*=/, "start token quote hash must be immutable");
  assert.doesNotMatch(createToken, /set\s+expires_at\s*=/, "start token expiry must be immutable");

  for (const pattern of [
    /from public\.draw_rounds/,
    /for update/,
    /status = 'live'/,
    /visibility = 'public'/,
    /approval_status = 'approved'/,
    /pull_all_enabled/,
    /pull_all_requested/,
    /pull_all_allowlisted/,
    /pull_all_readiness_status = 'ready'/,
    /bulk_open_settlement_not_ready/,
    /from public\.draw_slots/,
    /available_slots/,
    /sold_pct/,
    /sold_pct < 60/,
    /bulk_open_sold_threshold_not_met/,
    /bulk_open_settlement_enabled\(\)/,
    /has_active_bulk_open_session/,
    /active_bulk_open_session_exists/,
    /cost_per_reward/,
    /total_cost_coins/,
    /create_bulk_open_start_token/,
    /quote_hash/,
    /pack_open_contract_hash/,
    /gen_random_uuid\(\)::text/,
    /bulk-open-quote-/,
    /'tokenid'/,
    /'targetrewards'/,
    /'totalcostcoins'/,
    /'costperreward'/,
    /'expiresat'/,
    /'soldpct'/,
  ]) {
    requirePattern(quote, pattern, `quote preparation missing ${pattern}`);
  }
});

test("bulk open highlights seen marker only updates valid completed reveals and accepts already-seen retries", () => {
  const source = migrationSource();
  const markSeen = compactSql(functionBlock(source, "mark_bulk_open_highlights_seen"));

  for (const pattern of [
    /select \* into session_row/,
    /update public\.gacha_bulk_open_sessions/,
    /set highlights_seen_at = now\(\)/,
    /profile_id = p_profile_id/,
    /public_code = trim\(p_public_code\)/,
    /status = 'completed'/,
    /jsonb_array_length\(highlight_rewards_public\) > 0/,
    /for update/,
    /session_row\.highlights_seen_at is not null/,
    /'alreadyseen', true/,
    /'ok', true/,
    /returning id/,
    /'updated'/,
  ]) {
    requirePattern(markSeen, pattern, `highlights seen marker missing ${pattern}`);
  }
});

test("bulk open start and processor foundations are idempotent and conservative", () => {
  const source = migrationSource();
  const sql = compactSql(source);
  const start = compactSql(functionBlock(source, "start_bulk_open_session"));
  const process = compactSql(functionBlock(source, "process_bulk_open_chunk"));
  const finalize = compactSql(functionBlock(source, "finalize_bulk_open_session"));
  const recovery = compactSql(functionBlock(source, "list_bulk_open_recovery_sessions"));

  for (const pattern of [
    /locked_wallet public\.wallet_accounts%rowtype/,
    /for update/,
    /not_enough_available_slots/,
    /insufficient_balance/,
    /has_active_bulk_open_session/,
    /bulk_open_settlement_enabled\(\)/,
    /bulk_open_settlement_not_ready/,
    /insert into public\.coin_ledger/,
    /consume[ds]_at/,
  ]) {
    requirePattern(start, pattern, `start foundation missing ${pattern}`);
  }
  assert.doesNotMatch(
    start,
    /insert into public\.coin_ledger[\s\S]*on conflict \(profile_id, idempotency_key\)/,
    "bulk start must not debit after silently reusing a colliding ledger idempotency key",
  );

  requirePattern(sql, /check \(target_slots > 0\)/, "target_slots must be positive");
  requirePattern(sql, /check \(total_cost_coins > 0\)/, "total_cost_coins must be positive");
  requirePattern(sql, /jsonb_typeof\(highlight_rewards_public\) = 'array'/, "highlights must be a JSON array");
  requirePattern(sql, /highlights_seen_at timestamptz/, "sessions must support dismissing completed highlights");
  requirePattern(sql, /gacha_bulk_open_sessions_unseen_completed_idx[^;]*highlights_seen_at is null/, "missing unseen completed lookup index");
  requirePattern(sql, /expires_at timestamptz not null/, "tokens must expire");
  requirePattern(sql, /consumed_by_session_id uuid references public\.gacha_bulk_open_sessions\(id\) on delete set null/, "tokens must link to consumed session");
  for (const pattern of [
    /insert into public\.gacha_opens/,
    /insert into public\.gacha_open_items/,
    /insert into public\.collection_items/,
    /status = 'opened'/,
    /status = 'awarded'/,
    /bulk_open_sequence/,
    /highlight_rewards_public = highlight_items/,
    /bulk_open_last_prize_final_slot/,
    /last_prize_awarded_at/,
    /'shouldcontinue'/,
  ]) {
    requirePattern(process, pattern, `processor settlement missing ${pattern}`);
  }
  requirePattern(process, /on conflict \(bulk_open_session_id, draw_slot_id\) do update/, "processor must be draw-slot idempotent");
  assert.doesNotMatch(process, /where false/, "processor must not contain dead idempotency code");
  assert.doesNotMatch(process, /\n\s*raise;\s*\n/, "processor retry marker must not be rolled back by re-raise");
  assert.doesNotMatch(process, /'drawslotid'/, "public result payload must not expose draw slot ids");
  requirePattern(
    process,
    /return jsonb_build_object\(\s*'status', 'retry_required'/,
    "processor must return retry_required after persisting retry state",
  );
  requirePattern(finalize, /status = 'awarded'/, "finalizer must require awarded results");
  requirePattern(finalize, /gacha_open_item_id is not null/, "finalizer must require open item links");
  requirePattern(finalize, /collection_item_id is not null/, "finalizer must require collection item links");
  requirePattern(finalize, /open_items_awarded = session_row\.target_slots/, "finalizer must verify open item count");
  requirePattern(finalize, /collection_items_created = session_row\.target_slots/, "finalizer must verify collection item count");
  requirePattern(finalize, /status = 'completed'/, "finalizer must converge to completed only after reward settlement");

  for (const pattern of [
    /status = 'queued'/,
    /status = 'retry_required'/,
    /retry_scheduled_at/,
    /status = 'processing'/,
    /interval '5 minutes'/,
    /limit safe_limit/,
  ]) {
    requirePattern(recovery, pattern, `recovery watchdog missing ${pattern}`);
  }
});

test("production advisor hardening keeps helper functions private and removes public bucket listing", () => {
  const sql = compactSql(hardeningMigrationSource());

  for (const signature of [
    "app_private.stock_sku_default_kind(text, text)",
    "app_private.stock_sku_default_code(text, text, uuid, text, text, text, text, text)",
    "app_private.last_prize_convert_coin_value(jsonb)",
    "app_private.collection_convert_deadline(timestamptz, integer)",
    "app_private.uuid_from_text(text)",
    "app_private.stock_sku_code_part(text)",
  ]) {
    requirePattern(
      sql,
      new RegExp(`alter function ${signature.replace(/[().]/g, "\\$&")} set search_path = pg_catalog, app_private, public`),
      `${signature} must pin search_path`,
    );
  }

  requirePattern(
    sql,
    /revoke execute on function public\.touch_draw_round_live_revision_updated_at\(\) from public, anon, authenticated/,
    "trigger-only helper must not be directly callable by public roles",
  );
  requirePattern(
    sql,
    /drop policy if exists "public can read tier animation assets" on storage\.objects/,
    "public tier animation bucket must not allow broad object listing",
  );
});
