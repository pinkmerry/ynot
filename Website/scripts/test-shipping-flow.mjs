import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const shippingRoute = readFileSync(
  new URL("../src/app/api/ynot/shipping/route.ts", import.meta.url),
  "utf8",
);
const addressRoute = readFileSync(
  new URL("../src/app/api/ynot/addresses/route.ts", import.meta.url),
  "utf8",
);
const platformVerifier = readFileSync(
  new URL("../tools/verification/verify-platform-foundation.mjs", import.meta.url),
  "utf8",
);

function readOptionalUrl(url) {
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

const dataSource = readFileSync(
  new URL("../src/features/ynot/data.ts", import.meta.url),
  "utf8",
);
const typesSource = readFileSync(
  new URL("../src/features/ynot/types.ts", import.meta.url),
  "utf8",
);
const adminShippingPage = readFileSync(
  new URL("../src/app/admin/shipping/page.tsx", import.meta.url),
  "utf8",
);
const adminUsersPage = readFileSync(
  new URL("../src/app/admin/users/page.tsx", import.meta.url),
  "utf8",
);
const componentsSource = readFileSync(
  new URL("../src/features/ynot/components.tsx", import.meta.url),
  "utf8",
);
const clientSource = readFileSync(
  new URL("../src/features/ynot/client.tsx", import.meta.url),
  "utf8",
);
const historySource = readFileSync(
  new URL("../src/features/ynot/cr/HistoryExperience.tsx", import.meta.url),
  "utf8",
);
const adminShippingRoute = readFileSync(
  new URL("../src/app/api/ynot/admin/shipping/route.ts", import.meta.url),
  "utf8",
);
const adminShippingConsoleSource = readFileSync(
  new URL("../src/features/ynot/admin/AdminShippingConsole.tsx", import.meta.url),
  "utf8",
);
const personalInfoSource = readFileSync(
  new URL("../src/features/ynot/cr/PersonalInfoExperience.tsx", import.meta.url),
  "utf8",
);
const adminUserRouteSource = readOptionalUrl(
  new URL("../src/app/admin/users/[profileId]/page.tsx", import.meta.url),
);
const adminUser360Source = readOptionalUrl(
  new URL("../src/features/ynot/admin/AdminUser360.tsx", import.meta.url),
);
const shippingContextMigration = readOptionalUrl(
  new URL("../../Database/supabase/migrations/20260604100000_shipping_operations_context.sql", import.meta.url),
);
const shippingPickupMigration = readOptionalUrl(
  new URL("../../Database/supabase/migrations/20260604150000_shipping_pickup_statuses.sql", import.meta.url),
);
const shippingEventHandoffMigration = readOptionalUrl(
  new URL("../../Database/supabase/migrations/20260604160000_shipping_event_handoff_statuses.sql", import.meta.url),
);
const shippingJobsMigration = readOptionalUrl(
  new URL("../../Database/supabase/migrations/20260620090000_shipping_request_jobs.sql", import.meta.url),
);
const shippingStatusSource = readOptionalUrl(
  new URL("../src/features/ynot/shipping-status.ts", import.meta.url),
);
const shippingCurrentRoute = readOptionalUrl(
  new URL("../src/app/api/ynot/shipping/current/route.ts", import.meta.url),
);
const workerSource = readOptionalUrl(
  new URL("../bulk-open-worker.ts", import.meta.url),
);
const collectionActionTokenSource = readFileSync(
  new URL("../src/lib/ynot/collection-action-tokens.ts", import.meta.url),
  "utf8",
);

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

function sourceBefore(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return "";
  return source.slice(0, markerIndex);
}

function callSource(source, marker) {
  const callStart = source.indexOf(marker);
  if (callStart < 0) return "";
  const parenStart = source.indexOf("(", callStart);
  if (parenStart < 0) return "";

  let depth = 0;
  for (let index = parenStart; index < source.length; index += 1) {
    const character = source[index];
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (depth === 0) return source.slice(callStart, index + 1);
  }

  return "";
}

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing start marker: ${start}`);
  const endIndex = end ? source.indexOf(end, startIndex + start.length) : -1;
  if (end) assert.notEqual(endIndex, -1, `Missing end marker: ${end}`);
  return source.slice(startIndex, endIndex >= 0 ? endIndex : undefined);
}

function typeBlock(typeName) {
  return between(typesSource, `export type ${typeName}`, "\nexport type ");
}

function verifierCallSource(functionName, rel, label) {
  const marker = `${functionName}("${rel}", "${label}",`;
  const markerIndex = platformVerifier.indexOf(marker);
  if (markerIndex < 0) return "";
  const callEnd = platformVerifier.indexOf(");", markerIndex);
  if (callEnd < 0) return "";
  return platformVerifier.slice(markerIndex, callEnd + 2);
}

test("customer shipping route uses the same mutation guard as other customer flows", () => {
  const beforeBodyParsing = sourceBefore(shippingRoute, "request.json()");
  const guard = readFileSync(
    new URL("../src/lib/ynot/reward-action-guard.ts", import.meta.url),
    "utf8",
  );

  assert.match(beforeBodyParsing, /guardRewardActionRequest\(\s*request/);
  assert.match(guard, /enforceSameOriginMutation\(request\)/);
  assert.match(
    guard,
    /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*enforceSameOriginMutation\(request\)[\s\S]*if\s*\(\1\)\s*return\s+\{\s*response:\s*\1\s*\}/,
  );
});

test("customer shipping route validates action tokens, duplicate cards, selection mode, and idempotency before RPC", () => {
  const beforeQuoteRpc = sourceBefore(shippingRoute, 'prepare_shipping_request_quote');
  const quoteRpcCall = callSource(shippingRoute, 'prepare_shipping_request_quote');
  const startRpcCall = callSource(shippingRoute, 'start_shipping_request_job');
  const guard = readFileSync(
    new URL("../src/lib/ynot/reward-action-guard.ts", import.meta.url),
    "utf8",
  );

  assert.match(guard, /const IDEMPOTENCY_KEY_RE\s*=/);
  assert.doesNotMatch(shippingRoute, /const MAX_SHIPPING_ITEMS\s*=/);
  assert.match(guard, /type RewardSelectionMode = "selected" \| "all_eligible"/);
  assert.match(shippingRoute, /function normalizeAddressActionToken/);
  assert.match(shippingRoute, /resolveAddressActionToken/);
  assert.match(shippingRoute, /isAddressActionToken/);
  assert.match(shippingRoute, /normalizeSelectedRewardActionTokens/);
  assert.match(guard, /resolveCollectionItemActionTokens/);
  assert.match(shippingRoute, /isCollectionItemActionToken/);
  assert.match(shippingRoute, /normalizeRewardIdempotencyKey/);
  assert.match(shippingRoute, /Each card can only be selected once/);
  assert.doesNotMatch(shippingRoute, /Ship up to \$\{MAX_SHIPPING_ITEMS\} cards at a time/);
  assert.match(shippingRoute, /Invalid idempotency key/);
  assert.match(beforeQuoteRpc, /\baddressToken\b[\s\S]{0,180}normalizeAddressActionToken\(/);
  assert.match(beforeQuoteRpc, /\bcollectionItemTokens\b[\s\S]{0,260}normalizeCollectionItemActionTokens\(/);
  assert.match(beforeQuoteRpc, /\bidempotencyKey\b[\s\S]{0,180}normalizeRewardIdempotencyKey\(/);
  assert.match(beforeQuoteRpc, /if\s*\(!addressToken\)/);
  assert.match(beforeQuoteRpc, /resolvedAddressId\s*=\s*await resolveAddressActionToken\(/);
  assert.match(beforeQuoteRpc, /resolvedCollectionItemIds\s*=\s*await resolveSelectedCollectionItems\(/);
  assert.match(quoteRpcCall, /\bp_address_id:\s*resolvedAddressId\b/);
  assert.match(quoteRpcCall, /\bp_selection_mode:\s*selectionMode\b/);
  assert.match(quoteRpcCall, /\bp_collection_item_ids:\s*selectionMode === "selected" \? resolvedCollectionItemIds : null\b/);
  assert.match(startRpcCall, /\bp_quote_token_id:\s*quoteToken\b/);
  assert.match(startRpcCall, /\bp_idempotency_key:\s*idempotencyKey\b/);
  assert.doesNotMatch(quoteRpcCall, /\bbody\?\.addressId\b/);
  assert.doesNotMatch(quoteRpcCall, /\baddressToken\b/);
  assert.doesNotMatch(quoteRpcCall, /\bbody\?\.collectionItemIds\b/);
  assert.doesNotMatch(quoteRpcCall, /\bcollectionItemTokens\b/);
  assert.doesNotMatch(startRpcCall, /\bbody\?\.idempotencyKey\b/);
});

test("selected shipping action tokens resolve exact selected rows without a first-page bag cap", () => {
  const sealedResolverBody = functionBody(
    collectionActionTokenSource,
    "resolveSealedCollectionItemActionTokens",
  );

  assert.match(collectionActionTokenSource, /SEALED_COLLECTION_ITEM_ACTION_TOKEN_RE/);
  assert.match(collectionActionTokenSource, /LEGACY_COLLECTION_ITEM_ACTION_TOKEN_RE/);
  assert.match(collectionActionTokenSource, /createCipheriv\("aes-256-gcm"/);
  assert.match(collectionActionTokenSource, /createDecipheriv\(\s*"aes-256-gcm"/);
  assert.match(collectionActionTokenSource, /cipher\.setAAD\(Buffer\.from\(profileId\)\)/);
  assert.match(collectionActionTokenSource, /decipher\.setAAD\(Buffer\.from\(profileId\)\)/);
  assert.match(collectionActionTokenSource, /return `ci2_\$\{sealed\.toString\("base64url"\)\}`/);
  assert.match(sealedResolverBody, /return idByToken/);
  assert.doesNotMatch(sealedResolverBody, /\.in\("id"/);
  assert.doesNotMatch(sealedResolverBody, /createServiceSupabaseClient/);
  assert.match(collectionActionTokenSource, /MAX_LEGACY_RESOLVABLE_COLLECTION_ITEMS/);
  assert.match(
    collectionActionTokenSource,
    /resolveSealedCollectionItemActionTokens[\s\S]*resolveLegacyCollectionItemActionTokens/,
  );
});

test("customer shipping route maps database errors to safe customer messages", () => {
  const guard = readFileSync(
    new URL("../src/lib/ynot/reward-action-guard.ts", import.meta.url),
    "utf8",
  );
  assert.match(shippingRoute, /shippingRewardActionErrorMessage/);
  assert.match(guard, /valid_shipping_address_required/);
  assert.match(guard, /collection_item_not_shippable/);
  assert.match(shippingRoute, /shippingRewardActionErrorMessage\(error\.message\)/);
  assert.doesNotMatch(
    shippingRoute,
    /Response\.json\(\s*\{[\s\S]*\berror\s*:\s*error\.message/,
  );
});

test("customer shipping route returns an allowlisted public result", () => {
  const presenters = readFileSync(
    new URL("../src/lib/ynot/reward-action-presenters.ts", import.meta.url),
    "utf8",
  );
  const publicResultBody = functionBody(presenters, "presentShippingLegacyResult");
  const publicQuoteBody = functionBody(presenters, "presentShippingQuote");
  const publicProgressBody = functionBody(presenters, "presentShippingProgress");

  assert.match(shippingRoute, /presentShippingLegacyResult/);
  assert.match(shippingRoute, /presentShippingQuote/);
  assert.match(shippingRoute, /presentShippingProgress/);
  assert.match(shippingRoute, /quote:\s*presentShippingQuote\(quote\)/);
  assert.match(shippingRoute, /shipping:\s*presentShippingProgress\(started\)/);
  assert.match(presenters, /export function presentShippingLegacyResult/);
  assert.match(presenters, /export function presentShippingQuote/);
  assert.match(presenters, /export function presentShippingProgress/);
  assert.match(presenters, /export function presentShippingCurrent/);
  assert.match(presenters, /export function presentShippingHistoryCurrent/);
  assert.match(publicResultBody, /status:/);
  assert.match(publicResultBody, /publicCode:/);
  assert.match(publicResultBody, /itemCount:/);
  assert.match(publicResultBody, /replayed:/);
  assert.match(publicQuoteBody, /quoteToken:/);
  assert.match(publicQuoteBody, /selectionMode:/);
  assert.match(publicQuoteBody, /itemCount:/);
  assert.match(publicQuoteBody, /totalCoinValue:/);
  assert.match(publicQuoteBody, /selectedCoinValue:/);
  assert.match(publicQuoteBody, /minimumCoinValue:/);
  assert.match(publicQuoteBody, /expiresAt:/);
  assert.match(publicQuoteBody, /address:/);
  assert.doesNotMatch(publicQuoteBody, /collectionItemIds|collection_item_ids/);
  assert.match(publicProgressBody, /preparedCount:/);
  assert.match(publicProgressBody, /completed:/);
  assert.doesNotMatch(publicProgressBody, /value\.jobId|\bjobId\b/);
  assert.doesNotMatch(publicResultBody, /\.\.\.(?:value|data|raw)\b/);
  assert.doesNotMatch(publicQuoteBody, /\.\.\.(?:value|data|raw)\b/);
  assert.doesNotMatch(publicProgressBody, /\.\.\.(?:value|data|raw)\b/);
  assert.deepEqual(
    Array.from(new Set([...publicResultBody.matchAll(/\bvalue\.(\w+)/g)].map((match) => match[0]))),
    ["value.status", "value.publicCode", "value.itemCount", "value.replayed"],
  );
  assert.doesNotMatch(shippingRoute, /function publicShippingResult/);
  assert.doesNotMatch(shippingRoute, /function publicShippingQuoteResult/);
  assert.doesNotMatch(shippingRoute, /function publicShippingProgressResult/);
  assert.doesNotMatch(shippingRoute, /result:\s*data\b/);
  assert.doesNotMatch(shippingRoute, /\.\.\.(?:data|raw|result)\b/);
  assert.doesNotMatch(shippingRoute, /shippingRequestId:\s*value\.shippingRequestId/);
});

test("customer shipping route keeps unresolved selected tokens as validation errors", () => {
  assert.match(shippingRoute, /collection_action_tokens_invalid/);
  assert.match(shippingRoute, /Choose valid collection items to ship\./);
  assert.match(
    shippingRoute,
    /isInvalidSelectedCollectionActionTokenError\(error\)[\s\S]*Response\.json\(\s*\{\s*error:\s*"Choose valid collection items to ship\."\s*\},\s*\{\s*status:\s*400\s*\}/,
  );
});

test("shipping migration adds quote job pipeline with service-role RPCs only", () => {
  assert.ok(shippingJobsMigration, "missing shipping job migration");
  const sql = compactSql(shippingJobsMigration);

  for (const table of [
    "shipping_request_quote_tokens",
    "shipping_request_jobs",
    "shipping_request_job_items",
  ]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}\\b`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql, /status text not null default 'preparing' check \(status in \('preparing', 'processing', 'retry_required', 'submitted', 'failed'\)\)/);
  assert.match(sql, /selection_mode text not null check \(selection_mode in \('selected', 'all_eligible'\)\)/);
  assert.match(sql, /alter table public\.collection_items[\s\S]*shipping_request_job_id uuid references public\.shipping_request_jobs\(id\)/);
  assert.match(sql, /collection_items_status_check[\s\S]*'shipping_preparing'/);
  assert.match(sql, /shipping_requests_status_check[\s\S]*'preparing'/);
  assert.match(sql, /shipping_request_job_items[\s\S]*job_id uuid not null references public\.shipping_request_jobs\(id\) on delete restrict/);
  assert.match(sql, /shipping_request_job_items[\s\S]*collection_item_id uuid not null references public\.collection_items\(id\) on delete restrict/);
  assert.match(sql, /shipping_request_job_items[\s\S]*status text not null default 'pending' check \(status in \('pending', 'claimed'\)\)/);
  assert.match(sql, /shipping_request_job_items_job_item_unique_idx[\s\S]*on public\.shipping_request_job_items\(job_id, collection_item_id\)/);
  assert.match(sql, /shipping_request_job_items_pending_idx[\s\S]*where status = 'pending'/);

  for (const fn of [
    "prepare_shipping_request_quote",
    "start_shipping_request_job",
    "process_shipping_request_chunk",
    "list_shipping_request_recovery_jobs",
    "list_shipping_request_item_previews",
  ]) {
    const block = functionBlock(shippingJobsMigration, fn);
    assert.match(block, /security invoker/i);
    assert.match(block, /set search_path = public, pg_temp/i);
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to service_role`));
  }
  assert.match(
    sql,
    /revoke all on public\.shipping_request_quote_tokens, public\.shipping_request_jobs, public\.shipping_request_job_items from public, anon, authenticated/,
  );
  assert.match(
    sql,
    /grant all on public\.shipping_request_quote_tokens, public\.shipping_request_jobs, public\.shipping_request_job_items to service_role/,
  );
});

test("shipping quote is non-mutating, verifies address and 1000 coin minimum, and supports all eligible without browser IDs", () => {
  const quote = compactSql(functionBlock(shippingJobsMigration, "prepare_shipping_request_quote"));
  const guard = readFileSync(
    new URL("../src/lib/ynot/reward-action-guard.ts", import.meta.url),
    "utf8",
  );
  const quoteFirstCollectionRead = quote.indexOf("from public.collection_items");
  const quoteConversionGuard = quote.slice(0, quoteFirstCollectionRead);

  assert.match(quote, /p_selection_mode/);
  assert.match(quote, /all_eligible/);
  assert.match(quote, /selected/);
  assert.match(quote, /valid_shipping_address_required/);
  assert.match(quote, /minimum_coin_value integer := 1000/);
  assert.match(quote, /shipping_minimum_coin_value_required/);
  assert.match(quote, /status = 'owned'/);
  assert.match(quote, /insert into public\.shipping_request_quote_tokens/);
  assert.match(quote, /jsonb_build_object\([\s\S]*'quotetoken'/);
  assert.ok(quoteFirstCollectionRead > 0, "shipping quote must read collection items after active-conversion guard");
  assert.match(
    quoteConversionGuard,
    /reward_conversion_jobs[\s\S]*profile_id = p_profile_id[\s\S]*status in \('queued', 'processing', 'retry_required'\)[\s\S]*raise exception 'reward_conversion_active_blocks_shipping'/,
    "shipping quote must not start while conversion is claiming owned rewards",
  );
  assert.match(
    quote,
    /insert into public\.shipping_request_quote_tokens\(\s*profile_id,\s*address_id,\s*selection_mode,\s*collection_item_ids,\s*item_count[\s\S]*\)\s*values\s*\(\s*p_profile_id,\s*p_address_id,\s*p_selection_mode,\s*case\s+when p_selection_mode = 'selected'\s+then selected_ids\s+else '\{\}'::uuid\[\]\s+end,\s*quoted_count/,
  );
  assert.doesNotMatch(quote, /update public\.collection_items/);
  assert.doesNotMatch(quote, /insert into public\.shipping_requests/);
  assert.match(guard, /selectionMode === "all_eligible"[\s\S]*tokens: \[\] as string\[\]/);
  assert.match(shippingRoute, /p_collection_item_ids:\s*selectionMode === "selected" \? resolvedCollectionItemIds : null/);
});

test("shipping start creates a lightweight job and background processor claims bounded chunks", () => {
  const start = compactSql(functionBlock(shippingJobsMigration, "start_shipping_request_job"));
  const process = compactSql(functionBlock(shippingJobsMigration, "process_shipping_request_chunk"));
  const recovery = compactSql(functionBlock(shippingJobsMigration, "list_shipping_request_recovery_jobs"));
  const startFirstCollectionRead = start.indexOf("from public.collection_items");
  const startConversionGuard = start.slice(0, startFirstCollectionRead);

  assert.match(start, /p_quote_token_id/);
  assert.match(start, /pg_advisory_xact_lock\(hashtextextended\('ynot-profile-action:' \|\| p_profile_id::text, 0\)\)/);
  assert.match(start, /for update/);
  assert.match(start, /shipping_quote_changed/);
  assert.ok(startFirstCollectionRead > 0, "shipping start must read collection items after active-conversion guard");
  assert.ok(
    start.indexOf("shipping_request_active_exists") < start.indexOf("from public.collection_items"),
    "start should reject active jobs before expensive item aggregation",
  );
  assert.match(
    startConversionGuard,
    /reward_conversion_jobs[\s\S]*(?:profile_id = p_profile_id|profile_id = quote_row\.profile_id|profile_id = [a-z_]+\.profile_id)[\s\S]*status in \('queued', 'processing', 'retry_required'\)[\s\S]*raise exception 'reward_conversion_active_blocks_shipping'/,
    "shipping start must not race an active conversion job",
  );
  assert.match(start, /insert into public\.shipping_requests[\s\S]*'preparing'/);
  assert.match(start, /insert into public\.shipping_request_jobs/);
  assert.doesNotMatch(start, /insert into public\.shipping_request_job_items/, "start must not freeze every selected/all-eligible reward before returning");
  assert.doesNotMatch(
    start,
    /update public\.collection_items[\s\S]*set status = 'shipping_preparing'/,
  );
  assert.doesNotMatch(start, /get diagnostics locked_count = row_count/);

  assert.match(process, /for update skip locked/);
  assert.match(process, /limit p_limit/);
  assert.match(process, /ci\.status = 'owned'/);
  assert.match(process, /insert into public\.shipping_request_items/);
  assert.match(process, /set status = 'shipping_requested'/);
  assert.match(process, /update public\.collection_items[\s\S]*set status = 'shipping_requested'[\s\S]*shipping_request_job_id = job_row\.id/);
  assert.match(process, /update public\.collection_items[\s\S]*set status = 'shipping_requested'[\s\S]*shipping_request_id = job_row\.shipping_request_id/);
  assert.match(process, /update public\.collection_items[\s\S]*where[\s\S]*shipping_request_job_id is null/);
  assert.match(
    process,
    /get diagnostics [a-z_]+ = row_count[\s\S]*if [a-z_]+ <> chunk_count then[\s\S]*raise exception '(shipping_claim_mismatch|shipping_quote_changed)'/,
  );
  assert.match(process, /shipping_claim_mismatch|shipping_quote_changed/);
  assert.match(process, /job_row\.status = 'failed'[\s\S]*'retryrequired', false/);
  assert.match(process, /prepared_count = prepared_count \+/);
  assert.match(process, /status = case[\s\S]*'submitted'/);
  assert.match(process, /update public\.shipping_requests[\s\S]*status = 'submitted'/);
  assert.match(process, /exception[\s\S]*retry_required[\s\S]*retry_count = retry_count \+ 1/);
  assert.match(process, /sqlerrm = 'shipping_claim_mismatch'[\s\S]*status = 'failed'/);
  assert.match(process, /retry_count \+ 1 >= 5[\s\S]*'failed'/);
  assert.match(process, /update public\.shipping_requests[\s\S]*status = 'cancelled'[\s\S]*status = 'preparing'/);
  assert.match(process, /update public\.collection_items[\s\S]*shipping_request_job_id = null[\s\S]*shipping_request_id = null[\s\S]*status in \('shipping_requested', 'shipping_preparing'\)/);
  assert.match(process, /'retryrequired', false/);
  assert.doesNotMatch(shippingJobsMigration, /minimum_coin_value,\s*minimum_coin_value/);
  assert.doesNotMatch(shippingJobsMigration, /from public\.collection_items ci\s+from public\.collection_items ci/);

  assert.match(recovery, /status = 'preparing'/);
  assert.match(recovery, /status = 'retry_required'/);
  assert.match(recovery, /status = 'processing'[\s\S]*interval '2 minutes'/);
});

test("shipping process freezes selected or all-eligible membership in bounded chunks", () => {
  const quote = compactSql(functionBlock(shippingJobsMigration, "prepare_shipping_request_quote"));
  const start = compactSql(functionBlock(shippingJobsMigration, "start_shipping_request_job"));
  const process = compactSql(functionBlock(shippingJobsMigration, "process_shipping_request_chunk"));

  assertPlpgsqlVariablesDeclared(shippingJobsMigration, "start_shipping_request_job", [
    "new_job_id",
  ]);

  assert.doesNotMatch(quote, /insert into public\.shipping_request_job_items/);
  assert.doesNotMatch(start, /insert into public\.shipping_request_job_items/);
  assert.doesNotMatch(start, /get diagnostics snapshot_count = row_count/);
  assert.doesNotMatch(start, /set status = 'shipping_requested'/);
  assert.doesNotMatch(start, /set status = 'shipping_preparing'/);

  assert.match(process, /limit p_limit/);
  assert.match(process, /insert into public\.shipping_request_job_items/);
  assert.match(process, /select job_row\.id[\s\S]*collection_item_id[\s\S]*card_id[\s\S]*coin_value/);
  assert.match(process, /selection_mode = 'all_eligible'/);
  assert.match(process, /selection_mode = 'selected'[\s\S]*id = any\(quote_row\.collection_item_ids\)/);
  assert.match(process, /get diagnostics [a-z_]+ = row_count[\s\S]*if [a-z_]+ <> chunk_count then[\s\S]*raise exception '(shipping_claim_mismatch|shipping_quote_changed)'/);
  assert.match(process, /update public\.shipping_request_job_items[\s\S]*status = 'claimed'/);
  assert.match(process, /not exists \([\s\S]*from public\.shipping_request_job_items remaining[\s\S]*remaining\.job_id = job_row\.id[\s\S]*remaining\.status = 'pending'/);
  assert.match(process, /status = case[\s\S]*not exists \([\s\S]*shipping_request_job_items remaining[\s\S]*'submitted'/);
  assert.doesNotMatch(start, /job_row\.selection_mode = 'all_eligible'/);
  assert.doesNotMatch(start, /ci\.id = any\(quote_row\.collection_item_ids\)/);
});

test("legacy shipping fallback is serialized and blocked by active async work", () => {
  const legacy = compactSql(functionBlock(shippingJobsMigration, "request_shipping_for_items"));

  assert.match(legacy, /pg_advisory_xact_lock\(hashtextextended\('ynot-profile-action:' \|\| p_profile_id::text, 0\)\)/);
  assert.match(legacy, /shipping_request_jobs[\s\S]*profile_id = p_profile_id[\s\S]*status in \('preparing', 'processing', 'retry_required'\)[\s\S]*shipping_request_active_exists/);
  assert.match(legacy, /reward_conversion_jobs[\s\S]*profile_id = p_profile_id[\s\S]*status in \('queued', 'processing', 'retry_required'\)[\s\S]*reward_conversion_active_blocks_shipping/);
  assert.match(legacy, /minimum_coin_value integer := 1000/);
  assert.match(legacy, /valid_shipping_address_required/);
  assert.match(legacy, /status = 'owned'[\s\S]*shipping_request_job_id is null/);
  assert.match(legacy, /set status = 'shipping_requested'[\s\S]*shipping_request_id = shipping_row\.id[\s\S]*shipping_request_job_id = null/);
  assert.match(legacy, /get diagnostics [a-z_]+ = row_count[\s\S]*shipping_claim_mismatch/);
  assert.match(shippingJobsMigration, /revoke all on function public\.request_shipping_for_items\(uuid, uuid, uuid\[\], text, text\) from public, anon, authenticated/);
  assert.match(shippingJobsMigration, /grant execute on function public\.request_shipping_for_items\(uuid, uuid, uuid\[\], text, text\) to service_role/);
});

test("admin cancellation can terminate preparing shipping jobs and clear item job claims", () => {
  const updateStatus = compactSql(functionBlock(shippingJobsMigration, "update_shipping_request_status"));
  const jobFirstLockIndex = updateStatus.indexOf("from public.shipping_request_jobs cancel_job");
  const jobFirstUpdateIndex = updateStatus.indexOf("where id = v_cancel_job.id");
  const requestLockIndex = updateStatus.indexOf("from public.shipping_requests where id = p_shipping_request_id for update");
  const afterRequestLock = updateStatus.slice(requestLockIndex);

  assert.ok(jobFirstLockIndex > 0, "preparing cancellation must lock the matching async job");
  assert.ok(jobFirstUpdateIndex > jobFirstLockIndex, "preparing cancellation must update the locked async job");
  assert.ok(requestLockIndex > jobFirstUpdateIndex, "preparing cancellation must use job-first lock order before request row lock");
  assert.match(updateStatus, /select \* into v_request[\s\S]*from public\.shipping_requests[\s\S]*for update[\s\S]*v_previous_status := v_request\.status/);
  assert.match(updateStatus, /v_cancelled_preparing_job and v_previous_status <> 'preparing'[\s\S]*invalid_shipping_transition/);
  assert.doesNotMatch(afterRequestLock, /update public\.shipping_request_jobs[\s\S]*last_error_code = 'admin_cancelled_preparing'/);

  assert.match(updateStatus, /v_previous_status = 'preparing'[\s\S]*p_status <> 'cancelled'[\s\S]*invalid_shipping_transition/);
  assert.match(updateStatus, /p_status = 'cancelled'[\s\S]*update public\.shipping_request_jobs[\s\S]*status = 'failed'/);
  assert.match(updateStatus, /last_error_code = 'admin_cancelled_preparing'/);
  assert.match(updateStatus, /locked_by = null[\s\S]*heartbeat_at = null[\s\S]*completed_at = coalesce\(completed_at, now\(\)\)/);
  assert.match(updateStatus, /set status = 'owned'[\s\S]*shipping_request_job_id = null[\s\S]*shipping_request_id = null/);
  assert.match(updateStatus, /item\.status in \('shipping_requested', 'shipping_preparing'\)/);
});

test("shipping route has quote/start/current API and keeps legacy direct RPC only as compatibility fallback", () => {
  const postBody = functionBody(shippingRoute, "POST");
  const startBranch = between(
    postBody,
    'if (intent === "start")',
    "const addressToken",
  );
  const legacyBranch = between(
    shippingRoute,
    'if (intent === "legacy")',
    'const { data: quote',
  );
  const quoteBranch = shippingRoute.slice(shippingRoute.indexOf('const { data: quote'));

  assert.match(shippingRoute, /normalizeShippingIntent/);
  assert.match(shippingRoute, /return "legacy"/);
  assert.match(shippingRoute, /prepare_shipping_request_quote/);
  assert.match(shippingRoute, /start_shipping_request_job/);
  assert.match(shippingRoute, /enqueueShippingRequestJob/);
  assert.match(shippingRoute, /shipping_request_process/);
  assert.match(shippingRoute, /submitLegacyShippingFallback/);
  assert.match(shippingRoute, /request_shipping_for_items/);
  assert.match(shippingRoute, /intent === "legacy"/);
  assert.match(legacyBranch, /submitLegacyShippingFallback/);
  assert.doesNotMatch(legacyBranch, /prepare_shipping_request_quote|start_shipping_request_job/);
  assert.match(startBranch, /start_shipping_request_job/);
  assert.match(startBranch, /enqueueShippingRequestJob/);
  assert.doesNotMatch(startBranch, /request_shipping_for_items/);
  assert.match(quoteBranch, /prepare_shipping_request_quote/);
  assert.doesNotMatch(quoteBranch, /request_shipping_for_items/);
  assert.doesNotMatch(sourceBefore(shippingRoute, "submitLegacyShippingFallback"), /request_shipping_for_items/);

  assert.match(shippingCurrentRoute, /shipping_request_jobs/);
  assert.match(shippingCurrentRoute, /prepared_count/);
  assert.match(shippingCurrentRoute, /shipping_request_id/);
  assert.doesNotMatch(shippingCurrentRoute, /quote_hash|collection_item_ids|idempotency_key|service_role/);
});

test("Cloudflare worker can continue and recover shipping request jobs", () => {
  const continueShippingBody = functionBody(workerSource, "shouldContinueShippingRequest");

  assert.match(workerSource, /shipping_request_process/);
  assert.match(workerSource, /process_shipping_request_chunk/);
  assert.match(workerSource, /list_shipping_request_recovery_jobs/);
  assert.match(workerSource, /SHIPPING_REQUEST_PROCESS_LIMIT/);
  assert.match(workerSource, /const SHIPPING_REQUEST_PROCESS_LIMIT = 2000/);
  assert.match(workerSource, /const SHIPPING_REQUEST_CONTINUE_DELAY_SECONDS = 1/);
  assert.match(workerSource, /const SHIPPING_REQUEST_RECOVERY_DELAY_SECONDS = 1/);
  assert.match(workerSource, /recoverShippingRequestJobs/);
  assert.match(continueShippingBody, /retryRequired === true/);
  assert.match(continueShippingBody, /shouldContinue === false/);
  assert.match(continueShippingBody, /status === "retry_required"/);
  assert.match(
    continueShippingBody,
    /retryRequired === true[\s\S]*shouldContinue === false[\s\S]*status === "retry_required"[\s\S]*return false[\s\S]*shouldContinue === true/,
  );
  assert.doesNotMatch(workerSource, /console\.(log|warn)\([^)]*SUPABASE_SERVICE_ROLE_KEY/);
});

test("shipping quantity examples stay within one bounded background RPC", () => {
  const limitMatch = workerSource.match(/const SHIPPING_REQUEST_PROCESS_LIMIT = (\d+)/);
  assert.ok(limitMatch, "missing shipping process limit");
  const limit = Number(limitMatch[1]);

  assert.equal(limit, 2000);
  for (const count of [1, 10, 100, 1000]) {
    assert.equal(
      Math.ceil(count / limit),
      1,
      `${count} rewards should complete in one worker RPC`,
    );
  }
  assert.match(workerSource, /p_limit:\s*SHIPPING_REQUEST_PROCESS_LIMIT/);
  assert.match(
    workerSource,
    /delaySeconds:\s*SHIPPING_REQUEST_CONTINUE_DELAY_SECONDS/,
  );
  assert.match(workerSource, /const SHIPPING_REQUEST_CONTINUE_DELAY_SECONDS = 1/);
});

test("Customer Bag shipping UI quotes selected cards or all eligible without sending all IDs", () => {
  const history = readFileSync(
    new URL("../src/features/ynot/cr/HistoryExperience.tsx", import.meta.url),
    "utf8",
  );

  assert.match(history, /type ShippingSelectionMode = "selected" \| "all_eligible"/);
  assert.match(history, /function openShip\(nextMode: ShippingSelectionMode/);
  assert.match(history, /selectionMode:\s*"selected"/);
  assert.match(history, /collectionItemIds:\s*selectedCards\.map\(\(card\) => card\.id\)/);
  assert.match(history, /selectionMode:\s*"all_eligible"/);
  assert.match(history, /No eligible cards are ready for shipping/);
  const allEligibleQuoteBody = between(
    history,
    'shipMode === "all_eligible"',
    ': {',
  );
  assert.doesNotMatch(allEligibleQuoteBody, /collectionItemIds/);
  assert.match(history, /onClick=\{\(\) => void openShip\(selectedCards\.length \? "selected" : "all_eligible"\)\}/);
  assert.match(history, /const shipActive = Boolean\(shipProgress && !shipProgress\.completed\)/);
  assert.match(history, /function conversionIsTerminal/);
  assert.match(history, /const sellActive = Boolean\(sellProgress && !conversionIsTerminal\(sellProgress\)\)/);
  assert.match(history, /disabled=\{sellBusy \|\| shipActive\}/);
  assert.match(history, /disabled=\{shipBusy \|\| sellActive \|\| \(!shipActive && !selectedCards\.length && !ownedShipCards\.length\)\}/);
  assert.match(history, /shipActive[\s\S]*View shipping progress[\s\S]*Request shipping/);
});

test("Customer Bag shipping UI starts from quote token and shows/polls progress", () => {
  const history = readFileSync(
    new URL("../src/features/ynot/cr/HistoryExperience.tsx", import.meta.url),
    "utf8",
  );

  assert.match(history, /quoteToken:\s*shipQuote\.quoteToken/);
  assert.match(history, /\/api\/ynot\/shipping\/current/);
  assert.match(history, /Preparing shipping request/);
  assert.match(history, /cards prepared/);
  assert.match(history, /You can leave this page/);
  assert.match(history, /Shipping quote expired\. Recalculating the latest request\./);
  assert.match(history, /Request shipping/);
  assert.doesNotMatch(history, /window\.location\.assign\("\/profile"\)/);
});

test("customer shipping refreshes the collection after submitted progress", () => {
  assert.match(historySource, /const refreshedShippingKeyRef = useRef\(""\);/);
  assert.match(historySource, /if \(progress && progress\.completed\) \{/);
  assert.match(historySource, /refreshCollectionRoute\("shipping", progress\)/);
  assert.match(historySource, /Shipping request submitted/);
  assert.match(historySource, /all shippable rewards/);
});

test("customer shipping polling is paced for large background jobs", () => {
  assert.match(historySource, /const shouldPollShipping =\s*shipOpen && Boolean\(shipProgress && !shipProgress\.completed\)/);
  assert.match(historySource, /\}, \[language, shouldPollShipping\]\)/);
  assert.doesNotMatch(historySource, /\}, \[shipOpen, shipProgress\]\)/);
  assert.match(clientSource, /const shouldPollShipping =\s*showShippingConfirm && Boolean\(shippingProgress && !shippingProgress\.completed\)/);
  assert.match(clientSource, /\}, \[shouldPollShipping\]\)/);
  assert.doesNotMatch(clientSource, /\}, \[showShippingConfirm, shippingProgress\]\)/);
  assert.match(historySource, /window\.setInterval\(refresh, 5000\)/);
  assert.match(clientSource, /window\.setInterval\(refresh, 5000\)/);
});

test("admin preparing shipping requests are visible but not actionable", () => {
  const nextStatusesBody = functionBody(
    adminShippingConsoleSource,
    "nextShippingStatuses",
  );

  assert.match(shippingStatusSource, /preparing: "Preparing"/);
  assert.match(shippingStatusSource, /preparing: "Preparing request"/);
  assert.match(nextStatusesBody, /case "preparing":[\s\S]*return \[\]/);
  assert.match(adminShippingConsoleSource, /expectedRewardCount/);
  assert.match(adminShippingConsoleSource, /preparedRewardCount/);
  assert.match(adminShippingConsoleSource, /loadedRewardPreviewCount/);
  assert.match(adminShippingConsoleSource, /rewardCountLabel/);
  assert.match(adminShippingConsoleSource, /rewards prepared/);
  assert.match(adminShippingConsoleSource, /Showing \{loadedRewardPreviewCount\(selected\)\.toLocaleString\(\)\} of/);
  assert.match(adminShippingConsoleSource, /Preparing is not admin-actionable/);
  assert.match(adminShippingConsoleSource, /disabled=\{isPending \|\| preparingSelected \|\| statusOptions\.length === 0\}/);
  assert.match(adminShippingRoute, /status === "preparing"/);
  assert.match(shippingJobsMigration, /v_previous_status = 'preparing'[\s\S]*invalid_shipping_transition/);
});

test("admin shipping page loads all requests and renders the operations console", () => {
  assert.match(adminShippingPage, /getAdminShippingFulfillment\(profileId\)/);
  assert.doesNotMatch(adminShippingPage, /getShipping\([^)]*,\s*true\)/);
  assert.match(adminShippingPage, /AdminShippingConsole/);
  assert.doesNotMatch(adminShippingPage, /getYnotDashboardSlice\(\{\s*shipping:\s*true\s*\}\)/);
});

test("shipping DTOs include user reward pack address tracking and timeline fields", () => {
  const shippingItemBlock = typeBlock("YnotShippingItem");
  const shippingCustomerBlock = typeBlock("YnotShippingCustomer");
  const addressSnapshotBlock = typeBlock("YnotShippingAddressSnapshot");
  const timelineEventBlock = typeBlock("YnotShippingTimelineEvent");
  const shippingRequestBlock = typeBlock("YnotShippingRequest");

  assert.match(shippingItemBlock, /sourceCampaignTitle/);
  assert.match(shippingItemBlock, /sourceOpenCode/);
  assert.match(shippingCustomerBlock, /export type YnotShippingCustomer/);
  assert.match(addressSnapshotBlock, /export type YnotShippingAddressSnapshot/);
  assert.match(timelineEventBlock, /export type YnotShippingTimelineEvent/);
  assert.match(shippingRequestBlock, /items\?: YnotShippingItem\[\]/);
  assert.match(shippingRequestBlock, /itemCount\?: number \| null/);
  assert.match(shippingRequestBlock, /preparedCount\?: number \| null/);
  assert.match(shippingRequestBlock, /totalCoinValue\?: number \| null/);
  assert.match(shippingRequestBlock, /customer\?: YnotShippingCustomer \| null/);
  assert.match(shippingRequestBlock, /addressSnapshot\?: YnotShippingAddressSnapshot \| null/);
  assert.match(shippingRequestBlock, /timeline\?: YnotShippingTimelineEvent\[\]/);
});

test("customer shipping loader reads only safe public history and progress fields", () => {
  const customerShippingBlock = between(
    dataSource,
    "export async function getCustomerShipping",
    "export async function getAdminShippingFulfillment",
  );

  assert.match(dataSource, /SHIPPING_ITEM_PREVIEW_LIMIT = 250/);
  assert.match(customerShippingBlock, /\.from\("shipping_requests"\)/);
  assert.match(
    customerShippingBlock,
    /\.from\("shipping_requests"\)[\s\S]*?\.select\(\s*"id,public_code,status,tracking_provider,tracking_number,created_at,updated_at,customer_note,shipping_fee_coins,address_snapshot,address_id",?\s*\)/,
  );
  assert.doesNotMatch(
    customerShippingBlock,
    /\.from\("shipping_requests"\)[\s\S]*?\.select\(\s*"[^"]*\bprofile_id\b[^"]*",?\s*\)/,
  );
  assert.doesNotMatch(
    customerShippingBlock,
    /\.from\("shipping_requests"\)[\s\S]{0,120}\.select\("\*"\)/,
  );
  assert.doesNotMatch(customerShippingBlock, /\badmin_note\b/);
  assert.doesNotMatch(customerShippingBlock, /\bidempotency_key\b/);
  assert.doesNotMatch(customerShippingBlock, /profileId:\s*row\.profile_id/);
  assert.match(customerShippingBlock, /\.eq\("profile_id", profileId\)/);
  assert.match(customerShippingBlock, /getShippingRequestItemPreviews\(\s*supabase,\s*requestIds,\s*"customer_shipping_request_items"/);
  assert.doesNotMatch(
    customerShippingBlock,
    /\.from\("shipping_request_items"\)[\s\S]*?\.limit\(SHIPPING_ITEM_PREVIEW_LIMIT\)/,
  );
  assert.match(customerShippingBlock, /\.from\("shipping_request_jobs"\)/);
  assert.match(customerShippingBlock, /\.from\("user_addresses"\)/);
  assert.match(customerShippingBlock, /publicShippingRequest\(\{/);
  assert.match(customerShippingBlock, /customer:\s*null/);
  assert.match(customerShippingBlock, /adminNote:\s*null/);
  assert.match(customerShippingBlock, /timeline:\s*\[\]/);
  assert.match(customerShippingBlock, /itemCount:\s*job\?\.item_count/);
  assert.match(customerShippingBlock, /preparedCount:\s*job\?\.prepared_count/);
  assert.match(customerShippingBlock, /totalCoinValue:\s*job\?\.total_coin_value/);
  assert.doesNotMatch(customerShippingBlock, /\.from\("profiles"\)/);
  assert.doesNotMatch(customerShippingBlock, /\.from\("audit_events"\)/);
  assert.doesNotMatch(customerShippingBlock, /line_user_id/);
  assert.doesNotMatch(customerShippingBlock, /timelineByShippingRequestId/);
});

test("admin shipping fulfillment loader enriches requests from users items packs addresses and audits", () => {
  const adminShippingBlock = between(
    dataSource,
    "export async function getAdminShippingFulfillment",
    "export async function getShipping",
  );

  assert.match(adminShippingBlock, /resolveAdminSession\(\)/);
  assert.match(adminShippingBlock, /\.from\("shipping_requests"\)/);
  assert.match(adminShippingBlock, /getShippingRequestItemPreviews\(\s*supabase,\s*requestIds,\s*"shipping_request_items"/);
  assert.doesNotMatch(
    adminShippingBlock,
    /\.from\("shipping_request_items"\)[\s\S]*?\.limit\(SHIPPING_ITEM_PREVIEW_LIMIT\)/,
  );
  assert.match(adminShippingBlock, /\.from\("shipping_request_jobs"\)/);
  assert.match(adminShippingBlock, /\.from\("collection_items"\)/);
  assert.match(adminShippingBlock, /\.from\("profiles"\)/);
  assert.match(adminShippingBlock, /\.from\("user_addresses"\)/);
  assert.match(adminShippingBlock, /\.from\("gacha_opens"\)/);
  assert.match(adminShippingBlock, /\.from\("draw_rounds"\)/);
  assert.match(adminShippingBlock, /\.from\("audit_events"\)/);
  assert.match(adminShippingBlock, /line_user_id/);
  assert.match(adminShippingBlock, /addressSnapshotFromRow/);
  assert.match(adminShippingBlock, /shippingItemsByRequestId/);
  assert.match(adminShippingBlock, /shippingJobByRequestId/);
  assert.match(adminShippingBlock, /itemCount:\s*job\?\.item_count/);
  assert.match(adminShippingBlock, /preparedCount:\s*job\?\.prepared_count/);
  assert.match(adminShippingBlock, /totalCoinValue:\s*job\?\.total_coin_value/);
  assert.match(adminShippingBlock, /timelineByShippingRequestId/);
});

test("shipping item previews use one per-request capped RPC instead of a global table limit", () => {
  const helperBlock = between(
    dataSource,
    "async function getShippingRequestItemPreviews",
    "function displayTierFromPrizeMetadata",
  );
  const customerShippingBlock = between(
    dataSource,
    "export async function getCustomerShipping",
    "export async function getAdminShippingFulfillment",
  );
  const adminShippingBlock = between(
    dataSource,
    "export async function getAdminShippingFulfillment",
    "export async function getShipping",
  );
  const previewFunction = compactSql(functionBlock(shippingJobsMigration, "list_shipping_request_item_previews"));

  assert.match(helperBlock, /list_shipping_request_item_previews/);
  assert.match(helperBlock, /p_shipping_request_ids:\s*requestIds/);
  assert.match(helperBlock, /p_limit_per_request:\s*SHIPPING_ITEM_PREVIEW_LIMIT/);
  assert.match(previewFunction, /row_number\(\) over \(\s*partition by request_item\.shipping_request_id\s*order by request_item\.created_at asc, request_item\.collection_item_id asc\s*\)/);
  assert.match(previewFunction, /ranked\.preview_rank <= greatest\(1, least\(coalesce\(p_limit_per_request, 250\), 250\)\)/);
  assert.match(previewFunction, /security invoker/);
  assert.match(previewFunction, /set search_path = public, pg_temp/);
  assert.match(
    compactSql(shippingJobsMigration),
    /revoke all on function public\.list_shipping_request_item_previews\(uuid\[\], integer\) from public, anon, authenticated[\s\S]*grant execute on function public\.list_shipping_request_item_previews\(uuid\[\], integer\) to service_role/,
  );
  assert.doesNotMatch(
    customerShippingBlock,
    /\.from\("shipping_request_items"\)[\s\S]*?\.limit\(SHIPPING_ITEM_PREVIEW_LIMIT\)/,
  );
  assert.doesNotMatch(
    adminShippingBlock,
    /\.from\("shipping_request_items"\)[\s\S]*?\.limit\(SHIPPING_ITEM_PREVIEW_LIMIT\)/,
  );
});

test("shipping compatibility wrapper routes customer and admin calls to split read models", () => {
  const getShippingBlock = between(dataSource, "export async function getShipping", "function publicShippingRequest");

  assert.match(getShippingBlock, /includeAll/);
  assert.match(getShippingBlock, /getAdminShippingFulfillment\(profileId, options\)/);
  assert.match(getShippingBlock, /getCustomerShipping\(profileId, options\)/);
  assert.doesNotMatch(getShippingBlock, /\.from\("profiles"\)/);
  assert.doesNotMatch(getShippingBlock, /\.from\("audit_events"\)/);
});

test("customer public shipping strips admin-only customer and timeline context", () => {
  const presenters = readFileSync(
    new URL("../src/lib/ynot/reward-action-presenters.ts", import.meta.url),
    "utf8",
  );
  const publicBlock = between(dataSource, "function publicShippingRequest", "export async function getAddresses");
  const presenterBlock = functionBody(presenters, "presentShippingHistoryCurrent");

  assert.match(presenterBlock, /customer:\s*null/);
  assert.match(presenterBlock, /timeline:\s*\[\]/);
  assert.match(presenterBlock, /adminNote:\s*null/);
  assert.match(presenterBlock, /id:\s*request\.publicCode/);
  assert.match(dataSource, /presentShippingHistoryCurrent/);
  assert.match(publicBlock, /presentShippingHistoryCurrent\(request\)/);
  assert.match(presenters, /export function presentShippingHistoryCurrent/);
});

test("shipping request stores address snapshot and enforces complete address plus value minimum", () => {
  const guard = readFileSync(
    new URL("../src/lib/ynot/reward-action-guard.ts", import.meta.url),
    "utf8",
  );
  assert.match(shippingContextMigration, /add column if not exists address_snapshot jsonb/);
  assert.match(shippingContextMigration, /shipping_minimum_coin_value_required/);
  assert.match(shippingContextMigration, /valid_shipping_address_required/);
  assert.match(shippingContextMigration, /recipient_name/);
  assert.match(shippingContextMigration, /postal_code/);
  assert.match(shippingContextMigration, /convert_coin_value_snapshot/);
  assert.match(guard, /shipping_minimum_coin_value_required/);
});

test("admin shipped transition is the only tracking-required fulfilment status", () => {
  assert.match(adminShippingRoute, /status === "shipped"/);
  assert.match(adminShippingRoute, /Tracking provider and tracking number are required/);
  assert.match(shippingEventHandoffMigration, /if p_status = 'shipped'[\s\S]*shipping_tracking_required/);
  assert.doesNotMatch(shippingEventHandoffMigration, /if p_status in \('shipped', 'delivered'\)[\s\S]*shipping_tracking_required/);
});

test("shipping status model supports pickup fulfilment states", () => {
  const shippingStatusBlock = typeBlock("YnotShippingStatus");
  const requestTypeBlock = between(
    readFileSync(new URL("../src/lib/supabase/types.ts", import.meta.url), "utf8"),
    "shipping_requests: {",
    "shipping_request_items:",
  );
  const rpcTypeBlock = between(
    readFileSync(new URL("../src/lib/supabase/types.ts", import.meta.url), "utf8"),
    "update_shipping_request_status:",
    "consume_api_rate_limit:",
  );

  assert.match(shippingStatusBlock, /ready_for_pickup/);
  assert.match(shippingStatusBlock, /picked_up/);
  assert.match(requestTypeBlock, /ready_for_pickup/);
  assert.match(requestTypeBlock, /picked_up/);
  assert.match(rpcTypeBlock, /ready_for_pickup/);
  assert.match(rpcTypeBlock, /picked_up/);
  assert.match(shippingStatusSource, /Ready for pickup/);
  assert.match(shippingStatusSource, /Picked up/);
});

test("shipping pickup migration adds pickup statuses", () => {
  assert.match(shippingPickupMigration, /drop constraint if exists shipping_requests_status_check/);
  assert.match(shippingPickupMigration, /add constraint shipping_requests_status_check/);
  assert.match(shippingPickupMigration, /ready_for_pickup/);
  assert.match(shippingPickupMigration, /picked_up/);
});

test("shipping event handoff migration allows direct pickup and delivery without tracking", () => {
  assert.match(
    shippingEventHandoffMigration,
    /v_previous_status = 'submitted'[\s\S]*p_status not in \('submitted', 'packing', 'ready_for_pickup', 'shipped', 'delivered', 'cancelled'\)/,
  );
  assert.match(
    shippingEventHandoffMigration,
    /v_previous_status = 'packing'[\s\S]*p_status not in \('packing', 'ready_for_pickup', 'shipped', 'delivered', 'cancelled'\)/,
  );
  assert.match(
    shippingEventHandoffMigration,
    /v_previous_status = 'ready_for_pickup'[\s\S]*p_status not in \('ready_for_pickup', 'picked_up', 'delivered', 'cancelled'\)/,
  );
  assert.match(
    shippingEventHandoffMigration,
    /v_previous_status in \('delivered', 'picked_up', 'cancelled'\)/,
  );
  assert.match(
    shippingEventHandoffMigration,
    /if p_status = 'shipped'[\s\S]*shipping_tracking_required/,
  );
  assert.doesNotMatch(
    shippingEventHandoffMigration,
    /if p_status in \('shipped', 'delivered'\)[\s\S]*shipping_tracking_required/,
  );
  assert.match(
    shippingEventHandoffMigration,
    /if p_status in \('shipped', 'delivered', 'picked_up'\)[\s\S]*status = 'shipped'/,
  );
});

test("admin shipping route requires tracking only for shipped status", () => {
  const trackingGuard = between(
    adminShippingRoute,
    "if (\n    status === \"shipped\"",
    "const adminNote",
  );

  assert.match(adminShippingRoute, /ready_for_pickup/);
  assert.match(adminShippingRoute, /picked_up/);
  assert.match(trackingGuard, /status === "shipped"/);
  assert.match(adminShippingRoute, /delivered/);
  assert.doesNotMatch(trackingGuard, /status === "delivered"/);
  assert.doesNotMatch(trackingGuard, /ready_for_pickup/);
  assert.doesNotMatch(trackingGuard, /picked_up/);
});

test("admin shipping route rejects cross-origin status mutations", () => {
  const beforeBodyParsing = sourceBefore(adminShippingRoute, "request.json()");

  assert.match(beforeBodyParsing, /enforceSameOriginMutation\(request\)/);
  assert.match(
    beforeBodyParsing,
    /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*enforceSameOriginMutation\(request\)[\s\S]*if\s*\(\1\)\s*(?:return\s+\1|\{\s*return\s+\1;?\s*\})/,
  );
});

test("admin shipping console only offers valid pickup-aware status transitions", () => {
  const nextStatusesBody = functionBody(
    adminShippingConsoleSource,
    "nextShippingStatuses",
  );

  assert.match(nextStatusesBody, /case "submitted":[\s\S]*\["submitted", "packing", "ready_for_pickup", "shipped", "delivered", "cancelled"\]/);
  assert.match(nextStatusesBody, /case "packing":[\s\S]*\["packing", "ready_for_pickup", "shipped", "delivered", "cancelled"\]/);
  assert.match(nextStatusesBody, /case "ready_for_pickup":[\s\S]*\["ready_for_pickup", "picked_up", "delivered", "cancelled"\]/);
  assert.match(nextStatusesBody, /case "shipped":[\s\S]*\["shipped", "delivered"\]/);
  assert.match(nextStatusesBody, /case "delivered":[\s\S]*\["delivered"\]/);
  assert.match(nextStatusesBody, /case "picked_up":[\s\S]*\["picked_up"\]/);
  assert.match(nextStatusesBody, /case "cancelled":[\s\S]*\["cancelled"\]/);
  assert.match(adminShippingConsoleSource, /return status === "shipped"/);
  assert.match(adminShippingConsoleSource, /statusOptions\.map/);
});

test("admin shipping console shows status action first and collapses long detail sections", () => {
  assert.match(adminShippingConsoleSource, /admin-shipping-action-bar/);
  assert.match(adminShippingConsoleSource, /admin-shipping-status-select/);
  assert.match(adminShippingConsoleSource, /ShippingDetailSection/);
  assert.match(adminShippingConsoleSource, /<details/);
  assert.match(adminShippingConsoleSource, /Customer/);
  assert.match(adminShippingConsoleSource, /Address/);
  assert.match(adminShippingConsoleSource, /Reward and pack source/);
  assert.match(adminShippingConsoleSource, /Tracking/);
  assert.match(adminShippingConsoleSource, /Timeline/);
  assert.match(adminShippingConsoleSource, /admin-shipping-queue-status-cell/);
  assert.match(adminShippingConsoleSource, /aria-label=\{`Select shipping request/);
});

