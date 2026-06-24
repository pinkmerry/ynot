# Variant Language Axis (Option B — typed column) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move card *language* from the product (Main SKU) to the *variant* level so the same card code (e.g. `EB01-001`) can hold EN / JP / KR / CN as distinct, correctly-stocked variants under one catalog row.

**Architecture:** Language becomes a physical-item identity attribute on `card_stock_units` (parallel to `grade`/`condition`/`cert_number`), enforced by a DB CHECK. It flows into the existing add-stock RPCs **inside the current `p_metadata` argument** (so the PostgREST-facing RPC signatures do not change), and into `app_private.ensure_default_stock_sku` (new optional trailing param) so each language gets its own `stock_sku` row + language-bearing label. The catalog/campaign read paths select the new column, fold it into the variant group key + display label, and the Add-Stock wizard gains a Language picker. The Main-SKU language picker (added in `43e0436`) is removed; the language chip moves from the card name to the variant row.

**Tech Stack:** PostgreSQL (Supabase migrations, plpgsql/sql functions), Next.js App Router route handlers, React client components (TypeScript strict, no `any`), Node test runner static source-assertion guard tests.

---

## Context the implementer must know

- **The DB-level "variant" is a `stock_sku` row.** On add, `adjust_card_stock_units` calls `app_private.ensure_default_stock_sku(card, condition, grade, grader, cert, gemrate, …)`, which de-dupes/creates one `stock_sku` per identity using a generated `sku_code` (`app_private.stock_sku_default_code`). The catalog UI groups units by `stock_sku_id` first, falling back to `stockUnitGroupKey(unit)`.
- **Therefore language must enter the `stock_sku` identity** (its `sku_code` + label), or EN/JP would collapse into one variant. We do this by threading language into `ensure_default_stock_sku` → `stock_sku_default_code`.
- **`concat_ws` skips NULLs**, so appending a language code-part only when present keeps existing (null-language) `sku_code`s byte-identical → **backward compatible**; legacy stock keeps matching.
- **RPC signatures stay fixed.** `adjust_card_stock_units` / `adjust_stock_sku_units` keep their 13-arg signatures; language travels in the existing `p_metadata` jsonb (the route already builds that object). This avoids overload/grant churn and keeps the generated `Database` RPC `Args` types valid.
- **The two non-add callers of `ensure_default_stock_sku` are safe**: a one-time backfill (historical migration, already applied) and `public.edit_card_stock_unit`. After DROP+CREATE with a defaulted `p_language`, both bind to the new function with `p_language => null`. `edit_card_stock_unit` gets an explicit language-preserving change in Task 1.4 so editing a unit doesn't strip its language.
- **Canonical language set:** `english | japanese | korean | chinese` (lowercase). No free-text/"Custom…" — the axis is constrained. UI shows `English / Japanese / Korean / Chinese` plus "—" (none).
- **Test idiom:** this repo uses **static source-assertion guard tests** (`readFileSync` + `assert` on string patterns) under `Website/scripts/test-admin-prize-catalog-*.mjs`, run with `node --test`. No Playwright/RTL. New "tests" follow that idiom. `cd Website` before running test/typecheck/lint commands.
- **Production caveat:** the Supabase project is PRODUCTION. The migration is applied by the user (see Phase 5 runbook); do **not** apply it from here. Local writes remain sandbox-blocked.

## Source references (copy-from locations)

- `Database/supabase/migrations/20260610110000_stock_skus_and_container_conversion.sql`
  - `stock_sku_default_code` — lines **113–146**
  - `ensure_default_stock_sku` — lines **148–238**
  - `adjust_stock_sku_units` — lines **821–967**
  - `adjust_card_stock_units` — lines **969–1176**
  - `edit_card_stock_unit` — lines **1382–~1560** (calls `ensure_default_stock_sku` at ~1507)
- App: `Website/src/app/api/ynot/admin/card-stock/route.ts`, `Website/src/features/ynot/data.ts`, `Website/src/features/ynot/stock-sku-usage.ts`, `Website/src/features/ynot/admin/prize-catalog/{catalog-api,MainSkuForm,LedgerRow,VariantTable,PrizeCatalogScreen}.tsx`, `Website/src/features/ynot/admin/prize-catalog/add-stock/Step3Stock.tsx`, `Website/src/lib/supabase/types.ts`, `Website/src/lib/lucky-draw/types.ts`.

## File structure (touched)

