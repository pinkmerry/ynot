# Auto-Generated Stock SKU Variants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop mixing raw, PSA, BGS, CGC, sealed, language, set, and variant stock under one base card row by introducing an auto-generated stock SKU layer. Prize assignments and stock counts must target the exact stock SKU, not only the base card.

**Architecture:** Keep `public.cards` as the base catalog identity for the card product, add `public.card_stock_skus` as the sellable/winnable variant identity, and attach both physical `card_stock_units` and `draw_round_prizes` to that stock SKU. The UI still groups by card, but all inventory and prize pool numbers display per stock SKU.

**Tech Stack:** Next.js app in `Website/`, Supabase/Postgres migrations in `Database/supabase/migrations/`, TypeScript helper logic in `Website/src/features/ynot/`, admin API routes under `Website/src/app/api/ynot/admin/`, verification scripts under `Website/scripts/` and `Website/tools/verification/`.

---

## Current Problem

Right now, the same base card can hold different physical stock units:

| Base card row | Physical stock unit | Current result |
| --- | --- | --- |
| `OP09-118` Gold D. Roger | Raw / Ungraded / Japanese | Correct for raw stock |
| `OP09-118` Gold D. Roger | PSA 9 / cert `123` | Mixed into same base stock |
| `OP09-118` Gold D. Roger | BGS 9.5 / cert `456` | Mixed into same base stock |

That makes `Global stock`, `Prize pool`, assignments, and pack availability look like one bucket, even though these are different prize SKUs.

The corrected model is:

| Base card | Auto stock SKU | Variant identity | Physical units |
| --- | --- | --- | --- |
| `OP09-118` Gold D. Roger | `OP09-118-JP-RAW` | Japanese raw ungraded | raw unit #1, raw unit #2 |
| `OP09-118` Gold D. Roger | `OP09-118-JP-PSA9` | Japanese PSA 9 | PSA cert `123` |
| `OP09-118` Gold D. Roger | `OP09-118-JP-BGS95` | Japanese BGS 9.5 | BGS cert `456` |

Raw has no cert identity. A cert belongs to one physical graded unit, not to the stock SKU. The stock SKU is the repeatable variant bucket; `card_stock_units` are the individual things that can be reserved, awarded, or removed.

---

## Target Rules

- `cards` is the base catalog row: product name, brand, sub-category, model code, card number, base image.
- `card_stock_skus` is the exact stock/prize bucket: language, release year, set, variant, condition, grading service, grade, generated SKU code.
- `card_stock_units` is the physical inventory item: status, cert number, GemRate ID, image override, reservation/award lifecycle.
- `draw_round_prizes` points to `stock_sku_id`, not just `card_id`.
- Opening packs reserves and awards exact stock units from the assigned `stock_sku_id`.
- Raw and sealed SKUs must not store grading service, grade, or cert number.
- Graded SKUs must store grading service and grade.
- Cert number remains optional at unit level because some graded stock may be entered before cert data is ready, but a cert number must be unique per grading service when present.
- SKU is generated automatically and can be previewed in the admin UI before stock is added.

---

## SKU Format

Use deterministic uppercase ASCII tokens.

| Attribute | Rule | Example |
| --- | --- | --- |
| Base model code | Existing `cards.model_code`, sanitized | `OP09-118` |
| Language | Two-letter token from language | `JP`, `EN`, `TH` |
| Variant | Optional short token if present | `MANGA`, `ALT`, `SEC` |
| Raw condition | `RAW` | `OP09-118-JP-RAW` |
| Sealed condition | `SEALED` | `OP09-118-JP-SEALED` |
| PSA grade | `PSA` + normalized grade | `OP09-118-JP-PSA9` |
| BGS grade | `BGS` + normalized grade | `OP09-118-JP-BGS95` |
| CGC grade | `CGC` + normalized grade | `OP09-118-JP-CGC10` |
| BGS Black Label | `BGS10BL` | `OP09-118-JP-BGS10BL` |

Grade normalization examples:

| Display grade | SKU token |
| --- | --- |
| `10` | `10` |
| `9.5` | `95` |
| `8.5` | `85` |
| `10 Black Label` | `10BL` |
| `10 Pristine` | `10PR` |

---

## File Structure

Create or update these files:

```text
Database/supabase/migrations/20260601090000_card_stock_skus.sql
Website/src/features/ynot/stock-sku.ts
Website/src/features/ynot/card-catalog-metadata.ts
Website/src/features/ynot/admin-card-catalog-helpers.ts
Website/src/features/ynot/client.tsx
Website/src/lib/lucky-draw/types.ts
Website/src/lib/supabase/types.ts
Website/src/app/api/ynot/admin/cards/route.ts
Website/src/app/api/ynot/admin/card-stock/route.ts
Website/src/app/api/ynot/admin/card-stock/unit/route.ts
Website/src/app/api/ynot/admin/prizes/route.ts
Website/src/app/api/ynot/admin/prize-readiness/route.ts
Website/src/app/api/ynot/admin/stock-readiness/route.ts
Website/scripts/test-stock-sku.mjs
Website/scripts/test-card-catalog-metadata.mjs
Website/scripts/test-admin-card-catalog-helpers.mjs
Website/tools/verification/verify-card-stock-skus.mjs
Website/package.json
```

