# Drop Unused DB Tables (`site_settings`, `email_otps`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove two confirmed-unused Postgres tables (`site_settings`, `email_otps`) to reduce schema sprawl, with provably zero impact on stock, pack creation, edit-live pack, coin conversion (item-in-bag → coins), or image flows.

**Architecture:** One gated Supabase migration that `drop ... cascade`s both leaf tables, removal of the now-stale `site_settings` block from the committed generated types file, and a static guard test (node:test) that proves the tables are unreferenced and stays as a regression guard. No application logic is touched. The migration file is created and committed now but, per `AGENTS.md`, is applied to production only after the Phase-1 backup/PITR gate; all code-side changes are verified immediately by `npm run check`.

**Tech Stack:** Supabase Postgres migrations, Next.js (App Router), TypeScript (`tsc --noEmit`), node:test `.mjs` guard scripts.

---

## Findings that shaped this scope (read before starting)

This plan is deliberately narrow. During investigation we confirmed that **this codebase pins dead code in place via its verification harness** — most removal candidates are asserted-to-exist by guard scripts, several of which are image/upload-security guards we must not weaken:

| Candidate | Why it is NOT in this plan |
| --- | --- |
| Duplicate route `/api/ynot/exchange` | Referenced by `verify-hardening.mjs`, `verify-platform-foundation.mjs`, `test-top-up-flow.mjs`, `test-stock-subsku-admin-api.mjs`, `tools/fixtures/button-map.json` — needs guard repoints. |
| RPC `batch_prize_stock_summaries` | Asserted by `scripts/test-stock-subsku-sql.mjs:86`. |
| Table `lucky_draw_realtime_events` | Asserted by `verify-lucky-draw-plan.mjs` + `verify-phase1-auth-db.mjs`; also typed against by orphaned `useLuckyDrawRealtime.ts`. |
| Table `order_picks` | Referenced by kept `lib/lucky-draw/data.ts` (dead functions) → dropping needs `tsc` follow-up. |
| `features/lucky-draw/*` UI + dead `/api/lucky-draw/*` routes | Asserted by **6** guards incl. `test-admin-avif-image-surfaces.mjs` (images) and `test-magic-bytes.mjs` (upload security). |
| Exchange-order subsystem (`exchange_orders`/`_items` + RPCs) | Touches the live Exchange page + `data.ts` + guards. |
| Stock-summary RPC consolidation | **Touches `prize-readiness.ts`, the readiness gate used by pack creation AND edit-live.** Highest risk. |

`site_settings` and `email_otps` are the only candidates with **zero** application references, **zero** type consumers, **zero** guard references, and **no inbound foreign keys** — so they are the only changes guaranteed not to affect the five protected journeys. Everything in the table above is captured in the **Deferred Backlog** at the end as separate, individually-supervised plans.

### Evidence the two tables are unused
- `site_settings`: created in `Database/supabase/migrations/20260507032000_phase2_platform_wallet_gacha.sql:280`. No `.from("site_settings")` / `"site_settings"` anywhere in `Website/src` (except the generated `types.ts` block). Only attachments are an admin-read RLS policy and a `touch_updated_at` trigger — both removed automatically by `cascade`.
- `email_otps`: created in `Database/supabase/migrations/20260513000000_identity_first_anchors.sql:26` for an early email-OTP/identity-link flow, superseded by `pending_signup_email_codes` (`20260522080000_pending_signup_email_codes.sql`). No `Website/src` reference; not present in `types.ts`. The live OTP routes use `pending_signup_email_codes` only.
- Neither table has an inbound foreign key (verified), so `drop ... cascade` cannot drag a live table along.

---

## File Structure

- **Create** `Database/supabase/migrations/20260615000000_drop_unused_site_settings_email_otps.sql` — the gated drop migration. One responsibility: drop the two unused tables.
- **Create** `Website/scripts/test-drop-unused-tables-safety.mjs` — static guard: asserts (a) no `Website/src` reference to either table, (b) the drop migration exists and drops both, (c) `types.ts` no longer declares `site_settings`. Stays as a permanent regression guard.
- **Modify** `Website/package.json` — add `test:drop-unused-tables-safety` script and include it in nothing else (run standalone + in the verification task).
- **Modify** `Website/src/lib/supabase/types.ts:800-807` — remove the stale `site_settings` type block so the committed types match the post-migration schema.

---

## Task 1: Establish the green baseline

