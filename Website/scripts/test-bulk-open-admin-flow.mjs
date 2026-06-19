import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(rel) {
  return readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
}

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing start marker: ${start}`);
  const endIndex = end ? source.indexOf(end, startIndex + start.length) : -1;
  if (end) assert.notEqual(endIndex, -1, `Missing end marker: ${end}`);
  return source.slice(startIndex, endIndex >= 0 ? endIndex : undefined);
}

const packageSource = read("package.json");
const typesSource = read("src/features/ynot/types.ts");
const dataSource = read("src/features/ynot/data.ts");
const clientSource = read("src/features/ynot/client.tsx");
const adminUser360 = read("src/features/ynot/admin/AdminUser360.tsx");
const campaignRoute = read("src/app/api/ynot/admin/campaigns/route.ts");
const lifecycleRoute = read("src/app/api/ynot/admin/campaigns/lifecycle/route.ts");
const liveRevisionRoute = read("src/app/api/ynot/admin/campaigns/live-revisions/route.ts");

test("package exposes the scoped admin Pull All flow script", () => {
  assert.match(
    packageSource,
    /"test:bulk-open-admin-flow":\s*"node --test scripts\/test-bulk-open-admin-flow\.mjs"/,
  );
});

test("Pack Studio has a lighted Pull All switch and sends it in create/edit payloads", () => {
  assert.match(typesSource, /pullAllEnabled\?: boolean/);
  assert.match(typesSource, /pullAllRequested\?: boolean/);
  assert.match(typesSource, /pullAllAllowlisted\?: boolean/);
  assert.match(typesSource, /pullAllReadinessStatus\?: YnotPullAllReadinessStatus/);
  assert.match(clientSource, /const \[pullAllEnabled, setPullAllEnabled\] = useState/);
  assert.match(clientSource, /editingCampaign\?\.pullAllEnabled === true \|\|/);
  assert.match(clientSource, /editingCampaign\?\.pullAllRequested === true/);
  assert.match(clientSource, /Pull All/);
  assert.match(clientSource, /Admin\/owner access only/);
  assert.match(clientSource, /function PullAllSwitchButton/);
  assert.match(clientSource, /pull-all-switch-button/);
  assert.match(clientSource, /pull-all-status-light/);
  assert.match(clientSource, /pull-all-switch-text/);
  assert.match(clientSource, /pullAllEnabled \? "Pull All open" : "Pull All closed"/);
  assert.match(clientSource, /pullAllEnabled \? "Turn Pull All off" : "Turn Pull All on"/);
  assert.match(clientSource, /pullAllEnabled,/);
  assert.match(clientSource, /pullAllRequested: pullAllEnabled/);
  assert.match(clientSource, /pullAllAllowlisted: pullAllEnabled && viewerRole === "owner"/);
  assert.match(clientSource, /campaign\.pullAllEnabled === true \|\| campaign\.pullAllRequested === true/);
  assert.match(clientSource, /Pull All closed/);
});

test("admin campaign route persists Pull All fields safely without direct publish", () => {
  assert.match(campaignRoute, /pullAllEnabled\?: unknown/);
  assert.match(campaignRoute, /function pullAllPatch/);
  assert.match(campaignRoute, /pull_all_enabled/);
  assert.match(campaignRoute, /pull_all_requested/);
  assert.match(campaignRoute, /pull_all_allowlisted/);
  assert.match(campaignRoute, /pull_all_readiness_status/);
  assert.match(campaignRoute, /ownerApproved[\s\S]*\? "ready"[\s\S]*: "not_ready"/);
  assert.match(campaignRoute, /pull_all_config/);
  assert.match(campaignRoute, /const pullAllSettings = pullAllPatch\(body,\s*admin\.adminRole\)/);
  assert.match(campaignRoute, /\.\.\.pullAllSettings/);
  assert.match(campaignRoute, /CAMPAIGN_DIRECT_PUBLISH_LOCKED/);
  assert.match(campaignRoute, /approval_status: "not_submitted"/);
});

test("owner review queue exposes safe Pull All status and publish blocks unready requests", () => {
  assert.match(typesSource, /pullAllStatus\?: YnotOwnerPullAllStatus/);
  assert.match(dataSource, /function pullAllStatusFromCampaign/);
  assert.match(dataSource, /Pull All requested/);
  assert.match(dataSource, /Pull All readiness/);
  assert.match(clientSource, /Pull All ready/);
  assert.match(clientSource, /Pull All blocked/);
  assert.match(clientSource, /Owner selection/);
  assert.match(clientSource, /Owner changed Pull All selection for this review/);
  assert.match(clientSource, /pullAllRequested: pullAllEnabled/);
  assert.match(lifecycleRoute, /function pullAllPublishBlocker/);
  assert.match(lifecycleRoute, /function pullAllSelectionPatch/);
  assert.match(lifecycleRoute, /applyPullAllSelectionPatch/);
  assert.match(lifecycleRoute, /pull_all_readiness_status: selected \? "ready" : "disabled"/);
  assert.doesNotMatch(lifecycleRoute, /pull_all_readiness_status: selected \? readinessStatus : "disabled"/);
  assert.match(lifecycleRoute, /PULL_ALL_NOT_READY/);
  assert.match(lifecycleRoute, /pull_all_enabled,pull_all_requested,pull_all_allowlisted,pull_all_readiness_status/);
  assert.match(liveRevisionRoute, /function pullAllPublishBlocker/);
  assert.match(liveRevisionRoute, /function pullAllFieldsFromScalarPatch/);
  assert.match(liveRevisionRoute, /scalar_patch: scalarPatch as Json/);
  assert.match(liveRevisionRoute, /pull_all_readiness_status: selected \? "ready" : "disabled"/);
  assert.doesNotMatch(liveRevisionRoute, /pull_all_readiness_status: selected \? readinessStatus : "disabled"/);
  assert.match(liveRevisionRoute, /PULL_ALL_NOT_READY/);
});

test("active Bulk Open sessions block protected live pack edits", () => {
  const liveEditBranch = between(
    campaignRoute,
    "if (current.status === \"live\")",
    "if (current.status !== \"draft\")",
  );
  assert.match(liveEditBranch, /assertNoActiveBulkOpenSession/);
  assert.match(liveEditBranch, /isLivePullAllDisableRequest/);
  assert.match(liveEditBranch, /campaign_pull_all_disabled/);
  assert.match(liveEditBranch, /livePullAllDisableRequested \? \{\} : pullAllSettings/);
  assert.match(campaignRoute, /has_active_bulk_open_session/);
  assert.match(campaignRoute, /ACTIVE_BULK_OPEN_SESSION/);
});

test("User 360 shows operational-safe bulk session summaries only", () => {
  assert.match(typesSource, /export type YnotAdminBulkOpenSessionSummary/);
  assert.match(typesSource, /bulkOpenSessions: YnotAdminBulkOpenSessionSummary\[\]/);
  assert.match(dataSource, /function adminBulkOpenSessionSummary/);
  assert.match(dataSource, /getAdminBulkOpenSessions/);
  assert.match(dataSource, /public_code,status,target_slots,processed_slots,total_cost_coins,highlight_rewards_public,retry_count,retry_scheduled_at,last_error_code,last_error_at,created_at,started_at,completed_at,draw_rounds\(slug,title_th,title_en\)/);
  assert.match(adminUser360, /Pull All sessions/);
  const pullAllSection = between(
    adminUser360,
    "<AdminCardHead\n            label=\"Pull All sessions\"",
    "<AdminCard>\n          <AdminCardHead\n            label=\"Wallet and top-ups\"",
  );
  assert.match(pullAllSection, /targetRewards/);
  assert.match(pullAllSection, /processedRewards/);
  assert.match(pullAllSection, /highlightsCount/);
  assert.match(pullAllSection, /retryScheduledAt/);
  for (const privateTerm of [
    "queue_job_id",
    "locked_by",
    "idempotency",
    "quote_hash",
    "pack_open_contract",
    "draw_slot",
    "start_token",
    "pull_all_config",
    "house",
    "weight",
    "unlockAtSoldPct",
  ]) {
    assert.doesNotMatch(pullAllSection, new RegExp(privateTerm, "i"));
  }
});

test("admin owner review separates render keys from editable override keys", () => {
  assert.match(clientSource, /function ownerReviewPrizeRowKey\(/);
  assert.match(clientSource, /function ownerReviewPrizeEditKey\(/);
  assert.match(clientSource, /function ownerReviewDuplicatePrizeIds\(/);
  assert.match(
    clientSource,
    /const duplicatePrizeIds = useMemo\(\(\) => ownerReviewDuplicatePrizeIds\(prizes\), \[prizes\]\);/,
  );
  assert.match(clientSource, /rows\.map\(\(prize, index\) =>/);
  assert.match(clientSource, /const editKey = ownerReviewPrizeEditKey\(prize\);/);
  assert.match(clientSource, /<tr key=\{ownerReviewPrizeRowKey\(prize, index\)\}>/);
  assert.match(clientSource, /updateCardEdit\(editKey,/);
  assert.match(clientSource, /duplicatePrizeIds\.has\(editKey\)/);
  assert.doesNotMatch(clientSource, /<tr key=\{prize\.id\}>/);
  assert.doesNotMatch(clientSource, /updateCardEdit\(prize\.id,/);
});

test("public campaign DTO remains free of admin-only Pull All fields", () => {
  const publicCampaign = between(
    dataSource,
    "function publicYnotCampaign",
    "function localOwnerMockPrizeLineup",
  );
  assert.match(typesSource, /pullAllAvailable\?: boolean/);
  assert.match(publicCampaign, /pullAllAvailable: campaign\.pullAllAvailable/);
  for (const adminField of [
    "pullAllEnabled",
    "pullAllRequested",
    "pullAllAllowlisted",
    "pullAllReadinessStatus",
    "pullAllConfig",
    "pullAllStatus",
  ]) {
    assert.doesNotMatch(publicCampaign, new RegExp(`${adminField}:`));
  }
});