---

## Task 1: Add Shared Stock SKU Helper

- [ ] Create `Website/src/features/ynot/stock-sku.ts` with the canonical TypeScript helper.

```ts
export type StockCondition = "raw" | "sealed" | "graded";
export type GradingService = "psa" | "bgs" | "cgc" | "other";

export type StockSkuDraft = {
  modelCode: string;
  language?: string | null;
  variant?: string | null;
  condition: StockCondition;
  gradingService?: GradingService | null;
  grade?: string | null;
};

const LANGUAGE_TOKENS: Record<string, string> = {
  english: "EN",
  japanese: "JP",
  thai: "TH",
  korean: "KR",
  chinese: "CN",
};

export function normalizeSkuToken(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeLanguageToken(value?: string | null): string {
  if (!value) return "NA";
  const key = value.trim().toLowerCase();
  return LANGUAGE_TOKENS[key] ?? normalizeSkuToken(value).slice(0, 3);
}

export function normalizeGradeToken(value?: string | null): string {
  if (!value) return "";
  const normalized = value.trim().toUpperCase();
  if (normalized === "10 BLACK LABEL") return "10BL";
  if (normalized === "10 PRISTINE") return "10PR";
  return normalized.replace(/\./g, "").replace(/[^A-Z0-9]+/g, "");
}

export function generateStockSkuCode(draft: StockSkuDraft): string {
  const model = normalizeSkuToken(draft.modelCode);
  const language = normalizeLanguageToken(draft.language);
  const variant = draft.variant ? normalizeSkuToken(draft.variant) : "";

  if (draft.condition === "graded") {
    if (!draft.gradingService || !draft.grade) {
      throw new Error("Graded stock SKU requires grading service and grade.");
    }
    const service = normalizeSkuToken(draft.gradingService);
    const grade = normalizeGradeToken(draft.grade);
    return [model, language, variant, `${service}${grade}`].filter(Boolean).join("-");
  }

  return [model, language, variant, draft.condition.toUpperCase()].filter(Boolean).join("-");
}

export function buildStockSkuFingerprint(draft: StockSkuDraft): string {
  return [
    normalizeSkuToken(draft.modelCode),
    normalizeLanguageToken(draft.language),
    draft.variant ? normalizeSkuToken(draft.variant) : "",
    draft.condition,
    draft.gradingService ?? "",
    normalizeGradeToken(draft.grade),
  ].join("|");
}
```

- [ ] Add `Website/scripts/test-stock-sku.mjs`.

```js
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStockSkuFingerprint,
  generateStockSkuCode,
  normalizeGradeToken,
} from "../src/features/ynot/stock-sku.ts";

test("generates raw stock SKU without cert or grade", () => {
  assert.equal(
    generateStockSkuCode({
      modelCode: "OP09-118",
      language: "Japanese",
      condition: "raw",
    }),
    "OP09-118-JP-RAW",
  );
});

test("generates PSA numeric grade stock SKU", () => {
  assert.equal(
    generateStockSkuCode({
      modelCode: "OP09-118",
      language: "Japanese",
      condition: "graded",
      gradingService: "psa",
      grade: "9",
    }),
    "OP09-118-JP-PSA9",
  );
});

test("generates BGS half grade stock SKU", () => {
  assert.equal(
    generateStockSkuCode({
      modelCode: "OP09-118",
      language: "Japanese",
      condition: "graded",
      gradingService: "bgs",
      grade: "9.5",
    }),
    "OP09-118-JP-BGS95",
  );
});

test("normalizes premium grade labels", () => {
  assert.equal(normalizeGradeToken("10 Black Label"), "10BL");
  assert.equal(normalizeGradeToken("10 Pristine"), "10PR");
});

test("fingerprint separates PSA 10 from BGS 10", () => {
  assert.notEqual(
    buildStockSkuFingerprint({
      modelCode: "OP09-118",
      language: "Japanese",
      condition: "graded",
      gradingService: "psa",
      grade: "10",
    }),
    buildStockSkuFingerprint({
      modelCode: "OP09-118",
      language: "Japanese",
      condition: "graded",
      gradingService: "bgs",
      grade: "10",
    }),
  );
});
```

- [ ] Add a package script in `Website/package.json`.

```json
"test:stock-sku": "node --experimental-strip-types --test scripts/test-stock-sku.mjs"
```

- [ ] Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:stock-sku
```

- [ ] Commit:

```bash
git add Website/src/features/ynot/stock-sku.ts Website/scripts/test-stock-sku.mjs Website/package.json
git commit -m "Make stock SKU generation deterministic" \
  -m "Constraint: Admin stock and prize assignment need exact variant identity before database wiring." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Tested: npm run test:stock-sku"
