import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "../../Database/supabase/migrations/20260619130000_reward_conversion_jobs.sql";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const packageJson = JSON.parse(read("package.json"));

function migrationSource() {
  return readFileSync(new URL(migrationPath, import.meta.url), "utf8");
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

function assertNoPrivateDtoFields(source, label) {
  for (const field of [
    "quote_hash",
    "idempotency_key",
    "collection_item_ids",
    "locked_by",
    "raw_item",
    "queue_job_id",
    "service_role",
  ]) {
    assert.equal(source.includes(field), false, `${label} exposes ${field}`);
  }
}

test("package exposes scoped reward conversion flow test script", () => {
  assert.equal(
    packageJson.scripts["test:reward-conversion-flow"],
    "node --test scripts/test-reward-conversion-flow.mjs",
  );
});

test("reward conversion migration creates service-owned quote and job tables", () => {
  const sql = compactSql(migrationSource());

  for (const table of [
    "reward_conversion_quote_tokens",
    "reward_conversion_jobs",
  ]) {
    requirePattern(sql, new RegExp(`create table if not exists public\\.${table}\\b`), `missing ${table}`);
    requirePattern(sql, new RegExp(`alter table public\\.${table} enable row level security`), `${table} must enable RLS`);
  }

  requirePattern(
    sql,
    /status text not null default 'queued' check \(status in \('queued', 'processing', 'retry_required', 'completed'\)\)/,
    "job status should be queued/processing/retry_required/completed only",
  );
  requirePattern(sql, /quote_token_id uuid not null unique references public\.reward_conversion_quote_tokens\(id\)/, "conversion jobs must originate from a quote token");
  assert.doesNotMatch(sql, /reward_conversion_jobs[\s\S]*cancelled/, "conversion jobs must not be cancelable");
  requirePattern(sql, /alter table public\.collection_items[\s\S]*add column if not exists conversion_job_id uuid references public\.reward_conversion_jobs\(id\) on delete set null/, "collection items must link to conversion job");
  requirePattern(sql, /collection_items_status_check[\s\S]*'converting'/, "collection item status check must include converting");
  requirePattern(sql, /reward_conversion_jobs_active_profile_idx[\s\S]*where status in \('queued', 'processing', 'retry_required'\)/, "missing one active conversion job per profile index");
  requirePattern(sql, /collection_items_conversion_job_idx[\s\S]*where status = 'converting'/, "missing converting item lookup index");
});

test("reward conversion migration exposes service-role RPC pipeline only", () => {
  const source = migrationSource();
  const sql = compactSql(source);
  const functions = [
    "prepare_reward_conversion_quote",
    "start_reward_conversion",
    "process_reward_conversion_chunk",
    "list_reward_conversion_recovery_jobs",
  ];

  requirePattern(
    sql,
    /revoke all on public\.reward_conversion_quote_tokens, public\.reward_conversion_jobs from public, anon, authenticated/,
    "raw conversion tables must be revoked from public roles",
  );
  requirePattern(
    sql,
    /grant all on public\.reward_conversion_quote_tokens, public\.reward_conversion_jobs to service_role/,
    "raw conversion tables must grant service_role access",
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
      `${fn} execute must grant service_role only`,
    );
  }
});

test("quote is non-committing and supports manual or whole-bag eligible selection", () => {
  const source = migrationSource();
  const quote = compactSql(functionBlock(source, "prepare_reward_conversion_quote"));

  requirePattern(quote, /p_selection_mode/, "quote must accept a selection mode");
  requirePattern(quote, /all_eligible/, "quote must support whole Customer Bag eligible selection");
  requirePattern(quote, /selected/, "quote must support manually selected rewards");
  requirePattern(quote, /status = 'owned'/, "quote must only count owned rewards");
  requirePattern(quote, /convert_coin_value_snapshot > 0/, "quote must only count positive conversion value");
  requirePattern(quote, /convert_expires_at is null or convert_expires_at > now\(\)/, "quote must reject expired rewards");
  requirePattern(quote, /insert into public\.reward_conversion_quote_tokens/, "quote must issue opaque server token");
  assert.doesNotMatch(quote, /update public\.collection_items/, "quote must not lock or mutate rewards");
});

