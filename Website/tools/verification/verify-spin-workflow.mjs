#!/usr/bin/env node
/**
 * Smoke test for the campaign approval + spin-mode workflow API surface.
 *
 * What it checks (read-only as much as possible):
 *   1. /api/ynot/admin/campaigns POST creates a draft (admin cookie)
 *   2. /api/ynot/admin/campaigns/[id]/submit moves it to pending_approval
 *   3. /api/ynot/admin/campaigns/[id]/approve fails for admin, succeeds for owner
 *   4. /api/ynot/admin/campaigns/[id]/publish locks the campaign
 *   5. /api/ynot/admin/campaigns/[id]/spin-config refuses changes after lock
 *
 * The created campaign uses slot_pick mode so this API-surface smoke test does
 * not require pre-existing card/prize inventory. Use verify_spin_modes.sql for
 * database-level spin dispatcher checks.
 *
 * Usage:
 *   YNOT_BASE_URL=https://your.app \
 *   YNOT_ADMIN_COOKIE='lucky_draw_session=...; other=...' \
 *   YNOT_OWNER_COOKIE='lucky_draw_session=...' \
 *   node tools/verification/verify-spin-workflow.mjs
 *
 * Both cookies must be valid sessions for users with the corresponding admin
 * roles. If only one cookie is provided, the role-mismatch checks are skipped.
 */

const BASE = process.env.YNOT_BASE_URL ?? "http://localhost:3000";
const ADMIN_COOKIE = process.env.YNOT_ADMIN_COOKIE;
const OWNER_COOKIE = process.env.YNOT_OWNER_COOKIE;

if (!ADMIN_COOKIE || !OWNER_COOKIE) {
  console.error("YNOT_ADMIN_COOKIE and YNOT_OWNER_COOKIE are required.");
  process.exit(2);
}

let passed = 0;
let failed = 0;

function log(label, ok, extra = "") {
  const tag = ok ? "PASS" : "FAIL";
  console.log(`[${tag}] ${label}${extra ? " — " + extra : ""}`);
  if (ok) passed++;
  else failed++;
}

async function api(path, opts = {}) {
  const cookie = opts.role === "owner" ? OWNER_COOKIE : ADMIN_COOKIE;
  const response = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "content-type": "application/json",
      cookie,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text };
  }
  return { status: response.status, body: json };
}

async function main() {
  // 1. Admin creates draft
  const slug = `verify-${Date.now().toString(36)}`;
  const created = await api("/api/ynot/admin/campaigns", {
    method: "POST",
    body: {
      slug,
      titleTh: "verify",
      titleEn: "verify",
      series: "pokemon",
      mode: "slot_pick",
      priceThb: 100,
      costCoins: 1,
      totalSlots: 10,
      isTest: true,
      spinMode: "inventory_gate",
      spinConfig: { bands: [{ rankStart: 1, rankEnd: 3, unlockAtSoldPct: 30 }] },
    },
  });
  log("admin creates draft", created.status === 200 && created.body.campaign?.id, JSON.stringify(created.body).slice(0, 200));
  const campaignId = created.body?.campaign?.id;
  if (!campaignId) {
    console.error("Cannot continue without campaign id.");
    process.exit(1);
  }

  // 2. Admin submits for approval
  const submit = await api(`/api/ynot/admin/campaigns/${campaignId}/submit`, { method: "POST" });
  log("admin submits for approval", submit.status === 200, JSON.stringify(submit.body).slice(0, 200));

  // 3a. Admin tries to approve - should fail (forbidden)
  const approveByAdmin = await api(`/api/ynot/admin/campaigns/${campaignId}/approve`, {
    method: "POST",
    body: {},
  });
  log("admin approve is forbidden", approveByAdmin.status === 403, `status=${approveByAdmin.status}`);

  // 3b. Owner approves
  const approveByOwner = await api(`/api/ynot/admin/campaigns/${campaignId}/approve`, {
    method: "POST",
    body: { notes: "verify" },
    role: "owner",
  });
  log("owner approves", approveByOwner.status === 200, JSON.stringify(approveByOwner.body).slice(0, 200));

  // 4. Owner publishes
  const publish = await api(`/api/ynot/admin/campaigns/${campaignId}/publish`, {
    method: "POST",
    role: "owner",
  });
  log("owner publishes", publish.status === 200, JSON.stringify(publish.body).slice(0, 200));

  // 5. Spin-config change after lock should fail
  const editLocked = await api(`/api/ynot/admin/campaigns/${campaignId}/spin-config`, {
    method: "PUT",
    body: { spinMode: "pure_random", spinConfig: {} },
    role: "owner",
  });
  log("spin-config edit blocked after lock", editLocked.status === 409 && editLocked.body?.error === "campaign_locked", JSON.stringify(editLocked.body));

  // 6. Cleanup: cancel the test campaign
  const cancel = await api(`/api/ynot/admin/campaigns/${campaignId}/cancel`, {
    method: "POST",
    body: { reason: "verification cleanup" },
    role: "owner",
  });
  log("owner cancels (cleanup)", cancel.status === 200, JSON.stringify(cancel.body).slice(0, 200));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