```

---

## Task 2: Update Grade Metadata for PSA and BGS

- [ ] Update `Website/src/features/ynot/card-catalog-metadata.ts` so grade options are service-aware.

```ts
export type GradeOption = {
  value: string;
  label: string;
};

export const gradeOptionsByService: Record<string, GradeOption[]> = {
  psa: [
    { value: "10", label: "PSA 10" },
    { value: "9", label: "PSA 9" },
    { value: "8", label: "PSA 8" },
    { value: "7", label: "PSA 7" },
    { value: "6", label: "PSA 6" },
    { value: "5", label: "PSA 5" },
    { value: "4", label: "PSA 4" },
    { value: "3", label: "PSA 3" },
    { value: "2", label: "PSA 2" },
    { value: "1", label: "PSA 1" },
  ],
  bgs: [
    { value: "10 Black Label", label: "BGS 10 Black Label" },
    { value: "10 Pristine", label: "BGS 10 Pristine" },
    { value: "10", label: "BGS 10" },
    { value: "9.5", label: "BGS 9.5" },
    { value: "9", label: "BGS 9" },
    { value: "8.5", label: "BGS 8.5" },
    { value: "8", label: "BGS 8" },
    { value: "7.5", label: "BGS 7.5" },
    { value: "7", label: "BGS 7" },
  ],
  cgc: [
    { value: "10", label: "CGC 10" },
    { value: "9.5", label: "CGC 9.5" },
    { value: "9", label: "CGC 9" },
    { value: "8.5", label: "CGC 8.5" },
    { value: "8", label: "CGC 8" },
  ],
  other: [
    { value: "10", label: "10" },
    { value: "9.5", label: "9.5" },
    { value: "9", label: "9" },
    { value: "8.5", label: "8.5" },
    { value: "8", label: "8" },
  ],
};

export function gradeOptionsForService(service?: string | null): GradeOption[] {
  if (!service) return [];
  return gradeOptionsByService[service] ?? gradeOptionsByService.other;
}
```

- [ ] Keep the existing exported `cardGradeOptions` as a compatibility export if current UI imports it.

```ts
export const cardGradeOptions = gradeOptionsByService.psa;
```

- [ ] Update `Website/scripts/test-card-catalog-metadata.mjs` to assert:
  - PSA has `10` and `9`.
  - BGS has `9.5`.
  - BGS has `10 Black Label`.
  - `gradeOptionsForService(null)` returns an empty array.

- [ ] Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:card-catalog-metadata
npm run test:stock-sku
```

- [ ] Commit:

```bash
git add Website/src/features/ynot/card-catalog-metadata.ts Website/scripts/test-card-catalog-metadata.mjs
git commit -m "Separate grade options by grading service" \
  -m "Constraint: BGS 9.5 and BGS 10 labels must not be forced into PSA-only choices." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Tested: npm run test:card-catalog-metadata; npm run test:stock-sku"
```

---

## Task 3: Add Database Stock SKU Layer

- [ ] Create `Database/supabase/migrations/20260601090000_card_stock_skus.sql`.

```sql
create table if not exists public.card_stock_skus (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete restrict,
  sku_code text not null,
  sku_fingerprint text not null,
  language text,
  release_year integer,
  card_set text,
  variant text,
  condition text not null default 'raw',
  grading_service text,
  grade text,
  display_label text not null,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint card_stock_skus_condition_check
    check (condition in ('raw', 'sealed', 'graded')),
  constraint card_stock_skus_grading_service_check
    check (grading_service is null or grading_service in ('psa', 'bgs', 'cgc', 'other')),
  constraint card_stock_skus_raw_has_no_grade_check
    check (
      (condition = 'graded' and grading_service is not null and nullif(trim(grade), '') is not null)
      or
      (condition <> 'graded' and grading_service is null and grade is null)
    )
);

create unique index if not exists card_stock_skus_sku_code_key
  on public.card_stock_skus (sku_code);

create unique index if not exists card_stock_skus_fingerprint_key
  on public.card_stock_skus (sku_fingerprint);

create index if not exists card_stock_skus_card_idx
  on public.card_stock_skus (card_id);

create index if not exists card_stock_skus_condition_grade_idx
  on public.card_stock_skus (condition, grading_service, grade);

alter table public.card_stock_units
  add column if not exists stock_sku_id uuid references public.card_stock_skus(id) on delete restrict;

alter table public.draw_round_prizes
  add column if not exists stock_sku_id uuid references public.card_stock_skus(id) on delete restrict;

alter table public.draw_round_prize_units
  add column if not exists stock_sku_id uuid references public.card_stock_skus(id) on delete restrict;

create index if not exists card_stock_units_stock_sku_status_idx
  on public.card_stock_units (stock_sku_id, status);

create index if not exists draw_round_prizes_stock_sku_idx
  on public.draw_round_prizes (stock_sku_id);

create index if not exists draw_round_prize_units_stock_sku_status_idx
  on public.draw_round_prize_units (stock_sku_id, status);
```

