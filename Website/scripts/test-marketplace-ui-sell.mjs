import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readApp(relPath) {
  return readFileSync(path.join(appRoot, relPath), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SELL_DIR = "src/features/marketplace-ui/sell";
const SELL_FORM_PATH = `${SELL_DIR}/SellForm.tsx`;
const IDENTITY_PANEL_PATH = `${SELL_DIR}/SellIdentityPanel.tsx`;
const SUMMARY_RAIL_PATH = `${SELL_DIR}/SellSummaryRail.tsx`;
const PHOTO_UPLOADER_PATH = `${SELL_DIR}/PhotoUploader.tsx`;
const FORM_FIELDS_PATH = `${SELL_DIR}/SellFormFields.tsx`;
const SELLER_PAGE_PATH = "src/app/(store)/marketplace/seller/page.tsx";
const CATALOG_METADATA_PATH = "src/features/ynot/card-catalog-metadata.ts";
const SUBMISSIONS_ROUTE_PATH =
  "src/app/api/ynot/marketplace/seller/submissions/route.ts";
const SUBMISSION_DETAIL_ROUTE_PATH =
  "src/app/api/ynot/marketplace/seller/submissions/[submissionId]/route.ts";
const PHOTOS_ROUTE_PATH =
  "src/app/api/ynot/marketplace/seller/submissions/[submissionId]/photos/route.ts";
const PAYOUT_PREVIEW_ROUTE_PATH =
  "src/app/api/ynot/marketplace/seller/payout-preview/route.ts";
const TERMS_ROUTE_PATH = "src/app/api/ynot/marketplace/seller/terms/route.ts";
const SELLER_CONSIGNMENT_LIB_PATH = "src/lib/marketplace/seller-consignment.ts";

test("package exposes the scoped marketplace UI sell test script", () => {
  const packageJson = JSON.parse(readApp("package.json"));
  assert.equal(
    packageJson.scripts["test:marketplace-ui-sell"],
    "node --test scripts/test-marketplace-ui-sell.mjs",
  );
});

test("SellForm.tsx and its split-out sub-components exist", () => {
  for (const relPath of [
    SELL_FORM_PATH,
    IDENTITY_PANEL_PATH,
    SUMMARY_RAIL_PATH,
    PHOTO_UPLOADER_PATH,
    FORM_FIELDS_PATH,
  ]) {
    assert.ok(existsSync(path.join(appRoot, relPath)), `missing ${relPath}`);
  }
});

test("sell feature files are client components and stay under the 800-line file budget", () => {
  for (const relPath of [
    SELL_FORM_PATH,
    IDENTITY_PANEL_PATH,
    SUMMARY_RAIL_PATH,
    PHOTO_UPLOADER_PATH,
    FORM_FIELDS_PATH,
  ]) {
    const source = readApp(relPath);
    assert.match(source, /^"use client"/m, `${relPath} must be a client component`);
    const lineCount = source.split("\n").length;
    assert.ok(lineCount <= 800, `${relPath} has ${lineCount} lines, exceeds the 800-line budget`);
  }
});

test("seller page.tsx renders SellForm and no longer references YnotShell", () => {
  const source = readApp(SELLER_PAGE_PATH);
  assert.doesNotMatch(source, /YnotShell/, "seller page must no longer render YnotShell");
  assert.match(source, /<SellForm\b/, "seller page must render <SellForm");
  assert.match(
    source,
    /from\s*["']@\/features\/marketplace-ui\/sell\/SellForm["']/,
    "seller page must import SellForm from the new feature module",
  );
});

test("seller page.tsx keeps the real session/account guards", () => {
  const source = readApp(SELLER_PAGE_PATH);
  for (const symbol of [
    "resolveCurrentProfile",
    "resolveAdminSession",
    "marketplaceConfig",
    "getMarketplaceAccountForProfile",
    "getMockMarketplaceAccount",
  ]) {
    assert.match(source, new RegExp(escapeRegExp(symbol)), `page.tsx must still reference ${symbol}`);
  }
  assert.match(source, /if\s*\(!allowed\)\s*{\s*redirect\("\/packs"\);/, "must still redirect unauthorized owner-only access to /packs");
  assert.match(source, /redirect\("\/marketplace"\)/, "must still redirect when marketplace is unavailable");
});

test("seller page.tsx imports catalog option arrays instead of redeclaring them", () => {
  const source = readApp(SELLER_PAGE_PATH);
  assert.match(
    source,
    /from\s*["']@\/features\/ynot\/card-catalog-metadata["']/,
    "page.tsx must import option arrays from card-catalog-metadata",
  );
  for (const symbol of [
    "catalogCategoryOptions",
    "cardConditionOptions",
    "gradingServiceOptions",
    "cardGradeOptions",
    "cardLanguageOptions",
    "cardReleaseYearOptions",
  ]) {
    assert.match(source, new RegExp(escapeRegExp(symbol)), `page.tsx must reference ${symbol}`);
  }
});

test("card-catalog-metadata.ts still exports the exact option array names the sell form depends on", () => {
  const source = readApp(CATALOG_METADATA_PATH);
  for (const symbol of [
    "export const catalogCategoryOptions",
    "export const cardConditionOptions",
    "export const gradingServiceOptions",
    "export const cardGradeOptions",
    "export const cardLanguageOptions",
    "export const cardReleaseYearOptions",
  ]) {
    assert.match(source, new RegExp(escapeRegExp(symbol)), `sanity check: metadata module must export ${symbol}`);
  }
});

test("SellForm.tsx and its sub-components do not redeclare the catalog option arrays", () => {
  for (const relPath of [SELL_FORM_PATH, IDENTITY_PANEL_PATH]) {
    const source = readApp(relPath);
    assert.doesNotMatch(
      source,
      /gradingServiceOptions\s*=\s*\[/,
      `${relPath} must not redeclare gradingServiceOptions — it must receive it via props`,
    );
    assert.doesNotMatch(
      source,
      /cardGradeOptions\s*=\s*\[/,
      `${relPath} must not redeclare cardGradeOptions — it must receive it via props`,
    );
    assert.doesNotMatch(
      source,
      /catalogCategoryOptions\s*=\s*\[/,
      `${relPath} must not redeclare catalogCategoryOptions — it must receive it via props`,
    );
  }
});

test("SellForm.tsx does not statically import the server-only catalog metadata module", () => {
  const source = readApp(SELL_FORM_PATH);
  assert.doesNotMatch(
    source,
    /from\s*["']@\/features\/ynot\/card-catalog-metadata["']/,
    "SellForm must receive options as props from the server page, not import the metadata module directly",
  );
});

test("SellForm.tsx creates a draft, uploads its photos, then submits the completed consignment", () => {
  const source = readApp(SELL_FORM_PATH);
  assert.match(
    source,
    /fetch\(\s*["']\/api\/marketplace\/seller\/submissions["']/,
    "must POST to /api/marketplace/seller/submissions",
  );
  assert.match(source, /method:\s*["']POST["']/, "submission create must use method: POST");
  assert.match(source, /submitNow:\s*false/, "create payload must leave the submission as a draft for photo upload");
  assert.match(source, /["']idempotency-key["']/, "must send the idempotency-key header");
  assert.match(
    source,
    /\/api\/marketplace\/seller\/submissions\/\$\{submissionId\}\/submit/,
    "must submit only after the photos are attached",
  );
  assert.ok(
    source.indexOf("for (const [index, photo] of photos.entries())") <
      source.indexOf("/submit`"),
    "photo uploads must occur before the final submit request",
  );
});

test("SellForm.tsx sends every SELLER_SUBMISSION_FIELDS key the create route allows", () => {
  const libSource = readApp(SELLER_CONSIGNMENT_LIB_PATH);
  const match = libSource.match(
    /export const SELLER_SUBMISSION_FIELDS = \[([\s\S]*?)\] as const;/,
  );
  assert.ok(match, "sanity check: SELLER_SUBMISSION_FIELDS array must still be defined");
  const fields = [...match[1].matchAll(/"([a-zA-Z]+)"/g)].map((m) => m[1]);
  assert.ok(fields.length > 0, "sanity check: parsed at least one allowed field");

  const formSource = readApp(SELL_FORM_PATH);
  for (const field of fields) {
    assert.match(
      formSource,
      new RegExp(`\\b${escapeRegExp(field)}\\b`),
      `SellForm submit payload must reference the allowed field ${field}`,
    );
  }
});

test("SellForm.tsx uploads photos to the real per-submission photos route using the confirmed multipart field name", () => {
  const routeSource = readApp(PHOTOS_ROUTE_PATH);
  assert.match(
    routeSource,
    /form\.get\(["']sellerPhoto["']\)\s*\?\?\s*form\.get\(["']photo["']\)/,
    "sanity check: the real route must read the file under sellerPhoto (or legacy photo) first",
  );

  const formSource = readApp(SELL_FORM_PATH);
  assert.match(
    formSource,
    /\/api\/marketplace\/seller\/submissions\/\$\{submissionId\}\/photos/,
    "must POST to /api/marketplace/seller/submissions/{id}/photos",
  );
  assert.match(formSource, /form\.append\(["']sellerPhoto["']/, "must send the file under the confirmed sellerPhoto field name");
  assert.match(formSource, /new FormData\(\)/, "photo upload must be a multipart FormData request");
});

test("SellForm.tsx calls the real payout-preview route and renders only server-returned fee/net fields", () => {
  const routeSource = readApp(PAYOUT_PREVIEW_ROUTE_PATH);
  assert.match(
    routeSource,
    /quoteSellerPayoutPreview/,
    "sanity check: the real route must still call quoteSellerPayoutPreview",
  );

  const formSource = readApp(SELL_FORM_PATH);
  assert.match(
    formSource,
    /fetch\(\s*["']\/api\/marketplace\/seller\/payout-preview["']/,
    "must POST to /api/marketplace/seller/payout-preview",
  );
  assert.match(formSource, /askingPriceSatang/, "preview request body must send askingPriceSatang");
  assert.match(formSource, /sellerMarketplaceFeeSatang/, "must read the server's sellerMarketplaceFeeSatang field");
  assert.match(formSource, /sellerPayoutSatang/, "must read the server's sellerPayoutSatang field");
});

test("SellForm.tsx never hardcodes a seller fee percentage", () => {
  const formSource = readApp(SELL_FORM_PATH);
  const railSource = readApp(SUMMARY_RAIL_PATH);
  for (const source of [formSource, railSource]) {
    assert.doesNotMatch(source, /0\.06/, "must not hardcode the prototype's 6% seller fee constant");
    assert.doesNotMatch(source, /SELL_FEE/, "must not port the prototype's SELL_FEE constant");
    assert.doesNotMatch(source, /Seller fee\s*·\s*6%/, "must not hardcode a 6% fee label");
  }
});

test("SellForm.tsx debounces the payout preview at 400ms", () => {
  const source = readApp(SELL_FORM_PATH);
  assert.match(source, /PRICE_PREVIEW_DEBOUNCE_MS\s*=\s*400/, "preview debounce must be 400ms");
  // The payout-preview fetch must live inside a setTimeout whose delay
  // argument is the 400ms constant (i.e. the fetch is debounced, not fired
  // on every keystroke).
  assert.match(
    source,
    /setTimeout\([\s\S]*?\/api\/marketplace\/seller\/payout-preview[\s\S]*?\},\s*PRICE_PREVIEW_DEBOUNCE_MS\)/,
    "preview fetch must be wrapped in the 400ms debounce timer",
  );
});

test("SellForm.tsx calls the real seller-terms accept route", () => {
  const routeSource = readApp(TERMS_ROUTE_PATH);
  assert.match(
    routeSource,
    /acceptMarketplaceSellerTerms/,
    "sanity check: the real route must still call acceptMarketplaceSellerTerms",
  );
  const formSource = readApp(SELL_FORM_PATH);
  assert.match(
    formSource,
    /fetch\(\s*["']\/api\/marketplace\/seller\/terms["']/,
    "must POST to /api/marketplace/seller/terms",
  );
});

test("SellForm.tsx does not render a fill-from-cert affordance or call a cert-lookup endpoint", () => {
  for (const source of [readApp(SELL_FORM_PATH), readApp(IDENTITY_PANEL_PATH)]) {
    assert.doesNotMatch(source, /fill from cert/i, "must not port the prototype's 'Fill from cert' button");
    assert.doesNotMatch(source, /fillFromCert/, "must not port the prototype's fillFromCert handler");
    assert.doesNotMatch(source, /cert-lookup|certLookup|lookupCert/i, "must not call a cert-lookup endpoint");
  }
});

test("SellForm.tsx / SellIdentityPanel.tsx keep a plain cert-number text input for graded cards", () => {
  const source = readApp(IDENTITY_PANEL_PATH);
  assert.match(source, /cert/i, "must still render a cert-number field for graded cards");
  assert.match(source, /Cert number/, "must render a 'Cert number' label");
  assert.match(source, /SellInput[\s\S]{0,120}fields\.cert/, "cert number must be a plain text SellInput bound to fields.cert");
});

test("SellForm.tsx does not leave any prototype cert-lookup network call behind", () => {
  const source = readApp(SELL_FORM_PATH);
  const certRelatedFetch = /fetch\([^)]*cert[^)]*\)/i;
  assert.doesNotMatch(source, certRelatedFetch, "must not fetch any cert-lookup endpoint");
});

test("SellForm.tsx validates the form before enabling submit, matching the prototype's gating rules", () => {
  const source = readApp(SELL_FORM_PATH);
  assert.match(source, /Add at least one photo/, "must require at least one photo before create-mode submit");
  assert.match(source, /Add a card name/, "must require a non-empty name");
  assert.match(source, /Add a series/, "must require a series");
  assert.match(source, /Set a price/, "must require price > 0");
  assert.match(source, /Select a grade/, "must require a grade when graded");
  assert.match(source, /Complete the form to list/, "invalid state must show the prototype's button copy");
});

test("SellForm.tsx supports edit mode via ?submission=ID prefill from the real GET detail route", () => {
  const detailRouteSource = readApp(SUBMISSION_DETAIL_ROUTE_PATH);
  assert.match(
    detailRouteSource,
    /getSellerSubmissionDetail/,
    "sanity check: the real per-submission GET route must still call getSellerSubmissionDetail",
  );
  const pageSource = readApp(SELLER_PAGE_PATH);
  assert.match(pageSource, /getSellerSubmissionDetail/, "seller page.tsx must call getSellerSubmissionDetail for edit-mode prefill");
  assert.match(pageSource, /searchParams/, "seller page.tsx must read searchParams for ?submission=ID");
  assert.match(pageSource, /\.submission\b/, "seller page.tsx must read the submission search param");
});

test("SellForm.tsx does not fabricate a PATCH/update contract that does not exist on the server", () => {
  const detailRouteSource = readApp(SUBMISSION_DETAIL_ROUTE_PATH);
  assert.doesNotMatch(
    detailRouteSource,
    /export\s+async\s+function\s+PATCH/,
    "sanity check: no PATCH handler exists on the per-submission route today",
  );
  const formSource = readApp(SELL_FORM_PATH);
  assert.doesNotMatch(
    formSource,
    /method:\s*["']PATCH["']/,
    "SellForm must not send a PATCH request — no such route exists on the server",
  );
});

test("submissions route.ts confirms the real POST contract SellForm's create request must match", () => {
  const source = readApp(SUBMISSIONS_ROUTE_PATH);
  assert.match(source, /createSellerSubmission/, "sanity check: POST handler must still call createSellerSubmission");
  assert.match(source, /SELLER_SUBMISSION_FIELDS/, "sanity check: POST handler must still allow exactly SELLER_SUBMISSION_FIELDS");
});

test("PhotoUploader.tsx keeps photo files client-side (object URLs) and reports add/remove to the parent", () => {
  const source = readApp(PHOTO_UPLOADER_PATH);
  assert.match(source, /URL\.createObjectURL/, "must preview photos via local object URLs, not upload immediately");
  assert.doesNotMatch(source, /fetch\(/, "PhotoUploader must not itself call fetch — uploads happen at submit time in SellForm");
  assert.match(source, /MAX_SELL_PHOTOS\s*=\s*10/, "must cap photos at 10");
});

test("SellForm.tsx reuses shared marketplace-ui primitives instead of rewriting them", () => {
  const source = readApp(SELL_FORM_PATH);
  assert.match(
    source,
    /from\s*["']\.\.\/shared\/MpPrimitives["']/,
    "must import shared primitives from ../shared/MpPrimitives",
  );
  for (const primitive of ["MpBtn", "MpPanel", "useToasts", "MpToasts"]) {
    assert.match(source, new RegExp(escapeRegExp(primitive)), `must reference the shared ${primitive} primitive`);
  }
  assert.match(source, /from\s*["']\.\.\/shared\/money["']/, "must import formatThb from ../shared/money");
});

test("no client component under marketplace-ui/sell imports a server-only marketplace lib directly", () => {
  const forbiddenModules = [
    "@/lib/marketplace/cart-watchlist",
    "@/lib/marketplace/listings",
    "@/lib/marketplace/payment-instructions",
    "@/lib/marketplace/seller-consignment",
    "@/lib/marketplace/account-bridge",
  ];
  for (const relPath of [
    SELL_FORM_PATH,
    IDENTITY_PANEL_PATH,
    SUMMARY_RAIL_PATH,
    PHOTO_UPLOADER_PATH,
    FORM_FIELDS_PATH,
  ]) {
    const source = readApp(relPath);
    for (const forbidden of forbiddenModules) {
      assert.doesNotMatch(
        source,
        new RegExp(`from\\s*["']${escapeRegExp(forbidden)}["']`),
        `${relPath} must not import server-only module ${forbidden}`,
      );
    }
    assert.doesNotMatch(source, /^import\s*["']server-only["']/m, `${relPath} must not import "server-only"`);
  }
});

test("no client component under marketplace-ui/sell imports @/lib/marketplace/money directly (client-safe money helper only)", () => {
  for (const relPath of [
    SELL_FORM_PATH,
    IDENTITY_PANEL_PATH,
    SUMMARY_RAIL_PATH,
    PHOTO_UPLOADER_PATH,
    FORM_FIELDS_PATH,
  ]) {
    const source = readApp(relPath);
    assert.doesNotMatch(
      source,
      /from\s*["']@\/lib\/marketplace\/money["']/,
      `${relPath} must format money via ../shared/money, not the server @/lib/marketplace/money module`,
    );
  }
});

test("sellFormTypes.ts stays framework-free (no server-only, no React/Next imports)", () => {
  const source = readApp(`${SELL_DIR}/sellFormTypes.ts`);
  assert.doesNotMatch(source, /["']use client["']/, "shared types module must not be a client component");
  assert.doesNotMatch(source, /from ["']@\/lib\//, "shared types module must not import server libs");
  assert.doesNotMatch(source, /from ["']react["']|from ["']next\//, "shared types module must stay framework-free");
});

test("create-submission response is read via the real RPC key (submissionId)", () => {
  const source = readApp(`${SELL_DIR}/SellForm.tsx`);
  // The create RPC returns { submissionId, ... } (not { id }); mock mode
  // returns row-shaped { id }. The form must accept the real key first.
  assert.match(source, /submission\?\.submissionId \?\? submission\?\.id/);
});