| File | Responsibility / change |
|---|---|
| `Database/supabase/migrations/20260623120000_card_stock_unit_language.sql` | **New.** Column + CHECK; recreate `stock_sku_default_code`, `ensure_default_stock_sku`, `edit_card_stock_unit`; CREATE OR REPLACE both adjust RPCs. |
| `Website/src/lib/supabase/types.ts` | Add `language` to `card_stock_units` Row/Insert/Update. |
| `Website/src/lib/lucky-draw/types.ts` | Add `language?: string \| null` to the `CardCatalogItem.stockUnits[number]` shape. |
| `Website/src/app/api/ynot/admin/card-stock/route.ts` | Validate `body.language`; inject into both `p_metadata` blobs. |
| `Website/src/features/ynot/admin/prize-catalog/catalog-api.ts` | `StockAdjustInput += language`; remove `language` from `MainSkuInput`. |
| `Website/src/features/ynot/admin/prize-catalog/add-stock/Step3Stock.tsx` | Language `<select>` + `language`/`onLanguage` props. |
| `Website/src/features/ynot/admin/prize-catalog/PrizeCatalogScreen.tsx` | Hold language state; pass to Step3; include in `adjustCardStock`. |
| `Website/src/features/ynot/data.ts` | Select `language`; map onto display units (catalog + prize-pool paths). |
| `Website/src/features/ynot/stock-sku-usage.ts` | Fold language into `stockUnitGroupKey`, `stockUnitDisplayLabel`, `cardLanguageSkuPart` (+KR). |
| `Website/src/features/ynot/admin/prize-catalog/VariantTable.tsx` | Render language pill on each variant row. |
| `Website/src/features/ynot/admin/prize-catalog/LedgerRow.tsx` | Remove card-name language chip. |
| `Website/src/features/ynot/admin/prize-catalog/MainSkuForm.tsx` | Remove Language picker + state + submit field. |
| `Website/src/app/globals.css` | Keep `.pcx-lang-chip` (reused on variant). |
| `Website/scripts/test-admin-prize-catalog-*.mjs` | Update + add guard tests. |

---

## Phase 1 — Database migration + generated types

### Task 1.1: Create migration file + add the column

**Files:**
- Create: `Database/supabase/migrations/20260623120000_card_stock_unit_language.sql`

- [ ] **Step 1: Create the migration with the column + CHECK**

```sql
-- ============================================================================
-- Variant language axis: language is a physical-item attribute of the unit
-- (parallel to grade/condition/cert), not the product. Additive + backward
-- compatible: null language => unchanged stock_sku codes/labels.
-- ============================================================================

alter table public.card_stock_units
  add column if not exists language text;

alter table public.card_stock_units
  drop constraint if exists card_stock_units_language_check;
alter table public.card_stock_units
  add constraint card_stock_units_language_check
  check (language is null or language in ('english', 'japanese', 'korean', 'chinese'));
```

- [ ] **Step 2: Commit**

```bash
git add Database/supabase/migrations/20260623120000_card_stock_unit_language.sql
git commit -m "feat(db): add language column to card_stock_units"
```

### Task 1.2: Recreate `stock_sku_default_code` with an optional language part

**Files:**
- Modify: `Database/supabase/migrations/20260623120000_card_stock_unit_language.sql` (append)

- [ ] **Step 1: Append DROP + CREATE.** Copy the body verbatim from `20260610110000_…sql:113–146`, then (a) add the trailing param and (b) add the language `case` as a new final `concat_ws` argument:

```sql
drop function if exists app_private.stock_sku_default_code(text, text, uuid, text, text, text, text, text);
create or replace function app_private.stock_sku_default_code(
  p_card_code text,
  p_search_code text,
  p_card_id uuid,
  p_condition text,
  p_grade text,
  p_grading_service text,
  p_cert_number text,
  p_gemrate_id text,
  p_language text default null
)
returns text
language sql
stable
as $$
  select concat_ws(
    '-',
    app_private.stock_sku_code_part(coalesce(p_card_code, p_search_code, p_card_id::text)),
    case
      when coalesce(p_condition, 'raw') = 'graded' then concat_ws(
        '',
        app_private.stock_sku_code_part(coalesce(p_grading_service, 'graded')),
        nullif(regexp_replace(coalesce(p_grade, ''), '[^0-9]+', '', 'g'), '')
      )
      when coalesce(p_condition, 'raw') = 'sealed' then 'SEALED'
      else 'RAW'
    end,
    case
      when nullif(p_cert_number, '') is not null
        then concat('CERT-', app_private.stock_sku_code_part(p_cert_number))
      when nullif(p_gemrate_id, '') is not null
        then concat('GEMRATE-', app_private.stock_sku_code_part(p_gemrate_id))
    end,
    case
      when nullif(p_language, '') is not null
        then app_private.stock_sku_code_part(p_language)
    end
  );
$$;
```