- [ ] Add database helper functions in the same migration:
  - `public.normalize_stock_sku_token(value text)`
  - `public.normalize_stock_sku_grade(value text)`
  - `public.generate_card_stock_sku_code(...)`
  - `public.build_card_stock_sku_fingerprint(...)`
  - `public.find_or_create_card_stock_sku(...)`

- [ ] Backfill one default stock SKU per existing card row.

```sql
insert into public.card_stock_skus (
  card_id,
  sku_code,
  sku_fingerprint,
  language,
  release_year,
  card_set,
  variant,
  condition,
  grading_service,
  grade,
  display_label
)
select
  c.id,
  public.generate_card_stock_sku_code(
    c.model_code,
    c.language,
    c.variant,
    coalesce(nullif(c.condition, ''), 'raw'),
    c.grading_service,
    case when coalesce(nullif(c.condition, ''), 'raw') = 'graded' then c.grade else null end
  ),
  public.build_card_stock_sku_fingerprint(
    c.model_code,
    c.language,
    c.variant,
    coalesce(nullif(c.condition, ''), 'raw'),
    c.grading_service,
    case when coalesce(nullif(c.condition, ''), 'raw') = 'graded' then c.grade else null end
  ),
  c.language,
  c.release_year,
  c.card_set,
  c.variant,
  coalesce(nullif(c.condition, ''), 'raw'),
  case when coalesce(nullif(c.condition, ''), 'raw') = 'graded' then c.grading_service else null end,
  case when coalesce(nullif(c.condition, ''), 'raw') = 'graded' then c.grade else null end,
  concat_ws(' ', c.name, c.language, c.condition, c.grading_service, c.grade)
from public.cards c
on conflict (sku_fingerprint) do nothing;
```

- [ ] Backfill `card_stock_units.stock_sku_id` from unit attributes first, falling back to the card default SKU. This preserves existing PSA/BGS unit data as separate stock SKUs.

```sql
with unit_skus as (
  select
    u.id as unit_id,
    public.find_or_create_card_stock_sku(
      u.card_id,
      c.model_code,
      coalesce(u.language, c.language),
      c.release_year,
      c.card_set,
      coalesce(u.variant, c.variant),
      coalesce(nullif(u.condition, ''), 'raw'),
      u.grading_service,
      case when coalesce(nullif(u.condition, ''), 'raw') = 'graded' then u.grade else null end
    ) as sku_id
  from public.card_stock_units u
  join public.cards c on c.id = u.card_id
  where u.stock_sku_id is null
)
update public.card_stock_units u
set stock_sku_id = unit_skus.sku_id
from unit_skus
where u.id = unit_skus.unit_id;
```

- [ ] Backfill `draw_round_prizes.stock_sku_id` using current `card_id` default SKU. This keeps existing campaign behavior unchanged until the admin explicitly changes the prize to a more specific SKU.

```sql
update public.draw_round_prizes p
set stock_sku_id = s.id
from public.card_stock_skus s
where p.stock_sku_id is null
  and p.card_id = s.card_id
  and s.condition = coalesce(
    (select nullif(c.condition, '') from public.cards c where c.id = p.card_id),
    'raw'
  );
```

- [ ] Backfill `draw_round_prize_units.stock_sku_id` from linked stock units when possible.

```sql
update public.draw_round_prize_units pu
set stock_sku_id = u.stock_sku_id
from public.card_stock_units u
where pu.stock_sku_id is null
  and pu.stock_unit_id = u.id;
```

- [ ] Do not drop old card or unit columns in this migration. Keep `condition`, `grading_service`, and `grade` on existing tables during the transition.

- [ ] Update RPCs in this migration:
  - `adjust_card_stock_units` accepts `p_stock_sku_id uuid default null`.
  - If `p_stock_sku_id` is null, it calls `find_or_create_card_stock_sku`.
  - Inserted stock units store both `card_id` and `stock_sku_id`.
  - `submit_campaign_review` checks availability grouped by `stock_sku_id`.
  - `approve_campaign_inventory` reserves units with matching `stock_sku_id`.
  - `open_gacha_campaign` returns `stock_sku_id`, `sku_code`, condition, grading service, and grade in prize payloads.

- [ ] Run local database validation against a branch or local Supabase database before production:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Database
supabase db reset
```

- [ ] Commit:

```bash
git add Database/supabase/migrations/20260601090000_card_stock_skus.sql
git commit -m "Introduce exact stock SKU inventory layer" \
  -m "Constraint: Existing stock and prizes must keep working during an additive migration." \
  -m "Rejected: Splitting each PSA or BGS card into a separate cards row | That duplicates base catalog identity and makes card metadata harder to maintain." \
  -m "Confidence: medium" \
  -m "Scope-risk: broad" \
  -m "Tested: supabase db reset"
