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

function makeForm({
  paymentMethodId = "00000000-0000-0000-0000-000000000000",
  packageId = "starter",
  slip,
  customerNote,
} = {}) {
  const form = new FormData();
  if (paymentMethodId !== undefined) form.set("paymentMethodId", paymentMethodId);
  if (packageId !== undefined) form.set("packageId", packageId);
  if (customerNote !== undefined) form.set("customerNote", customerNote);
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

test("wallet POST ignores browser-supplied amount and coin fields", () => {
  const source = readFileSync(
    new URL("../src/app/api/ynot/wallet/route.ts", import.meta.url),
    "utf8",
  );
  const walletExperience = readFileSync(
    new URL("../src/features/ynot/cr/WalletExperience.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /amount_thb:\s*topUpPackage\.amountThb/);
  assert.match(source, /coin_amount:\s*topUpPackage\.coins/);
  assert.doesNotMatch(source, /form\.get\(["']amountThb["']\)/);
  assert.doesNotMatch(source, /form\.get\(["']coinAmount["']\)/);
  assert.match(walletExperience, /form\.set\("packageId",\s*picked\.id\)/);
  assert.doesNotMatch(walletExperience, /form\.set\(["']amountThb["']/);
  assert.doesNotMatch(walletExperience, /form\.set\(["']coinAmount["']/);
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
  assert.match(conversionHandler, /UUID_RE[\s\S]*IDEMPOTENCY_KEY_RE/);
  assert.match(conversionHandler, /new Set\(ids\)\.size !== ids\.length/);
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

test("admin top-up approval refuses unsafe or reused slips before crediting", () => {
  const adminRoute = readFileSync(
    new URL("../src/app/api/ynot/admin/top-ups/route.ts", import.meta.url),
    "utf8",
  );
  const migration = readFileSync(
    new URL("../../Database/supabase/migrations/20260528050000_harden_top_up_approval.sql", import.meta.url),
    "utf8",
  );

  assert.match(adminRoute, /approvableSlipStatuses\s*=\s*new Set\(\["valid", "manual_review"\]\)/);
  assert.match(adminRoute, /Cannot approve a top-up without an uploaded slip/);
  assert.match(adminRoute, /duplicate_of_slip_id[\s\S]*approvableSlipStatuses\.has/);
  assert.match(adminRoute, /Only pending top-up requests can be approved/);
  assert.match(migration, /latest_slip public\.payment_slips%rowtype/);
  assert.match(migration, /latest_slip\.duplicate_of_slip_id is not null[\s\S]*verification_status not in \('valid', 'manual_review'\)/);
  assert.match(migration, /locked_topup\.status not in \('pending_slip', 'pending_review'\)/);
  assert.match(migration, /top_up_slip_required/);
  assert.match(migration, /top_up_slip_not_approvable/);
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

  await t.test("missing slip is rejected for otherwise valid package input", async () => {
    await expectTopUpError(
      cookie,
      makeForm({ packageId: "starter" }),
      400,
      /slip upload is required/i,
    );
  });

  await t.test("unsupported slip MIME type is rejected", async () => {
    await expectTopUpError(
      cookie,
      makeForm({
        slip: textFile("not an image", "fake.txt", "text/plain"),
      }),
      400,
      /jpg, png, or webp/i,
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

  await t.test("valid image bytes with nonexistent method is rejected before insert", async () => {
    await expectTopUpError(
      cookie,
      makeForm({ slip: validPngSlip() }),
      400,
      /payment method is not active/i,
    );
  });
});