> Null/empty language → `concat_ws` drops the final part → identical code to today.

### Task 1.3: Recreate `ensure_default_stock_sku` with language in code + label + identity

**Files:**
- Modify: `Database/supabase/migrations/20260623120000_card_stock_unit_language.sql` (append)

- [ ] **Step 1: Append DROP + CREATE.** Copy verbatim from `20260610110000_…sql:148–238`, then apply exactly these edits:

1. Add trailing param `p_language text default null` (after `p_image_storage_path`).
2. Pass it to the code generator — the `next_code := app_private.stock_sku_default_code(...)` call gains a 9th arg `p_language`.
3. After `next_label := case … end;`, append a language suffix.
4. Add `'language'` to the `backfillIdentity` jsonb object.

The changed declarations/body lines:

```sql
  next_code := app_private.stock_sku_default_code(
    card_row.card_code,
    card_row.search_code,
    card_row.id,
    coalesce(nullif(p_condition, ''), 'raw'),
    p_grade,
    p_grading_service,
    p_cert_number,
    p_gemrate_id,
    p_language            -- NEW (9th arg)
  );
  -- … next_kind / next_label CASE unchanged …
  if nullif(p_language, '') is not null then
    next_label := next_label || ' · ' || case lower(p_language)
      when 'english' then 'EN'
      when 'japanese' then 'JP'
      when 'korean' then 'KR'
      when 'chinese' then 'CN'
      else upper(p_language)
    end;
  end if;
```

And inside the `metadata` jsonb of the `insert into public.stock_skus(...)`, extend `backfillIdentity`:

```sql
      jsonb_build_object(
        'condition', coalesce(nullif(p_condition, ''), 'raw'),
        'grade', coalesce(p_grade, ''),
        'gradingService', coalesce(p_grading_service, ''),
        'certNumber', coalesce(p_cert_number, ''),
        'gemrateId', coalesce(p_gemrate_id, ''),
        'language', coalesce(p_language, '')     -- NEW
      )
```

Leave the function signature header as the new 9-arg form:

```sql
create or replace function app_private.ensure_default_stock_sku(
  p_card_id uuid,
  p_condition text,
  p_grade text default null,
  p_grading_service text default null,
  p_cert_number text default null,
  p_gemrate_id text default null,
  p_image_url text default null,
  p_image_storage_path text default null,
  p_language text default null
)
```

> The historical backfill (one-time, already applied) and `edit_card_stock_unit` call this with 8 positional args; they bind to the new function with `p_language => null`. `edit_card_stock_unit` is fixed in Task 1.4.

### Task 1.4: Recreate `edit_card_stock_unit` to preserve language

**Files:**
- Modify: `Database/supabase/migrations/20260623120000_card_stock_unit_language.sql` (append)

- [ ] **Step 1: Append CREATE OR REPLACE.** Copy verbatim from `20260610110000_…sql:1382–~1560` (the full `create or replace function public.edit_card_stock_unit(...) … $$;`). Apply two edits so editing a unit doesn't strip its language:

1. Where it reads the existing unit row, capture its language into a local var, e.g. `v_language text;` in the `declare`, and `v_language := <unit_row>.language;` after the row is loaded (use the existing selected row variable; match its name from the copied body).
2. The `app_private.ensure_default_stock_sku(...)` call at ~1507 gains a 9th arg `v_language`.
3. If the edit writes identity columns back onto the unit, include `language = v_language` so it is retained (only if the UPDATE/INSERT in that body sets identity columns; otherwise no-op).

> Keep the function signature identical — this is a pure CREATE OR REPLACE (no new params). If reproducing the full body is impractical, preserve language by reading the row's `language` and passing it through; do not change behavior otherwise.

### Task 1.5: CREATE OR REPLACE `adjust_card_stock_units` (set unit language, language-aware dedup + remove-match)

**Files:**
- Modify: `Database/supabase/migrations/20260623120000_card_stock_unit_language.sql` (append)

- [ ] **Step 1: Append CREATE OR REPLACE.** Copy verbatim from `20260610110000_…sql:969–1176` (signature **unchanged**). Apply exactly these edits:

1. In `declare`, add:
```sql
  v_language text := nullif(normalized_metadata ->> 'language', '');
```
2. The positive-delta `v_stock_sku_id := app_private.ensure_default_stock_sku(...)` call gains a 9th arg `v_language`:
```sql
    v_stock_sku_id := app_private.ensure_default_stock_sku(
      p_card_id,
      v_condition,
      case when v_condition = 'graded' then v_grade else null end,
      case when v_condition = 'graded' then v_grading_service else null end,
      case when v_condition = 'graded' then v_cert else null end,
      case when v_condition = 'graded' then nullif(p_gemrate_id, '') else null end,
      p_image_url,
      p_image_storage_path,
      v_language            -- NEW (9th arg)
    );
```
3. In the positive-delta `insert into public.card_stock_units(...)` column list, add `language`; in the `select`, add `v_language` (set for graded **and** raw):
```sql
      insert into public.card_stock_units(
        card_id, stock_sku_id, status, source_type, source_id, created_by_admin_id,
        metadata, condition, grade, grading_service, cert_number, gemrate_id,
        image_url, image_storage_path, quantity,
        language                              -- NEW column
      )
      select
        p_card_id, v_stock_sku_id, 'available',
        coalesce(nullif(p_source_type, ''), 'admin_adjustment'),
        nullif(p_source_id, ''), p_admin_id,
        normalized_metadata || jsonb_build_object('createdByAdminId', p_admin_id, 'stockSkuId', v_stock_sku_id),
        v_condition,
        case when v_condition = 'graded' then v_grade else null end,
        case when v_condition = 'graded' then v_grading_service else null end,
        case when v_condition = 'graded' then v_cert else null end,
        case when v_condition = 'graded' then nullif(p_gemrate_id, '') else null end,
        nullif(p_image_url, ''), nullif(p_image_storage_path, ''), 1,
        v_language                            -- NEW value
      from generate_series(1, p_quantity_delta)
      returning id, card_id
```
4. In the negative-delta selection (the `where … (v_stock_sku_id is null and …)` branch), add a language match so removing by group archives the right language:
```sql
            and coalesce(nullif(stock.condition, ''), 'raw') = v_condition
            and coalesce(stock.language, '') = coalesce(v_language, '')   -- NEW
```

### Task 1.6: CREATE OR REPLACE `adjust_stock_sku_units` (set unit language from metadata)

**Files:**
- Modify: `Database/supabase/migrations/20260623120000_card_stock_unit_language.sql` (append)

- [ ] **Step 1: Append CREATE OR REPLACE.** Copy verbatim from `20260610110000_…sql:821–967` (signature **unchanged**). Edits:

1. In `declare`, add:
```sql
  v_language text := nullif(coalesce(p_metadata, '{}'::jsonb) ->> 'language', '');
```
2. In the positive-delta `insert into public.card_stock_units(...)` column list add `language`, and in the `select` add `v_language` (last column, mirroring Task 1.5).

- [ ] **Step 2: Commit the function changes**

```bash
git add Database/supabase/migrations/20260623120000_card_stock_unit_language.sql
git commit -m "feat(db): thread variant language through stock_sku identity + adjust RPCs"
```

### Task 1.7: Add `language` to generated DB types

**Files:**
- Modify: `Website/src/lib/supabase/types.ts` (the `card_stock_units` block, starts line ~536)

- [ ] **Step 1: Add the field to Row, Insert, Update.** In the `card_stock_units` table type, add `language: string | null` to `Row`, and `language?: string | null` to `Insert` and `Update`, alongside the existing `grade` / `condition` fields. Do **not** touch the `adjust_*` `Functions` `Args` (signatures unchanged).

- [ ] **Step 2: Typecheck**

Run: `cd Website && npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add Website/src/lib/supabase/types.ts
git commit -m "chore(types): card_stock_units.language"
```

---

## Phase 2 — Write path (route + Add-Stock wizard)

### Task 2.1: Extend the stock-adjust API client; drop card-level language

**Files:**
- Modify: `Website/src/features/ynot/admin/prize-catalog/catalog-api.ts`

- [ ] **Step 1: Add `language` to `StockAdjustInput`** (after `gemrateId`):
```ts
  gemrateId?: string;
  language?: string; // "english" | "japanese" | "korean" | "chinese"
```
- [ ] **Step 2: Remove `language` from `MainSkuInput`** (delete the `language?: string;` line added in `43e0436`).
- [ ] **Step 3: Typecheck** — `cd Website && npm run typecheck`. Expect failures only in `MainSkuForm.tsx` (fixed in Task 4.3); note them and proceed.

### Task 2.2: Validate + forward language in the card-stock route

**Files:**
- Modify: `Website/src/app/api/ynot/admin/card-stock/route.ts`