```

---

## Task 4: Update Supabase Types and Lucky Draw Types

- [ ] Update `Website/src/lib/supabase/types.ts` with the new table and new columns.

Add table shape:

```ts
card_stock_skus: {
  Row: {
    id: string;
    card_id: string;
    sku_code: string;
    sku_fingerprint: string;
    language: string | null;
    release_year: number | null;
    card_set: string | null;
    variant: string | null;
    condition: string;
    grading_service: string | null;
    grade: string | null;
    display_label: string;
    is_active: boolean;
    metadata: Json;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    card_id: string;
    sku_code: string;
    sku_fingerprint: string;
    language?: string | null;
    release_year?: number | null;
    card_set?: string | null;
    variant?: string | null;
    condition?: string;
    grading_service?: string | null;
    grade?: string | null;
    display_label: string;
    is_active?: boolean;
    metadata?: Json;
    created_at?: string;
    updated_at?: string;
  };
  Update: {
    id?: string;
    card_id?: string;
    sku_code?: string;
    sku_fingerprint?: string;
    language?: string | null;
    release_year?: number | null;
    card_set?: string | null;
    variant?: string | null;
    condition?: string;
    grading_service?: string | null;
    grade?: string | null;
    display_label?: string;
    is_active?: boolean;
    metadata?: Json;
    created_at?: string;
    updated_at?: string;
  };
  Relationships: [
    {
      foreignKeyName: "card_stock_skus_card_id_fkey";
      columns: ["card_id"];
      isOneToOne: false;
      referencedRelation: "cards";
      referencedColumns: ["id"];
    },
  ];
};
```

- [ ] Add `stock_sku_id?: string | null` to `card_stock_units`, `draw_round_prizes`, and `draw_round_prize_units` type sections.

- [ ] Update `Website/src/lib/lucky-draw/types.ts`.

```ts
export type CardStockSku = {
  id: string;
  cardId: string;
  skuCode: string;
  skuFingerprint: string;
  displayLabel: string;
  language: string | null;
  releaseYear: number | null;
  set: string | null;
  variant: string | null;
  condition: string;
  gradingService: string | null;
  grade: string | null;
  isActive: boolean;
  stockUnits: CardStockUnit[];
  stockSummary: {
    total: number;
    available: number;
    reserved: number;
    awarded: number;
    allocated: number;
  };
};
```

- [ ] Add `stockSkuId`, `stockSkuCode`, and `stockSku` fields to prize/admin prize types where `cardId` currently appears.

- [ ] Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run typecheck
```

- [ ] Commit:

```bash
git add Website/src/lib/supabase/types.ts Website/src/lib/lucky-draw/types.ts
git commit -m "Expose stock SKU records to the app type layer" \
  -m "Constraint: API and UI migrations need typed access to stock SKU IDs before behavior switches." \
  -m "Confidence: medium" \
  -m "Scope-risk: moderate" \
  -m "Tested: npm run typecheck"
```

---

## Task 5: Update Admin Stock APIs

- [ ] Update `Website/src/app/api/ynot/admin/card-stock/route.ts`.

Behavior:

| Input | API behavior |
| --- | --- |
| `stockSkuId` present | Validate SKU belongs to `cardId`, then pass it to `adjust_card_stock_units` |
| `stockSkuId` missing | Generate/find SKU from condition, service, grade, language, set, variant, then pass new SKU ID |
| `condition=raw` | Force `gradingService=null`, `grade=null`, `certNumber=null` |
| `condition=sealed` | Force `gradingService=null`, `grade=null`, `certNumber=null` |
| `condition=graded` | Require `gradingService` and `grade`; cert remains unit-level optional |

Add a server-side helper near the route body:

```ts
async function findOrCreateStockSkuForPayload(
  supabase: SupabaseClient<Database>,
  payload: {
    cardId: string;
    condition: string;
    gradingService: string | null;
    grade: string | null;
    language: string | null;
    releaseYear: number | null;
    set: string | null;
    variant: string | null;
  },
): Promise<string> {
  const { data, error } = await supabase.rpc("find_or_create_card_stock_sku", {
    p_card_id: payload.cardId,
    p_language: payload.language,
    p_release_year: payload.releaseYear,
    p_card_set: payload.set,
    p_variant: payload.variant,
    p_condition: payload.condition,
    p_grading_service: payload.gradingService,
    p_grade: payload.grade,
  });

  if (error) {
    throw new Error(error.message);
  }
  return data as string;
}
```

- [ ] Update RPC call arguments:

```ts
const rpcArgs = {
  p_card_id: cardId,
  p_stock_sku_id: stockSkuId,
  p_quantity: quantity,
  p_condition: normalizedCondition,
  p_grade: normalizedGrade,
  p_grading_service: normalizedGradingService,
  p_cert_number: normalizedCertNumber,
  p_gemrate_id: normalizedGemrateId,
  p_image_url: normalizedImageUrl,
  p_image_storage_path: normalizedImageStoragePath,
};
```

- [ ] Update `Website/src/app/api/ynot/admin/card-stock/unit/route.ts`.

PATCH behavior:

| Edit | API behavior |
| --- | --- |
| Edit raw to PSA 9 | Create/find PSA 9 stock SKU, move unit to that SKU |
| Edit PSA 9 to BGS 9.5 | Create/find BGS 9.5 stock SKU, move unit to that SKU |
| Edit cert only | Keep same stock SKU and update unit cert |
| Edit awarded/reserved unit | Continue rejecting edits unless current route already allows the status |

