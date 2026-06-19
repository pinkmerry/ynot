import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const baseUrl = (process.env.TOP_UP_BASE_URL ?? "http://localhost:3022").replace(/\/$/, "");

function loadTopUpPackagesModule() {
  const source = readFileSync(
    new URL("../src/features/ynot/top-up-packages.ts", import.meta.url),
    "utf8",
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const cjsModule = { exports: {} };
  vm.runInNewContext(outputText, {
    exports: cjsModule.exports,
    module: cjsModule,
    require,
  });
  return cjsModule.exports;
}

function extractPreviewCookie(response) {
  const getSetCookie = response.headers.getSetCookie?.() ?? [];
  const rawCookie = getSetCookie[0] ?? response.headers.get("set-cookie") ?? "";
  const match = rawCookie.match(/(?:^|,\s*)(ynot-preview-auth=1)(?:;|$)/);
  assert.ok(match, `preview auth cookie was not set: ${rawCookie || "(empty)"}`);
  return match[1];
}

async function fetchJson(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    redirect: "manual",
    ...init,
    headers: {
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }
  return { response, body };
}

async function previewCookie() {
  const response = await fetch(
    `${baseUrl}/api/dev/preview-auth?mode=on&next=/wallet`,
    { redirect: "manual" },
  );
  assert.equal(response.status, 307);
  return extractPreviewCookie(response);
}

function makeForm(options = {}) {
  const {
    paymentMethodId = "00000000-0000-0000-0000-000000000000",
    packageId = options.customAmountThb === undefined ? "starter" : undefined,
    customAmountThb,
    slip,
    customerNote,
    idempotencyKey = "ynot-topup:test-edge-validation-key",
  } = options;
  const form = new FormData();
  if (paymentMethodId !== undefined) form.set("paymentMethodId", paymentMethodId);
  if (packageId !== undefined) form.set("packageId", packageId);
  if (customAmountThb !== undefined) form.set("customAmountThb", customAmountThb);
  if (customerNote !== undefined) form.set("customerNote", customerNote);
  if (idempotencyKey !== undefined) form.set("idempotencyKey", idempotencyKey);
  if (slip) form.set("slip", slip);
  return form;
}

function fileFromBytes(bytes, name, type) {
  return new File([new Uint8Array(bytes)], name, { type });
}

function textFile(text, name, type) {
  return new File([new TextEncoder().encode(text)], name, { type });
}

const validPngSlip = () =>
  fileFromBytes(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d],
    "safe-test-slip.png",
    "image/png",
  );

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function readMigration(name) {
  return readFileSync(
    new URL(`../../Database/supabase/migrations/${name}`, import.meta.url),
    "utf8",
  );
}

function sourceBefore(source, marker) {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `Missing marker: ${marker}`);
  return source.slice(0, markerIndex);
}

function sourceAfter(source, marker) {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `Missing marker: ${marker}`);
  return source.slice(markerIndex + marker.length);
}

function sourceBetween(source, startMarker, endMarker) {
  const afterStart = sourceAfter(source, startMarker);
  return sourceBefore(afterStart, endMarker);
}

function functionBody(source, functionName) {
  const functionStart = source.indexOf(`function ${functionName}`);
  assert.notEqual(functionStart, -1, `Missing function: ${functionName}`);
  const bodyStart = source.indexOf("{", functionStart);
  assert.notEqual(bodyStart, -1, `Missing function body: ${functionName}`);

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    if (depth === 0) return source.slice(bodyStart, index + 1);
  }

  assert.fail(`Unclosed function body: ${functionName}`);
}

async function expectTopUpError(cookie, form, status, messagePattern) {
  const { response, body } = await fetchJson("/api/ynot/wallet", {
    method: "POST",
    headers: { cookie },
    body: form,
  });
  assert.equal(response.status, status);
  assert.match(String(body.error ?? ""), messagePattern);
}