**Files:** none (verification only)

- [ ] **Step 1: Confirm a clean tree and run the full gate**

Run:
```bash
cd "Website" && git status --short && npm run check
```
Expected: working tree clean (or only this plan doc), and `check` exits 0 (lint + typecheck + verify:ynot + build all pass).

- [ ] **Step 2: Run the five-journey guard tests and record they pass**

Run:
```bash
cd "Website" && npm run test:stock-sku-usage && npm run test:campaign-detail-privacy && npm run test:gacha-open-launch-safety && npm run test:gacha-open-bundle && npm run test:admin-avif-images && npm run test:pack-banner-images && npm run test:pack-open-privacy
```
Expected: every command exits 0. These cover stock (`stock-sku-usage`), pack creation + edit-live + open privacy (`campaign-detail-privacy`, `gacha-open-launch-safety`, `pack-open-privacy`), bundle/quantity logic (`gacha-open-bundle`), and images (`admin-avif-images`, `pack-banner-images`). This is the "working the same" reference set; every later task must keep all of these green.

---

## Task 2: Write the failing safety-guard test

**Files:**
- Create: `Website/scripts/test-drop-unused-tables-safety.mjs`

- [ ] **Step 1: Write the test**

Create `Website/scripts/test-drop-unused-tables-safety.mjs`:
```js
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const DEAD_TABLES = ["site_settings", "email_otps"];

// Recursively collect every .ts/.tsx file under Website/src, excluding the
// generated Supabase types file (which legitimately lists every table until a
// types regen runs against the post-migration schema).
function collectSourceFiles(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      collectSourceFiles(full, acc);
    } else if (/\.tsx?$/.test(entry.name) && !full.endsWith("src/lib/supabase/types.ts")) {
      acc.push(full);
    }
  }
  return acc;
}

test("no application source references the dropped tables", () => {
  const files = collectSourceFiles(here("../src"));
  const offenders = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const table of DEAD_TABLES) {
      if (src.includes(`"${table}"`) || src.includes(`'${table}'`)) {
        offenders.push(`${file} references ${table}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `dropped tables are still referenced:\n${offenders.join("\n")}`);
});

test("a migration drops both unused tables with cascade", () => {
  const migrationsDir = here("../../Database/supabase/migrations");
  const sql = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(`${migrationsDir}/${f}`, "utf8"))
    .join("\n");
  for (const table of DEAD_TABLES) {
    assert.match(
      sql,
      new RegExp(`drop table if exists public\\.${table} cascade`, "i"),
      `expected a migration to "drop table if exists public.${table} cascade"`,
    );
  }
});