- [ ] **Step 1: Add the language allow-set** near `CONDITIONS`/`GRADING_SERVICES`:
```ts
const LANGUAGES = new Set(["english", "japanese", "korean", "chinese"]);
```
- [ ] **Step 2: Parse + validate** (only meaningful on add; mirror the `grade` derivation around line 149):
```ts
  const languageRaw = text(body?.language, 16).toLowerCase();
  const language =
    delta > 0 && LANGUAGES.has(languageRaw) ? languageRaw : null;
```
- [ ] **Step 3: Inject into BOTH `p_metadata` blobs** (the `adjust_stock_sku_units` branch ~197 and the `adjust_card_stock_units` branch ~218), adding `language` to each object:
```ts
        p_metadata: {
          adjustedByAdminId: admin.adminId,
          reason,
          sourceId,
          stockUnitGroupKey: stockUnitGroupKey || null,
          language, // null when unspecified or invalid
        } satisfies Json,
```
- [ ] **Step 4: Typecheck** — `cd Website && npm run typecheck` (route should be clean).
- [ ] **Step 5: Commit**
```bash
git add Website/src/features/ynot/admin/prize-catalog/catalog-api.ts Website/src/app/api/ynot/admin/card-stock/route.ts
git commit -m "feat(api): accept + forward variant language on stock adjust"
```

### Task 2.3: Language picker in Add-Stock Step 3

**Files:**
- Modify: `Website/src/features/ynot/admin/prize-catalog/add-stock/Step3Stock.tsx`

- [ ] **Step 1: Add a guard test first.** In `Website/scripts/test-admin-prize-catalog-edit-stock.mjs` add:
```js
const step3 = read("../src/features/ynot/admin/prize-catalog/add-stock/Step3Stock.tsx");
test("Step3Stock offers a variant language picker", () => {
  assert.ok(step3.includes("onLanguage"), "Step3 must accept onLanguage");
  assert.ok(step3.includes('id="pcx-stock-language"'), "Step3 must render a language select");
  assert.ok(
    step3.includes("English") && step3.includes("Japanese") &&
    step3.includes("Korean") && step3.includes("Chinese"),
    "language options EN/JP/KR/CN",
  );
});
```
- [ ] **Step 2: Run it — expect FAIL.** `cd Website && node --test scripts/test-admin-prize-catalog-edit-stock.mjs`
- [ ] **Step 3: Add props** to `Step3StockProps` and the destructure:
```ts
  language: string;
  onLanguage: (l: string) => void;
```
- [ ] **Step 4: Render the select** (place inside the condition/grade column; mirror the existing `<label>` + `pcx-input` markup). Use a constant at module top:
```tsx
const LANGUAGE_CHOICES = [
  { value: "", label: "—" },
  { value: "english", label: "English" },
  { value: "japanese", label: "Japanese" },
  { value: "korean", label: "Korean" },
  { value: "chinese", label: "Chinese" },
] as const;
```
```tsx
<div className="pcx-field">
  <label htmlFor="pcx-stock-language">Language</label>
  <select
    id="pcx-stock-language"
    className="pcx-input"
    value={language}
    onChange={(e) => onLanguage(e.target.value)}
  >
    {LANGUAGE_CHOICES.map((l) => (
      <option key={l.value} value={l.value}>{l.label}</option>
    ))}
  </select>
</div>
```
- [ ] **Step 5: Run the test — expect PASS.** `cd Website && node --test scripts/test-admin-prize-catalog-edit-stock.mjs`

### Task 2.4: Wire language state through PrizeCatalogScreen

**Files:**
- Modify: `Website/src/features/ynot/admin/prize-catalog/PrizeCatalogScreen.tsx`

- [ ] **Step 1: Add state** beside the other add-stock field state (grade/cert/condition):
```ts
const [stockLanguage, setStockLanguage] = useState("");
```
- [ ] **Step 2: Pass to Step3** where `<Step3Stock … />` is rendered: `language={stockLanguage} onLanguage={setStockLanguage}`.
- [ ] **Step 3: Include in the add call.** In `handleAddStockRow` → the `adjustCardStock({ … })` object (line ~279), add `language: stockLanguage || undefined`.
- [ ] **Step 4: Reset on drawer open/close** — wherever the other field state resets on a new `openId`, reset `setStockLanguage("")`.
- [ ] **Step 5: Typecheck** — `cd Website && npm run typecheck`. Expect 0 errors here.
- [ ] **Step 6: Commit**
```bash
git add Website/src/features/ynot/admin/prize-catalog/add-stock/Step3Stock.tsx Website/src/features/ynot/admin/prize-catalog/PrizeCatalogScreen.tsx Website/scripts/test-admin-prize-catalog-edit-stock.mjs
git commit -m "feat(stock): language picker in Add-Stock wizard"
```

