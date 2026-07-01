import assert from "node:assert/strict";
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appRoot, "..");
const migrationPath = path.join(
  repoRoot,
  "Database/marketplace-supabase/migrations/20260628090000_marketplace_foundation.sql",
);
const coreMigrationPath = path.join(
  repoRoot,
  "Database/supabase/migrations/20260628090000_marketplace_foundation.sql",
);

function readApp(relPath) {
  return readFileSync(path.join(appRoot, relPath), "utf8");
}

function readRepo(relPath) {
  return readFileSync(path.join(repoRoot, relPath), "utf8");
}

function stripSqlComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
}

function compactSql(source) {
  return stripSqlComments(source).replace(/\s+/g, " ").toLowerCase();
}

function requirePattern(source, pattern, label) {
  assert.match(source, pattern, label);
}

function assertCentralMutationGuard(source, relPath) {
  const mutationGuard = readApp("src/lib/marketplace/mutation-guard.ts");
  assert.match(source, /prepareMarketplaceMutation/, `${relPath} must use the centralized mutation guard`);
  assert.match(mutationGuard, /resolveCurrentProfile/, "central mutation guard must resolve YNOTT login");
  assert.match(mutationGuard, /ownerOnlyMarketplaceAccess/, "central mutation guard must keep owner-only prelaunch gate");
  assert.match(mutationGuard, /enforceSameOriginMutation/, "central mutation guard must enforce same origin");
  assert.match(mutationGuard, /enforceRateLimit/, "central mutation guard must rate-limit");
  assert.match(mutationGuard, /marketplaceIdempotencyKey/, "central mutation guard must require idempotency by default");
  assert.match(mutationGuard, /readMarketplaceJsonBody/, "central mutation guard must use JSON allowlists");
  assert.match(mutationGuard, /marketplaceRequestHash/, "central mutation guard must hash requests");
}

function migrationSource() {
  return readFileSync(migrationPath, "utf8");
}

function walkFiles(root, predicate = () => true) {
  const files = [];
  const pending = [root];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    const stat = statSync(current);
    if (stat.isDirectory()) {
      const basename = path.basename(current);
      if (
        basename === "node_modules" ||
        basename === ".next" ||
        basename === ".open-next" ||
        basename === ".wrangler"
      ) {
        continue;
      }
      for (const entry of readdirSync(current)) pending.push(path.join(current, entry));
      continue;
    }
    if (stat.isFile() && predicate(current)) files.push(current);
  }

  return files;
}

test("package exposes the scoped marketplace foundation test script", () => {
  const packageJson = JSON.parse(readApp("package.json"));
  assert.equal(
    packageJson.scripts["test:marketplace-foundation"],
    "node --test scripts/test-marketplace-foundation.mjs",
  );
});