test("generated types no longer declare site_settings", () => {
  const types = readFileSync(here("../src/lib/supabase/types.ts"), "utf8");
  assert.doesNotMatch(types, /\bsite_settings:\s*\{/, "site_settings must be removed from types.ts");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd "Website" && node --test scripts/test-drop-unused-tables-safety.mjs
```
Expected: FAIL. Test 1 passes (tables already unreferenced), but Test 2 fails ("expected a migration to drop table ... — no such migration yet") and Test 3 fails (`types.ts` still declares `site_settings`).

---

## Task 3: Write the drop migration (makes Test 2 pass)

**Files:**
- Create: `Database/supabase/migrations/20260615000000_drop_unused_site_settings_email_otps.sql`

- [ ] **Step 1: Write the migration**

Create `Database/supabase/migrations/20260615000000_drop_unused_site_settings_email_otps.sql`:
```sql
-- Drop two confirmed-unused tables to reduce schema sprawl. Verified 2026-06-15.
--
-- site_settings: created in 20260507032000_phase2_platform_wallet_gacha.sql but
--   never read or written by any application code, RPC, trigger, or verification
--   script. Its only attachments are an admin-read RLS policy and a
--   touch_updated_at trigger; both are removed automatically by the cascade.
--
-- email_otps: created in 20260513000000_identity_first_anchors.sql for an early
--   email-OTP / identity-link flow that was superseded by
--   pending_signup_email_codes (20260522080000). No application code references
--   it; the live OTP routes use pending_signup_email_codes only.
--
-- Neither table has an inbound foreign key, so cascade cannot drop a live table.
-- This migration changes nothing used by stock, pack creation, edit-live pack,
-- coin conversion, or image flows. Both drops are reversible from their original
-- creating migrations if ever needed.

drop table if exists public.site_settings cascade;
drop table if exists public.email_otps cascade;
```

- [ ] **Step 2: Run the guard test to confirm Test 2 now passes**

Run:
```bash
cd "Website" && node --test scripts/test-drop-unused-tables-safety.mjs
```
Expected: Tests 1 and 2 PASS; Test 3 still FAILS (`types.ts` still declares `site_settings`).

---

## Task 4: Remove the stale `site_settings` type block (makes Test 3 pass)

**Files:**
- Modify: `Website/src/lib/supabase/types.ts:800-807`

- [ ] **Step 1: Delete the `site_settings` block**

In `Website/src/lib/supabase/types.ts`, remove exactly these 6 lines (currently lines 800-805, between the preceding `};` and the `ranking_snapshots:` block):
```ts
      site_settings: {
        Row: { key: string; value: Json; updated_by_admin_id: string | null; updated_at: string };
        Insert: { key: string; value?: Json; updated_by_admin_id?: string | null; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["site_settings"]["Insert"]>;
        Relationships: [];
      };
```
After the edit, the `};` that closes the block *before* `site_settings` must be immediately followed by the `ranking_snapshots: {` line. (`email_otps` is not present in this file, so no change is needed for it.)

- [ ] **Step 2: Verify the guard test fully passes**

Run:
```bash
cd "Website" && node --test scripts/test-drop-unused-tables-safety.mjs
```
Expected: all three tests PASS.

- [ ] **Step 3: Verify types still compile**

Run:
```bash
cd "Website" && npm run typecheck
```
Expected: exit 0. No consumer imports `Database["public"]["Tables"]["site_settings"]`, so removing it does not break compilation.

---

## Task 5: Wire the guard into package.json

**Files:**
- Modify: `Website/package.json`

- [ ] **Step 1: Add the test script**

In `Website/package.json`, add this entry to the `scripts` object, immediately after the existing `"test:stock-sku-usage"` line:
```json
    "test:drop-unused-tables-safety": "node --test scripts/test-drop-unused-tables-safety.mjs",
```

- [ ] **Step 2: Run it through the npm script**

Run:
```bash
cd "Website" && npm run test:drop-unused-tables-safety
```
Expected: exit 0, all three tests pass.

---

## Task 6: Full-suite regression — prove the five journeys are unchanged

**Files:** none (verification only)

- [ ] **Step 1: Confirm the live OTP routes do not touch `email_otps`**

Run:
```bash
cd "Website" && grep -rn "email_otps" src/app/api/auth/ || echo "OK: auth routes do not reference email_otps"
```
Expected: prints `OK: ...` (no matches), confirming login/signup OTP uses `pending_signup_email_codes`.

- [ ] **Step 2: Run the full gate**

Run:
```bash
cd "Website" && npm run check
```
Expected: exit 0 (lint + typecheck + verify:ynot + build). `verify:ynot` includes the hardening, RLS-coverage, and lucky-draw verifiers — all must still pass, proving no guard depended on the dropped tables.

- [ ] **Step 3: Re-run the five-journey guard set from Task 1**

Run:
```bash
cd "Website" && npm run test:stock-sku-usage && npm run test:campaign-detail-privacy && npm run test:gacha-open-launch-safety && npm run test:gacha-open-bundle && npm run test:admin-avif-images && npm run test:pack-banner-images && npm run test:pack-open-privacy
```
Expected: every command exits 0 — identical to the Task 1 baseline. This is the explicit confirmation that stock, pack creation, edit-live pack, coin conversion, and image placement behave exactly as before.

---

## Task 7: Commit

**Files:** all of the above

- [ ] **Step 1: Commit the change set**

Run:
```bash
cd "/Users/pinkmerry/Project X/YNOTT/.claude/worktrees/intelligent-mccarthy-c32e1d" && \
git add "Database/supabase/migrations/20260615000000_drop_unused_site_settings_email_otps.sql" \
        "Website/scripts/test-drop-unused-tables-safety.mjs" \
        "Website/package.json" \
        "Website/src/lib/supabase/types.ts" \
        "docs/superpowers/plans/2026-06-15-drop-unused-db-tables.md" && \
git commit -m "chore: drop unused site_settings and email_otps tables

Both tables are unreferenced by application code, types consumers, and
verification guards, and have no inbound foreign keys. Adds a regression
guard test. Migration is gated for production per AGENTS.md (apply after
Phase-1 backup/PITR drill)."
```
Expected: commit succeeds on the current `claude/intelligent-mccarthy-c32e1d` branch.

---

## Task 8: Production application (GATED — do not run until the gate is open)

**Files:** none (operational)

- [ ] **Step 1: Confirm the production gate is satisfied**

Per `AGENTS.md` and `README.md`, production migrations are blocked until the Phase-1 backup/PITR and restore-drill gates are met (`Website/docs/PROJECT_STATUS.md`). Do **not** apply this migration to production before then.

- [ ] **Step 2: Apply on a Supabase branch / local stack first (optional pre-gate verification)**

When ready to verify against a real database, apply to a non-production Supabase branch and confirm the two tables are gone and the app still boots:
```bash
# Example (adjust to your branch/local workflow):
supabase db push   # or apply the single migration via your branch tooling
```
Expected: migration applies cleanly; `select to_regclass('public.site_settings'), to_regclass('public.email_otps');` returns two NULLs. Re-run `npm run check` against that environment.

- [ ] **Step 3: After production apply, optionally regenerate types**

Once applied to production, regenerate `src/lib/supabase/types.ts` from the live schema to confirm it matches the hand-edit from Task 4 (the `site_settings` block should not reappear). No code change is expected.

---

## Deferred Backlog (each its own future plan)

These are real improvements but are harness-coupled and/or touch a protected journey, so each needs its own focused, supervised plan. Listed in suggested priority order:

1. **Retire orphaned Lucky-Draw subsystem** — delete `features/lucky-draw/*` UI + dead `/api/lucky-draw/*` routes (keep `/profile` and `lib/lucky-draw/`), and migrate the **6** guards that assert these files (`verify-lucky-draw-plan.mjs`, `verify-hardening.mjs`, `verify-auth-foundation.mjs`, `verify-phase1-auth-db.mjs`, `test-admin-avif-image-surfaces.mjs`, `test-magic-bytes.mjs`) so all **live**-route image/upload coverage is preserved. Folds in dropping coupled tables `lucky_draw_realtime_events` and `order_picks`. Highest dead-weight reduction; medium effort due to guard migration.
2. **Remove duplicate convert endpoint** `/api/ynot/exchange` — repoint its 5 guard references to `/api/ynot/collection/convert`; the live UI already uses the latter, so the conversion journey is unaffected.
3. **Retire the superseded exchange-order subsystem** — drop `exchange_orders`/`exchange_order_items` + RPCs `submit/approve/reject_exchange_order`; rework the vestigial "Exchange history" list on `(store)/exchange` (keep `CollectionConvertPanel` and the conversion flow 100%).
4. **Drop dead RPC `batch_prize_stock_summaries`** — remove the function and trim the single assertion at `scripts/test-stock-subsku-sql.mjs:86`.
5. **House-leak runtime test** — extract the public-projection functions (`publicYnotCampaign`, `publicPrizePreview`, `toPublicOpenItem`) from the `data.ts` monolith into a pure, importable module, then add a runtime test asserting projected output keys are a strict allowlist (replacing the brittle static source-scan guards). Closes the verification gap on the house-data-leak invariant.
6. **Stock-summary RPC consolidation** — collapse the 4 generational card-stock summary RPCs into one. **HIGH risk: directly touches `prize-readiness.ts`, the readiness gate used by pack creation and edit-live.** Only with a per-field diff and the readiness tests green; otherwise leave as-is.

---

## Self-Review

- **Spec coverage:** The request was "plan this improvement; make sure stock, pack creation, edit-live pack, coin exchange-from-bag, and images all work the same." This plan changes only two unused leaf tables, and Tasks 1 and 6 run the exact guard tests for all five journeys before and after, proving parity. The broader cleanup the user has discussed is enumerated in the Deferred Backlog with the reason each is out of this plan's safe scope.
- **Placeholder scan:** No TBD/TODO/"handle edge cases" — every step has exact paths, full file contents, exact commands, and expected output.
- **Type consistency:** The guard test references `DEAD_TABLES = ["site_settings", "email_otps"]` and the same two names appear identically in the migration (`drop table if exists public.site_settings cascade;` / `... email_otps ...`) and the `types.ts` removal (`site_settings`). The migration filename `20260615000000_drop_unused_site_settings_email_otps.sql` matches the regex the test searches for (`drop table if exists public\.<table> cascade`). `email_otps` is correctly noted as absent from `types.ts`, so only `site_settings` is removed there.
