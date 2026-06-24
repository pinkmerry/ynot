import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationPaths = [
  "../../Database/supabase/migrations/20260619130000_reward_conversion_jobs.sql",
  "../../Database/supabase/migrations/20260621062815_reward_conversion_forward_compat.sql",
  "../../Database/supabase/migrations/20260624131500_fix_reward_conversion_uuid_hash.sql",
];

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const packageJson = JSON.parse(read("package.json"));

function migrationSource() {
  return migrationPaths
    .map((migrationPath) => readFileSync(new URL(migrationPath, import.meta.url), "utf8"))
    .join("\n\n");
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
    "gi",
  );
  const matches = Array.from(stripSqlComments(source).matchAll(pattern));
  assert.ok(matches.length, `missing function public.${functionName}`);
  return matches.at(-1)[0];
}

function functionBody(source, functionName) {
  const functionStart = source.indexOf(`function ${functionName}`);
  if (functionStart < 0) return "";
  const bodyStart = source.indexOf("{", functionStart);
  if (bodyStart < 0) return "";

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    if (depth === 0) return source.slice(bodyStart, index + 1);
  }

  return "";
}

function functionDeclareBlock(source, functionName) {
  const block = functionBlock(source, functionName);
  const match = block.match(/\bas\s+\$\$\s*declare\s+([\s\S]*?)\bbegin\b/i);
  assert.ok(match, `missing declare block for public.${functionName}`);
  return match[1];
}