test("marketplace foundation migration defines Slice 1 account, inventory, snapshot, audit, and idempotency schema", () => {
  assert.ok(existsSync(migrationPath), "missing marketplace foundation migration");
  assert.ok(
    !existsSync(coreMigrationPath),
    "marketplace migration must not live in the core YNOTT Supabase stream",
  );
  assert.ok(
    existsSync(path.join(repoRoot, "Database/marketplace-supabase/config.toml")),
    "marketplace Supabase project must have its own config root",
  );
  const sql = compactSql(migrationSource());

  for (const table of [
    "marketplace_accounts",
    "marketplace_idempotency_keys",
    "marketplace_audit_events",
    "marketplace_inventory_sources",
    "marketplace_inventory_items",
    "marketplace_listing_snapshots",
  ]) {
    requirePattern(
      sql,
      new RegExp(`create table if not exists public\\.${table}\\b`),
      `missing ${table}`,
    );
    requirePattern(
      sql,
      new RegExp(`alter table public\\.${table} enable row level security`),
      `${table} must enable RLS`,
    );
  }

  requirePattern(
    sql,
    /ynot_profile_id uuid not null/,
    "marketplace account must store the server-resolved YNOTT profile id",
  );
  requirePattern(
    sql,
    /unique\s*\(ynot_profile_id\)/,
    "marketplace account must be unique by ynot_profile_id",
  );
  requirePattern(
    sql,
    /source_kind text not null check \(source_kind in \('official_stock', 'seller_consignment', 'marketplace_purchase'\)\)/,
    "inventory source_kind must allow only marketplace-owned sources",
  );
  requirePattern(
    sql,
    /foreign key \(inventory_source_id, source_kind\) references public\.marketplace_inventory_sources\(id, source_kind\)/,
    "inventory items must reference marketplace-owned source rows",
  );
  assert.doesNotMatch(sql, /source_ref/, "source_ref string guards are bypassable");
  assert.doesNotMatch(
    sql,
    /source_kind[^;]*'gacha'|source_kind[^;]*'customer_bag'|source_kind[^;]*'reward'/,
    "source_kind must not admit gacha, customer_bag, or reward values",
  );
  requirePattern(
    sql,
    /unique index if not exists marketplace_listing_snapshots_one_open_per_inventory_idx/,
    "listing snapshots must prevent duplicate active or pending listings per inventory item",
  );
});

test("marketplace foundation RPCs are service-role only and audit account creation plus seller terms acceptance", () => {
  const sql = compactSql(migrationSource());

  for (const rpc of [
    "marketplace_get_or_create_account",
    "marketplace_accept_seller_terms",
  ]) {
    requirePattern(
      sql,
      new RegExp(`create or replace function public\\.${rpc}\\b`),
      `missing ${rpc}`,
    );
    requirePattern(
      sql,
      new RegExp(`security definer[\\s\\S]*set search_path = public`),
      `${rpc} must use a locked search_path`,
    );
    requirePattern(
      sql,
      new RegExp(`revoke all on function public\\.${rpc}[\\s\\S]*from public, anon, authenticated`),
      `${rpc} must revoke public execution`,
    );
    requirePattern(
      sql,
      new RegExp(`grant execute on function public\\.${rpc}[\\s\\S]*to service_role`),
      `${rpc} must grant execution only to service_role`,
    );
  }

  requirePattern(
    sql,
    /marketplace_account_ensured/,
    "account ensure must write an audit event",
  );
  requirePattern(
    sql,
    /marketplace_seller_terms_accepted/,
    "seller terms acceptance must write an audit event",
  );
  requirePattern(
    sql,
    /marketplace_idempotency_conflict/,
    "state-changing marketplace RPCs must reject conflicting idempotency replay",
  );
  requirePattern(
    sql,
    /seller_terms\.accept/,
    "seller terms acceptance must use idempotency scope",
  );
});

