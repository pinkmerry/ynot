# Variant Campaign Table + PSA Lookup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the prize-catalog variant detail so the Campaign-assignments table is cleaner and more informative (drop Rank/Value, show the pack-defined tier, show per-campaign Total/In-pool counts, and *who won* each prize), and add PSA cert auto-fill to the Create-Main-SKU form.

**Architecture:** Almost entirely frontend. The only backend touch is extending `getAdminPrizePool()` to also load the winner profile for awarded units (the data already lives in `draw_round_prize_units.profile_id`). Everything else reuses fields already present on `YnotPrizePoolItem` (`displayTierLabel`, `totalUnits`, `availableUnits`, `awardedUnits`) and the existing `CertLookupField` + `lookupCert` GemRate wiring.

**Tech Stack:** Next.js App Router, React client components, TypeScript strict (no `any`), Supabase service client, Node test runner (`node --test`) with the project's static source-assertion guard suites under `Website/scripts/test-admin-prize-catalog-*.mjs`.

---

## Decisions locked in (from the discussion)

- **In bags semantics:** KEEP as-is (`allocated` count, which includes already-won units). No redefinition. A clarifying tooltip is the only optional touch (Task 4).
- **Winner display:** show the awarded **count** plus winner **display names** (`display_name ?? line_display_name ?? "YNot Player"`), capped at 3 inline with `+N more`, full list in the cell `title`. **Name only — never email.** Admin-only surface.
- **Final Campaign-assignments columns:** `Campaign · Status · Variant · Tier · Total · In pool · Awarded(+winners)`. Dropped: `Rank`, `Value (THB)`.
- **Tier source:** `prize.displayTierLabel` (the tier you set at pack creation), colored by `prize.displayTier` (`rainbow`/`gold`/`bronze`/custom).
- **PSA lookup:** added to `MainSkuForm` (covers both the Add-stock wizard's "Create new Main SKU" step and the per-row Edit). Shown for the **Single Cards** category only. Auto-fills Name / Series / Set / Year / Card number. Requires `GEMRATE_API_KEY` in the environment to actually return data (returns a friendly 503 locally).

## Files touched

- `Website/src/features/ynot/types.ts` — add `PrizeWinner` type + `awardedTo` field on `YnotPrizePoolItem`.
- `Website/src/features/ynot/data.ts` — `getAdminPrizePool()`: load winner profiles, attach `awardedTo`.
- `Website/src/features/ynot/admin/prize-catalog/CampaignPrizesSection.tsx` — column changes + winner rendering.
- `Website/src/features/ynot/admin/prize-catalog/LedgerRow.tsx` — drop the now-unused `isOwner` pass to `CampaignPrizesSection`.
- `Website/src/features/ynot/admin/prize-catalog/MainSkuForm.tsx` — PSA cert lookup + auto-fill.
- `Website/src/app/globals.css` — display-tier pills + winner-list styling (+ optional In-bags tooltip styling).
- `Website/src/features/ynot/admin/prize-catalog/VariantTable.tsx` — optional In-bags tooltip (Task 4).
- Tests: `Website/scripts/test-admin-prize-catalog-campaign.mjs`, `...-mainsku.mjs`, `...-variants.mjs` (Task 4).

> **Test idiom reminder:** this project does NOT use Playwright/RTL. Tests are static source-assertion guards: `readFileSync` the source, then `assert` on string patterns. "Write the failing test" = add an assertion that fails because the code isn't changed yet; "make it pass" = make the change.

---

## Task 1: Backend — attach `awardedTo` (winners) to the prize pool

**Files:**
- Modify: `Website/src/features/ynot/types.ts` (the `YnotPrizePoolItem` type at ~line 742)
- Modify: `Website/src/features/ynot/data.ts` (`PrizePoolUnitRow` ~line 577; `getAdminPrizePool` ~line 5432–5560)
- Test: `Website/scripts/test-admin-prize-catalog-campaign.mjs`

- [ ] **Step 1: Write the failing tests**

Add to `test-admin-prize-catalog-campaign.mjs` (it already `readFileSync`s sources into consts; add a `data` read at top: `const data = read("../src/features/ynot/data.ts"); const types = read("../src/features/ynot/types.ts");`).

```js
test("YnotPrizePoolItem exposes awardedTo winners", () => {
  assert.ok(types.includes("awardedTo"), "YnotPrizePoolItem must declare awardedTo");
  assert.ok(types.includes("PrizeWinner"), "types must define a PrizeWinner shape");
});

test("getAdminPrizePool loads winner identity for awarded units", () => {
  const fn = data.slice(data.indexOf("export async function getAdminPrizePool"));
  assert.ok(
    fn.includes("profile_id"),
    "prize-pool unit query must select profile_id",
  );
  assert.ok(
    /from\(\s*["']profiles["']\s*\)/.test(fn) || fn.includes('.from("profiles")'),
    "getAdminPrizePool must read profiles to resolve winner names",
  );
  assert.ok(fn.includes("awardedTo"), "each prize item must include awardedTo");
  assert.ok(
    !fn.includes("ownerEmail") && !fn.includes(".email"),
    "winner email must NOT be loaded into the prize pool (name only)",
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd Website && node --test scripts/test-admin-prize-catalog-campaign.mjs`
Expected: FAIL (`awardedTo` / `PrizeWinner` / `profiles` not present yet).

- [ ] **Step 3: Add the `PrizeWinner` type + field in `types.ts`**

Immediately above `export type YnotPrizePoolItem = {` add:

```ts
export type PrizeWinner = {
  profileId: string;
  name: string;
  awardedAt: string | null;
};
```

Inside `YnotPrizePoolItem`, add a field next to `awardedUnits`:

```ts
  awardedUnits: number;
  /** Admin-only: who won each awarded unit (display name, never email). */
  awardedTo: PrizeWinner[];
  voidUnits: number;
```

- [ ] **Step 4: Extend `PrizePoolUnitRow` in `data.ts`**

```ts
type PrizePoolUnitRow = Pick<
  Database["public"]["Tables"]["draw_round_prize_units"]["Row"],
  "card_stock_unit_id" | "draw_round_prize_id" | "status" | "profile_id" | "awarded_at"
>;
```

- [ ] **Step 5: Select the new columns + build the winners map in `getAdminPrizePool`**

In `getAdminPrizePool`, change the `prizeUnits` select (currently `"draw_round_prize_id,card_stock_unit_id,status"`) to:

```ts
            .select("draw_round_prize_id,card_stock_unit_id,status,profile_id,awarded_at")
```

After `prizeUnits` is loaded (and before the `stockUnitIds` block is fine), add:

```ts
    // Winner identity for awarded units (admin-only; name not email).
    const winnerProfileIds = [
      ...new Set(
        prizeUnits
          .filter((unit) => unit.status === "awarded" && unit.profile_id)
          .map((unit) => unit.profile_id as string),
      ),
    ];
    const winnerProfiles = winnerProfileIds.length
      ? await readSupabaseRows<
          Pick<
            Database["public"]["Tables"]["profiles"]["Row"],
            "id" | "display_name" | "line_display_name"
          >
        >("prize_pool_winner_profiles", () =>
          supabase
            .from("profiles")
            .select("id,display_name,line_display_name")
            .in("id", winnerProfileIds),
        )
      : [];
    const winnerNameById = new Map(
      winnerProfiles.map((p) => [
        p.id,
        p.display_name ?? p.line_display_name ?? "YNot Player",
      ]),
    );
    const winnersByPrizeId = new Map<string, PrizeWinner[]>();
    for (const unit of prizeUnits) {
      if (unit.status !== "awarded" || !unit.profile_id) continue;
      const list = winnersByPrizeId.get(unit.draw_round_prize_id) ?? [];
      list.push({
        profileId: unit.profile_id,
        name: winnerNameById.get(unit.profile_id) ?? "YNot Player",
        awardedAt: unit.awarded_at ?? null,
      });
      winnersByPrizeId.set(unit.draw_round_prize_id, list);
    }
```

Add `PrizeWinner` to the `types` import at the top of `data.ts` (it imports from `@/features/ynot/types`). In the `visiblePrizes.map((prize) => { ... return { ... } })` item, add next to `awardedUnits: counts.awarded`:

```ts
        awardedUnits: counts.awarded,
        awardedTo: winnersByPrizeId.get(prize.id) ?? [],
        voidUnits: counts.void,
```

- [ ] **Step 6: Run tests + typecheck**

Run: `cd Website && node --test scripts/test-admin-prize-catalog-campaign.mjs && npm run typecheck`
Expected: tests PASS, typecheck clean.

> ⚠️ `YnotPrizePoolItem` is built in more than one place in `data.ts` (e.g. campaign-detail builders at ~1180 and ~1300 also construct prize items). After adding the **required** `awardedTo` field, `tsc` will flag any other object literal that's missing it. Fix each by adding `awardedTo: []` (those surfaces don't show winners). Let typecheck drive this — do not guess locations.