- [ ] Keep unit-level columns in sync during transition:

```ts
const unitPatch = {
  stock_sku_id: stockSkuId,
  condition: normalizedCondition,
  grade: normalizedGrade,
  grading_service: normalizedGradingService,
  cert_number: normalizedCertNumber,
  gemrate_id: normalizedGemrateId,
  image_url: normalizedImageUrl,
  image_storage_path: normalizedImageStoragePath,
};
```

- [ ] Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run typecheck
```

- [ ] Commit:

```bash
git add Website/src/app/api/ynot/admin/card-stock/route.ts Website/src/app/api/ynot/admin/card-stock/unit/route.ts
git commit -m "Route stock changes through exact SKU buckets" \
  -m "Constraint: Physical unit edits must move inventory between exact SKU buckets instead of changing base card totals." \
  -m "Confidence: medium" \
  -m "Scope-risk: moderate" \
  -m "Tested: npm run typecheck"
```

---

## Task 6: Update Admin Card Catalog API and Helpers

- [ ] Update `Website/src/app/api/ynot/admin/cards/route.ts`.

Read behavior:

- Fetch `cards`.
- Fetch `card_stock_skus` by card IDs.
- Fetch `card_stock_units` by card IDs with `stock_sku_id`.
- Attach `stockSkus` to each `CardCatalogItem`.
- Compute card totals from the sum of SKU totals.
- Compute SKU totals from only units with matching `stock_sku_id`.

Response shape:

```ts
{
  id: "card-id",
  name: "GOLD D. ROGER",
  modelCode: "OP09-118",
  stockSkus: [
    {
      id: "sku-id-raw",
      cardId: "card-id",
      skuCode: "OP09-118-JP-RAW",
      condition: "raw",
      gradingService: null,
      grade: null,
      stockSummary: { total: 7, available: 2, reserved: 0, awarded: 0, allocated: 5 },
      stockUnits: []
    },
    {
      id: "sku-id-bgs",
      cardId: "card-id",
      skuCode: "OP09-118-JP-BGS95",
      condition: "graded",
      gradingService: "bgs",
      grade: "9.5",
      stockSummary: { total: 1, available: 1, reserved: 0, awarded: 0, allocated: 0 },
      stockUnits: []
    }
  ]
}
```

- [ ] Update `Website/src/features/ynot/admin-card-catalog-helpers.ts`.

Add helpers:

```ts
export function getCardStockSkuRows(card: CardCatalogItem): CardStockSku[] {
  return card.stockSkus ?? [];
}

export function matchesStockSkuQuery(sku: CardStockSku, query: string): boolean {
  const normalized = normalizeAdminSearch(query);
  if (!normalized) return true;
  return [
    sku.skuCode,
    sku.displayLabel,
    sku.condition,
    sku.gradingService,
    sku.grade,
    sku.language,
    sku.set,
    sku.variant,
  ]
    .filter(Boolean)
    .some((value) => normalizeAdminSearch(String(value)).includes(normalized));
}
```

- [ ] Update `Website/scripts/test-admin-card-catalog-helpers.mjs` to assert:
  - Raw and BGS 9.5 SKU rows stay separate.
  - Searching `BGS95` returns only the BGS 9.5 SKU row.
  - Filtering by `graded` does not show raw SKU rows.

- [ ] Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:admin-card-catalog-helpers
npm run typecheck
```

- [ ] Commit:

```bash
git add Website/src/app/api/ynot/admin/cards/route.ts Website/src/features/ynot/admin-card-catalog-helpers.ts Website/scripts/test-admin-card-catalog-helpers.mjs
git commit -m "Show catalog inventory as exact stock SKU rows" \
  -m "Constraint: Admin needs one base card grouped with separate raw, PSA, and BGS stock buckets." \
  -m "Confidence: medium" \
  -m "Scope-risk: moderate" \
  -m "Tested: npm run test:admin-card-catalog-helpers; npm run typecheck"
```

---

## Task 7: Update Prize APIs to Assign Stock SKUs

- [ ] Update `Website/src/app/api/ynot/admin/prizes/route.ts`.

New request item:

```ts
type PrizeInput = {
  stockSkuId: string;
  cardId?: string;
  tier: string;
  rank: number;
  weight: number;
  unlockAfterOpens: number;
  plannedQuantity: number;
};
```

Server behavior:

| Input | Server action |
| --- | --- |
| `stockSkuId` | Load SKU, set `draw_round_prizes.stock_sku_id`, set denormalized `card_id` from SKU |
| old `cardId` only | Reject with `400` and message `Prize assignment requires stockSkuId.` |
| random PSA10 special row | Store a specific stock SKU pool ID or keep current non-card sentinel separate from card stock prizes |

Upsert shape:

```ts
{
  draw_round_id: drawRoundId,
  card_id: stockSku.card_id,
  stock_sku_id: stockSku.id,
  tier,
  rank,
  weight,
  unlock_after_opens: unlockAfterOpens,
  planned_quantity: plannedQuantity,
}
```