test("start locks only after confirm and process progressively credits wallet", () => {
  const source = migrationSource();
  const start = compactSql(functionBlock(source, "start_reward_conversion"));
  const process = compactSql(functionBlock(source, "process_reward_conversion_chunk"));

  requirePattern(start, /p_quote_token_id/, "start must require quote token");
  requirePattern(start, /for update/, "start must lock quote/job data inside transaction");
  requirePattern(start, /reward_conversion_quote_changed/, "start must abort stale quotes before locking rewards");
  requirePattern(start, /insert into public\.reward_conversion_jobs/, "start must create a conversion job");
  requirePattern(start, /update public\.collection_items[\s\S]*set status = 'converting'/, "start must lock selected rewards after confirm");
  assert.ok(
    start.indexOf("insert into public.reward_conversion_jobs") < start.indexOf("update public.collection_items"),
    "job should be created before selected rewards are locked",
  );

  requirePattern(process, /for update skip locked/, "processor must use bounded skip-locked reward chunks");
  requirePattern(process, /p_limit/, "processor must accept a chunk limit");
  requirePattern(process, /insert into public\.coin_ledger/, "processor must write wallet ledger");
  requirePattern(process, /entry_type[\s\S]*exchange_credit/, "processor must credit as exchange conversion");
  requirePattern(process, /update public\.wallet_accounts[\s\S]*balance_coins = balance_coins \+/, "processor must update wallet balance");
  requirePattern(process, /set status = 'exchanged'/, "processor must mark processed rewards exchanged");
  requirePattern(process, /converted_count = converted_count \+/, "processor must update progress counters");
  requirePattern(process, /credited_total_coins = credited_total_coins \+/, "processor must update credited coin total");
  requirePattern(process, /completed/, "processor must complete the job when no converting rewards remain");
  requirePattern(process, /exception[\s\S]*retry_required[\s\S]*retry_count = retry_count \+ 1/, "processor must record retry state on failures");

  const recovery = compactSql(functionBlock(source, "list_reward_conversion_recovery_jobs"));
  requirePattern(recovery, /status = 'queued'/, "recovery must pick up queued conversions after enqueue failure");
  requirePattern(recovery, /status = 'retry_required'/, "recovery must pick up due retry conversions");
  requirePattern(recovery, /status = 'processing'[\s\S]*interval '2 minutes'/, "recovery must pick up stale processing conversions");
});

test("collection conversion API is one dynamic pipeline with safe DTOs and queue enqueue", () => {
  const source = read("src/lib/ynot/card-conversion-api.ts");
  const route = read("src/app/api/ynot/collection/convert/route.ts");
  const currentRoutePath = "src/app/api/ynot/collection/convert/current/route.ts";
  assert.equal(existsSync(new URL(`../${currentRoutePath}`, import.meta.url)), true, `${currentRoutePath} must exist`);
  const currentRoute = read(currentRoutePath);

  requirePattern(route, /handleCardConversionRequest/, "primary convert route must delegate to shared handler");
  requirePattern(source, /prepare_reward_conversion_quote/, "handler must call quote RPC");
  requirePattern(source, /start_reward_conversion/, "handler must call start RPC");
  requirePattern(source, /Choose rewards first, then confirm conversion/, "handler must reject missing-intent auto-starts");
  assert.doesNotMatch(source, /submitLegacyCardConversionFallback|YNOT_REWARD_CONVERSION_LEGACY_FALLBACK/, "handler must not fall back from quote into the legacy committing RPC");
  assert.doesNotMatch(source, /process_reward_conversion_chunk/, "handler must not inline process conversions");
  requirePattern(source, /getCloudflareContext/, "handler must enqueue background processing after start");
  requirePattern(source, /reward_conversion_process/, "handler must enqueue reward conversion queue messages");
  requirePattern(
    source,
    /\[89ab\]\[0-9a-f\]\{3\}-\[0-9a-f\]\{12\}/,
    "handler must accept standard UUID variant group plus trailing node group",
  );
  assert.doesNotMatch(
    source,
    /\[89ab\]\[0-9a-f\]\{12\}/,
    "handler must not reject normal UUIDs by omitting the final UUID hyphen",
  );
  requirePattern(source, /selectionMode/, "handler must accept explicit selection mode");
  requirePattern(source, /all_eligible/, "handler must support select all eligible rewards");
  requirePattern(source, /selected/, "handler must support manual selection");
  requirePattern(source, /quoteToken/, "handler must return/use opaque quote token");
  requirePattern(
    source,
    /reward_conversion_quote_expired[\s\S]*Conversion quote expired\. Please try again\./,
    "handler must return a specific expired-quote message",
  );
  requirePattern(source, /publicConversionJobResult/, "handler must allowlist job DTOs");
  assertNoPrivateDtoFields(source.slice(source.indexOf("function publicConversionJobResult")), "conversion handler public DTO");

  requirePattern(currentRoute, /reward_conversion_jobs/, "current route must read conversion jobs");
  requirePattern(currentRoute, /converted_count/, "current route must return progress counts");
  requirePattern(currentRoute, /credited_total_coins/, "current route must return credited coins");
  assertNoPrivateDtoFields(currentRoute, "conversion current route");
});