- [ ] **Step 7: Commit**

```bash
git add Website/src/features/ynot/types.ts Website/src/features/ynot/data.ts Website/scripts/test-admin-prize-catalog-campaign.mjs
git commit -m "feat: load prize winners (awardedTo) in getAdminPrizePool"
```

---

## Task 2: Frontend — rebuild the Campaign-assignments columns

**Files:**
- Modify: `Website/src/features/ynot/admin/prize-catalog/CampaignPrizesSection.tsx`
- Modify: `Website/src/features/ynot/admin/prize-catalog/LedgerRow.tsx`
- Modify: `Website/src/app/globals.css`
- Test: `Website/scripts/test-admin-prize-catalog-campaign.mjs`

- [ ] **Step 1: Write/adjust the failing tests**

In `test-admin-prize-catalog-campaign.mjs`:
- **Remove** the two value-gating tests (`"...value column only when isOwner"` and `"...value cell is gated behind isOwner"`) — the Value column is gone.
- **Add:**

```js
test("Campaign table drops Rank and Value columns", () => {
  assert.ok(!campaignSection.includes("prize.rank"), "Rank cell must be removed");
  assert.ok(!campaignSection.includes("valueThb"), "Value cell must be removed");
  assert.ok(!campaignSection.includes("Value (THB)"), "Value header must be removed");
});

test("Campaign table shows pack-defined tier, total, in-pool, and winners", () => {
  assert.ok(campaignSection.includes("displayTierLabel"), "Tier must use displayTierLabel");
  assert.ok(campaignSection.includes("totalUnits"), "must show Total (totalUnits)");
  assert.ok(campaignSection.includes("availableUnits"), "must show In pool (availableUnits)");
  assert.ok(campaignSection.includes("awardedTo"), "Awarded cell must render winners (awardedTo)");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd Website && node --test scripts/test-admin-prize-catalog-campaign.mjs`
