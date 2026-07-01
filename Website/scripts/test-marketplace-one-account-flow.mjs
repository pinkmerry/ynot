#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(scriptPath), "..");
const marketplaceApiRoot = path.join(
  appRoot,
  "src/app/api/ynot/marketplace",
);

const mutationHandlerPattern =
  /^export\s+async\s+function\s+(POST|PATCH|PUT|DELETE)\b/m;

const identityFieldNames = [
  "marketplaceAccountId",
  "marketplace_account_id",
  "ynotProfileId",
  "ynot_profile_id",
  "buyerMarketplaceAccountId",
  "sellerMarketplaceAccountId",
  "buyerYnotProfileId",
  "sellerYnotProfileId",
  "buyer_ynot_profile_id",
  "seller_ynot_profile_id",
  "actorYnotProfileId",
  "actor_ynot_profile_id",
];
const identityFieldSet = new Set(identityFieldNames);
const identityFieldPattern = identityFieldNames.map(escapeRegExp).join("|");
const identityObjectFieldReadPattern = new RegExp(
  `\\b(?:body|form|fields|payload|input)\\s*\\.\\s*(?:${identityFieldPattern})\\b`,
);
const identityBracketFieldReadPattern = new RegExp(
  `\\b(?:body|form|fields|payload|input)\\s*\\[\\s*["'](?:${identityFieldPattern})["']\\s*\\]`,
);
const identityGetterReadPattern = new RegExp(
  `\\b(?:form|formData|searchParams|params|body|fields|payload|input)\\.get\\(\\s*["'](?:${identityFieldPattern})["']\\s*\\)`,
);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function read(relPath) {
  return fs.readFileSync(path.join(appRoot, relPath), "utf8");
}

function readAbsolute(absPath) {
  return fs.readFileSync(absPath, "utf8");
}

function assertAppearsBefore(source, beforePattern, afterPattern, label) {
  const before = source.search(beforePattern);
  const after = source.search(afterPattern);
  assert.ok(before >= 0, `${label}: missing ${beforePattern}`);
  assert.ok(after >= 0, `${label}: missing ${afterPattern}`);
  assert.ok(before < after, `${label}: expected rate limit before account read`);
}

function toRelPath(absPath) {
  return path.relative(appRoot, absPath).split(path.sep).join("/");
}

function walkRouteFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkRouteFiles(fullPath));
    } else if (entry.isFile() && entry.name === "route.ts") {
      files.push(fullPath);
    }
  }

  return files.sort();
}

function isExcludedMutationSurface(relPath) {
  // Privileged admin routes derive admin/owner authority, not customer ownership.
  if (relPath.includes("/admin/")) return true;
  // Provider webhooks are external system callbacks, not browser account actions.
  if (relPath.includes("/payments/webhook/")) return true;
  // Expiry jobs are scheduled/system maintenance, not user-owned mutations.
  if (relPath.includes("/checkout/pending-orders/expire/")) return true;
  return false;
}

function isQuoteOnlyMutationSurface(relPath) {
  // Quote-only preview: validates the current login but does not persist or fetch a marketplace account.
  return relPath === "src/app/api/ynot/marketplace/seller/payout-preview/route.ts";
}

function marketplaceMutationRoutes() {
  return walkRouteFiles(marketplaceApiRoot)
    .map((absPath) => {
      const relPath = toRelPath(absPath);
      return {
        absPath,
        relPath,
        source: readAbsolute(absPath),
      };
    })
    .filter(({ source }) => mutationHandlerPattern.test(source))
    .filter(({ relPath }) => !isExcludedMutationSurface(relPath));
}

