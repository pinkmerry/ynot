import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const readOptional = (path) => {
  const url = new URL(path, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
};

const packageJson = JSON.parse(read("../package.json"));
const migration = readOptional(
  "../../Database/supabase/migrations/20260625120000_reward_fulfillment_policy.sql",
);
const adminCampaignRoute = read("../src/app/api/ynot/admin/campaigns/route.ts");
const prizeReadiness = read("../src/features/ynot/prize-readiness.ts");
const dataSource = read("../src/features/ynot/data.ts");
const typesSource = read("../src/features/ynot/types.ts");
const clientSource = read("../src/features/ynot/client.tsx");
const globalStyles = read("../src/app/globals.css");
const historyExperience = read("../src/features/ynot/cr/HistoryExperience.tsx");
const supabaseTypes = read("../src/lib/supabase/types.ts");
const localPreviewRewards = read("../src/features/ynot/local-preview-rewards.ts");
const previewPolicySmokeRoute = readOptional(
  "../src/app/api/dev/preview-policy-smoke/route.ts",
);

function stripSqlComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");
}

function compact(source) {
  return stripSqlComments(source).replace(/\s+/g, " ").toLowerCase();
}

function requirePattern(source, pattern, label) {
  assert.match(source, pattern, label);
}

function forbidPattern(source, pattern, label) {
  assert.doesNotMatch(source, pattern, label);
}

test("package exposes the focused reward fulfillment policy test", () => {
  assert.equal(
    packageJson.scripts["test:reward-fulfillment-policy"],
    "node --test scripts/test-reward-fulfillment-policy.mjs",
  );
});

test("database stores and snapshots reward fulfillment policy", () => {
  const sql = compact(migration);

  requirePattern(
    sql,
    /alter table public\.draw_round_prizes[\s\S]*add column if not exists fulfillment_policy text not null default 'ship_or_convert'/,
    "draw_round_prizes must store the admin-selected policy",
  );
  requirePattern(
    sql,
    /alter table public\.collection_items[\s\S]*add column if not exists fulfillment_policy_snapshot text not null default 'ship_or_convert'/,
    "collection_items must snapshot the policy at award time",
  );
  requirePattern(
    sql,
    /check \(fulfillment_policy in \('ship_or_convert', 'ship_only', 'convert_only'\)\)/,
    "draw_round_prizes must constrain policy values",
  );
  requirePattern(
    sql,
    /check \(fulfillment_policy_snapshot in \('ship_or_convert', 'ship_only', 'convert_only'\)\)/,
    "collection_items must constrain snapshot policy values",
  );
  requirePattern(
    sql,
    /create or replace function app_private\.snapshot_collection_fulfillment\(\)/,
    "collection item award path must freeze policy",
  );
  requirePattern(
    sql,
    /last_prize_metadata[\s\S]*fulfillmentpolicy/,
    "last prize metadata must carry fulfillmentPolicy",
  );
});

test("shipping and conversion RPCs enforce policy at the database boundary", () => {
  const sql = compact(migration);

  requirePattern(
    sql,
    /fulfillment_policy_snapshot in \('ship_or_convert', 'ship_only'\)/,
    "shipping must only include shippable rewards",
  );
  requirePattern(
    sql,
    /count\(\*\) filter \(where (?:ci\.)?fulfillment_policy_snapshot = 'ship_only'\)/,
    "shipping quote must identify ship-only rewards",
  );
  requirePattern(
    sql,
    /shipping_minimum_not_met/,
    "shipping must still reject normal low-value rewards",
  );
  requirePattern(
    sql,
    /fulfillment_policy_snapshot in \('ship_or_convert', 'convert_only'\)/,
    "conversion must only include convertible rewards",
  );
  requirePattern(
    sql,
    /collection_items_shipping_eligible_policy_idx/,
    "shipping needs a policy-aware partial index",
  );
  requirePattern(
    sql,
    /collection_items_conversion_eligible_policy_idx/,
    "conversion needs a policy-aware partial index",
  );
  requirePattern(
    sql,
    /fulfillment_policy_snapshot::text/,
    "quote hashes must include policy to catch drift",
  );
});