- [ ] Update `Website/src/app/api/ynot/admin/prize-readiness/route.ts`.

Readiness behavior:

- Group required units by `stock_sku_id`.
- Count available units by `stock_sku_id`.
- Shortage labels must use `sku_code`.
- A BGS 9.5 shortage must not be satisfied by PSA 10 or raw units.

- [ ] Update `Website/src/app/api/ynot/admin/stock-readiness/route.ts` with the same grouping rule.

- [ ] Update database RPC calls and result mapping if these APIs depend on RPC summary output.

- [ ] Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run typecheck
```

- [ ] Commit:

```bash
git add Website/src/app/api/ynot/admin/prizes/route.ts Website/src/app/api/ynot/admin/prize-readiness/route.ts Website/src/app/api/ynot/admin/stock-readiness/route.ts
git commit -m "Assign prizes to exact stock SKUs" \
  -m "Constraint: Pack pools must not substitute raw, PSA, and BGS stock for each other." \
  -m "Confidence: medium" \
  -m "Scope-risk: broad" \
  -m "Tested: npm run typecheck"
```

---

## Task 8: Update Admin UI

- [ ] Update `Website/src/features/ynot/client.tsx`.

Admin stock form behavior:

| User action | UI behavior |
| --- | --- |
| Select raw | Hide grading service, grade, cert fields; preview `OP09-118-JP-RAW` |
| Select graded + PSA + 9 | Show cert field; preview `OP09-118-JP-PSA9` |
| Select graded + BGS + 9.5 | Show cert field; preview `OP09-118-JP-BGS95` |
| Add quantity | Adds stock to the previewed SKU bucket |

- [ ] Import helper functions:

```ts
import { generateStockSkuCode } from "./stock-sku";
import { gradeOptionsForService } from "./card-catalog-metadata";
```

- [ ] In `AdminCardStockUnitForm`, replace the static grade dropdown with service-aware options:

```tsx
const visibleGradeOptions = gradeOptionsForService(stockForm.gradingService);
```

- [ ] Add non-editable SKU preview near the quantity field:

```tsx
<div className="rounded-md border border-[color:var(--ynott-border)] bg-black/20 px-3 py-2 text-sm">
  <span className="text-[color:var(--ynott-muted)]">Auto SKU</span>
  <strong className="ml-2 text-[color:var(--ynott-ink)]">{previewSkuCode}</strong>
</div>
```

- [ ] Update the catalog card display:
  - Keep one base card header.
  - Render child SKU rows under it.
  - Show per-SKU `Global stock`, `Prize pool`, and assignments.
  - Move the existing `Graded / sealed units` list under the matching SKU row.

Desired admin shape:

| Base catalog | Stock SKU row | Global stock | Prize pool |
| --- | --- | --- | --- |
| Gold D. Roger `OP09-118` | `OP09-118-JP-RAW` Raw | `7/12` | `5/5` |
| Gold D. Roger `OP09-118` | `OP09-118-JP-BGS95` BGS 9.5 | `1/1` | `0/0` |
| Gold D. Roger `OP09-118` | `OP09-118-JP-PSA9` PSA 9 | `1/1` | `0/0` |

- [ ] Update the prize selector:
  - Options should be stock SKU rows, not base card rows.
  - Display: `OP09-118-JP-BGS95 - GOLD D. ROGER - BGS 9.5`.
  - Submission must send `stockSkuId`.

- [ ] Preserve the base card creation modal as a base product form. It should not require grading service, grade, or cert.

- [ ] Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run typecheck
npm run lint
```

- [ ] Commit:

```bash
git add Website/src/features/ynot/client.tsx
git commit -m "Make admin stock and prize selection SKU-first" \
  -m "Constraint: Operators need to see exact raw, PSA, and BGS buckets before assigning prizes." \
  -m "Confidence: medium" \
  -m "Scope-risk: broad" \
  -m "Tested: npm run typecheck; npm run lint"
```

---

## Task 9: Update Pack Opening and Award Display

- [ ] Update any app-side mapping of `open_gacha_campaign` results to include exact SKU details.

Prize reveal payload should include:

```ts
{
  cardId: string;
  stockSkuId: string;
  stockSkuCode: string;
  condition: "raw" | "sealed" | "graded";
  gradingService: "psa" | "bgs" | "cgc" | "other" | null;
  grade: string | null;
  certNumber: string | null;
}
```

- [ ] Update collection/order display labels so awarded graded cards show exact service and grade:

| Awarded stock | Display |
| --- | --- |
| Raw | `Raw / Ungraded` |
| PSA 9 | `PSA 9` |
| BGS 9.5 | `BGS 9.5` |
| BGS 10 Black Label | `BGS 10 Black Label` |

- [ ] Verify no customer-facing page displays catalog-level `grade=Ungraded` for a graded awarded stock unit.