function assertPlpgsqlVariablesDeclared(source, functionName, variables) {
  const declarations = compactSql(functionDeclareBlock(source, functionName));
  for (const variable of variables) {
    assert.match(
      declarations,
      new RegExp(`\\b${variable.toLowerCase()}\\s+[^;]+;`),
      `public.${functionName} must declare ${variable}`,
    );
  }
}

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing start marker: ${start}`);
  const endIndex = end ? source.indexOf(end, startIndex + start.length) : -1;
  if (end) assert.notEqual(endIndex, -1, `Missing end marker: ${end}`);
  return source.slice(startIndex, endIndex >= 0 ? endIndex : undefined);
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
    "jobId",
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
    "reward_conversion_job_items",
  ]) {
    requirePattern(sql, new RegExp(`create table if not exists public\\.${table}\\b`), `missing ${table}`);
    requirePattern(sql, new RegExp(`alter table public\\.${table} enable row level security`), `${table} must enable RLS`);
  }

  requirePattern(
    sql,
    /add constraint reward_conversion_jobs_status_check check \(status in \('queued', 'processing', 'retry_required', 'completed', 'failed'\)\)/,
    "job status should support a terminal failed state",
  );
  requirePattern(sql, /quote_token_id uuid not null unique references public\.reward_conversion_quote_tokens\(id\)/, "conversion jobs must originate from a quote token");
  assert.doesNotMatch(sql, /reward_conversion_jobs[\s\S]*cancelled/, "conversion jobs must not be cancelable");
  requirePattern(sql, /alter table public\.collection_items[\s\S]*add column if not exists conversion_job_id uuid references public\.reward_conversion_jobs\(id\) on delete set null/, "collection items must link to conversion job");
  requirePattern(sql, /collection_items_status_check[\s\S]*'converting'/, "collection item status check must include converting");
  requirePattern(sql, /reward_conversion_jobs_active_profile_idx[\s\S]*where status in \('queued', 'processing', 'retry_required'\)/, "missing one active conversion job per profile index");
  requirePattern(sql, /collection_items_conversion_job_idx[\s\S]*where status = 'converting'/, "missing converting item lookup index");
  requirePattern(sql, /reward_conversion_job_items[\s\S]*job_id uuid not null references public\.reward_conversion_jobs\(id\) on delete restrict/, "snapshot items must belong to a conversion job");
  requirePattern(sql, /reward_conversion_job_items[\s\S]*collection_item_id uuid not null references public\.collection_items\(id\) on delete restrict/, "snapshot items must keep auditable collection membership");
  requirePattern(sql, /reward_conversion_job_items[\s\S]*coin_value integer not null check \(coin_value > 0\)/, "snapshot items must freeze coin value");
  requirePattern(sql, /reward_conversion_job_items[\s\S]*status text not null default 'pending' check \(status in \('pending', 'converted'\)\)/, "snapshot items must track pending/converted state");
  requirePattern(sql, /reward_conversion_job_items_job_item_unique_idx[\s\S]*on public\.reward_conversion_job_items\(job_id, collection_item_id\)/, "snapshot membership must be unique per job");
  requirePattern(sql, /reward_conversion_job_items_pending_idx[\s\S]*where status = 'pending'/, "processor needs an indexed pending snapshot selection");
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
    /revoke all on public\.reward_conversion_quote_tokens, public\.reward_conversion_jobs, public\.reward_conversion_job_items from public, anon, authenticated/,
    "raw conversion tables must be revoked from public roles",
  );
  requirePattern(
    sql,
    /grant all on public\.reward_conversion_quote_tokens, public\.reward_conversion_jobs, public\.reward_conversion_job_items to service_role/,
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
  const allEligibleQuoteBranch = between(
    quote,
    "else selected_ids := '{}'::uuid[];",
    "end if;",
  );

  requirePattern(quote, /p_selection_mode/, "quote must accept a selection mode");
  requirePattern(quote, /all_eligible/, "quote must support whole Customer Bag eligible selection");
  requirePattern(quote, /selected/, "quote must support manually selected rewards");
  requirePattern(quote, /count\(distinct item_id\)/, "selected conversion must count unique selected rewards");
  requirePattern(quote, /requested_count <> cardinality\(p_collection_item_ids\)[\s\S]*duplicate_collection_items/, "selected conversion must reject duplicate selected rewards");
  requirePattern(quote, /status = 'owned'/, "quote must only count owned rewards");
  requirePattern(quote, /convert_coin_value_snapshot > 0/, "quote must only count positive conversion value");
  requirePattern(quote, /coalesce\(sum\(convert_coin_value_snapshot\), 0\)::int/, "quote total must be the exact sum of selected reward coin snapshots");
  requirePattern(quote, /convert_expires_at is null or convert_expires_at > now\(\)/, "quote must reject expired rewards");
  requirePattern(quote, /insert into public\.reward_conversion_quote_tokens/, "quote must issue opaque server token");
  requirePattern(quote, /if p_selection_mode = 'selected' then[\s\S]*array_agg\(id order by id\)[\s\S]*else selected_ids := '\{\}'::uuid\[\]/, "selected quotes may store selected IDs");
  assert.doesNotMatch(allEligibleQuoteBranch, /array_agg\(id order by id\)/, "all eligible quote must not build a giant UUID array");
  requirePattern(allEligibleQuoteBranch, /min\(id::text\)/, "all-eligible quote must hash UUIDs through text-safe min");
  requirePattern(allEligibleQuoteBranch, /max\(id::text\)/, "all-eligible quote must hash UUIDs through text-safe max");
  assert.doesNotMatch(allEligibleQuoteBranch, /min\(id\)|max\(id\)/, "all-eligible quote must not call min/max directly on UUID");
  assert.doesNotMatch(quote, /update public\.collection_items/, "quote must not lock or mutate rewards");
});

test("conversion is blocked while a shipping request job is active", () => {
  const source = migrationSource();
  const compactSource = compactSql(source);
  const quote = compactSql(functionBlock(source, "prepare_reward_conversion_quote"));
  const start = compactSql(functionBlock(source, "start_reward_conversion"));
  const quoteFirstCollectionRead = quote.indexOf("from public.collection_items");
  const startFirstCollectionRead = start.indexOf("from public.collection_items");
  const quoteShippingGuard = quote.slice(0, quoteFirstCollectionRead);
  const startShippingGuard = start.slice(0, startFirstCollectionRead);

  assert.ok(quoteFirstCollectionRead > 0, "quote must read collection items after active-shipping guard");
  assert.ok(startFirstCollectionRead > 0, "start must read collection items after active-shipping guard");

  requirePattern(
    quoteShippingGuard,
    /shipping_request_jobs[\s\S]*profile_id = p_profile_id[\s\S]*status in \('preparing', 'processing', 'retry_required'\)[\s\S]*raise exception 'shipping_request_active_blocks_conversion'/,
    "conversion quote must not start while shipping is claiming owned rewards",
  );
  requirePattern(
    startShippingGuard,
    /shipping_request_jobs[\s\S]*(?:profile_id = p_profile_id|profile_id = quote_row\.profile_id|profile_id = [a-z_]+\.profile_id)[\s\S]*status in \('preparing', 'processing', 'retry_required'\)[\s\S]*raise exception 'shipping_request_active_blocks_conversion'/,
    "conversion start must not race an active shipping job",
  );
  requirePattern(
    start,
    /pg_advisory_xact_lock\(hashtextextended\('ynot-profile-action:' \|\| p_profile_id::text, 0\)\)/,
    "conversion start must use the shared profile action advisory lock",
  );
  assert.ok(
    start.indexOf("pg_advisory_xact_lock") < start.indexOf("from public.reward_conversion_quote_tokens"),
    "conversion start should lock before quote row processing",
  );
  requirePattern(
    compactSource,
    /shipping_request_active_exists|shipping_request_active_blocks_conversion/,
    "conversion RPC must expose a specific active-shipping error",
  );
});

test("start only commits the conversion job and process freezes bounded membership chunks", () => {
  const source = migrationSource();
  const quote = compactSql(functionBlock(source, "prepare_reward_conversion_quote"));
  const start = compactSql(functionBlock(source, "start_reward_conversion"));
  const process = compactSql(functionBlock(source, "process_reward_conversion_chunk"));

  assertPlpgsqlVariablesDeclared(source, "start_reward_conversion", [
    "new_job_id",
  ]);

  requirePattern(start, /p_quote_token_id/, "start must require quote token");
  requirePattern(start, /for update/, "start must lock quote/job data inside transaction");
  requirePattern(start, /reward_conversion_quote_changed/, "start must abort stale quotes before locking rewards");
  requirePattern(start, /min\(eligible\.id::text\)/, "all-eligible start validation must hash UUIDs through text-safe min");
  requirePattern(start, /max\(eligible\.id::text\)/, "all-eligible start validation must hash UUIDs through text-safe max");
  assert.doesNotMatch(start, /min\(eligible\.id\)|max\(eligible\.id\)/, "start validation must not call min/max directly on UUID");
  requirePattern(start, /insert into public\.reward_conversion_jobs/, "start must create a conversion job");
  assert.doesNotMatch(quote, /insert into public\.reward_conversion_job_items/, "quote must not create frozen snapshot rows");
  assert.doesNotMatch(start, /insert into public\.reward_conversion_job_items/, "start must not freeze every selected/all-eligible reward before returning");
  assert.doesNotMatch(start, /get diagnostics snapshot_count = row_count/, "start must not count frozen membership rows before returning");
  assert.doesNotMatch(start, /update public\.collection_items[\s\S]*set status = 'converting'/, "start must not pre-lock every reward before returning");
  assert.doesNotMatch(start, /insert into public\.coin_ledger/, "start must not credit the wallet before background chunks run");

  requirePattern(process, /for update skip locked/, "processor must use bounded skip-locked reward chunks");
  requirePattern(process, /p_limit/, "processor must accept a chunk limit");
  requirePattern(process, /limit p_limit/, "processor must bound each membership claim");
  requirePattern(process, /insert into public\.reward_conversion_job_items/, "processor must freeze claimed conversion membership rows");
  requirePattern(process, /select job_row\.id[\s\S]*collection_item_id[\s\S]*coin_value/, "processor snapshot rows must freeze collection item and coin value");
  requirePattern(process, /selection_mode = 'all_eligible'/, "processor must support all-eligible claims without start-time materialization");
  requirePattern(process, /selection_mode = 'selected'[\s\S]*id = any\(quote_row\.collection_item_ids\)/, "processor must support selected claims without start-time materialization");
  assert.doesNotMatch(
    process,
    /eligible\.convert_expires_at is null or eligible\.convert_expires_at > now\(\)/,
    "processor must not let a confirmed conversion fail only because reward expiry passed during chunking",
  );
  requirePattern(process, /get diagnostics [a-z_]+ = row_count[\s\S]*if [a-z_]+ <> chunk_count then[\s\S]*raise exception 'reward_conversion_claim_mismatch'/, "processor must verify bounded claim/freeze row counts");
  requirePattern(process, /insert into public\.coin_ledger/, "processor must write wallet ledger");
  requirePattern(process, /entry_type[\s\S]*exchange_credit/, "processor must credit as exchange conversion");
  requirePattern(process, /update public\.wallet_accounts[\s\S]*balance_coins = balance_coins \+/, "processor must update wallet balance");
  requirePattern(process, /set status = 'exchanged'/, "processor must mark processed rewards exchanged");
  requirePattern(process, /update public\.reward_conversion_job_items[\s\S]*status = 'converted'/, "processor must preserve snapshot rows and mark them converted");
  requirePattern(process, /converted_count = converted_count \+/, "processor must update progress counters");
  requirePattern(process, /credited_total_coins = credited_total_coins \+/, "processor must update credited coin total");
  requirePattern(process, /not exists \([\s\S]*from public\.reward_conversion_job_items remaining[\s\S]*remaining\.job_id = job_row\.id[\s\S]*remaining\.status = 'pending'/, "processor must complete only when no frozen snapshot rows remain");
  assert.doesNotMatch(process, /ci\.conversion_job_id = job_row\.id[\s\S]*ci\.status = 'converting'/, "old live conversion-job item query must not drive chunk membership");
  requirePattern(process, /if sqlerrm = 'reward_conversion_claim_mismatch'[\s\S]*status = 'failed'/, "permanent conversion membership mismatches must fail instead of blocking the customer forever");
  requirePattern(process, /when retry_count \+ 1 >= 5 then 'failed'[\s\S]*else 'retry_required'/, "transient conversion failures must stop retrying after a bounded threshold");
  requirePattern(process, /'retryrequired', false/, "failed conversions must not request more queue retries");

  const recovery = compactSql(functionBlock(source, "list_reward_conversion_recovery_jobs"));
  requirePattern(recovery, /status = 'queued'/, "recovery must pick up queued conversions after enqueue failure");
  requirePattern(recovery, /status = 'retry_required'/, "recovery must pick up due retry conversions");
  requirePattern(recovery, /status = 'processing'[\s\S]*interval '2 minutes'/, "recovery must pick up stale processing conversions");
});

test("reward conversion replays before creating jobs and credits only worker-frozen chunks", () => {
  const source = migrationSource();
  const sql = compactSql(source);
  const start = compactSql(functionBlock(source, "start_reward_conversion"));
  const process = compactSql(functionBlock(source, "process_reward_conversion_chunk"));

  const consumedReplayIndex = start.indexOf("if quote_row.consumed_by_job_id is not null");
  const idempotencyReplayIndex = start.indexOf("where profile_id = p_profile_id and idempotency_key = coalesce");
  const jobInsertIndex = start.indexOf("insert into public.reward_conversion_jobs");
  const quoteConsumeIndex = start.indexOf("update public.reward_conversion_quote_tokens");

  assert.ok(consumedReplayIndex >= 0, "start must replay a consumed quote token");
  assert.ok(consumedReplayIndex < jobInsertIndex, "consumed quote replay must happen before job insert");
  assert.ok(idempotencyReplayIndex >= 0, "start must replay matching conversion idempotency keys");
  assert.ok(idempotencyReplayIndex < jobInsertIndex, "idempotency replay must happen before job insert");
  assert.ok(jobInsertIndex < quoteConsumeIndex, "quote token should be consumed only after a job is created");
  assert.doesNotMatch(start, /insert into public\.coin_ledger/, "start must never credit the wallet");
  assert.match(start, /'creditedtotalcoins', existing_job\.credited_total_coins/);
  assert.match(start, /'replayed', true/);
  assert.match(start, /'replayed', false/);

  requirePattern(sql, /check \(credited_total_coins <= total_coins\)/, "conversion jobs must never credit beyond the quoted total");
  requirePattern(process, /chunk_idempotency_key := job_row\.id::text \|\| ':' \|\| \(job_row\.converted_count \+ 1\)::text \|\| ':' \|\| chunk_count::text/, "chunk ledger idempotency key must be deterministic per frozen chunk");
  requirePattern(process, /coalesce\(sum\(chunk\.coin_value\), 0\)::int/, "chunk credit must sum frozen item coin values");
  requirePattern(process, /insert into public\.coin_ledger/, "worker must write the wallet credit ledger");
  requirePattern(process, /'exchange_credit'[\s\S]*chunk_total[\s\S]*locked_wallet\.balance_coins[\s\S]*locked_wallet\.balance_coins \+ chunk_total/, "ledger must credit exactly the frozen chunk total");
  requirePattern(process, /update public\.wallet_accounts set balance_coins = balance_coins \+ chunk_total,\s*version = version \+ 1/, "wallet credit must add exactly the frozen chunk total");
  requirePattern(process, /credited_total_coins = credited_total_coins \+ chunk_total/, "job progress must add the same credited chunk total");
});

test("collection conversion API is one dynamic pipeline with safe DTOs and queue enqueue", () => {
  const source = read("src/lib/ynot/card-conversion-api.ts");
  const guard = read("src/lib/ynot/reward-action-guard.ts");
  const presenters = read("src/lib/ynot/reward-action-presenters.ts");
  const route = read("src/app/api/ynot/collection/convert/route.ts");
  const exchangeRoute = read("src/app/api/ynot/exchange/route.ts");
  const currentRoutePath = "src/app/api/ynot/collection/convert/current/route.ts";
  assert.equal(existsSync(new URL(`../${currentRoutePath}`, import.meta.url)), true, `${currentRoutePath} must exist`);
  const currentRoute = read(currentRoutePath);

  requirePattern(route, /handleCardConversionRequest/, "primary convert route must delegate to shared handler");
  requirePattern(exchangeRoute, /handleCardConversionRequest/, "legacy exchange adapter must delegate to the shared conversion handler");
  assert.doesNotMatch(route, /submit_card_conversion|request_card_conversion|direct_card_conversion/, "legacy conversion adapter must not call the retired direct conversion RPC");
  assert.doesNotMatch(exchangeRoute, /submit_card_conversion|request_card_conversion|direct_card_conversion/, "legacy exchange adapter must not call or reference the retired direct conversion RPC");
  assert.doesNotMatch(source, /submit_card_conversion|request_card_conversion|direct_card_conversion/, "conversion handler must not call the retired direct conversion RPC");
  requirePattern(source, /guardRewardActionRequest/, "handler must use the shared reward action admission guard");
  requirePattern(source, /normalizeRewardIdempotencyKey/, "handler must use shared idempotency normalization");
  requirePattern(source, /normalizeSelectedRewardActionTokens/, "handler must use shared selected/all-eligible token validation");
  requirePattern(guard, /shipping_request_active_blocks_conversion/, "guard contract must document shipping blocking conversion");
  requirePattern(guard, /reward_conversion_active_exists/, "guard contract must document conversion active errors");
  requirePattern(source, /prepare_reward_conversion_quote/, "handler must call quote RPC");
  requirePattern(source, /start_reward_conversion/, "handler must call start RPC");
  requirePattern(source, /Choose rewards first, then confirm conversion/, "handler must reject missing-intent auto-starts");
  assert.doesNotMatch(source, /submitLegacyCardConversionFallback|YNOT_REWARD_CONVERSION_LEGACY_FALLBACK/, "handler must not fall back from quote into the legacy committing RPC");
  assert.doesNotMatch(source, /process_reward_conversion_chunk/, "handler must not inline process conversions");
  requirePattern(source, /getCloudflareContext/, "handler must enqueue background processing after start");
  requirePattern(source, /reward_conversion_process/, "handler must enqueue reward conversion queue messages");
  requirePattern(
    guard,
    /\[89ab\]\[0-9a-f\]\{3\}-\[0-9a-f\]\{12\}/,
    "handler must accept standard UUID variant group plus trailing node group",
  );
  assert.doesNotMatch(
    guard,
    /\[89ab\]\[0-9a-f\]\{12\}/,
    "handler must not reject normal UUIDs by omitting the final UUID hyphen",
  );
  requirePattern(source, /selectionMode/, "handler must accept explicit selection mode");
  requirePattern(guard, /all_eligible/, "handler must support select all eligible rewards");
  requirePattern(source, /selected/, "handler must support manual selection");
  requirePattern(source, /quoteToken/, "handler must return/use opaque quote token");
  requirePattern(
    guard,
    /reward_conversion_quote_expired[\s\S]*Conversion quote expired\. Please try again\./,
    "handler must return a specific expired-quote message",
  );
  requirePattern(source, /presentConversionProgress/, "handler must present conversion progress through shared presenters");
  requirePattern(source, /presentConversionStartResult/, "handler must present conversion start result through shared presenters");
  requirePattern(source, /presentConversionQuote/, "handler must present conversion quote through shared presenters");
  requirePattern(presenters, /export function presentConversionQuote/, "presenters must expose conversion quote DTO");
  requirePattern(presenters, /export function presentConversionStartResult/, "presenters must expose conversion start DTO");
  requirePattern(presenters, /export function presentConversionProgress/, "presenters must expose conversion progress DTO");
  requirePattern(presenters, /export function presentConversionCurrent/, "presenters must expose conversion current DTO");
  assert.doesNotMatch(functionBody(presenters, "presentConversionQuote"), /collectionItemIds|collection_item_ids/, "all-eligible conversion quotes must not return every reward ID");
  assert.doesNotMatch(functionBody(presenters, "presentConversionProgress"), /value\.jobId|\bjobId\b/, "conversion progress must not expose internal job IDs");
  assertNoPrivateDtoFields(presenters, "reward action presenters");

  requirePattern(currentRoute, /reward_conversion_jobs/, "current route must read conversion jobs");
  requirePattern(currentRoute, /converted_count/, "current route must return progress counts");
  requirePattern(currentRoute, /credited_total_coins/, "current route must return credited coins");
  requirePattern(currentRoute, /terminalConversionStatuses = \["completed", "failed"\]/, "current route must surface failed terminal conversions");
  requirePattern(currentRoute, /presentConversionCurrent/, "current route must use the public conversion presenter");
  assert.doesNotMatch(currentRoute, /function toPublicConversion/, "current route must not hide a local conversion allowlist");
  requirePattern(presenters, /failed:\s*status === "failed"/, "conversion presenters must expose failed terminal state");
  assertNoPrivateDtoFields(currentRoute, "conversion current route");
});

test("localhost preview conversion follows quote/start/current without private IDs", () => {
  const previewStore = read("src/features/ynot/local-preview-rewards.ts");
  const conversionApi = read("src/lib/ynot/card-conversion-api.ts");
  const currentRoute = read("src/app/api/ynot/collection/convert/current/route.ts");
  const data = read("src/features/ynot/data.ts");

  requirePattern(previewStore, /preparePreviewConversionQuote/, "preview store must quote selected rewards");
  requirePattern(previewStore, /startPreviewConversion/, "preview store must commit from an opaque quote token");
  requirePattern(previewStore, /previewCurrentConversionForProfile/, "preview store must expose current conversion progress");
  requirePattern(previewStore, /crypto\.randomUUID\(\)/, "preview conversion must issue opaque UUID quote/job ids");
  requirePattern(previewStore, /function previewConvertCoinValue/, "preview open rewards must get public mock coin values");
  requirePattern(previewStore, /switch \(item\.displayTier\)/, "preview conversion values must use public display tiers only");
  requirePattern(previewStore, /convertCoinValue: previewConvertCoinValue\(item\)/, "preview bag rows must be convertible on localhost");
  requirePattern(previewStore, /updatePreviewCollectionItems\(profileId, quote\.collectionItemIds, "exchanged"\)/, "preview conversion must move rewards into converted state");
  requirePattern(previewStore, /walletBonusCoinsByProfile/, "preview conversion must credit localhost wallet state");
  assert.doesNotMatch(previewStore, /draw_round_prize_units|card_stock_unit_id|stockUnitGroupKey/, "preview store must not model private stock tables");

  requirePattern(conversionApi, /isDevAuthAllowed/, "conversion API must gate preview behavior on dev auth");
  requirePattern(conversionApi, /session\.authUserId === "preview-user"/, "conversion API must only short-circuit preview sessions");
  requirePattern(conversionApi, /preparePreviewConversionQuote/, "conversion API must serve local preview quotes");
  requirePattern(conversionApi, /startPreviewConversion/, "conversion API must serve local preview starts");
  requirePattern(conversionApi, /return Response\.json\(\{ quote: publicQuote \}\)/, "preview quotes must return the same public DTO shape");
  requirePattern(conversionApi, /return Response\.json\(\{[\s\S]*conversion: presentConversionProgress\(started\),[\s\S]*result: presentConversionStartResult\(started\),[\s\S]*\}\)/, "preview starts must return the same public DTO shape");
  requirePattern(currentRoute, /previewCurrentConversionForProfile/, "current conversion route must expose localhost preview progress");
  requirePattern(data, /previewWalletBonusForProfile/, "dashboard wallet must include preview conversion credits");
});

test("Cloudflare worker can continue reward conversion jobs without browser ownership", () => {
  const worker = read("bulk-open-worker.ts");
  const rewardConversionAdapter = between(
    worker,
    "const rewardConversionAdapter",
    "const shippingRequestAdapter",
  );
  const continueConversionBody = functionBody(worker, "shouldContinueRewardConversion");

  requirePattern(worker, /reward_conversion_process/, "worker must recognize reward conversion messages");
  requirePattern(worker, /process_reward_conversion_chunk/, "worker must process conversion chunks by RPC");
  requirePattern(worker, /list_reward_conversion_recovery_jobs/, "worker scheduled recovery must find stuck conversions");
  requirePattern(worker, /REWARD_CONVERSION_PROCESS_LIMIT/, "worker must use a named conversion process limit");
  requirePattern(worker, /const REWARD_CONVERSION_PROCESS_LIMIT = 2000/, "conversion worker should process at the launch chunk size");
  requirePattern(worker, /const REWARD_CONVERSION_CONTINUE_DELAY_SECONDS = 1/, "conversion continuation must be paced by a named delay");
  requirePattern(worker, /const REWARD_CONVERSION_RECOVERY_DELAY_SECONDS = 1/, "conversion recovery must be paced by a named delay");
  requirePattern(rewardConversionAdapter, /p_limit:\s*REWARD_CONVERSION_PROCESS_LIMIT/, "conversion worker must pass the named limit to the RPC");
  requirePattern(worker, /BULK_OPEN_QUEUE\.send/, "worker may reuse the existing queue binding for continuation");
  requirePattern(rewardConversionAdapter, /delaySeconds:\s*REWARD_CONVERSION_CONTINUE_DELAY_SECONDS/, "conversion worker must not immediately hammer continuation queue messages");
  requirePattern(rewardConversionAdapter, /recoveryDelaySeconds:\s*REWARD_CONVERSION_RECOVERY_DELAY_SECONDS/, "conversion recovery messages must use the named recovery delay");
  requirePattern(continueConversionBody, /retryRequired === true/, "worker must not immediately continue retry-required conversions");
  requirePattern(continueConversionBody, /shouldContinue === false/, "worker must respect explicit conversion stop signals");
  requirePattern(continueConversionBody, /status === "retry_required"/, "worker must not immediately continue retry-required conversion status");
  requirePattern(
    continueConversionBody,
    /retryRequired === true[\s\S]*shouldContinue === false[\s\S]*status === "retry_required"[\s\S]*return false[\s\S]*shouldContinue === true/,
    "conversion retry guards must run before positive continuation",
  );
  assert.doesNotMatch(worker, /console\.(log|warn)\([^)]*SUPABASE_SERVICE_ROLE_KEY/);
});

test("Customer Bag conversion UI requires explicit selection and keeps huge flow summary-only", () => {
  const history = read("src/features/ynot/cr/HistoryExperience.tsx");
  const theme = read("src/features/ynot/cr/theme.css");

  requirePattern(history, /Select all eligible rewards to convert/, "UI must expose explicit whole-bag select-all conversion");
  requirePattern(history, /selectionMode:\s*"all_eligible"/, "whole-bag selection must be sent as scope, not IDs");
  requirePattern(history, /selectionMode:\s*"selected"/, "manual selection must remain available");
  requirePattern(history, /function isConvertibleReward/, "manual conversion must share the RPC eligibility rules");
  requirePattern(history, /selectedConvertibleCards\.map\(\(card\) => card\.id\)/, "manual conversion must only submit convertible selected rewards");
  requirePattern(history, /const shipActive = Boolean\(shipProgress && !shipProgress\.completed\)/, "active shipping must block new conversion attempts");
  requirePattern(history, /function conversionIsTerminal/, "conversion UI must distinguish failed terminal jobs from active work");
  requirePattern(history, /const sellActive = Boolean\(sellProgress && !conversionIsTerminal\(sellProgress\)\)/, "active conversion must block new shipping attempts");
  requirePattern(history, /Conversion could not finish/, "failed conversions must show a terminal customer message");
  requirePattern(history, /disabled=\{[^}]*sellBusy[^}]*shipActive[^}]*\}/, "conversion CTAs must disable while shipping is active");
  requirePattern(history, /disabled=\{[^}]*shipBusy[^}]*sellActive[^}]*\}/, "shipping CTAs must disable while conversion is active");
  requirePattern(history, /disabled=\{!selectedConvertibleCards\.length \|\| sellBusy \|\| shipActive\}/, "manual conversion CTA must disable when no selected rewards are convertible or shipping is active");
  requirePattern(history, /No rewards selected/, "empty selection must convert nothing");
  requirePattern(history, /quoteIsExpired/, "UI must detect stale conversion quotes");
  requirePattern(history, /void openSell\(sellMode\)/, "expired quotes must refresh the same conversion scope");
  requirePattern(history, /Refresh total/, "expired quote confirm should refresh totals before start");
  requirePattern(history, /summary-only/i, "huge selection confirmation should be summary-only");
  requirePattern(history, /Converting rewards to coins/, "UI must show calm progress copy");
  requirePattern(history, /coins credited/, "UI must show progressive credited coins");
  requirePattern(history, /You can leave this page/, "UI must make server-owned continuation clear");
  requirePattern(
    history,
    /className="cr-btn cr-btn-gold"[\s\S]*onClick=\{submitSell\}/,
    "conversion confirmation CTA must use the readable coin/gold button treatment",
  );
  requirePattern(
    theme,
    /\.cr-btn-gold:hover:not\(\[disabled\]\)\s*\{[\s\S]*background:\s*linear-gradient\(180deg,\s*#ffe07a,\s*#c98d10\);[\s\S]*color:\s*#211504;/,
    "conversion confirmation coin button must stay readable on hover like collection sell chips",
  );
  assert.doesNotMatch(history, /Admin reviews the request/, "conversion copy must not mention admin approval");
  assert.doesNotMatch(history.replace(/\bjobId\b/g, "progressIdentity"), /chunk|rpc|queue|job/i, "customer UI must not expose backend mechanics");
});

test("collection conversion refreshes the server collection after terminal progress", () => {
  const historySource = read("src/features/ynot/cr/HistoryExperience.tsx");

  assert.match(historySource, /import \{ useRouter \} from "next\/navigation";/);
  assert.match(historySource, /import \{ useCallback,/);
  assert.match(historySource, /const router = useRouter\(\);/);
  assert.match(historySource, /const refreshedConversionKeyRef = useRef\(""\);/);
  assert.match(historySource, /function refreshCollectionRoute\(kind: "conversion" \| "shipping", progress: ConvertProgress \| ShippingProgress\)/);
  assert.match(historySource, /progress\.jobId \?\? progress\.id \?\? ""/);
  assert.match(historySource, /\[\s*kind,\s*identity,\s*progress\.status,/);
  assert.match(historySource, /startRefreshTransition\(\(\) => router\.refresh\(\)\)/);
  assert.match(historySource, /if \(progress && conversionIsTerminal\(progress\)\) \{/);
  assert.match(historySource, /refreshCollectionRoute\("conversion", progress\)/);
  assert.match(historySource, /\}, \[refreshCollectionRoute, shouldPollConversion\]\)/);
});