test("admin and collection surfaces use explicit policy instead of coin-value magic", () => {
  requirePattern(adminCampaignRoute, /FULFILLMENT_POLICIES/, "admin API must whitelist policies");
  requirePattern(adminCampaignRoute, /fulfillmentPolicy/, "admin API must accept fulfillmentPolicy");
  requirePattern(prizeReadiness, /normalizeRewardFulfillmentPolicy/, "prize drafts must normalize policy");
  requirePattern(typesSource, /YnotRewardFulfillmentPolicy/, "domain types must expose policy");
  requirePattern(dataSource, /fulfillment_policy_snapshot/, "collection presenter must read snapshot policy");
  requirePattern(dataSource, /fulfillmentPolicy/, "collection presenter must map policy");
  requirePattern(clientSource, /canShipReward/, "collection UI must centralize ship condition");
  requirePattern(clientSource, /canConvertReward/, "collection UI must centralize convert condition");
  requirePattern(clientSource, /Reward action/, "admin prize tables must expose reward action");
  requirePattern(clientSource, /lastPrizeFulfillmentPolicy/, "last prize must use an explicit policy selector");
  requirePattern(clientSource, /Ship only/, "collection UI must label ship-only rewards");
  requirePattern(clientSource, /Sell only/, "collection UI must label sell-only rewards");
  requirePattern(globalStyles, /admin-prize-policy-field/, "admin table must style the reward action column");
  requirePattern(
    globalStyles,
    /minmax\(140px,\s*0\.8fr\)/,
    "admin prize table grid must reserve a visible reward action column",
  );
  requirePattern(historyExperience, /item\.canConvert/, "card history collection must use canConvert");
  requirePattern(historyExperience, /item\.canShip/, "card history collection must use canShip");
  requirePattern(historyExperience, /rewardPolicyLabel/, "card history collection must label policy");
  requirePattern(historyExperience, /Ship only/, "card history collection must label ship-only rewards");
  requirePattern(historyExperience, /Sell only/, "card history collection must label sell-only rewards");
  forbidPattern(
    clientSource,
    /selectedShippingValue\s*>=\s*SHIPPING_REQUEST_MIN_COINS/,
    "shipping enablement must not rely only on selected coin value",
  );
});

test("supabase types include fulfillment policy columns", () => {
  requirePattern(
    supabaseTypes,
    /fulfillment_policy:\s*"ship_or_convert" \| "ship_only" \| "convert_only"/,
    "draw_round_prizes row type must include fulfillment_policy",
  );
  requirePattern(
    supabaseTypes,
    /fulfillment_policy_snapshot:\s*"ship_or_convert" \| "ship_only" \| "convert_only"/,
    "collection_items row type must include fulfillment_policy_snapshot",
  );
});

test("dev-only smoke pack covers every fulfillment policy", () => {
  requirePattern(
    previewPolicySmokeRoute,
    /isDevAuthAllowed/,
    "smoke pack seed route must stay behind the dev-auth gate",
  );
  requirePattern(
    previewPolicySmokeRoute,
    /seedPreviewRewardPolicySmokePack/,
    "smoke pack route must seed the preview pack through the local preview store",
  );
  requirePattern(
    localPreviewRewards,
    /Reward Policy Smoke Pack/,
    "preview store must create a named smoke pack source",
  );
  requirePattern(
    localPreviewRewards,
    /fulfillmentPolicy:\s*"ship_only"/,
    "smoke pack must include a ship-only reward",
  );
  requirePattern(
    localPreviewRewards,
    /fulfillmentPolicy:\s*"convert_only"/,
    "smoke pack must include a sell-only reward",
  );
  requirePattern(
    localPreviewRewards,
    /fulfillmentPolicy:\s*"ship_or_convert"/,
    "smoke pack must include a normal ship-or-sell reward",
  );
});