test("Cloudflare worker can continue reward conversion jobs without browser ownership", () => {
  const worker = read("bulk-open-worker.ts");

  requirePattern(worker, /reward_conversion_process/, "worker must recognize reward conversion messages");
  requirePattern(worker, /process_reward_conversion_chunk/, "worker must process conversion chunks by RPC");
  requirePattern(worker, /list_reward_conversion_recovery_jobs/, "worker scheduled recovery must find stuck conversions");
  requirePattern(worker, /REWARD_CONVERSION_PROCESS_LIMIT/, "worker must use a named conversion process limit");
  requirePattern(worker, /BULK_OPEN_QUEUE\.send/, "worker may reuse the existing queue binding for continuation");
  assert.doesNotMatch(worker, /console\.(log|warn)\([^)]*SUPABASE_SERVICE_ROLE_KEY/);
});

test("Customer Bag conversion UI requires explicit selection and keeps huge flow summary-only", () => {
  const history = read("src/features/ynot/cr/HistoryExperience.tsx");

  requirePattern(history, /Select all eligible rewards/, "UI must expose explicit whole-bag select-all");
  requirePattern(history, /selectionMode:\s*"all_eligible"/, "whole-bag selection must be sent as scope, not IDs");
  requirePattern(history, /selectionMode:\s*"selected"/, "manual selection must remain available");
  requirePattern(history, /function isConvertibleReward/, "manual conversion must share the RPC eligibility rules");
  requirePattern(history, /selectedConvertibleCards\.map\(\(card\) => card\.id\)/, "manual conversion must only submit convertible selected rewards");
  requirePattern(history, /disabled=\{!selectedConvertibleCards\.length \|\| sellBusy\}/, "manual conversion CTA must disable when no selected rewards are convertible");
  requirePattern(history, /No rewards selected/, "empty selection must convert nothing");
  requirePattern(history, /quoteIsExpired/, "UI must detect stale conversion quotes");
  requirePattern(history, /void openSell\(sellMode\)/, "expired quotes must refresh the same conversion scope");
  requirePattern(history, /Refresh total/, "expired quote confirm should refresh totals before start");
  requirePattern(history, /summary-only/i, "huge selection confirmation should be summary-only");
  requirePattern(history, /Converting rewards to coins/, "UI must show calm progress copy");
  requirePattern(history, /coins credited/, "UI must show progressive credited coins");
  requirePattern(history, /You can leave this page/, "UI must make server-owned continuation clear");
  assert.doesNotMatch(history, /Admin reviews the request/, "conversion copy must not mention admin approval");
  assert.doesNotMatch(history, /chunk|rpc|queue|job/i, "customer UI must not expose backend mechanics");
});
