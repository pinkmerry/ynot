import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const migration = read("../Database/supabase/migrations/20260607120000_live_pack_revisions_and_monitor.sql");
const campaignRoute = read("src/app/api/ynot/admin/campaigns/route.ts");
const revisionRoute = read("src/app/api/ynot/admin/campaigns/live-revisions/route.ts");
const client = read("src/features/ynot/client.tsx");

test("migration stages live edits and publishes through owner-reviewed RPC", () => {
  assert.match(migration, /create table if not exists public\.draw_round_live_revisions/);
  assert.match(migration, /create or replace function public\.publish_live_campaign_revision/);
  assert.match(migration, /public\.edit_live_campaign_inventory/);
  assert.match(migration, /live_revision_base_changed/);
  assert.match(migration, /is_active = true/);
  assert.doesNotMatch(migration, /and active = true/);
  assert.match(migration, /grant execute on function public\.publish_live_campaign_revision/);
});

test("live campaign PATCH creates a pending revision instead of editing live inventory", () => {
  const liveBranch = campaignRoute.match(
    /if \(current\.status === "live"\) \{[\s\S]*?return Response\.json\(\{[\s\S]*?requiresOwnerReview: true,[\s\S]*?\}\);[\s\S]*?\n  \}/,
  )?.[0] ?? "";
  assert.match(liveBranch, /createLivePackRevision/);
  assert.match(liveBranch, /requiresOwnerReview: true/);
  assert.doesNotMatch(liveBranch, /edit_live_campaign_inventory/);
  assert.match(campaignRoute, /preserveLivePrizeSensitiveFields/);
  assert.match(campaignRoute, /\$\{prize\.tier\}:\$\{prize\.rank\}/);
  assert.doesNotMatch(campaignRoute, /cardId:rank/);
});

test("live revision action route is owner-only and same-origin guarded", () => {
  assert.match(revisionRoute, /enforceSameOriginMutation/);
  assert.match(revisionRoute, /admin\.adminRole !== "owner"/);
  assert.match(revisionRoute, /publish_live_campaign_revision/);
  assert.match(revisionRoute, /action === "approve"/);
  assert.match(revisionRoute, /"reject" \| "publish"/);
  assert.match(revisionRoute, /actionValue/);
});

test("admin live row exposes monitor and edit revision actions", () => {
  assert.match(client, /href=\{`\/admin\/ynot\/live-packs\/\$\{campaign\.slug\}\/monitor`\}/);
  assert.match(client, />\s*Monitor\s*</);
  assert.match(client, />\s*Edit live pack\s*</);
  assert.doesNotMatch(client, /changes apply immediately and re-materialize stock/);
});