test("top-up packages are fixed server-side catalog values", () => {
  const { getTopUpPackage, topUpPackages } = loadTopUpPackagesModule();
  assert.deepEqual(
    plain(topUpPackages.map((pkg) => [pkg.id, pkg.amountThb, pkg.coins])),
    [
      ["starter", 100, 100],
      ["player", 500, 500],
      ["collector", 1000, 1000],
      ["whale", 3000, 3000],
    ],
  );
  for (const pkg of topUpPackages) {
    assert.equal(
      pkg.coins,
      pkg.amountThb,
      `${pkg.id} must credit exactly 1 coin per 1 THB`,
    );
  }
  assert.deepEqual(plain(getTopUpPackage("player")), {
    id: "player",
    label: "Player",
    amountThb: 500,
    coins: 500,
  });
  assert.equal(getTopUpPackage("tampered-package"), null);
});

test("wallet POST uses server-resolved amount for storage and slip checks", () => {
  const source = readFileSync(
    new URL("../src/app/api/ynot/wallet/route.ts", import.meta.url),
    "utf8",
  );
  const migration = readMigration("20260615090000_top_up_idempotency.sql");
  const walletExperience = readFileSync(
    new URL("../src/features/ynot/cr/WalletExperience.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /customAmountThb/);
  assert.match(source, /coins:\s*amountThb/);
  assert.match(source, /amount_thb:\s*resolvedTopUp\.value\.amountThb/);
  assert.match(source, /coin_amount:\s*resolvedTopUp\.value\.coins/);
  assert.match(source, /p_amount_source:\s*resolvedTopUp\.value\.packageId \? "package" : "custom"/);
  assert.match(source, /p_package_id:\s*resolvedTopUp\.value\.packageId/);
  assert.match(migration, /'amount_source',\s*trim\(p_amount_source\)/);
  assert.match(migration, /'package_id',\s*nullif\(trim\(coalesce\(p_package_id,\s*''\)\),\s*''\)/);
  assert.match(
    source,
    /verifySlipWithSlip2Go\([\s\S]*amountThb:\s*resolvedTopUp\.value\.amountThb/,
  );
  assert.doesNotMatch(source, /form\.get\(["']amountThb["']\)/);
  assert.doesNotMatch(source, /form\.get\(["']coinAmount["']\)/);
  assert.match(walletExperience, /form\.set\("packageId",\s*picked\.id\)/);
  assert.match(walletExperience, /form\.set\("customAmountThb",\s*String\(buyThb\)\)/);
  assert.doesNotMatch(walletExperience, /form\.set\(["']amountThb["']/);
  assert.doesNotMatch(walletExperience, /form\.set\(["']coinAmount["']/);
});

test("wallet POST requires client idempotency and delegates top-up/slip creation to RPC", () => {
  const walletRoute = readFileSync(
    new URL("../src/app/api/ynot/wallet/route.ts", import.meta.url),
    "utf8",
  );
  const migration = readMigration("20260615090000_top_up_idempotency.sql");
  const typesSource = readFileSync(
    new URL("../src/lib/supabase/types.ts", import.meta.url),
    "utf8",
  );

  const beforeSubmitRpc = sourceBefore(walletRoute, 'supabase.rpc("submit_top_up_request"');
  const submitRpcCall = walletRoute.slice(
    walletRoute.indexOf('supabase.rpc("submit_top_up_request"'),
    walletRoute.indexOf("});", walletRoute.indexOf('supabase.rpc("submit_top_up_request"')) + 3,
  );
  const normalizeKeyBody = functionBody(walletRoute, "normalizeTopUpIdempotencyKey");
  const replayBody = functionBody(walletRoute, "replayTopUpResponse");
  const replayLookupBody = functionBody(walletRoute, "fetchExistingTopUpByIdempotency");

  assert.match(walletRoute, /const TOP_UP_IDEMPOTENCY_KEY_RE\s*=/);
  assert.match(walletRoute, /function normalizeTopUpIdempotencyKey/);
  assert.match(normalizeKeyBody, /typeof value !== "string"\) return null/);
  assert.match(normalizeKeyBody, /const clean = value\.trim\(\)/);
  assert.match(normalizeKeyBody, /TOP_UP_IDEMPOTENCY_KEY_RE\.test\(clean\) \? clean : null/);
  assert.match(replayLookupBody, /\.eq\("profile_id",\s*profileId\)/);
  assert.match(replayLookupBody, /\.eq\("idempotency_key",\s*idempotencyKey\)/);
  assert.match(replayLookupBody, /\.maybeSingle\(\)/);
  assert.match(replayBody, /topUp:\s*publicTopUp\(toTopUp\(topUp\)\)/);
  assert.doesNotMatch(replayBody, /provider|paymentSlip|file_sha|storage|adminNote/i);
  assert.match(beforeSubmitRpc, /normalizeTopUpIdempotencyKey\(form\.get\("idempotencyKey"\)\)/);
  assert.match(
    beforeSubmitRpc,
    /if\s*\(!idempotencyKey\)\s*\{[\s\S]*return\s+jsonNoStore\([\s\S]*Invalid idempotency key[\s\S]*\{\s*status:\s*400\s*\}[\s\S]*\);[\s\S]*\}/,
  );
  assert.match(beforeSubmitRpc, /fetchExistingTopUpByIdempotency\(supabase,\s*session\.profileId,\s*idempotencyKey\)/);
  assert.match(beforeSubmitRpc, /replayTopUpResponse\(existingTopUp,\s*200\)/);

  assert.match(submitRpcCall, /p_top_up_id:\s*topUpId/);
  assert.match(submitRpcCall, /p_profile_id:\s*session\.profileId/);
  assert.match(submitRpcCall, /p_payment_method_id:\s*paymentMethodId/);
  assert.match(submitRpcCall, /p_amount_thb:\s*resolvedTopUp\.value\.amountThb/);
  assert.match(submitRpcCall, /p_coin_amount:\s*resolvedTopUp\.value\.coins/);
  assert.match(submitRpcCall, /p_amount_source:\s*resolvedTopUp\.value\.packageId \? "package" : "custom"/);
  assert.match(submitRpcCall, /p_package_id:\s*resolvedTopUp\.value\.packageId/);
  assert.match(submitRpcCall, /p_customer_note:\s*customerNote/);
  assert.match(submitRpcCall, /p_idempotency_key:\s*idempotencyKey/);
  assert.match(submitRpcCall, /p_slip_file_sha256:\s*slipHash/);
  assert.match(submitRpcCall, /p_slip_verification_status:\s*localDuplicateSlip \? "duplicate" : "unverified"/);
  assert.match(submitRpcCall, /p_slip_provider_code:\s*localDuplicateSlip \? "LOCAL_DUPLICATE" : null/);
  assert.match(submitRpcCall, /p_slip_provider_message:\s*localDuplicateSlip \? "This slip image was already used on another approved payment\." : null/);
  assert.match(submitRpcCall, /p_slip_provider_response:\s*initialProviderResponse/);
  assert.match(submitRpcCall, /p_slip_duplicate_of_slip_id:\s*localDuplicateSlip\?\.id \?\? null/);
  assert.match(submitRpcCall, /p_slip_verified_at:\s*localDuplicateSlip \? new Date\(\)\.toISOString\(\) : null/);

  assert.doesNotMatch(walletRoute, /const idempotencyKey = randomUUID\(\)/);
  assert.doesNotMatch(walletRoute, /\.from\("top_up_requests"\)\s*\.insert/);
  assert.doesNotMatch(walletRoute, /\.from\("payment_slips"\)\s*\.\s*insert/);
  assert.doesNotMatch(walletRoute, /\.from\("audit_events"\)[\s\S]{0,120}\.insert\([\s\S]*event_type:\s*"top_up_submitted"/);

  assert.match(
    migration,
    /create unique index if not exists top_up_requests_profile_idempotency_unique_idx\s+on public\.top_up_requests\s*\(\s*profile_id,\s*idempotency_key\s*\)\s+where idempotency_key is not null;/i,
  );
  assert.match(migration, /create or replace function public\.submit_top_up_request\(/);
  assert.match(migration, /insert into public\.top_up_requests/);
  assert.match(migration, /insert into public\.payment_slips/);
  assert.match(migration, /insert into public\.audit_events/);
  assert.match(
    migration,
    /revoke all on function public\.submit_top_up_request\([\s\S]*\) from public,\s*anon,\s*authenticated;/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.submit_top_up_request\([\s\S]*\) to service_role;/i,
  );
  assert.doesNotMatch(migration, /grant execute on function public\.submit_top_up_request\([\s\S]*\) to (?:public|anon|authenticated)/i);
  assert.doesNotMatch(migration, /open_gacha_campaign/i);
  assert.doesNotMatch(migration, /draw_round_prizes|draw_round_prize_units|logic_snapshot|weight|unlock_at_sold_pct/i);

  assert.match(typesSource, /submit_top_up_request:\s*\{\s*Args:/);
  assert.match(typesSource, /p_idempotency_key:\s*string/);
  assert.match(typesSource, /p_amount_source:\s*string/);
  assert.match(typesSource, /p_package_id\?:\s*string \| null/);
  assert.match(typesSource, /p_slip_file_sha256:\s*string/);
});

test("wallet top-up UIs send stable idempotency keys and block duplicate submits", () => {
  const actionIntent = readFileSync(
    new URL("../src/features/ynot/action-intent.ts", import.meta.url),
    "utf8",
  );
  const walletExperience = readFileSync(
    new URL("../src/features/ynot/cr/WalletExperience.tsx", import.meta.url),
    "utf8",
  );
  const legacyClient = readFileSync(
    new URL("../src/features/ynot/client.tsx", import.meta.url),
    "utf8",
  );

  assert.match(actionIntent, /export function createYnotActionIntentId/);
  assert.match(actionIntent, /export function ynotActionIdempotencyKey/);
  assert.match(actionIntent, /ynot-topup/);

  const walletSubmit = functionBody(walletExperience, "submit");
  const legacyTopUpForm = sourceBetween(
    legacyClient,
    "export function TopUpForm",
    "export function GachaOpenPanel",
  );
  const legacySubmit = functionBody(legacyTopUpForm, "submit");

  for (const source of [walletExperience, legacyTopUpForm]) {
    assert.match(source, /createYnotActionIntentId\("topup"\)/);
    assert.match(source, /ynotActionIdempotencyKey\("topup"/);
    assert.match(source, /topUpSubmitInFlightRef/);
    assert.match(source, /topUpIntentRef/);
    assert.match(source, /useRef\(createYnotActionIntentId\("topup"\)\)/);
  }

  for (const submitBody of [walletSubmit, legacySubmit]) {
    assert.match(submitBody, /if\s*\(topUpSubmitInFlightRef\.current\)\s*return/);
    assert.match(submitBody, /ynotActionIdempotencyKey\("topup",\s*topUpIntentRef\.current/);
    assert.match(submitBody, /topUpSubmitInFlightRef\.current\s*=\s*true[\s\S]*fetch\("\/api\/ynot\/wallet"/);
    assert.match(submitBody, /form\.set\("idempotencyKey",\s*topUpIdempotencyKey\)/);
    assert.match(submitBody, /setSlip\(null\);[\s\S]*topUpIntentRef\.current\s*=\s*createYnotActionIntentId\("topup"\)/);
    assert.match(submitBody, /finally\s*\{[\s\S]*topUpSubmitInFlightRef\.current\s*=\s*false/);
    assert.doesNotMatch(submitBody, /form\.set\("idempotencyKey",\s*crypto\.randomUUID\(\)\)/);
  }
});

test("top-up mutations reject cross-origin browser submissions", () => {
  const walletRoute = readFileSync(
    new URL("../src/app/api/ynot/wallet/route.ts", import.meta.url),
    "utf8",
  );
  const adminRoute = readFileSync(
    new URL("../src/app/api/ynot/admin/top-ups/route.ts", import.meta.url),
    "utf8",
  );
  const sameOrigin = readFileSync(
    new URL("../src/lib/security/same-origin.ts", import.meta.url),
    "utf8",
  );

  assert.match(sameOrigin, /request\.headers\.get\("origin"\)/);
  assert.match(sameOrigin, /new URL\(request\.url\)\.origin/);
  assert.match(sameOrigin, /Cross-origin mutation requests are not allowed/);
  assert.match(walletRoute, /enforceSameOriginMutation\(request\)/);
  assert.match(adminRoute, /enforceSameOriginMutation\(request\)/);
});

test("coin mutation APIs validate inputs and hide internal response fields", () => {
  const conversionHandler = readFileSync(
    new URL("../src/lib/ynot/card-conversion-api.ts", import.meta.url),
    "utf8",
  );
  const collectionRoute = readFileSync(
    new URL("../src/app/api/ynot/collection/convert/route.ts", import.meta.url),
    "utf8",
  );
  const exchangeRoute = readFileSync(
    new URL("../src/app/api/ynot/exchange/route.ts", import.meta.url),
    "utf8",
  );
  const adminTopUpsRoute = readFileSync(
    new URL("../src/app/api/ynot/admin/top-ups/route.ts", import.meta.url),
    "utf8",
  );
  const campaignCostRoute = readFileSync(
    new URL("../src/app/api/ynot/admin/campaigns/cost/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(collectionRoute, /handleCardConversionRequest\(request\)/);
  assert.match(exchangeRoute, /handleCardConversionRequest\(request\)/);
  assert.match(conversionHandler, /enforceSameOriginMutation\(request\)/);
  assert.match(conversionHandler, /isCollectionItemActionToken[\s\S]*IDEMPOTENCY_KEY_RE/);
  assert.match(conversionHandler, /resolveCollectionItemActionTokens/);
  assert.match(conversionHandler, /new Set\(tokens\)\.size !== tokens\.length/);
  assert.match(
    conversionHandler,
    /p_collection_item_ids:\s*selectionMode === "selected" \? resolvedCollectionItemIds : null/,
  );
  assert.match(conversionHandler, /function publicConversionResult[\s\S]*totalCoins[\s\S]*itemCount[\s\S]*replayed/);
  assert.doesNotMatch(conversionHandler, /ledgerId/);
  assert.doesNotMatch(conversionHandler, /Response\.json\(\{\s*error:\s*error\.message/);
  assert.doesNotMatch(adminTopUpsRoute, /Response\.json\(\{\s*error:\s*error\.message/);
  assert.doesNotMatch(adminTopUpsRoute, /result:\s*data/);
  assert.match(campaignCostRoute, /enforceSameOriginMutation\(request\)/);
  assert.match(campaignCostRoute, /MAX_CAMPAIGN_COST_COINS/);
  assert.doesNotMatch(campaignCostRoute, /error\.message/);
  assert.doesNotMatch(campaignCostRoute, /error\.details|error\.hint/);
});

test("customer wallet top-ups do not expose provider internals", () => {
  const dataSource = readFileSync(
    new URL("../src/features/ynot/data.ts", import.meta.url),
    "utf8",
  );
  const typesSource = readFileSync(
    new URL("../src/features/ynot/types.ts", import.meta.url),
    "utf8",
  );

  assert.match(dataSource, /includeSensitiveSlipDetails\s*=\s*options\.includeSensitiveSlipDetails \?\? includeAll/);
  assert.match(dataSource, /adminNote:\s*includeSensitiveSlipDetails \? row\.admin_note : null/);
  assert.match(dataSource, /\.\.\.\(includeSensitiveSlipDetails[\s\S]*providerCode:[\s\S]*providerMessage:/);
  assert.doesNotMatch(typesSource, /referenceId|duplicateOfSlipId/);
});

test("bank-transfer top-up labels stay aligned across customer and admin previews", () => {
  const dataSource = readFileSync(
    new URL("../src/features/ynot/data.ts", import.meta.url),
    "utf8",
  );
  const walletExperience = readFileSync(
    new URL("../src/features/ynot/cr/WalletExperience.tsx", import.meta.url),
    "utf8",
  );
  const adminSettings = readFileSync(
    new URL("../src/app/admin/settings/page.tsx", import.meta.url),
    "utf8",
  );
  const adminComponents = readFileSync(
    new URL("../src/features/ynot/components.tsx", import.meta.url),
    "utf8",
  );

  assert.match(dataSource, /function displayPaymentMethodName/);
  assert.match(dataSource, /function displayPaymentInstructions/);
  assert.ok(dataSource.includes('if (type === "bank_transfer") return "Bank Transfer";'));
  assert.match(dataSource, /upload the slip for automatic verification/);
  assert.match(dataSource, /function hideLegacyMainTransfer/);
  assert.match(dataSource, /method\.code === "main-transfer"/);
  assert.match(dataSource, /ynot-payment-methods-v4-auto-slip-approval/);
  assert.match(dataSource, /displayName:\s*displayPaymentMethodName\(row\.type, row\.display_name\)/);
  assert.match(
    dataSource,
    /displayName:\s*displayPaymentMethodName\(\s*options\.paymentMethod\.type,\s*options\.paymentMethod\.display_name,\s*\)/,
  );
  assert.doesNotMatch(walletExperience, /Main bank \/ PromptPay|No active bank or PromptPay/);
  assert.match(adminSettings, /title="Bank Transfer"/);
  assert.match(adminComponents, />Bank Transfer<\/h3>/);
});

test("admin top-up approval refuses unsafe or reused slips before crediting", () => {
  const adminRoute = readFileSync(
    new URL("../src/app/api/ynot/admin/top-ups/route.ts", import.meta.url),
    "utf8",
  );
  const approvalHelper = readFileSync(
    new URL("../src/lib/ynot/top-up-approval.ts", import.meta.url),
    "utf8",
  );
  const migration = readFileSync(
    new URL("../../Database/supabase/migrations/20260528050000_harden_top_up_approval.sql", import.meta.url),
    "utf8",
  );

  assert.match(approvalHelper, /manualApprovableSlipStatuses\s*=\s*new Set<SlipVerificationStatus>\(\[[\s\S]*"valid"[\s\S]*"manual_review"/);
  assert.match(adminRoute, /Cannot approve a top-up without an uploaded slip/);
  assert.match(adminRoute, /duplicate_of_slip_id[\s\S]*manualApprovableSlipStatuses\.has/);
  assert.match(adminRoute, /Only pending top-up requests can be approved/);
  assert.match(migration, /latest_slip public\.payment_slips%rowtype/);
  assert.match(migration, /latest_slip\.duplicate_of_slip_id is not null[\s\S]*verification_status not in \('valid', 'manual_review'\)/);
  assert.match(migration, /locked_topup\.status not in \('pending_slip', 'pending_review'\)/);
  assert.match(migration, /top_up_slip_required/);
  assert.match(migration, /top_up_slip_not_approvable/);
});

test("wallet top-up auto-approval requires strict Slip2Go valid status", () => {
  const walletRoute = readFileSync(
    new URL("../src/app/api/ynot/wallet/route.ts", import.meta.url),
    "utf8",
  );
  const approvalHelper = readFileSync(
    new URL("../src/lib/ynot/top-up-approval.ts", import.meta.url),
    "utf8",
  );

  assert.match(approvalHelper, /const autoApprovableSlipStatus: SlipVerificationStatus = "valid"/);
  assert.match(approvalHelper, /providerAutoApprove && finalStatus === autoApprovableSlipStatus/);
  assert.match(walletRoute, /canAutoApproveVerifiedSlip\(\{[\s\S]*finalStatus[\s\S]*providerAutoApprove: verification\.autoApprove/);
  assert.match(walletRoute, /resolveAutoTopUpAdmin\(supabase\)/);
  assert.match(walletRoute, /rpc\("approve_top_up_request"/);
  assert.match(walletRoute, /p_admin_note:\s*"Auto-approved after Slip2Go verified amount, receiver, date, and duplicate checks\."/);
  assert.match(walletRoute, /emitTopUpApprovalRiskAlerts\(supabase,[\s\S]*approvalMode: "slip2go_auto"/);
  assert.match(walletRoute, /topUp:\s*publicTopUp\(toTopUp\(responseTopUp\)\)/);
});

test("wallet top-up auto-rejects definitive Slip2Go failures", () => {
  const walletRoute = readFileSync(
    new URL("../src/app/api/ynot/wallet/route.ts", import.meta.url),
    "utf8",
  );
  const approvalHelper = readFileSync(
    new URL("../src/lib/ynot/top-up-approval.ts", import.meta.url),
    "utf8",
  );

  assert.match(approvalHelper, /autoRejectableSlipStatuses[\s\S]*"duplicate"[\s\S]*"amount_mismatch"[\s\S]*"receiver_mismatch"/);
  assert.match(approvalHelper, /function canAutoRejectVerifiedSlip/);
  assert.match(walletRoute, /canAutoRejectVerifiedSlip\(finalStatus\)/);
  assert.match(walletRoute, /rpc\("reject_top_up_request"/);
  assert.match(walletRoute, /autoRejected = true/);
});

test("customer wallet history exposes rejected top-up filter", () => {
  const walletExperience = readFileSync(
    new URL("../src/features/ynot/cr/WalletExperience.tsx", import.meta.url),
    "utf8",
  );

  assert.match(walletExperience, /type HistoryFilter = "all" \| "approved" \| "pending" \| "rejected"/);
  assert.match(walletExperience, /entry\.group === historyFilter/);
  assert.match(walletExperience, /Rejected top-up/);
  assert.match(walletExperience, /\{ id: "rejected", label: "Rejected" \}/);
  assert.match(walletExperience, /autoRejected/);
});

test("wallet top-up API safe validation and edge cases", async (t) => {
  await t.test("unauthenticated wallet GET is rejected", async () => {
    const { response, body } = await fetchJson("/api/ynot/wallet");
    assert.equal(response.status, 401);
    assert.match(String(body.error ?? ""), /login is required/i);
  });

  const cookie = await previewCookie();

  await t.test("authenticated wallet GET exposes expected payload shape", async () => {
    const { response, body } = await fetchJson("/api/ynot/wallet", {
      headers: { cookie },
    });
    assert.equal(response.status, 200);
    assert.equal(typeof body.wallet?.balanceCoins, "number");
    assert.ok(Array.isArray(body.topUps));
    assert.ok(Array.isArray(body.paymentMethods));
    for (const method of body.paymentMethods) {
      assert.match(String(method.id ?? ""), /^pm_[A-Za-z0-9_-]{43}$/);
      assert.equal("code" in method, false);
    }
    for (const topUp of body.topUps) {
      assert.equal("id" in topUp, false);
      assert.equal("profileId" in topUp, false);
      assert.equal("adminNote" in topUp, false);
      assert.equal("code" in (topUp.paymentMethod ?? {}), false);
    }
  });

  await t.test("missing payment method is rejected before upload processing", async () => {
    await expectTopUpError(
      cookie,
      makeForm({ paymentMethodId: "", packageId: "starter" }),
      400,
      /payment method is required/i,
    );
  });

  await t.test("invalid package id is rejected before upload processing", async () => {
    await expectTopUpError(
      cookie,
      makeForm({ packageId: "attacker-package" }),
      400,
      /invalid top-up package/i,
    );
  });

  await t.test("invalid custom amount is rejected before upload processing", async () => {
    await expectTopUpError(
      cookie,
      makeForm({ packageId: undefined, customAmountThb: "0" }),
      400,
      /custom top-up amount/i,
    );
  });

  await t.test("missing slip is rejected for otherwise valid custom amount input", async () => {
    await expectTopUpError(
      cookie,
      makeForm({ packageId: undefined, customAmountThb: "321" }),
      400,
      /slip upload is required/i,
    );
  });

  await t.test("declared image with non-image bytes is rejected", async () => {
    await expectTopUpError(
      cookie,
      makeForm({
        slip: textFile("<!doctype html><html></html>", "fake.jpg", "image/jpeg"),
      }),
      400,
      /file content does not match/i,
    );
  });

  await t.test("valid image bytes with custom amount is rejected before insert when method is inactive", async () => {
    await expectTopUpError(
      cookie,
      makeForm({
        packageId: undefined,
        customAmountThb: "321",
        slip: validPngSlip(),
      }),
      400,
      /payment method is not active/i,
    );
  });
});
