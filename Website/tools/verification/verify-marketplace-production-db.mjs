#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = process.cwd();
const failures = [];
const warnings = [];

function loadEnvFile(file) {
  const path = resolve(root, file);
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue
      .trim()
      .replace(/^['"]|['"]$/g, "")
      .replace(/\\n/g, "\n");
  }
}

function readJson(rel) {
  return JSON.parse(readFileSync(resolve(root, rel), "utf8"));
}

function pass(message) {
  console.log(`PASS ${message}`);
}

function warn(message) {
  warnings.push(message);
  console.warn(`WARN ${message}`);
}

function fail(message) {
  failures.push(message);
  console.error(`FAIL ${message}`);
}

function check(message, condition, detail) {
  if (condition) pass(message);
  else fail(`${message}${detail ? ` — ${detail}` : ""}`);
}

function envOrVar(name, vars) {
  const value = process.env[name]?.trim() || vars?.[name]?.trim();
  return value || null;
}

function projectRefFromUrl(value) {
  if (!value) return null;
  try {
    return new URL(value).hostname.split(".")[0] || null;
  } catch {
    return null;
  }
}

function allowCoreDatabaseOverride() {
  const value = process.env.YNOT_ALLOW_CORE_MARKETPLACE_SUPABASE?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const marketplaceConfig = readJson("wrangler.marketplace.jsonc");
const websiteConfig = readJson("wrangler.website.jsonc");
const marketplaceVars = marketplaceConfig.vars ?? {};
const websiteVars = websiteConfig.vars ?? {};

const marketplaceUrl = envOrVar("MARKETPLACE_SUPABASE_URL", marketplaceVars);
const marketplaceKey = process.env.MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY?.trim() || null;
const marketplaceProjectRef = envOrVar("MARKETPLACE_SUPABASE_PROJECT_REF", marketplaceVars);
const expectedProjectRef = envOrVar(
  "MARKETPLACE_EXPECTED_SUPABASE_PROJECT_REF",
  marketplaceVars,
);
const coreUrl = envOrVar("NEXT_PUBLIC_SUPABASE_URL", websiteVars);
const marketplaceUrlRef = projectRefFromUrl(marketplaceUrl);
const coreRef = projectRefFromUrl(coreUrl);

check("Marketplace Supabase URL is configured", Boolean(marketplaceUrl));
check(
  "Marketplace service-role key is provided by environment",
  Boolean(marketplaceKey),
  "MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY must be an environment secret, not a checked-in var",
);
check("Marketplace Supabase project ref is configured", Boolean(marketplaceProjectRef));
check("Marketplace expected project ref is configured", Boolean(expectedProjectRef));
check(
  "Marketplace Supabase URL is a Supabase project URL",
  typeof marketplaceUrl === "string" &&
    /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(marketplaceUrl),
);
check(
  "Marketplace URL ref matches configured project ref",
  Boolean(marketplaceUrlRef && marketplaceProjectRef && marketplaceUrlRef === marketplaceProjectRef),
);
check(
  "Marketplace project ref matches expected ref",
  Boolean(marketplaceProjectRef && expectedProjectRef && marketplaceProjectRef === expectedProjectRef),
);

if (marketplaceUrlRef && coreRef && marketplaceUrlRef === coreRef) {
  if (allowCoreDatabaseOverride()) {
    warn(
      "Marketplace Supabase ref matches core YNOT ref because YNOT_ALLOW_CORE_MARKETPLACE_SUPABASE is enabled",
    );
  } else {
    fail(
      "Marketplace Supabase ref must not match core YNOT ref. Create/link the dedicated marketplace Supabase project or set YNOT_ALLOW_CORE_MARKETPLACE_SUPABASE only for an explicit emergency deploy.",
    );
  }
}

if (failures.length) {
  console.error(`\nMarketplace production DB verification stopped before probing (${failures.length} blocker(s)).`);
  process.exit(1);
}

const supabase = createClient(marketplaceUrl, marketplaceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function checkTable(table, select = "*") {
  const { error } = await supabase.from(table).select(select).limit(1);
  check(
    `table ${table} is available`,
    !error,
    error ? `${error.code ?? "UNKNOWN"} ${error.message}` : undefined,
  );
}

async function checkRpc(name, args = {}) {
  const { error } = await supabase.rpc(name, args);
  const missing =
    error &&
    (error.code === "PGRST202" ||
      /Could not find the function|schema cache/i.test(error.message));
  check(
    `rpc ${name} is available`,
    !missing,
    error ? `${error.code ?? "UNKNOWN"} ${error.message}` : undefined,
  );
}

console.log(`Marketplace production DB project ref: ${marketplaceUrlRef}`);

await checkTable("marketplace_accounts");
await checkTable("marketplace_public_listing_snapshots");
await checkTable("marketplace_products");
await checkTable("marketplace_orders");
await checkTable("marketplace_pending_payment_orders");
await checkTable("marketplace_seller_submissions");
await checkTable("marketplace_money_policies");
await checkTable("api_rate_limits", "key");

await checkRpc("marketplace_get_active_money_policy");
await checkRpc("marketplace_browse_product_markets", {
  p_source: null,
  p_item_type: null,
  p_q: null,
  p_condition: null,
  p_grade: null,
  p_sort: "recommended",
  p_limit: 1,
});
await checkRpc("marketplace_browse_filter_counts");
await checkRpc("consume_api_rate_limit_weighted", {
  p_key: `marketplace-production-probe:${Date.now()}`,
  p_limit: 5,
  p_window_seconds: 1,
  p_cost: 1,
});

if (failures.length) {
  console.error(`\nMarketplace production DB verification failed with ${failures.length} blocker(s).`);
  if (warnings.length) console.error(`${warnings.length} warning(s) also reported.`);
  process.exit(1);
}

console.log("\nMarketplace production DB verification passed.");
if (warnings.length) console.log(`${warnings.length} warning(s) reported.`);