---

## Phase 3 — Read path (select, group, label)

### Task 3.1: Add `language` to the stock-unit display type

**Files:**
- Modify: `Website/src/lib/lucky-draw/types.ts`

- [ ] **Step 1: Locate** the element type behind `CardCatalogItem.stockUnits` (grep `stockUnits` in the file; it is an array of an object type carrying `condition`/`grade`/`gradingService`/`certNumber`/`gemrateId`).
- [ ] **Step 2: Add** `language?: string | null;` to that element shape. (`CatalogStockUnit` in `stock-sku-usage.ts` derives from this, so it picks the field up automatically.)
- [ ] **Step 3: Typecheck** — `cd Website && npm run typecheck`.

### Task 3.2: Select `language` and map it onto display units

**Files:**
- Modify: `Website/src/features/ynot/data.ts`

- [ ] **Step 1: Add `language` to the catalog select strings** (lines ~853 and ~855):
```ts
"id,card_id,stock_sku_id,condition,grade,grading_service,cert_number,gemrate_id,image_url,status,language";
// fallback (no stock_sku_id):
"id,card_id,condition,grade,grading_service,cert_number,gemrate_id,image_url,status,language";
```
- [ ] **Step 2: Add `"language"`** to the `PrizePoolStockUnitRow` `Pick<…>` (lines ~559–571) and to the prize-pool select where those columns are fetched.
- [ ] **Step 3: Map it onto display units.** In `stockUnitForSku` (line ~674) and the catalog display-unit builder (line ~677), add:
```ts
    language: unit.language ?? null,
```
- [ ] **Step 4: Typecheck** — `cd Website && npm run typecheck`.

### Task 3.3: Fold language into the variant group key + label

**Files:**
- Modify: `Website/src/features/ynot/stock-sku-usage.ts`
- Modify: `Website/src/features/ynot/data.ts` (the `groupKey` at line ~703)
- Test: `Website/scripts/test-admin-prize-catalog-edit-stock.mjs`

- [ ] **Step 1: Guard test first** (append):
```js
const stockSkuUsage = read("../src/features/ynot/stock-sku-usage.ts");
test("stockUnitGroupKey + label are language-aware", () => {
  assert.ok(stockSkuUsage.includes("language"), "group/label helpers reference language");
  const keyFn = stockSkuUsage.slice(stockSkuUsage.indexOf("function stockUnitGroupKey"));
  assert.ok(keyFn.includes("language"), "stockUnitGroupKey must include language");
});
```
Run — expect FAIL: `cd Website && node --test scripts/test-admin-prize-catalog-edit-stock.mjs`.

- [ ] **Step 2: `stockUnitGroupKey`** — add `"language"` to the `Pick` and append it **only when present** so legacy null-language keys stay byte-identical (preserves matches against persisted prize `stockUnitGroupKey` metadata):
```ts
export function stockUnitGroupKey(
  unit: Pick<
    CatalogStockUnit,
    "certNumber" | "condition" | "gemrateId" | "grade" | "gradingService" | "language"
  >,
) {
  const condition = unit.condition || "raw";
  const base =
    condition !== "graded"
      ? [condition, "", "", "", ""]
      : [condition, unit.grade || "", unit.gradingService || "", unit.certNumber || "", unit.gemrateId || ""];
  if (unit.language) base.push(unit.language);
  return base.join("");
}
```
- [ ] **Step 3: `stockUnitDisplayLabel`** — add `"language"` to its `Pick` and append a language suffix:
```ts
  const langSuffix = unit.language ? ` · ${languageShort(unit.language)}` : "";
  // graded: return [...].filter(Boolean).join(" · ") + langSuffix;
  // non-graded: return conditionLabel(unit.condition) + langSuffix;
```
Add a small module helper:
```ts
function languageShort(language: string) {
  switch (language.toLowerCase()) {
    case "english": return "EN";
    case "japanese": return "JP";
    case "korean": return "KR";
    case "chinese": return "CN";
    default: return language.toUpperCase();
  }
}
```
- [ ] **Step 4: `cardLanguageSkuPart`** — add Korean:
```ts
  if (language === "korean") return "KR";
```
- [ ] **Step 5: Primary group key in `data.ts`** (line ~703) — make the `stock-sku:` key language-aware (defensive, in case one stock_sku ever holds mixed languages):
```ts
    const groupKey = stockUnit.stock_sku_id
      ? `stock-sku:${stockUnit.stock_sku_id}${displayUnit.language ? `${displayUnit.language}` : ""}`
      : stockUnitGroupKey(displayUnit);
```
- [ ] **Step 6: Run the test — expect PASS.** Then full typecheck: `cd Website && npm run typecheck`.
- [ ] **Step 7: Commit**
```bash
git add Website/src/lib/lucky-draw/types.ts Website/src/features/ynot/data.ts Website/src/features/ynot/stock-sku-usage.ts Website/scripts/test-admin-prize-catalog-edit-stock.mjs
git commit -m "feat(catalog): language-aware variant grouping + labels"
```

