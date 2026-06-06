import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const migration = read("../Database/supabase/migrations/20260607120000_live_pack_revisions_and_monitor.sql");
const client = read("src/features/ynot/client.tsx");
const route = read("src/app/api/ynot/admin/campaigns/[id]/monitor/route.ts");
const page = read("src/app/admin/campaigns/[id]/monitor/page.tsx");

test("monitor RPC returns compact manual dashboard data without house fields", () => {
  const monitorFunction = migration.match(
    /create or replace function public\.get_live_pack_monitor[\s\S]*?grant execute on function public\.get_live_pack_monitor/,
  )?.[0] ?? "";
  assert.match(monitorFunction, /plannedWins/);
  assert.match(monitorFunction, /leftWins/);
  assert.match(monitorFunction, /outWins/);
  assert.match(monitorFunction, /customerLabel/);
  assert.match(monitorFunction, /pendingRevision/);
  assert.match(monitorFunction, /array_agg\(unit\.profile_id order by unit\.awarded_at desc nulls last\)/);
  assert.doesNotMatch(monitorFunction, /min\(unit\.profile_id\)/);
  for (const forbidden of [
    /email/i,
    /phone/i,
    /address/i,
    /line_user_id/i,
    /cert_number/i,
    /gemrate_id/i,
    /weight/i,
    /unlock_at_sold_pct/i,
    /value_thb/i,
    /draw_round_prize_unit_id/i,
  ]) {
    assert.doesNotMatch(monitorFunction, forbidden);
  }
});

test("monitor route and page load only on demand", () => {
  assert.match(route, /getLivePackMonitor/);
  assert.match(route, /enforceRateLimit/);
  assert.match(page, /getLivePackMonitor/);
  assert.match(page, /<LivePackMonitor/);
});

test("monitor client has manual refresh and no polling transports", () => {
  const monitorBlock = client.match(/function LivePackMonitor[\s\S]*?function liveRevisionPatchEntries/)?.[0] ?? "";
  assert.match(monitorBlock, /function refresh\(/);
  assert.match(monitorBlock, /cache: "no-store"/);
  assert.match(monitorBlock, /\{refreshing \? "Refreshing\.\.\." : "Refresh"\}/);
  assert.doesNotMatch(monitorBlock, /setInterval/);
  assert.doesNotMatch(monitorBlock, /EventSource/);
  assert.doesNotMatch(monitorBlock, /channel\(/);
  for (const forbidden of [
    /weight/i,
    /unlockAtSoldPct/i,
    /cert/i,
    /gemrate/i,
    /email/i,
    /phone/i,
    /address/i,
  ]) {
    assert.doesNotMatch(monitorBlock, forbidden);
  }
});