test("admin user directory links to User 360 and the detail route loads admin user history", () => {
  assert.match(adminUsersPage, /\/admin\/users\/(?:\$\{user\.id\}|[\s\S]{0,120}user\.id)/);
  assert.match(adminUserRouteSource, /getAdminUserDetail/);
  assert.match(adminUserRouteSource, /AdminUser360/);
  assert.match(typesSource, /export type YnotAdminUserDetail/);
  assert.match(dataSource, /export async function getAdminUserDetail/);
  assert.match(dataSource, /getAdminShippingFulfillment\(profileId,\s*\{\s*limit: sectionLimit\s*\}\)/);
});

test("customer shipping history shows reward source pack and tracking details", () => {
  const orderListBlock = between(componentsSource, "export function OrderList", "export function AdminSectionShell");
  const personalInfoShippingBlock = between(
    personalInfoSource,
    "function ShippingHistorySection",
    undefined,
  );

  assert.match(orderListBlock, /order\.items/);
  assert.match(orderListBlock, /sourceCampaignTitle/);
  assert.match(orderListBlock, /ynotShippingTrackingLabel\(order, "en"\)/);
  assert.match(personalInfoShippingBlock, /shippingRewardLabel\(shp, language\)/);
  assert.match(personalInfoShippingBlock, /shippingSourceLabel\(shp, language\)/);
  assert.match(personalInfoShippingBlock, /ynotShippingTrackingLabel\(shp, language\)/);
});