Expected: the new tests FAIL.

- [ ] **Step 3: Rewrite `CampaignPrizesSection.tsx`**

Replace the `tierPillClass` helper with a display-tier helper, and drop `isOwner` from the props (it was only used for the Value gate). Full new component body:

```tsx
"use client";

import type { YnotCampaign, YnotPrizePoolItem, PrizeWinner } from "@/features/ynot/types";
import { fmtInt } from "./catalog-format";

/**
 * Campaign prizes section rendered in the LedgerRow expanded detail
 * for NON-box cards. READ-ONLY display of which campaigns this card is
 * assigned to as a prize, the winnable banner, and per-campaign counts.
 *
 * Assignment and removal live in the campaign builder, not here.
 * Winner names are admin-only (sourced from the admin-gated prize pool).
 */

type CampaignPrizesSectionProps = {
  prizes: YnotPrizePoolItem[];
  campaigns: YnotCampaign[];
};

function campaignStatus(
  campaignId: string,
  campaigns: YnotCampaign[],
): YnotCampaign["status"] | "unknown" {
  const campaign = campaigns.find((c) => c.id === campaignId);
  return campaign?.status ?? "unknown";
}

function statusPillClass(status: YnotCampaign["status"] | "unknown"): string {
  switch (status) {
    case "live":
      return "pcx-pill pcx-pill-live";
    case "draft":
      return "pcx-pill pcx-pill-draft";
    case "closed":
      return "pcx-pill pcx-pill-closed";
    case "archived":
      return "pcx-pill pcx-pill-archived";
    default:
      return "pcx-pill pcx-pill-unknown";
  }
}

function tierPillClass(displayTier: string | undefined): string {
  switch (displayTier) {
    case "rainbow":
      return "pcx-pill pcx-pill-rainbow";
    case "gold":
      return "pcx-pill pcx-pill-gold";
    case "bronze":
      return "pcx-pill pcx-pill-bronze";
    default:
      return "pcx-pill pcx-pill-unknown";
  }
}

function AwardedCell({ count, winners }: { count: number; winners: PrizeWinner[] }) {
  if (count <= 0) return <td className="num">0</td>;
  const names = winners.map((w) => w.name);
  const shown = names.slice(0, 3);
  const extra = names.length - shown.length;
  return (
    <td className="num pcx-awarded-cell" title={names.join(", ") || undefined}>
      <span className="pcx-awarded-count">{fmtInt(count)}</span>
      {names.length > 0 && (
        <span className="pcx-winner-list">
          {shown.join(", ")}
          {extra > 0 ? ` +${extra} more` : ""}
        </span>
      )}
    </td>
  );
}

export function CampaignPrizesSection({
  prizes,
  campaigns,
}: CampaignPrizesSectionProps) {
  const isWinnableNow = prizes.some(
    (p) => campaignStatus(p.campaignId, campaigns) === "live",
  );

  return (
    <div className="pcx-detail-sec pcx-campaign-sec">
      <div className="pcx-sec-head">
        <h5>Campaign assignments</h5>
        <span className="pcx-sh-meta">
          {prizes.length} prize{prizes.length === 1 ? "" : "s"} assigned
        </span>
      </div>

      {prizes.length > 0 && (
        <div
          className={
            isWinnableNow
              ? "pcx-winnable-banner pcx-winnable-live"
              : "pcx-winnable-banner pcx-winnable-pending"
          }
        >
          {isWinnableNow
            ? "Winnable now"
            : "Not winnable yet — assign to a live campaign"}
        </div>
      )}

      {prizes.length > 0 && (
        <table className="pcx-vtable">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Status</th>
              <th>Variant</th>
              <th>Tier</th>
              <th className="num">Total</th>
              <th className="num">In pool</th>
              <th className="num">Awarded</th>
            </tr>
          </thead>
          <tbody>
            {prizes.map((prize) => {
              const status = campaignStatus(prize.campaignId, campaigns);
              return (
                <tr key={prize.id}>
                  <td className="pcx-pt-campaign">
                    {prize.campaignTitle || prize.campaignSlug}
                  </td>
                  <td>
                    <span className={statusPillClass(status)}>{status}</span>
                  </td>
                  <td className="pcx-pt-variant">
                    {prize.intendedStockLabel ?? prize.intendedStockSku ?? "—"}
                  </td>
                  <td>
                    <span className={tierPillClass(prize.displayTier)}>
                      {prize.displayTierLabel ?? prize.tier}
                    </span>
                  </td>
                  <td className="num">{fmtInt(prize.totalUnits)}</td>
                  <td className="num">{fmtInt(prize.availableUnits)}</td>
                  <AwardedCell count={prize.awardedUnits} winners={prize.awardedTo} />
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Drop the now-unused `isOwner` pass in `LedgerRow.tsx`**

Find the `<CampaignPrizesSection … />` usage and remove the `isOwner={isOwner}` prop (keep `prizes` and `campaigns`). Do NOT remove `isOwner` from `LedgerRow`'s own props unless `eslint` reports it unused there — verify with `grep -n "isOwner" src/features/ynot/admin/prize-catalog/LedgerRow.tsx` first; leave it if used elsewhere.

- [ ] **Step 5: Add CSS for display-tier pills + winner list in `globals.css`**

In the Prize Catalog section (near the existing `.pcx-pill-*` rules added earlier), following the `html[data-ynot-theme] .admin-frame .<class>` convention:

```css
html[data-ynot-theme] .admin-frame .pcx-pill-rainbow {
  color: #ffe27a;
  border: 1px solid rgba(244, 197, 66, 0.5);
  background: linear-gradient(90deg, rgba(244,161,66,0.16), rgba(68,209,126,0.16));
}
html[data-ynot-theme] .admin-frame .pcx-pill-gold {
  color: #ffe27a;
  border: 1px solid rgba(244, 197, 66, 0.5);
  background: rgba(244, 197, 66, 0.12);
}
html[data-ynot-theme] .admin-frame .pcx-pill-bronze {
  color: #d8c3a5;
  border: 1px solid rgba(180, 140, 90, 0.4);
  background: rgba(180, 140, 90, 0.1);
}
html[data-ynot-theme] .admin-frame .pcx-awarded-cell {
  white-space: nowrap;
}
html[data-ynot-theme] .admin-frame .pcx-winner-list {
  display: block;
  font-size: 10.5px;
  color: var(--a-muted, #9b9daf);
  font-weight: 500;
  margin-top: 2px;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

(If `.pcx-pill-unknown` does not already exist from the prior task, add a muted variant too.)

- [ ] **Step 6: Run tests, typecheck, lint**

Run: `cd Website && node --test scripts/test-admin-prize-catalog-campaign.mjs && npm run typecheck && npx eslint src/features/ynot/admin/prize-catalog`
Expected: tests PASS, typecheck clean, eslint 0 errors.

- [ ] **Step 7: Commit**

```bash
git add Website/src/features/ynot/admin/prize-catalog/CampaignPrizesSection.tsx \
        Website/src/features/ynot/admin/prize-catalog/LedgerRow.tsx \
        Website/src/app/globals.css \
        Website/scripts/test-admin-prize-catalog-campaign.mjs
git commit -m "feat: campaign table — drop rank/value, show pack tier + total/in-pool + winners"
```

---

## Task 3: Frontend — PSA cert lookup auto-fill in Create-Main-SKU

**Files:**
- Modify: `Website/src/features/ynot/admin/prize-catalog/MainSkuForm.tsx`
- Test: `Website/scripts/test-admin-prize-catalog-mainsku.mjs`

**Context:** `CertLookupField` (controlled: `value`, `onChange`, `grader`, `onResult(lookup: CertLookup)`) and `lookupCert` already exist and hit `POST /api/ynot/admin/gemrate-cert`. `CertLookup = { name?, series?, set?, year?, number?, grade?, gemrateId? }`. `MainSkuForm` already has `seriesDisplayToOption(...)` to map a series string to its option. Grade/gemrateId are NOT Main-SKU fields (they belong to the graded stock unit added later) — ignore them here.

- [ ] **Step 1: Write the failing test**

Add to `test-admin-prize-catalog-mainsku.mjs` (read the source into `mainSku` if not already):

```js
test("MainSkuForm offers PSA cert lookup auto-fill for Single Cards", () => {
  assert.ok(mainSku.includes("CertLookupField"), "must render CertLookupField");
  assert.ok(mainSku.includes("onResult"), "must handle cert onResult to autofill");
  // autofill targets the identity fields
  assert.ok(mainSku.includes("setName"), "lookup must fill Name");
  assert.ok(mainSku.includes("setCardSet"), "lookup must fill Set");
  assert.ok(mainSku.includes("setReleaseYear"), "lookup must fill Year");
  assert.ok(mainSku.includes("setCardNumber"), "lookup must fill Card number");
  // gated to single cards
  assert.ok(
    mainSku.includes('category === "Single Cards"'),
    "cert lookup must be shown only for Single Cards",
  );
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd Website && node --test scripts/test-admin-prize-catalog-mainsku.mjs`
Expected: FAIL.

- [ ] **Step 3: Wire the cert lookup into `MainSkuForm.tsx`**

Add imports:

```ts
import { CertLookupField } from "./CertLookupField";
import type { CertLookup } from "./catalog-api";
import type { GradingService } from "./add-stock/types";
```

Add state near the other `useState`s:

```ts
  const [certNumber, setCertNumber] = useState("");
  const [grader, setGrader] = useState<GradingService>("psa");
```

Add the auto-fill handler (place above `return`):

```ts
  function applyCertLookup(lookup: CertLookup) {
    if (lookup.name) setName(lookup.name);
    if (lookup.series) {
      const opt = seriesDisplayToOption(lookup.series);
      setSeriesOption(opt);
      setCustomSeries(opt === "Custom…" ? lookup.series : "");
    }
    if (lookup.set) setCardSet(lookup.set);
    if (lookup.year != null) setReleaseYear(String(lookup.year));
    if (lookup.number) setCardNumber(lookup.number);
  }
```

Render the lookup block at the **top** of the form (first child of `<div className="pcx-form">`), shown only for Single Cards:

```tsx
      {category === "Single Cards" && (
        <Field label="PSA / cert lookup" htmlFor="pcx-cert" optional>
          <div className="pcx-form-row2">
            <CertLookupField
              value={certNumber}
              onChange={setCertNumber}
              grader={grader}
              onResult={applyCertLookup}
            />
            <select
              aria-label="Grading service"
              className="pcx-input"
              value={grader}
              onChange={(e) => setGrader(e.target.value as GradingService)}
            >
              <option value="psa">PSA</option>
              <option value="bgs">BGS</option>
              <option value="cgc">CGC</option>
            </select>
          </div>
        </Field>
      )}
```

> Note: `CertLookupField`'s own input has `id` absent; the wrapping `<Field htmlFor="pcx-cert">` label is descriptive only. That's acceptable (the field already has `aria-label="Cert number"`). If eslint/jsx-a11y complains about the label association, drop the `htmlFor`/use a plain `<div className="pcx-field">` with a `<span>` label instead.

- [ ] **Step 4: Run test + typecheck + lint**

Run: `cd Website && node --test scripts/test-admin-prize-catalog-mainsku.mjs && npm run typecheck && npx eslint src/features/ynot/admin/prize-catalog/MainSkuForm.tsx`
Expected: PASS, clean, 0 errors.

- [ ] **Step 5: Commit**

```bash
git add Website/src/features/ynot/admin/prize-catalog/MainSkuForm.tsx Website/scripts/test-admin-prize-catalog-mainsku.mjs
git commit -m "feat: PSA cert lookup auto-fill in Create-Main-SKU (Single Cards)"
```

---

## Task 4 (OPTIONAL): "In bags" clarifying tooltip

Only do this if keeping the In-bags clarity note (option A). Skip otherwise.

**Files:**
- Modify: `Website/src/features/ynot/admin/prize-catalog/VariantTable.tsx`
- Test: `Website/scripts/test-admin-prize-catalog-variants.mjs`

- [ ] **Step 1: Failing test**

```js
test("VariantTable clarifies the In bags column meaning", () => {
  assert.ok(
    variantTable.includes("loaded into live campaigns"),
    "In bags header should carry a clarifying title",
  );
});
```

Run: `cd Website && node --test scripts/test-admin-prize-catalog-variants.mjs` → FAIL.

- [ ] **Step 2: Add a `title` on the In bags header**

In `VariantTable.tsx`, change the In bags header:

```tsx
          <th className="num" title="Loaded into live campaigns (incl. units already won)">In bags</th>
```

- [ ] **Step 3: Run test + typecheck**

Run: `cd Website && node --test scripts/test-admin-prize-catalog-variants.mjs && npm run typecheck`
Expected: PASS, clean.

- [ ] **Step 4: Commit**

```bash
git add Website/src/features/ynot/admin/prize-catalog/VariantTable.tsx Website/scripts/test-admin-prize-catalog-variants.mjs
git commit -m "docs: clarify In bags column (loaded into live campaigns, incl. won)"
```

---

## Cross-cutting verification (after all tasks)

Run from `Website/`:
- [ ] `npm run typecheck` → clean
- [ ] `npx eslint src/features/ynot/admin/prize-catalog src/app/admin/prizes/page.tsx` → 0 errors (existing `<img>` warnings OK)
- [ ] `npm run test:admin-prize-catalog` → all 9 suites pass / 0 fail
- [ ] `npm run verify:platform` → exit 0
- [ ] Customer-leak check: winner names render only in `CampaignPrizesSection` (admin module); `getAdminPrizePool` is admin-gated; no `ownerEmail`/`.email` pulled into the prize pool. `grep -rn "awardedTo\|ownerEmail" src/features/ynot/admin/prize-catalog` should show `awardedTo` rendering only, no email.
- [ ] Visual (sandbox can stay ON — read-only): open a card with prizes → confirm columns are `Campaign · Status · Variant · Tier · Total · In pool · Awarded`, tier shows the pack label, winners list under awarded counts. Open Add-stock → "Create new Main SKU" (Single Cards) → confirm the PSA lookup field appears (it returns the 503 "GemRate API key not configured" message locally — that's expected without the key).

## Self-review (author)

- **Spec coverage:** #1 drop rank/value → Task 2. #2 pack tier → Task 2 (`displayTierLabel`). #3 who won → Task 1 (data) + Task 2 (render). #4 total-in-campaign → Task 2 (`totalUnits`/`availableUnits`). #5 In-bags keep + clarify → Task 4 (optional). #6 PSA lookup → Task 3. ✓
- **Type consistency:** `PrizeWinner` defined once in `types.ts`; `awardedTo` is required on `YnotPrizePoolItem`, so Step 6 of Task 1 deliberately uses `tsc` to surface every other construction site (≥2 in `data.ts`) and patches them `awardedTo: []`. `CertLookupField`/`CertLookup`/`GradingService` names match their real exports. `displayTier`/`displayTierLabel`/`totalUnits`/`availableUnits`/`awardedUnits` all exist on `YnotPrizePoolItem` today.
- **No placeholders:** every code step shows the actual code.
- **Security:** winner data is name-only, admin-gated, rendered only in the admin module; explicit grep guard + a test asserting no email.