function stringLiterals(source) {
  return [...source.matchAll(/["'`]([^"'`]+)["'`]/g)].map((match) => match[1]);
}

function findBalancedArrayAfter(source, startIndex) {
  const openIndex = source.indexOf("[", startIndex);
  if (openIndex === -1) return "";

  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === "[") depth += 1;
    if (char === "]") {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex, index + 1);
    }
  }

  return "";
}

function findConstArray(source, constName) {
  const declaration = new RegExp(
    `(?:export\\s+)?const\\s+${escapeRegExp(constName)}\\s*=`,
  );
  const match = declaration.exec(source);
  if (!match) return "";
  return findBalancedArrayAfter(source, match.index + match[0].length);
}

function resolveImportPath(currentAbsPath, specifier) {
  const candidates = [];

  if (specifier.startsWith("@/")) {
    candidates.push(path.join(appRoot, "src", specifier.slice(2)));
  } else if (specifier.startsWith(".")) {
    candidates.push(path.resolve(path.dirname(currentAbsPath), specifier));
  }

  for (const candidate of candidates) {
    for (const suffix of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
      const withSuffix = `${candidate}${suffix}`;
      if (fs.existsSync(withSuffix)) return withSuffix;
    }
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

function importedFieldConstants(source, currentAbsPath) {
  const imports = [];
  const importPattern = /import\s+{([^}]+)}\s+from\s+["']([^"']+)["']/g;

  for (const match of source.matchAll(importPattern)) {
    const [, specifiers, moduleSpecifier] = match;
    const modulePath = resolveImportPath(currentAbsPath, moduleSpecifier);
    if (!modulePath) continue;

    for (const specifier of specifiers.split(",")) {
      const importedName = specifier
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)[0]
        .trim();
      if (importedName.includes("FIELDS")) {
        imports.push({ name: importedName, modulePath });
      }
    }
  }

  return imports;
}

function allowedFieldLiterals(source, currentAbsPath) {
  const fields = [];

  for (const match of source.matchAll(/allowedFields\s*:\s*\[/g)) {
    fields.push(...stringLiterals(findBalancedArrayAfter(source, match.index)));
  }

  for (const match of source.matchAll(/\b([A-Z][A-Z0-9_]*FIELDS)\b/g)) {
    const arraySource = findConstArray(source, match[1]);
    if (arraySource) fields.push(...stringLiterals(arraySource));
  }

  for (const imported of importedFieldConstants(source, currentAbsPath)) {
    const moduleSource = readAbsolute(imported.modulePath);
    const arraySource = findConstArray(moduleSource, imported.name);
    if (arraySource) fields.push(...stringLiterals(arraySource));
  }

  return [...new Set(fields)];
}

function assertNoBrowserIdentityInput(route) {
  const allowedIdentityFields = allowedFieldLiterals(
    route.source,
    route.absPath,
  ).filter((field) => identityFieldSet.has(field));

  assert.deepEqual(
    allowedIdentityFields,
    [],
    `${route.relPath} must not allow browser-supplied marketplace/YNOT identity fields`,
  );

  assert.doesNotMatch(
    route.source,
    identityObjectFieldReadPattern,
    `${route.relPath} must not read browser-supplied marketplace/YNOT identity from object fields`,
  );
  assert.doesNotMatch(
    route.source,
    identityBracketFieldReadPattern,
    `${route.relPath} must not read browser-supplied marketplace/YNOT identity from bracket fields`,
  );
  assert.doesNotMatch(
    route.source,
    identityGetterReadPattern,
    `${route.relPath} must not read browser-supplied marketplace/YNOT identity from form/query input`,
  );
}

function assertCurrentUserPreparedMutation(route) {
  assert.match(
    route.source,
    /prepareMarketplaceMutation|resolveCurrentProfile/,
    `${route.relPath} must start from the current YNOT login`,
  );
}

function assertMarketplaceAccountDerivedIdentity(route) {
  assert.match(
    route.source,
    /ensureMarketplaceAccountForProfile|getMarketplaceAccountForProfile|mutation\.account|account\.accountId/,
    `${route.relPath} must derive marketplace/user ownership through a server-side marketplace account`,
  );
}

test("marketplace user mutation routes are discovered from route exports", () => {
  const routes = marketplaceMutationRoutes().map((route) => route.relPath);
  assert(routes.length > 0, "expected discovered marketplace mutation routes");
  assert(routes.includes("src/app/api/ynot/marketplace/cart/items/route.ts"));
  assert(routes.includes("src/app/api/ynot/marketplace/checkout/official/route.ts"));
  assert(!routes.some((route) => route.includes("/admin/")));
  assert(!routes.some((route) => route.includes("/payments/webhook/")));
});

test("marketplace user mutation routes derive actor identity from the current YNOT login", () => {
  for (const route of marketplaceMutationRoutes()) {
    assertCurrentUserPreparedMutation(route);
    assertNoBrowserIdentityInput(route);
    if (isQuoteOnlyMutationSurface(route.relPath)) {
      continue;
    }
    assertMarketplaceAccountDerivedIdentity(route);
  }
});

test("marketplace quote-only mutation routes stay login-bound without account lookup", () => {
  const quoteOnlyRoutes = marketplaceMutationRoutes().filter((route) =>
    isQuoteOnlyMutationSurface(route.relPath),
  );

  assert.deepEqual(
    quoteOnlyRoutes.map((route) => route.relPath),
    ["src/app/api/ynot/marketplace/seller/payout-preview/route.ts"],
  );

  for (const route of quoteOnlyRoutes) {
    assert.match(route.source, /prepareMarketplaceMutation/);
    assertNoBrowserIdentityInput(route);
    assert.doesNotMatch(
      route.source,
      /ensureMarketplaceAccountForProfile|getMarketplaceAccountForProfile/,
      `${route.relPath} is intentionally quote-only and should not need account persistence`,
    );
  }
});

test("identity input boundary checks cover direct fields and likely getter containers", () => {
  assert.match("const id = body.marketplaceAccountId;", identityObjectFieldReadPattern);
  assert.match("const id = input['actor_ynot_profile_id'];", identityBracketFieldReadPattern);
  assert.match("const id = form.get('sellerYnotProfileId');", identityGetterReadPattern);
  assert.match("const id = params.get(\"buyer_ynot_profile_id\");", identityGetterReadPattern);
  assert.doesNotMatch("const item = params.get('listingId');", identityGetterReadPattern);
});

test("customer marketplace pages keep one-site UX language", () => {
  const layout = read("src/app/(store)/marketplace/layout.tsx");
  const cart = read("src/app/(store)/marketplace/cart/page.tsx");
  const orders = read("src/app/(store)/marketplace/orders/page.tsx");
  assert.doesNotMatch(
    layout + cart + orders,
    /create a marketplace account|sign up for marketplace|second account/i,
  );
  assert.match(layout + cart + orders, /marketplace/i);
});

test("marketplace admin remains a marketplace surface without exposing private payment data", () => {
  const adminPage = read("src/app/admin/marketplace/page.tsx");
  assert.match(adminPage, /surface="marketplace"/);
  assert.doesNotMatch(
    adminPage,
    /provider_response|proof_storage_path|buyer_marketplace_account_id|seller_marketplace_account_id/i,
  );
});

test("marketplace actor context is read-only and does not replace mutation guard", () => {
  const actorContext = read("src/lib/marketplace/actor-context.ts");
  const mutationGuard = read("src/lib/marketplace/mutation-guard.ts");

  assert.match(actorContext, /resolveCurrentProfile/);
  assert.match(
    actorContext,
    /getMarketplaceAccountForProfile/,
  );
  assert.doesNotMatch(
    actorContext,
    /enforceSameOriginMutation|marketplaceIdempotencyKey|readMarketplaceJsonBody|idempotencyKey|requestHash|ensureMarketplaceAccountForProfile/,
  );
  assert.match(mutationGuard, /enforceSameOriginMutation/);
  assert.match(mutationGuard, /marketplaceIdempotencyKey/);
  assert.match(mutationGuard, /readMarketplaceJsonBody/);

  for (const route of marketplaceMutationRoutes()) {
    assert.match(
      route.source,
      /prepareMarketplaceMutation/,
      `${route.relPath} must keep the marketplace mutation guard`,
    );
    assert.doesNotMatch(
      route.source,
      /getMarketplaceActorContext/,
      `${route.relPath} must not replace the mutation guard with read-only actor context`,
    );
  }
});

test("marketplace read routes rate-limit before marketplace account reads", () => {
  for (const relPath of [
    "src/app/api/ynot/marketplace/account/me/route.ts",
    "src/app/api/ynot/marketplace/orders/route.ts",
    "src/app/api/ynot/marketplace/cart/route.ts",
  ]) {
    const source = read(relPath);
    assert.match(source, /getMarketplaceActorContext/);
    assert.match(source, /enforceRateLimit/);
    assert.doesNotMatch(
      source,
      /requireAccount:\s*true/,
      `${relPath} must not load marketplace accounts before route-level rate limits`,
    );
    assertAppearsBefore(
      source,
      /enforceRateLimit\(/,
      /getMarketplaceActorAccount\(/,
      relPath,
    );
  }
});

test("marketplace storefront entry points stay owner-only during gated launch", () => {
  const storePreferences = read("src/features/ynot/StorePreferences.tsx");
  assert.match(
    storePreferences,
    /key:\s*"marketplace"[\s\S]*ownerOnly:\s*true/,
    "storefront nav marketplace item must be owner-only, not just admin-only",
  );
  assert.match(storePreferences, /canRenderCustomerNavItem/);
  assert.match(storePreferences, /isOwner/);

  const home = read("src/features/ynot/components.tsx");
  assert.match(home, /const showMarketplace = data\.viewer\.adminRole === "owner"/);
  assert.match(home, /<SeriesEssentialsSection showMarketplace=\{showMarketplace\} \/>/);
  assert.match(
    home,
    /\{showMarketplace \? \([\s\S]*href="\/marketplace"[\s\S]*\) : null\}/,
    "home essentials marketplace card must render only for owners",
  );

  const collectionPanel = read("src/features/ynot/client.tsx");
  assert.match(collectionPanel, /showMarketplace\?: boolean/);
  assert.match(
    collectionPanel,
    /\{showMarketplace \? \([\s\S]*className="collection-marketplace-separation"[\s\S]*\) : null\}/,
    "collection marketplace explanation must render only for owners",
  );

  const exchangePage = read("src/app/(store)/exchange/page.tsx");
  assert.match(
    exchangePage,
    /showMarketplace=\{data\.viewer\.adminRole === "owner"\}/,
  );

  const collectionPage = read("src/app/(store)/collection/page.tsx");
  const profilePage = read("src/app/(store)/profile/page.tsx");
  assert.match(collectionPage, /viewerRole=\{data\.viewer\.adminRole\}/);
  assert.match(profilePage, /viewerRole=\{data\.viewer\.adminRole\}/);

  const history = read("src/features/ynot/cr/HistoryExperience.tsx");
  assert.match(history, /viewerRole\?: YnotViewer\["adminRole"\]/);
  assert.match(history, /const showMarketplace = viewerRole === "owner"/);
  assert.match(
    history,
    /if \(!showMarketplace\) \{[\s\S]*setMarketplaceSummaryState\("unavailable"\);[\s\S]*return;/,
    "history page must skip marketplace summary calls for non-owners",
  );
  assert.match(
    history,
    /\{showMarketplace \? \([\s\S]*<I18nText en="Marketplace" th="ตลาด" \/>[\s\S]*\) : null\}/,
    "history marketplace tab must render only for owners",
  );

  const adminShell = read("src/features/ynot/admin/Shell.tsx");
  assert.match(adminShell, /AdminSurfaceSwitch\(\{[\s\S]*isOwner/);
  assert.match(adminShell, /item\.surface !== "marketplace"/);
  assert.match(adminShell, /!item\.href\.startsWith\("\/marketplace"\)/);
});