test("marketplace server modules and routes are server-only, fail closed, and reuse YNOTT auth/security seams", () => {
  for (const relPath of [
    "src/lib/marketplace/config.ts",
    "src/lib/marketplace/supabase-adapter.ts",
    "src/lib/marketplace/account-bridge.ts",
    "src/lib/marketplace/actor-context.ts",
    "src/lib/marketplace/route-guards.ts",
    "src/lib/marketplace/request-guard.ts",
    "src/lib/marketplace/inventory-source-guard.ts",
    "src/lib/marketplace/money.ts",
    "src/app/api/marketplace/account/me/route.ts",
    "src/app/api/marketplace/account/ensure/route.ts",
    "src/app/api/ynot/marketplace/account/me/route.ts",
    "src/app/api/ynot/marketplace/account/ensure/route.ts",
  ]) {
    assert.ok(existsSync(path.join(appRoot, relPath)), `missing ${relPath}`);
  }

  const config = readApp("src/lib/marketplace/config.ts");
  assert.match(config, /import "server-only"/);
  assert.match(config, /MARKETPLACE_ENVIRONMENT/);
  assert.match(config, /MARKETPLACE_EXPECTED_SUPABASE_PROJECT_REF/);
  assert.match(config, /MARKETPLACE_SUPABASE_URL/);
  assert.match(config, /MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(config, /supabaseUrlProjectRef/);
  assert.match(config, /projectRefFromUrl\(supabaseUrl\)/);
  assert.match(config, /input\.supabaseProjectRef &&/);
  assert.match(
    config,
    /input\.supabaseProjectRef !== input\.supabaseUrlProjectRef/,
  );
  assert.match(config, /marketplace_supabase_project_ref_mismatch/);
  assert.doesNotMatch(config, /NEXT_PUBLIC_MARKETPLACE/i);

  const adapter = readApp("src/lib/marketplace/supabase-adapter.ts");
  assert.match(adapter, /import "server-only"/);
  assert.match(adapter, /createClient/);
  assert.match(adapter, /MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY/);

  const bridge = readApp("src/lib/marketplace/account-bridge.ts");
  assert.match(bridge, /import "server-only"/);
  assert.match(bridge, /marketplace_get_or_create_account/);
  assert.match(bridge, /marketplace_accept_seller_terms/);
  assert.match(bridge, /p_idempotency_key/);
  assert.match(bridge, /p_request_hash/);
  assert.match(bridge, /ResolvedProfileSession/);

  const actorContext = readApp("src/lib/marketplace/actor-context.ts");
  assert.match(actorContext, /import "server-only"/);
  assert.match(actorContext, /resolveCurrentProfile/);
  assert.match(actorContext, /getMarketplaceAccountForProfile/);
  assert.match(actorContext, /customerMarketplaceAccess/);
  assert.match(actorContext, /ownerOnlyMarketplaceAccess/);
  assert.match(actorContext, /getMarketplaceActorContext/);
  assert.match(actorContext, /getMarketplaceActorAccount/);

  const meRoute = readApp("src/app/api/ynot/marketplace/account/me/route.ts");
  assert.match(meRoute, /getMarketplaceActorContext/);
  assert.match(meRoute, /getMarketplaceActorAccount/);
  assert.match(meRoute, /safeMarketplaceAccountResponse/);
  assert.match(meRoute, /enforceRateLimit/);

  const ensureRoute = readApp("src/app/api/ynot/marketplace/account/ensure/route.ts");
  assertCentralMutationGuard(ensureRoute, "src/app/api/ynot/marketplace/account/ensure/route.ts");
  assert.match(ensureRoute, /allowedFields: \[\]/);
  assert.match(ensureRoute, /mutation\.requestHash\("account\.ensure"\)/);
  assert.match(ensureRoute, /ensureMarketplaceAccountForProfile/);
  assert.match(ensureRoute, /request_id/);

  const requestGuard = readApp("src/lib/marketplace/request-guard.ts");
  assert.match(requestGuard, /MAX_MARKETPLACE_JSON_BODY_BYTES = 4096/);
  assert.match(requestGuard, /content-length/);
  assert.match(requestGuard, /marketplace_body_too_large/);
  assert.match(requestGuard, /content-type/);

  assert.match(adapter, /SAFE_RPC_ERRORS/);
  assert.match(adapter, /const safeCode = SAFE_RPC_ERRORS\[code\]/);
  assert.match(adapter, /safeCode \?\? "marketplace_request_failed"/);
  assert.match(adapter, /safe\?\.message \?\? "Marketplace request failed\."/);
  assert.doesNotMatch(adapter, /message,\n\s*message\.includes/);

  const canonicalMeRoute = readApp("src/app/api/marketplace/account/me/route.ts");
  const canonicalEnsureRoute = readApp(
    "src/app/api/marketplace/account/ensure/route.ts",
  );
  assert.match(canonicalMeRoute, /api\/ynot\/marketplace\/account\/me\/route/);
  assert.match(
    canonicalEnsureRoute,
    /api\/ynot\/marketplace\/account\/ensure\/route/,
  );
});

test("marketplace page exposes owner-only account status without coin placeholders", () => {
  const page = readApp("src/app/(store)/marketplace/page.tsx");
  assert.match(page, /resolveCurrentProfile/);
  assert.match(page, /resolveAdminSession/);
  assert.match(page, /admin\?\.adminRole === "owner"/);
  assert.match(page, /getMarketplaceAccountForProfile/);
  assert.match(page, /safeMarketplaceAccountResponse/);
  assert.doesNotMatch(
    page,
    /if \(!viewer\.isAdmin && !isDevAuthAllowed\(\)\)/,
    "marketplace page must not use the old broad admin-only gate",
  );
  assert.doesNotMatch(
    page,
    /config\.ownerOnly \?[^:]+:\s*viewer\.isAdmin/s,
    "marketplace page must allow signed-in users when owner-only mode is disabled",
  );

  const components = readApp("src/features/ynot/components.tsx");
  assert.match(components, /marketplace-masthead/);
  assert.match(components, /marketplace-masthead-actions/);
  assert.match(components, /marketplace-market-snapshot/);
  assert.match(components, /\/marketplace\/cart/);
  assert.match(components, /\/marketplace\/watchlist/);
  assert.match(components, /\/marketplace\/seller/);
  assert.match(components, /marketplaceThb/);
  assert.match(components, /item_price_satang/);
  assert.doesNotMatch(
    components,
    /marketplace-card-price[^]*<CoinIcon \/> 0/,
    "marketplace cards must not use coin-style zero price placeholders",
  );
});

test("browser-facing marketplace code does not expose service-role env names", () => {
  const leaked = [];
  const serviceRoleName = /MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SERVICE_ROLE_KEY/g;
  const publicMarketplaceEnv = /NEXT_PUBLIC_[A-Z0-9_]*MARKETPLACE[A-Z0-9_]*/g;
  const allowedServerOnly = new Set([
    "src/lib/marketplace/config.ts",
    "src/lib/marketplace/supabase-adapter.ts",
  ]);

  for (const absPath of walkFiles(path.join(appRoot, "src"), (file) =>
    /\.(?:ts|tsx|js|jsx)$/.test(file),
  )) {
    const relPath = path.relative(appRoot, absPath).replaceAll(path.sep, "/");
    const source = readFileSync(absPath, "utf8");
    const isServerOnly = source.includes('import "server-only"') || source.includes("import 'server-only'");
    if (!allowedServerOnly.has(relPath) && !isServerOnly && serviceRoleName.test(source)) {
      leaked.push(`${relPath}: service-role env reference`);
    }
    serviceRoleName.lastIndex = 0;
    if (publicMarketplaceEnv.test(source)) {
      leaked.push(`${relPath}: NEXT_PUBLIC marketplace env reference`);
    }
    publicMarketplaceEnv.lastIndex = 0;
  }

  assert.deepEqual(leaked, []);
});

test("customer bag plan keeps marketplace activity separate from gacha rewards", () => {
  const doc = readRepo("Website/docs/plans/marketplace/08-mvp-function-list-and-release-plan.md");
  assert.match(doc, /Customer Bag `Marketplace` section composed separately from `Gacha Rewards`/);
  assert.match(doc, /Hard rejection of Customer Bag\/gacha reward IDs as Marketplace Inventory/);
  assert.match(doc, /`Gacha Rewards` and `Marketplace` actions stay separate/);

  const client = readApp("src/features/ynot/client.tsx");
  assert.match(client, /collection-marketplace-separation/);
  assert.match(client, /Gacha Rewards/);
  assert.match(client, /Rewards in this bag cannot become marketplace listings/);
  assert.match(client, /Physical consignment only/);
  assert.doesNotMatch(
    client,
    /collectionItemIds[^]*marketplace\/seller\/submissions/,
    "customer bag rewards must not be submitted to marketplace seller routes",
  );
});