---

## Phase 4 — Surface on the variant; remove from Main SKU

### Task 4.1: Show the language pill on each variant row

**Files:**
- Modify: `Website/src/features/ynot/admin/prize-catalog/VariantTable.tsx`

- [ ] **Step 1: Render the pill.** Each variant row maps a `StockSkuGroup` whose `label` already carries the language suffix from Task 3.3. Additionally render a discrete chip when the group's units have a language. Derive it from the first unit:
```tsx
const groupLanguage = group.units.find((u) => u.language)?.language ?? null;
// …in the row's identity cell, after the label:
{groupLanguage && (
  <span className="pcx-lang-chip" title="Card language">{languageLabel(groupLanguage)}</span>
)}
```
Reuse a `languageLabel` helper (title-cases / maps to EN-JP-KR-CN); if one already exists in `LedgerRow.tsx`, extract it to a shared module `prize-catalog/format.ts` and import in both. Otherwise add it locally.

- [ ] **Step 2: Typecheck** — `cd Website && npm run typecheck`.

### Task 4.2: Remove the card-name language chip

**Files:**
- Modify: `Website/src/features/ynot/admin/prize-catalog/LedgerRow.tsx`

- [ ] **Step 1: Delete** the `{row.card.language && <span className="pcx-lang-chip" …>…</span>}` block next to the card name (added in `43e0436`). If `languageLabel` was extracted to `format.ts` in Task 4.1, remove the now-unused local copy here.

### Task 4.3: Remove the Language picker from Create-Main-SKU

**Files:**
- Modify: `Website/src/features/ynot/admin/prize-catalog/MainSkuForm.tsx`

- [ ] **Step 1: Remove** `LANGUAGE_OPTIONS`, `LanguageOption`, `languageDisplayToOption`, the `languageOption`/`customLanguage` state, `resolvedLanguage`, the Language `<Field>`/`<select>` (the `pcx-form-row2` pairing Category+Language → make Category a single-column row again), and the `language: resolvedLanguage || undefined` line in the submit object.
- [ ] **Step 2: Typecheck + lint** — `cd Website && npm run typecheck && npm run lint`. Expect 0 errors (pre-existing img warnings OK).

### Task 4.4: Update guard tests for the move

**Files:**
- Modify: `Website/scripts/test-admin-prize-catalog-mainsku.mjs`
- Modify: `Website/scripts/test-admin-prize-catalog-edit-stock.mjs`

- [ ] **Step 1: In `mainsku.mjs`,** replace the "captures the card language" test with the inverse:
```js
test("MainSkuForm no longer owns language (moved to variant)", () => {
  assert.ok(!mainSku.includes("LANGUAGE_OPTIONS"), "language picker removed from Main SKU");
  assert.ok(!mainSku.includes('id="pcx-language"'), "no Main-SKU language select");
});
```
- [ ] **Step 2: In `edit-stock.mjs`,** replace the old `row.card.language` LedgerRow assertion with a VariantTable one:
```js
const variantTable = read("../src/features/ynot/admin/prize-catalog/VariantTable.tsx");
test("variant row shows the card language chip", () => {
  assert.ok(variantTable.includes("pcx-lang-chip"), "language chip on the variant row");
  assert.ok(variantTable.includes("language"), "variant row derives language");
});
```
- [ ] **Step 3: Run both suites — expect PASS.** `cd Website && node --test scripts/test-admin-prize-catalog-mainsku.mjs scripts/test-admin-prize-catalog-edit-stock.mjs`
- [ ] **Step 4: Commit**
```bash
git add Website/src/features/ynot/admin/prize-catalog/VariantTable.tsx Website/src/features/ynot/admin/prize-catalog/LedgerRow.tsx Website/src/features/ynot/admin/prize-catalog/MainSkuForm.tsx Website/scripts/test-admin-prize-catalog-mainsku.mjs Website/scripts/test-admin-prize-catalog-edit-stock.mjs
# include format.ts if extracted
git commit -m "feat(catalog): language chip on variant; remove from Main SKU"
```