test("customer shipping history uses friendly pickup labels instead of raw statuses", () => {
  const orderListBlock = between(componentsSource, "export function OrderList", "export function AdminSectionShell");
  const personalInfoShippingBlock = between(
    personalInfoSource,
    "function ShippingHistorySection",
    undefined,
  );

  assert.match(shippingStatusSource, /ynotShippingStatusCustomerLabel/);
  assert.match(shippingStatusSource, /Ready for pickup/);
  assert.match(shippingStatusSource, /Picked up/);
  assert.match(orderListBlock, /ynotShippingStatusCustomerLabel/);
  assert.match(personalInfoShippingBlock, /ynotShippingStatusCustomerLabel/);
  assert.doesNotMatch(personalInfoShippingBlock, /shp\.status\.replace\(/);
  assert.match(personalInfoShippingBlock, /id: "completed"[\s\S]*"Completed"/);
  assert.doesNotMatch(personalInfoShippingBlock, /label: "Delivered"/);
});

test("shipping audit history uses friendly pickup status labels", () => {
  const timelineLabelBody = functionBody(dataSource, "shippingTimelineLabel");
  const adminUserTimelineBlock = between(
    adminUser360Source,
    "Support timeline",
    "</AdminCard>",
  );

  assert.match(timelineLabelBody, /status === "ready_for_pickup"[\s\S]*Marked ready for pickup/);
  assert.match(timelineLabelBody, /status === "picked_up"[\s\S]*Marked picked up/);
  assert.match(adminUserTimelineBlock, /ynotShippingStatusLabel\(event\.previousStatus\)/);
  assert.match(adminUserTimelineBlock, /ynotShippingStatusLabel\(event\.status\)/);
  assert.doesNotMatch(adminUserTimelineBlock, /event\.previousStatus \? `\$\{event\.previousStatus\} -> `/);
});

test("customer shipping panel requires a complete address and confirms reward lock before submit", () => {
  const convertPanelBlock = between(clientSource, "export function CollectionConvertPanel", "export function AdminPaymentMethodForm");
  const openShippingBody = functionBody(convertPanelBlock, "openShippingConfirm");
  const submitShippingBody = functionBody(convertPanelBlock, "submitShipping");

  assert.match(clientSource, /from "\.\/address-utils"/);
  assert.match(convertPanelBlock, /isCompleteShippingAddress\(selectedAddress\)/);
  assert.match(convertPanelBlock, /showShippingConfirm/);
  assert.match(convertPanelBlock, /This reward will be locked/);
  assert.match(convertPanelBlock, /SHIPPING_REQUEST_MIN_COINS/);
  assert.match(openShippingBody, /\/api\/ynot\/shipping/);
  assert.match(openShippingBody, /intent:\s*"quote"/);
  assert.match(openShippingBody, /shippingSelectionMode/);
  assert.match(openShippingBody, /selectionMode:\s*shippingSelectionMode/);
  assert.match(
    openShippingBody,
    /collectionItemIds:\s*shippingSelectionMode === "selected" \? selectedItems\.map\(\(item\) => item\.id\) : \[\]/,
  );
  assert.match(openShippingBody, /addressId:\s*activeAddressId/);
  assert.match(openShippingBody, /panelShippingQuoteFromPayload\(payload\)/);
  assert.match(submitShippingBody, /\/api\/ynot\/shipping/);
  assert.match(submitShippingBody, /intent:\s*"start"/);
  assert.match(submitShippingBody, /quoteToken:\s*shippingQuote\.quoteToken/);
  assert.match(submitShippingBody, /idempotencyKey:\s*crypto\.randomUUID\(\)/);
  assert.match(convertPanelBlock, /\/api\/ynot\/shipping\/current/);
  assert.match(convertPanelBlock, /panelShippingProgressFromPayload\(payload\)/);
  assert.match(convertPanelBlock, /Preparing shipping request/);
  assert.doesNotMatch(submitShippingBody, /collectionItemIds:\s*selectedItems\.map/);
  assert.doesNotMatch(submitShippingBody, /addressId:\s*activeAddressId/);
});

test("shipping address completeness helper matches the shipping RPC required fields", () => {
  const helper = readFileSync(
    new URL("../src/features/ynot/address-utils.ts", import.meta.url),
    "utf8",
  );

  assert.match(helper, /export const REQUIRED_SHIPPING_ADDRESS_FIELDS/);
  assert.match(helper, /key: "recipientName", label: "recipient name"/);
  assert.match(helper, /key: "phone", label: "phone"/);
  assert.match(helper, /key: "addressLine1", label: "address line 1"/);
  assert.match(helper, /key: "subdistrict", label: "subdistrict"/);
  assert.match(helper, /key: "district", label: "district"/);
  assert.match(helper, /key: "province", label: "province"/);
  assert.match(helper, /key: "postalCode", label: "postal code"/);
  assert.match(helper, /key: "country", label: "country"/);
  assert.match(helper, /export function missingShippingAddressFields/);
  assert.match(helper, /export function isCompleteShippingAddress/);
});

test("customer shipping UIs reuse the shared complete-address helper", () => {
  const history = readFileSync(
    new URL("../src/features/ynot/cr/HistoryExperience.tsx", import.meta.url),
    "utf8",
  );

  assert.match(history, /from "..\/address-utils"/);
  assert.match(history, /isCompleteShippingAddress/);
  assert.match(history, /missingShippingAddressFields/);
  assert.doesNotMatch(history, /function isCompleteShippingAddress\(address/);
  assert.match(clientSource, /from "\.\/address-utils"/);
  assert.match(clientSource, /isCompleteShippingAddress/);
  assert.doesNotMatch(clientSource, /function isCompleteShippingAddress\(address/);
});

test("address creation API validates and returns a full selectable address DTO", () => {
  assert.match(addressRoute, /import \{[\s\S]*toYnotAddress[\s\S]*\} from "@\/features\/ynot\/server-addresses"/);
  assert.match(addressRoute, /const recipientName = clean\(body\?\.recipientName, 120\)/);
  assert.match(addressRoute, /const phone = clean\(body\?\.phone, 40\)/);
  assert.match(addressRoute, /const subdistrict = clean\(body\?\.subdistrict, 100\)/);
  assert.match(addressRoute, /const district = clean\(body\?\.district, 100\)/);
  assert.match(addressRoute, /const province = clean\(body\?\.province, 100\)/);
  assert.match(addressRoute, /const postalCode = clean\(body\?\.postalCode, 20\)/);
  assert.match(addressRoute, /if \(\[recipientName, phone, addressLine1, subdistrict, district, province, postalCode, country\]\.some\(\(value\) => !value\)\)/);
  assert.match(addressRoute, /address: await toYnotAddress\(session\.profileId, data as UserAddressRow\)/);
  assert.doesNotMatch(addressRoute, /address: \{\s*id: await addressActionToken/);
});

test("localhost preview supports address and shipping request mock data", () => {
  const previewStore = readOptionalUrl(
    new URL("../src/features/ynot/local-preview-rewards.ts", import.meta.url),
  );

  assert.match(previewStore, /previewAddressesForProfile/);
  assert.match(previewStore, /savePreviewAddressForProfile/);
  assert.match(previewStore, /requestPreviewShipping/);
  assert.match(previewStore, /previewShippingForProfile/);
  assert.match(previewStore, /addressActionToken/);
  assert.match(previewStore, /status: "shipping_requested"/);
  assert.doesNotMatch(previewStore, /draw_round_prize_units|card_stock_unit_id|stockUnitGroupKey/);

  assert.match(addressRoute, /isDevAuthAllowed/);
  assert.match(addressRoute, /savePreviewAddressForProfile/);
  assert.match(addressRoute, /session\.authUserId === "preview-user"/);

  assert.match(shippingRoute, /isDevAuthAllowed/);
  assert.match(shippingRoute, /requestPreviewShipping/);
  assert.match(shippingRoute, /session\.authUserId === "preview-user"/);
  assert.match(shippingRoute, /result:\s*presentShippingLegacyResult\(previewShipping\)/);
  assert.match(dataSource, /previewAddressesForProfile/);
  assert.match(dataSource, /previewShippingForProfile/);
  assert.match(dataSource, /previewExchangesForProfile/);
});

test("address creation API requires explicit country before saving", () => {
  assert.match(addressRoute, /const country = clean\(body\?\.country, 80\);/);
  assert.match(addressRoute, /if \(\[recipientName, phone, addressLine1, subdistrict, district, province, postalCode, country\]\.some\(\(value\) => !value\)\)/);
  assert.match(addressRoute, /const requiredAddress = \{[\s\S]*country,[\s\S]*\} as const satisfies Record<string, string>/);
  assert.match(addressRoute, /country: requiredAddress\.country,/);
  assert.doesNotMatch(addressRoute, /const country = clean\(body\?\.country, 80\) \?\? "Thailand"/);
  assert.doesNotMatch(addressRoute, /country: country \?\? "Thailand"/);
  assert.doesNotMatch(addressRoute, /country: requiredAddress\.country \?\? "Thailand"/);
});

test("address creation API rejects cross-origin address mutations before auth work", () => {
  const postHandler = addressRoute.slice(addressRoute.indexOf("export async function POST"));
  const beforeAuth = postHandler.slice(0, postHandler.indexOf("resolveCurrentProfile()"));

  assert.match(addressRoute, /import \{ enforceSameOriginMutation \} from "@\/lib\/security\/same-origin"/);
  assert.match(beforeAuth, /const crossOrigin = enforceSameOriginMutation\(request\)/);
  assert.match(beforeAuth, /if \(crossOrigin\) return crossOrigin/);
});

test("collection ship modal lets users choose existing address or add a new one inline", () => {
  const history = readFileSync(
    new URL("../src/features/ynot/cr/HistoryExperience.tsx", import.meta.url),
    "utf8",
  );

  assert.match(history, /const \[addressRows, setAddressRows\] = useState\(addresses\)/);
  assert.match(history, /function handleAddressSaved\(address: YnotAddress\)/);
  assert.match(history, /<ShipModal[\s\S]*addresses=\{addressRows\}[\s\S]*onAddressSaved=\{handleAddressSaved\}/);
  assert.match(history, /const \[addingAddress, setAddingAddress\] = useState\(false\)/);
  assert.match(history, /Add a new address/);
  assert.match(history, /saveAddress\(\)/);
  assert.match(history, /onAddressSaved\(address\)/);
  assert.match(history, /setAddressId\(address\.id\)/);
});

test("collection ship modal prevents duplicate inline address saves while pending", () => {
  const history = readFileSync(
    new URL("../src/features/ynot/cr/HistoryExperience.tsx", import.meta.url),
    "utf8",
  );
  const shipModal = history.slice(history.indexOf("function ShipModal"));

  assert.match(shipModal, /const \[addressSavePending, setAddressSavePending\] = useState\(false\)/);
  assert.match(shipModal, /if \(addressSavePending\) return/);
  assert.match(shipModal, /setAddressSavePending\(true\)/);
  assert.match(shipModal, /finally \{[\s\S]*setAddressSavePending\(false\)/);
  assert.match(shipModal, /disabled=\{busy \|\| addressSavePending \|\| Boolean\(quote\)\}/);
  assert.match(shipModal, /disabled=\{!complete \|\| busy \|\| addressSavePending \|\| Boolean\(quote\)\}/);
  assert.match(shipModal, /disabled=\{addressSavePending \|\| busy\}/);
  assert.match(shipModal, /addressSavePending[\s\S]*Saving\.\.\.[\s\S]*Save and use this address/);
});

test("collection ship modal disables incomplete saved addresses before submit", () => {
  const history = readFileSync(
    new URL("../src/features/ynot/cr/HistoryExperience.tsx", import.meta.url),
    "utf8",
  );

  assert.match(history, /const missingFields = missingShippingAddressFields\(a\)/);
  assert.match(history, /const complete = missingFields\.length === 0/);
  assert.match(history, /disabled=\{!complete \|\| busy \|\| addressSavePending \|\| Boolean\(quote\)\}/);
  assert.match(history, /Missing"\} \{missingFields\.join\(", "\)\}/);
  assert.match(history, /const selectedAddress = addresses\.find\(\(address\) => address\.id === addressId\)/);
  assert.match(history, /addressSavePending \|\| busy \|\| !isCompleteShippingAddress\(selectedAddress\)/);
});

test("legacy shipping page shares newly saved addresses between form and request panel", () => {
  const shippingPage = readFileSync(
    new URL("../src/app/(store)/shipping/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(clientSource, /export function AddressForm\(\{ addresses, onAddressSaved \}/);
  assert.match(clientSource, /subdistrict, setSubdistrict/);
  assert.match(clientSource, /country, setCountry/);
  assert.match(clientSource, /label, setLabel/);
  assert.match(clientSource, /onAddressSaved\?\.\(payload\.address as YnotAddress\)/);
  assert.match(clientSource, /export function ShippingRequestExperience/);
  assert.match(clientSource, /const \[addressRows, setAddressRows\] = useState\(addresses\)/);
  assert.match(clientSource, /const \[selectedAddressId, setSelectedAddressId\] = useState\(/);
  assert.match(clientSource, /function syncAddress\(address: YnotAddress\) \{[\s\S]*setSelectedAddressId\(address\.id\)/);
  assert.match(clientSource, /<CollectionConvertPanel[\s\S]*addresses=\{addressRows\}[\s\S]*selectedAddressId=\{selectedAddressId\}[\s\S]*onSelectedAddressIdChange=\{setSelectedAddressId\}/);
  assert.match(clientSource, /<AddressForm addresses=\{addressRows\} onAddressSaved=\{syncAddress\} \/>/);
  assert.match(clientSource, /const requestedAddressId = selectedAddressId \?\? localAddressId/);
  assert.match(clientSource, /const activeAddressId =[\s\S]*addresses\.find\(\(address\) => address\.id === requestedAddressId\)\?\.id[\s\S]*addresses\.find\(\(address\) => address\.isDefault\)\?\.id[\s\S]*addresses\[0\]\?\.id[\s\S]*""/);
  assert.match(clientSource, /addressId: activeAddressId/);
  assert.match(clientSource, /value=\{activeAddressId\}/);
  assert.match(clientSource, /onChange=\{\(event\) => updateAddressId\(event\.target\.value\)\}/);
  assert.doesNotMatch(clientSource, /setAddressId\(nextAddressId\)/);
  assert.match(shippingPage, /import \{ ShippingRequestExperience \} from "@\/features\/ynot\/client"/);
  assert.match(shippingPage, /<ShippingRequestExperience collection=\{data\.collection\} addresses=\{data\.addresses\} \/>/);
  assert.doesNotMatch(shippingPage, /<CollectionConvertPanel collection=\{data\.collection\} addresses=\{data\.addresses\} \/>/);
  assert.doesNotMatch(shippingPage, /<AddressForm addresses=\{data\.addresses\} \/>/);
});

test("platform verifier covers customer shipping hardening", () => {
  const crossOriginCheck = verifierCallSource(
    "check",
    "src/app/api/ynot/shipping/route.ts",
    "shipping request rejects cross-origin cookie mutations",
  );
  const validationCheck = verifierCallSource(
    "check",
    "src/app/api/ynot/shipping/route.ts",
    "shipping request validates action tokens and idempotency keys",
  );
  const rawErrorCheck = verifierCallSource(
    "notCheck",
    "src/app/api/ynot/shipping/route.ts",
    "shipping request does not return raw RPC errors",
  );
  const publicResultCheck = verifierCallSource(
    "check",
    "src/lib/ynot/reward-action-presenters.ts",
    "shipping request returns allowlisted RPC result",
  );

  assert.match(crossOriginCheck, /guardRewardActionRequest/);
  assert.match(validationCheck, /normalizeAddressActionToken/);
  assert.match(validationCheck, /resolveAddressActionToken/);
  assert.match(validationCheck, /normalizeSelectedRewardActionTokens/);
  assert.match(validationCheck, /resolveSelectedCollectionItemActionTokens/);
  assert.match(validationCheck, /normalizeRewardIdempotencyKey/);
  assert.match(rawErrorCheck, /error\\?\.message/);
  assert.match(publicResultCheck, /presentShippingLegacyResult/);
});
