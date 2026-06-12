import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const migration = read("../Database/supabase/migrations/20260607120000_live_pack_revisions_and_monitor.sql");
const campaignRoute = read("src/app/api/ynot/admin/campaigns/route.ts");
const revisionRoute = read("src/app/api/ynot/admin/campaigns/live-revisions/route.ts");
const client = read("src/features/ynot/client.tsx");
const migrationDir = new URL("../../Database/supabase/migrations/", import.meta.url);

function latestFunctionSource(functionName) {
  const definitions = [];
  for (const file of readdirSync(migrationDir).filter((name) => name.endsWith(".sql")).sort()) {
    const source = readFileSync(new URL(file, migrationDir), "utf8");
    const pattern = new RegExp(
      `create or replace function public\\.${functionName}\\([\\s\\S]*?\\n\\$\\$;`,
      "g",
    );
    for (const match of source.matchAll(pattern)) definitions.push(match[0]);
  }
  return definitions.at(-1) ?? "";
}

function latestMigrationContaining(needle) {
  const matches = readdirSync(migrationDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .filter((file) => readFileSync(new URL(file, migrationDir), "utf8").includes(needle));
  assert.ok(matches.length > 0, `expected a migration containing ${needle}`);
  return readFileSync(new URL(matches.at(-1), migrationDir), "utf8");
}

test("migration stages live edits and publishes through owner-reviewed RPC", () => {
  assert.match(migration, /create table if not exists public\.draw_round_live_revisions/);
  assert.match(migration, /create or replace function public\.publish_live_campaign_revision/);
  assert.match(migration, /public\.edit_live_campaign_inventory/);
  assert.match(migration, /live_revision_base_changed/);
  assert.match(migration, /is_active = true/);
  assert.doesNotMatch(migration, /and active = true/);
  assert.match(migration, /grant execute on function public\.publish_live_campaign_revision/);
});

test("live revision publish keeps CASE branches typed for uuid fields", () => {
  const publishFunction = latestFunctionSource("publish_live_campaign_revision");
  assert.match(publishFunction, /create or replace function public\.publish_live_campaign_revision/);
  assert.match(
    publishFunction,
    /seed_run_id = case[\s\S]*nullif\(revision\.scalar_patch->>'seed_run_id', ''\)::uuid[\s\S]*else campaign\.seed_run_id[\s\S]*end,/,
  );
  assert.doesNotMatch(
    publishFunction,
    /then nullif\(revision\.scalar_patch->>'seed_run_id', ''\)\s*\n\s*else campaign\.seed_run_id/,
  );
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

test("awarded Last Prize identity cannot be changed by live revisions", () => {
  const lockMigration = latestMigrationContaining("last_prize_identity_locked_after_award");

  assert.match(campaignRoute, /lastPrizePatchChangesAwardedIdentity/);
  assert.match(campaignRoute, /last_prize_awarded_at/);
  assert.match(campaignRoute, /LAST_PRIZE_IDENTITY_LOCKED/);
  assert.match(revisionRoute, /last_prize_identity_locked_after_award/);
  assert.match(lockMigration, /campaign\.last_prize_awarded_at is not null/);
  assert.match(lockMigration, /revision\.scalar_patch \? 'last_prize_card_id'/);
  assert.match(lockMigration, /revision\.scalar_patch \? 'last_prize_metadata'/);
  assert.match(lockMigration, /raise exception 'last_prize_identity_locked_after_award'/);
  assert.doesNotMatch(lockMigration, /open_gacha_campaign/);
});

test("live revision action route is owner-only and same-origin guarded", () => {
  assert.match(revisionRoute, /enforceSameOriginMutation/);
  assert.match(revisionRoute, /admin\.adminRole !== "owner"/);
  assert.match(revisionRoute, /publish_live_campaign_revision/);
  assert.match(revisionRoute, /save_logic/);
  assert.match(revisionRoute, /action === "save_logic" \|\| action === "approve"/);
  assert.match(
    revisionRoute,
    /const nextStatus = action === "approve" \? "approved" : "pending_review"/,
  );
  assert.match(revisionRoute, /from\("draw_rounds"\)[\s\S]*select\("logic_snapshot"\)/);
  assert.match(revisionRoute, /revision\.logic_snapshot \?\? campaign\.logic_snapshot/);
  assert.match(revisionRoute, /prize_snapshot/);
  assert.match(revisionRoute, /logic_snapshot/);
  assert.match(revisionRoute, /status:\s*nextStatus/);
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

test("admin live row surfaces owner review status before republish", () => {
  assert.match(client, /liveRevisionStatus/);
  assert.match(client, /Needs owner review/);
  assert.match(client, /Review & republish/);
  assert.match(client, /viewerRole === "owner"/);
  assert.match(client, /\/admin\/campaigns\/\$\{campaign\.id\}\/review/);
});

test("live revision review returns owner to the public monitor route after publish", () => {
  assert.match(client, /router\.replace\(`\/admin\/ynot\/live-packs\/\$\{campaign\.slug\}\/monitor`\)/);
});

test("live revision review reuses the random logic editor instead of the snapshot table", () => {
  const reviewPage = read("src/app/admin/campaigns/[id]/review/page.tsx");
  assert.doesNotMatch(reviewPage, /<LivePackRevisionReview/);
  assert.doesNotMatch(
    reviewPage,
    /import \{[^\n}]*LivePackRevisionReview[^\n}]*\} from "@\/features\/ynot\/client"/,
  );
  assert.match(reviewPage, /liveRevision=\{liveRevision\}/);
  assert.match(reviewPage, /prizes=\{liveRevision\.prizes\}/);
  assert.match(client, /liveRevision\?:\s*YnotLivePackRevisionReview \| null/);
  assert.match(client, /isLiveRevision/);
  assert.match(client, /\/api\/ynot\/admin\/campaigns\/live-revisions/);
  assert.match(client, /liveRevisionHasUnsavedChanges/);
  assert.match(client, /alreadyApproved && !liveRevisionHasUnsavedChanges/);
  assert.match(client, /!alreadyApproved \|\| liveRevisionHasUnsavedChanges/);
  assert.doesNotMatch(client, /Owner review snapshot/);
});