---

## Phase 5 — Tests, QA, and production rollout

### Task 5.1: Migration static guard test

**Files:**
- Create: `Website/scripts/test-card-stock-language-migration.mjs`

- [ ] **Step 1: Add a guard over the migration .sql** asserting the contract:
```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const base = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  resolve(base, "../../Database/supabase/migrations/20260623120000_card_stock_unit_language.sql"),
  "utf8",
);

test("adds language column with the canonical CHECK", () => {
  assert.ok(/add column if not exists language text/.test(sql));
  assert.ok(/language in \('english', 'japanese', 'korean', 'chinese'\)/.test(sql));
});
test("threads language through stock_sku identity helpers", () => {
  assert.ok(sql.includes("p_language text default null"));
  assert.ok(sql.includes("drop function if exists app_private.stock_sku_default_code"));
  assert.ok(sql.includes("app_private.ensure_default_stock_sku"));
});
test("adjust RPC signatures stay 13-arg (language rides p_metadata)", () => {
  assert.ok(sql.includes("normalized_metadata ->> 'language'"));
});
```
- [ ] **Step 2: Run — expect PASS.** `cd Website && node --test scripts/test-card-stock-language-migration.mjs`

### Task 5.2: Full verification gate

- [ ] **Step 1: Typecheck** — `cd Website && npm run typecheck` → exit 0.
- [ ] **Step 2: Lint** — `cd Website && npm run lint` → 0 errors (pre-existing `next/image` warnings acceptable).
- [ ] **Step 3: All prize-catalog guard suites + migration test:**
```bash
cd Website && node --test scripts/test-admin-prize-catalog-*.mjs scripts/test-card-stock-language-migration.mjs
```
Expected: 0 failures.
- [ ] **Step 4: Commit**
```bash
git add Website/scripts/test-card-stock-language-migration.mjs
git commit -m "test: guard variant-language migration + read/write path"
```

### Task 5.3: Final review (subagent-driven: dispatch final code reviewer)

- [ ] Dispatch a final review across the whole branch diff (`git diff main...HEAD`). Confirm: RPC signatures unchanged; null-language backward compatibility intact; no `any`; no card-level language references remain (`grep -rn "card.language\|MainSkuInput" Website/src` shows only intended sites); CHECK set matches the route allow-set.

### Task 5.4: Production rollout runbook (performed by the user)

> The DB is production; this plan does **not** apply the migration. Hand this to the user.

- [ ] **1. Apply the migration FIRST** (additive + backward compatible — safe before the new code ships): via Supabase SQL editor / `supabase db push` against project `szjoarkijeaspazbrchc`.
- [ ] **2. Verify** in SQL: `select column_name from information_schema.columns where table_name='card_stock_units' and column_name='language';` returns one row; `\df app_private.ensure_default_stock_sku` shows the 9-arg form.
- [ ] **3. Deploy code** (merge to `main` per the project's "ship = merge to main"). Old rows have `language = null` → render as no chip (correct).
- [ ] **4. Post-deploy smoke** (sandbox OFF): add a PSA 10 **Japanese** unit and a PSA 10 **English** unit to one test card → expect **two** variant rows labelled `… · JP` / `… · EN`. Remove one → confirm the correct language's unit is archived (the other untouched). Confirm `stock_skus` now has two distinct `sku_code`s for that grade.
- [ ] **5. Rollback** (if needed): the column is additive; reverting the code restores prior behavior. Drop only if certain: `alter table public.card_stock_units drop column language;` (and restore the prior helper definitions from `20260610110000`).

---

## Self-review notes

- **Spec coverage:** language on the variant (1.1, 1.5, 2.3); same code/4 languages as distinct variants (1.2/1.3 sku_code+label, 3.3 grouping); typed column + CHECK (1.1); removed from Main SKU (4.3); chip on variant (4.1); EN/JP/KR/CN incl. Korean (1.1, 2.2, 2.3, 3.3).
- **Backward compatibility:** null-language → unchanged `sku_code` (concat_ws), unchanged `stockUnitGroupKey` (append-only-when-present), legacy rows render chip-less. RPC signatures unchanged → generated `Args` types valid, grants untouched.
- **Type consistency:** `p_language` is the trailing 9th arg on both helpers; `language` column added to Row/Insert/Update and to the `stockUnits[number]` shape so `CatalogStockUnit` inherits it; `StockAdjustInput.language` matches the route's `p_metadata.language`.
- **Risk watch:** `edit_card_stock_unit` must preserve language (1.4) or editing a unit could move it to a null-language `stock_sku`.