- [ ] Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run typecheck
```

- [ ] Commit:

```bash
git add Website/src/features/ynot/client.tsx Website/src/lib/lucky-draw/types.ts
git commit -m "Display awarded prizes with exact stock SKU identity" \
  -m "Constraint: Customer reveals must match the physical unit reserved from inventory." \
  -m "Confidence: medium" \
  -m "Scope-risk: moderate" \
  -m "Tested: npm run typecheck"
```

---

## Task 10: Add Verification Script

- [ ] Create `Website/tools/verification/verify-card-stock-skus.mjs`.

Checks:

```js
const checks = [
  "Every card_stock_unit has stock_sku_id",
  "Every draw_round_prize with card_id has stock_sku_id",
  "Every draw_round_prize_unit with stock_unit_id has stock_sku_id",
  "No raw or sealed stock SKU has grading_service or grade",
  "Every graded stock SKU has grading_service and grade",
  "No two active stock SKUs share the same sku_fingerprint",
  "Every prize assigned to BGS 9.5 has only BGS 9.5 available units counted",
];
```

- [ ] Script should print a table:

```text
check                                                result
--------------------------------------------------   ------
card_stock_units.stock_sku_id                       pass
draw_round_prizes.stock_sku_id                      pass
raw_skus_have_no_grade                              pass
graded_skus_have_grade                              pass
sku_fingerprint_unique                              pass
```

- [ ] Add a package script:

```json
"verify:card-stock-skus": "node tools/verification/verify-card-stock-skus.mjs"
```

- [ ] Run against a safe local or branch database:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run verify:card-stock-skus
```

- [ ] Commit:

```bash
git add Website/tools/verification/verify-card-stock-skus.mjs Website/package.json
git commit -m "Verify exact stock SKU migration invariants" \
  -m "Constraint: Production migration must prove no inventory bucket is missing exact SKU identity." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Tested: npm run verify:card-stock-skus"
```

---

## Task 11: Final Validation

- [ ] Run unit/helper tests:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:stock-sku
npm run test:card-catalog-metadata
npm run test:admin-card-catalog-helpers
```

- [ ] Run static checks:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run typecheck
npm run lint
```

- [ ] Run build:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run build
```

- [ ] Run database reset or branch database migration:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Database
supabase db reset
```

- [ ] Run SKU invariant verification:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run verify:card-stock-skus
```

- [ ] Manual admin smoke test:
  - Create base card `OP09-118`.
  - Add raw Japanese stock quantity `2`.
  - Add PSA 9 stock quantity `1`.
  - Add BGS 9.5 stock quantity `1`.
  - Confirm catalog shows three SKU rows: `OP09-118-JP-RAW`, `OP09-118-JP-PSA9`, `OP09-118-JP-BGS95`.
  - Assign only `OP09-118-JP-BGS95` to a pack.
  - Confirm readiness counts only BGS 9.5 stock.
  - Open pack in a safe test campaign.
  - Confirm awarded unit is the BGS 9.5 unit and not raw or PSA.

- [ ] Final commit if any validation fixes were needed:

```bash
git add Website Database
git commit -m "Finish stock SKU variant migration" \
  -m "Constraint: Exact inventory identity must be proven through UI, API, RPC, and database checks." \
  -m "Confidence: medium" \
  -m "Scope-risk: broad" \
  -m "Tested: npm run test:stock-sku; npm run test:card-catalog-metadata; npm run test:admin-card-catalog-helpers; npm run typecheck; npm run lint; npm run build; supabase db reset; npm run verify:card-stock-skus"
```

---

## Production Safety Notes

- This plan is additive first. It does not drop existing catalog or stock columns.
- Production Supabase migration should wait for the existing YNOTT backup, PITR, and restore-drill gate.
- Before applying to production, run read-only counts:

```sql
select count(*) as cards from public.cards;
select count(*) as stock_units from public.card_stock_units;
select count(*) as prizes from public.draw_round_prizes;
select count(*) as prize_units from public.draw_round_prize_units;
select condition, grading_service, grade, count(*)
from public.card_stock_units
group by condition, grading_service, grade
order by condition, grading_service, grade;
```

- After production migration, run:

```sql
select count(*) as stock_units_without_sku
from public.card_stock_units
where stock_sku_id is null;

select count(*) as prizes_without_sku
from public.draw_round_prizes
where card_id is not null
  and stock_sku_id is null;
```

Both counts must be `0`.

---

## Acceptance Criteria

- Adding BGS 9.5 stock to Gold D. Roger creates or reuses `OP09-118-JP-BGS95`.
- Adding PSA 9 stock to Gold D. Roger creates or reuses `OP09-118-JP-PSA9`.
- Adding raw stock to Gold D. Roger creates or reuses `OP09-118-JP-RAW`.
- The three SKUs have separate stock counts and separate prize pool counts.
- Assigning BGS 9.5 to a pack cannot consume raw, PSA 9, or PSA 10 stock.
- Raw stock has no cert, no grading service, and no grade.
- Graded physical units can have cert numbers, but cert number does not define the SKU.
- Admin UI previews the generated SKU before confirming stock add.
- Customer reveal and collection display exact awarded service/grade from the reserved unit.
- Existing production data remains readable throughout the transition.
