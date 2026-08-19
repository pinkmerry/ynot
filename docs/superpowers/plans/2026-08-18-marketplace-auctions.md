# Marketplace Auctions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add timed auctions to the YNOTT marketplace as a second listing format on existing marketplace inventory, settling through the existing order → payout → shipping chain.

**Architecture:** An auction is not a new service or database. It is one new column on `marketplace_listing_snapshots` (`listing_format`), three new tables in the existing marketplace Supabase project, and two new RPCs. Bidding is proxy-based and serialised by a row lock on the auction. Closing is a pure function of the bid ledger and `effective_ends_at`, so a late closer costs notification latency but never a wrong winner. At close an *award* is created, and the award hands off to the same pending-order/order/payout code fixed-price checkout already uses.

**Tech Stack:** Next.js (App Router) on Cloudflare Workers via OpenNext · Supabase Postgres (marketplace project `lvdikmsygdstckhektth`) · plpgsql RPCs called with the service-role key · `node:test` for test scripts · Slip2Go for payment-slip verification.

---

## Non-Negotiable Constraints

These come from verified repository facts. Violating any one produces a money bug, a data leak, or a broken deploy.

1. **Money is derived from `marketplace_inventory_items.item_price_satang`, never from the listing.** Both `marketplace_create_pending_payment_order` (official, line ~105) and `marketplace_create_user_seller_pending_payment_order` (line ~467) compute fees and totals from the *inventory* row. The listing price is a display mirror. An auction that does not override this charges the start price, not the hammer price.
2. **`listing_source` must stay `official_shop` / `user_seller`.** It is filtered in 12+ places including the award RPC's listing lock and the group-checkout source whitelist. Auctions use a separate orthogonal `listing_format` column.
3. **A live auction sits in `listing_state = 'active'`.** This keeps the existing partial unique index `marketplace_listing_snapshots_one_open_per_inventory_idx` working unchanged, so a card can never be auctioned and fixed-price sold at once. It also means every fixed-price listing lock MUST add `and listing_format = 'fixed_price'` or the lot can be bought out from under the bidders.
4. **No admin, staff, or owner account may ever bid.** For official lots YNOTT is the seller; a house bid is fraud.
5. **A bidder's maximum is never exposed** — not to other bidders, not to the seller, not in any public projection. Only the effective price is public. Bidder identity is masked to a stable per-auction alias.
6. **Marketplace and gacha are separate Supabase projects.** No cross-database foreign keys, no reads of core gacha tables from marketplace code. `verify:marketplace-no-gacha-inventory` enforces this.
7. **Every mutation route goes through `prepareMarketplaceMutation()`** (`src/lib/marketplace/mutation-guard.ts`), which supplies same-origin, rate limit, idempotency, request hashing, and field allowlisting.
8. **API handlers live at `src/app/api/ynot/marketplace/**`.** The `src/app/api/marketplace/**` tree is pruned from *both* production builds — those files are dead in prod.

---

## v1 Scope (Decision Ledger)

| Decision | Settled as |
|---|---|
| First lots | Small-value **official** lots — a rehearsal of the mechanism |
| Who may bid | Everyone with a verified contact. **No admin/staff/owner, ever** |
| Start price | Per lot, default ฿0, settable higher |
| Reserve | **None.** `closed_unsold` means zero bids and nothing else |
| Buy-now | Not in v1 |
| Close | Soft close — 120s window, +120s, max 20 extensions |
| Gate | `bidder_gate` per lot, default `open`. `kyc_required` built but unused |
| KYC | Separate spec. Auctions read `kyc_status` only |
| Win notice | Manual in v1 |
| Settlement | Marketplace rails — PromptPay QR + slip + Slip2Go |
| Payment | Baht, not coins |
| Fulfilment | Marketplace order states + `fulfilment_method` (`ship` \| `collect`) |
| Payment window | 48 hours from award |
| Duration | 5–7 days, per lot |
| Zero-bid lots | Admin decides manually |
| Deposits / strikes | Deferred to P5 |
| Opening bid | Start price, or one increment when the lot opens at ฿0 |
| Buyer's premium | **3%** (`auction_buyer_premium_bps = 300`), added on top of hammer |
| Seller commission | Settable `auction_seller_fee_bps`, deducted from hammer. No seller side on official lots |
| Fee base | Commission on hammer only, never on hammer + premium |
| Unsold lots | No fee charged to the consignor |
| Unpaid win | Award expires, card freed to the cockpit's expired queue |
| Live updates | Supabase Realtime primary (~100–300ms), polling fallback |
| Realtime safety | Only `marketplace_auction_events` is published; a CI gate fails the build if any table carrying a bidder maximum is added |
| Read path | Conditional lazy close, one merged public endpoint, 1s edge cache, private `/me` route |
| Sweeps | Three, per-lot: open, close, expire |
| Admin writes | Cancel and edit are RPCs taking the same auction row lock as a bid |
| No-house-bidding | Enforced by BOTH a caller argument and a stored `is_staff` flag |
| Bid ceiling | Per lot (default 100x start, floor ฿20,000) plus an absolute ฿1,000,000 cap |
| Bidder anonymity | Alias is HMAC-salted per auction; the salt is never projected |

**Out of scope for this plan:** KYC document upload and review (own spec), seller-run auctions, deposits, bidder strikes, realtime push, LINE notifications.

---

## File Structure

**Database — `Database/marketplace-supabase/migrations/`**
- `20260818100000_marketplace_auction_foundation.sql` — `listing_format` column, `marketplace_auctions`, `marketplace_auction_bids`, append-only trigger, increment ladder function, indexes
- `20260818100100_marketplace_auction_fixed_price_guard.sql` — adds `listing_format = 'fixed_price'` to every fixed-price listing lock
- `20260818100200_marketplace_auction_price_override.sql` — adds `p_price_override_satang` to both pending-order RPCs
- `20260818100300_marketplace_auction_bid_rpc.sql` — `marketplace_place_auction_bid`
- `20260818100400_marketplace_auction_close_rpc.sql` — `marketplace_auction_awards`, `marketplace_close_due_auctions`
- `20260818100500_marketplace_auction_award_checkout.sql` — `marketplace_create_auction_pending_payment_order`
- `20260818100600_marketplace_auction_public_projection.sql` — public view + `fulfilment_method`

**Backend service layer — `Website/src/lib/marketplace/`**
- `auctions.ts` — read/list/detail projection, lazy close on read
- `auction-bids.ts` — bid placement, masked history
- `auction-awards.ts` — award reads, award → pending order
- `auction-admin.ts` — create, edit pre-first-bid, cancel
- `auction-money.ts` — pure increment ladder, mirrors the SQL function

**API routes — `Website/src/app/api/ynot/marketplace/`**
- `auctions/route.ts`, `auctions/[auctionId]/route.ts`, `auctions/[auctionId]/bids/route.ts`
- `awards/route.ts`, `awards/[awardId]/checkout/route.ts`
- `admin/auctions/route.ts`, `admin/auctions/[auctionId]/route.ts`, `admin/auctions/[auctionId]/cancel/route.ts`
- `time/route.ts` — server clock for countdown sync

**Frontend — `Website/src/features/marketplace-ui/auction/`**
- `AuctionRoom.tsx` — live lot: countdown, current bid, bid form
- `AuctionCountdown.tsx` — server-synced clock, extension-aware
- `BidPanel.tsx` — proxy-max input plus the authorise-up-to confirm step
- `BidHistory.tsx` — masked alias list
- `ScheduledLotPanel.tsx` — pre-bidding state, gate notice
- `AuctionList.tsx` — ending soon / live / upcoming
- `WonLotPanel.tsx` — award, deadline, pay action
- `auction.css` — mobile-first, extends the `.mp-*` token set

**Pages — `Website/src/app/(store)/marketplace/`**
- `auctions/page.tsx`, `auctions/[auctionId]/page.tsx`

**Admin — `Website/src/features/marketplace-ui/admin/`**
- `AuctionsScreen.tsx`, `AuctionModal.tsx`
- page at `Website/src/app/admin/marketplace/auctions/page.tsx`

**Tests — `Website/scripts/`**
- `test-marketplace-auction-schema.mjs` — static SQL assertions, repo convention
- `test-marketplace-auction-money.mjs` — behavioural unit tests of the TS increment ladder
- `test-marketplace-auction-live.mjs` — behavioural tests against the production marketplace project, admin-gated

---

## The Proxy-Bid Algorithm

Every auction dispute you will ever have comes from this function, so it is specified exhaustively here and implemented identically in SQL (Task 8) and TypeScript (Task 5).

Inputs: `cur` (current price), `cur_max` (leading bidder's hidden maximum, null if no bids), `leader` (leading account, null if none), `new_max` (this bid), `start` (start price).

```
inc(p) = 1000 if p < 50000            -- satang: <฿500      → ฿10
         2000 if p < 200000           --         ฿500–1,999 → ฿20
         5000 if p < 500000           --         ฿2k–4,999  → ฿50
        10000 if p < 2000000          --         ฿5k–19,999 → ฿100
        25000 if p < 5000000          --         ฿20k–49,999→ ฿250
        50000 if p < 20000000         --         ฿50k–199,999→ ฿500
       100000 otherwise               --         ≥฿200,000  → ฿1,000

CASE A — no bids yet (leader is null):
    reject 'auction_bid_below_start' if new_max < start
    price = start ; new_leader = bidder ; new_leading_max = new_max

CASE B — leader is the same bidder raising their own maximum:
    reject 'auction_bid_not_higher' if new_max <= cur_max
    price = cur                      -- price does NOT move
    new_leader = bidder ; new_leading_max = new_max

CASE C — challenger, new_max > cur_max  (challenger takes the lead):
    reject 'auction_bid_below_min' if new_max < cur + inc(cur)
    price = min(new_max, cur_max + inc(cur_max))
    new_leader = bidder ; new_leading_max = new_max

CASE D — challenger, new_max == cur_max  (tie → earlier sequence wins):
    price = cur_max
    new_leader = leader (unchanged) ; new_leading_max = cur_max

CASE E — challenger, new_max < cur_max  (incumbent holds):
    reject 'auction_bid_below_min' if new_max < cur + inc(cur)
    price = min(cur_max, new_max + inc(new_max))
    new_leader = leader (unchanged) ; new_leading_max = cur_max
```

Worked example (satang): start 0, A bids max 500000. Price 0, leader A.
B bids max 300000 → Case E: price = min(500000, 300000+5000) = 305000, leader stays A.
B bids max 600000 → Case C: price = min(600000, 500000+10000) = 510000, leader B.
A bids max 600000 → Case D: tie, price 600000, leader stays B.

---

## Phase 0 — Safety Gates

### Task 1: Stop marketplace changes from redeploying the gacha worker

**Files:**
- Modify: `.github/workflows/cloudflare-deploy.yml:3-7`

- [ ] **Step 1: Read the current trigger**

Run: `sed -n '1,12p' .github/workflows/cloudflare-deploy.yml`
Expected: a `push: branches: [main]` block with no `paths-ignore`.

- [ ] **Step 2: Add the path filter**

```yaml
on:
  push:
    branches:
      - main
    paths-ignore:
      - 'Database/marketplace-supabase/**'
      - 'Website/src/app/(store)/marketplace/**'
      - 'Website/src/app/admin/marketplace/**'
      - 'Website/src/app/api/ynot/marketplace/**'
      - 'Website/src/features/marketplace-ui/**'
      - 'Website/src/lib/marketplace/**'
      - 'docs/**'
  workflow_dispatch:
```

- [ ] **Step 3: Verify the workflow still parses**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/cloudflare-deploy.yml')); print('ok')"`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/cloudflare-deploy.yml
git commit -m "ci: stop marketplace-only changes redeploying the website worker"
```

### Task 2: Measure marketplace bundle headroom

**Files:** none modified.

- [ ] **Step 1: Build the marketplace target**

Run: `cd Website && npm run cf:build:marketplace`
Expected: build completes and prints a gzip size. Last known 1979.24 KiB against a 3072 KiB cap.

- [ ] **Step 2: Record the number**

If headroom is under 400 KiB, STOP and raise it — auctions add roughly 7 pages plus components, and the fix is a third *build target*, not a third service. Do not proceed past this gate silently.

- [ ] **Step 3: Add a size assertion so this never surprises anyone again**

Create `Website/tools/verification/verify-worker-bundle-size.mjs`:

```js
import assert from "node:assert/strict";
import { statSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import path from "node:path";

const CAP_KIB = 3072;
const WARN_KIB = 2600;
const dir = path.resolve(process.cwd(), ".open-next");
const workerPath = path.join(dir, "worker.js");
assert.ok(statSync(workerPath).isFile(), "run a cf:build target first");
const gz = gzipSync(readFileSync(workerPath));
const kib = gz.length / 1024;
console.log(`worker.js gzip: ${kib.toFixed(2)} KiB (cap ${CAP_KIB})`);
assert.ok(kib < CAP_KIB, `bundle ${kib.toFixed(2)} KiB exceeds ${CAP_KIB} KiB cap`);
if (kib > WARN_KIB) console.warn(`WARNING: within ${(CAP_KIB - kib).toFixed(0)} KiB of the cap`);
```

- [ ] **Step 4: Wire it into package.json scripts**

```json
"verify:bundle-size": "node tools/verification/verify-worker-bundle-size.mjs"
```

- [ ] **Step 5: Commit**

```bash
git add Website/tools/verification/verify-worker-bundle-size.mjs Website/package.json
git commit -m "chore: assert Cloudflare worker bundle stays under the 3 MiB cap"
```

### Task 3: Back up the marketplace database

**Files:**
- Create: `Database/backups/pre-auctions-<UTC timestamp>/schema.sql`

`Database/README.md:18` forbids applying production migrations before a backup, and **no marketplace backup has ever been taken** — all seven existing backup directories are from the core project.

- [ ] **Step 1: Create the backup directory**

```bash
mkdir -p "Database/backups/pre-auctions-$(date -u +%Y%m%dT%H%M%SZ)"
```

- [ ] **Step 2: Dump the marketplace schema**

Use the Supabase Management API with a browser User-Agent (python-urllib is Cloudflare-blocked on this endpoint):

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/lvdikmsygdstckhektth/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "User-Agent: Mozilla/5.0" \
  -d '{"query":"select table_name, column_name, data_type, is_nullable from information_schema.columns where table_schema='"'"'public'"'"' order by table_name, ordinal_position"}' \
  > "Database/backups/pre-auctions-$(date -u +%Y%m%dT%H%M%SZ)/schema.json"
```

- [ ] **Step 3: Confirm Point-in-Time Recovery is enabled on the marketplace project**

Check the Supabase dashboard for project `lvdikmsygdstckhektth`. If PITR is not enabled, STOP and raise it — the plan writes to production.

- [ ] **Step 4: Commit the backup evidence**

```bash
git add Database/backups/
git commit -m "chore: capture marketplace schema backup before auction migrations"
```

---

## Phase 1 — Schema and Ledger

### Task 4: Auction foundation migration

**Files:**
- Create: `Database/marketplace-supabase/migrations/20260818100000_marketplace_auction_foundation.sql`
- Create: `Website/scripts/test-marketplace-auction-schema.mjs`

- [ ] **Step 1: Write the failing static test**

Create `Website/scripts/test-marketplace-auction-schema.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appRoot, "..");
const migrationsDir = path.join(repoRoot, "Database/marketplace-supabase/migrations");

function readMigration(name) {
  return readFileSync(path.join(migrationsDir, name), "utf8");
}
function readApp(relPath) {
  return readFileSync(path.join(appRoot, relPath), "utf8");
}
function compact(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "").replace(/\s+/g, " ").toLowerCase();
}

const foundation = compact(readMigration("20260818100000_marketplace_auction_foundation.sql"));

test("listing_format is added with a two-value constraint", () => {
  assert.match(foundation, /add column if not exists listing_format text not null default 'fixed_price'/);
  assert.match(foundation, /listing_format in \('fixed_price', 'auction'\)/);
});

test("auction terms table carries the gate and soft-close fields", () => {
  assert.match(foundation, /create table if not exists public\.marketplace_auctions/);
  assert.match(foundation, /bidder_gate text not null default 'open'/);
  assert.match(foundation, /bidder_gate in \('open', 'kyc_required'\)/);
  assert.match(foundation, /effective_ends_at timestamptz not null/);
  assert.match(foundation, /anti_snipe_window_seconds integer not null default 120/);
  assert.match(foundation, /max_extensions integer not null default 20/);
});

test("v1 carries no reserve and no buy-now", () => {
  assert.doesNotMatch(foundation, /reserve_price_satang/);
  assert.doesNotMatch(foundation, /reserve_met/);
  assert.doesNotMatch(foundation, /buy_now_price_satang/);
});

test("bid ledger is append-only and uniquely sequenced", () => {
  assert.match(foundation, /create table if not exists public\.marketplace_auction_bids/);
  assert.match(foundation, /unique \(auction_id, sequence\)/);
  assert.match(foundation, /marketplace_auction_bids_append_only/);
});

test("SECURITY: the admin-bid block does not rely on a caller-supplied argument", () => {
  assert.match(bidRpc, /p_actor_admin_role is not null or coalesce\(account_row\.is_staff, false\)/);
  assert.match(foundation, /add column if not exists is_staff boolean not null default false/);
});

test("SECURITY: bids are bounded, per lot and absolutely", () => {
  assert.match(foundation, /max_amount_satang between 0 and 100000000/);
  assert.match(foundation, /max_bid_satang integer/);
  assert.match(bidRpc, /auction_bid_above_ceiling/);
});

test("SECURITY: the bidder alias is salted with a per-auction secret", () => {
  assert.match(foundation, /alias_salt uuid not null default gen_random_uuid\(\)/);
  assert.match(bidRpc, /hmac\(/);
  // an unsalted digest over two guessable UUIDs would be reversible
  assert.doesNotMatch(bidRpc, /digest\(p_auction_id::text \|\| p_bidder/);
});

test("SECURITY: alias_salt is never selected into a projection", () => {
  const serviceLayer = readApp("src/lib/marketplace/auctions.ts");
  assert.doesNotMatch(serviceLayer, /alias_salt/);
  assert.doesNotMatch(serviceLayer, /leading_max_satang/);
});

test("bidder maximum is never granted to anon or authenticated", () => {
  assert.match(foundation, /revoke all on public\.marketplace_auction_bids from anon, authenticated/);
  assert.match(foundation, /revoke all on public\.marketplace_auctions from anon, authenticated/);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd Website && node --test scripts/test-marketplace-auction-schema.mjs`
Expected: FAIL — `ENOENT ... 20260818100000_marketplace_auction_foundation.sql`

- [ ] **Step 3: Write the migration**

Create `Database/marketplace-supabase/migrations/20260818100000_marketplace_auction_foundation.sql`:

```sql
-- Auctions as a second listing format on existing marketplace inventory.
--
-- An auction is not a new inventory type. It hangs off an existing
-- marketplace_listing_snapshots row, which keeps the one-open-listing-per-item
-- unique index working unchanged. v1 has no reserve and no buy-now.

alter table public.marketplace_listing_snapshots
  add column if not exists listing_format text not null default 'fixed_price';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'marketplace_listing_snapshots_listing_format_check'
      and conrelid = 'public.marketplace_listing_snapshots'::regclass
  ) then
    alter table public.marketplace_listing_snapshots
      add constraint marketplace_listing_snapshots_listing_format_check
      check (listing_format in ('fixed_price', 'auction'));
  end if;
end $$;

-- Staff status, mirrored from the core admin session by the account bridge on
-- every resolve. The marketplace project has no admin table of its own, so
-- without this the admin-bid block is enforced ONLY by a parameter the caller
-- passes -- one forgotten argument away from letting the house bid on its own
-- lot. Defence in depth: the bid RPC rejects on the parameter OR this flag.
alter table public.marketplace_accounts
  add column if not exists is_staff boolean not null default false,
  add column if not exists staff_synced_at timestamptz;

create index if not exists marketplace_accounts_staff_idx
  on public.marketplace_accounts(is_staff) where is_staff;

create table if not exists public.marketplace_auctions (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null unique
    references public.marketplace_listing_snapshots(listing_id) on delete restrict,
  inventory_item_id uuid not null
    references public.marketplace_inventory_items(id) on delete restrict,
  seller_marketplace_account_id uuid
    references public.marketplace_accounts(id) on delete restrict,
  listing_source text not null check (listing_source in ('official_shop', 'user_seller')),

  auction_state text not null default 'scheduled'
    check (auction_state in ('scheduled', 'live', 'closed_won', 'closed_unsold', 'cancelled')),

  bidder_gate text not null default 'open'
    check (bidder_gate in ('open', 'kyc_required')),

  start_price_satang integer not null default 0 check (start_price_satang >= 0),
  currency text not null default 'THB' check (currency = 'THB'),

  starts_at timestamptz not null,
  base_ends_at timestamptz not null,
  effective_ends_at timestamptz not null,
  anti_snipe_window_seconds integer not null default 120 check (anti_snipe_window_seconds between 0 and 3600),
  anti_snipe_extend_seconds integer not null default 120 check (anti_snipe_extend_seconds between 0 and 3600),
  max_extensions integer not null default 20 check (max_extensions between 0 and 100),
  extension_count integer not null default 0 check (extension_count >= 0),

  current_price_satang integer not null default 0 check (current_price_satang >= 0),
  -- Per-lot bid ceiling. v1 has no deposit and no strikes, so this is the only
  -- thing standing between a griefer and a destroyed auction. The admin RPC
  -- defaults it to 100x the start price, floored at THB 20,000.
  max_bid_satang integer check (max_bid_satang is null or max_bid_satang > 0),
  -- leading_max_satang is the leading bidder's authorised maximum. It is
  -- NEVER exposed in any public projection, to any buyer, seller, or admin
  -- customer-facing surface. It exists so the bid RPC can resolve the proxy
  -- contest under a single row lock.
  leading_max_satang integer check (leading_max_satang >= 0),
  leading_bidder_account_id uuid references public.marketplace_accounts(id) on delete restrict,
  bid_count integer not null default 0 check (bid_count >= 0),
  distinct_bidder_count integer not null default 0 check (distinct_bidder_count >= 0),
  next_sequence bigint not null default 1 check (next_sequence >= 1),
  -- Per-auction secret. Without it the alias is sha256(auction_id||account_id)
  -- over two values an attacker may already hold, so anyone holding a target's
  -- account id could confirm whether they bid on any lot. Never projected.
  alias_salt uuid not null default gen_random_uuid(),

  closed_at timestamptz,
  close_reason text check (close_reason in ('sold', 'no_bids', 'cancelled_by_admin')),
  admin_note text,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (base_ends_at > starts_at),
  check (effective_ends_at >= base_ends_at),
  check (extension_count <= max_extensions)
);

create table if not exists public.marketplace_auction_bids (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references public.marketplace_auctions(id) on delete restrict,
  sequence bigint not null check (sequence >= 1),
  bidder_marketplace_account_id uuid not null
    references public.marketplace_accounts(id) on delete restrict,
  bidder_ynot_profile_id uuid not null,
  bid_kind text not null default 'proxy_max'
    check (bid_kind in ('proxy_max', 'system_increment')),
  -- max_amount_satang is private to the bidder. effective_amount_satang is public.
  -- Hard ceiling. Prevents integer overflow in the proxy arithmetic
  -- (max + increment near INT_MAX throws) and, more importantly, stops a
  -- throwaway account destroying a lot with an absurd bid it will never pay.
  max_amount_satang integer not null
    check (max_amount_satang between 0 and 100000000),   -- <= THB 1,000,000
  effective_amount_satang integer not null check (effective_amount_satang >= 0),
  outcome text not null
    check (outcome in ('leading', 'outbid', 'winning', 'void')),
  bidder_alias text not null check (length(bidder_alias) between 6 and 16),
  request_id text,
  idempotency_key text not null,
  -- clock_timestamp(): the moment the bid was actually admitted under the
  -- lock, not the moment its transaction began.
  placed_at timestamptz not null default clock_timestamp(),
  unique (auction_id, sequence),
  -- scoped per auction: the auction row lock only serialises retries that
  -- share an auction, so the uniqueness that backs it must too
  unique (auction_id, bidder_marketplace_account_id, idempotency_key)
);

create or replace function public.marketplace_auction_bids_append_only()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- The outcome column is the single exception: a bid moves leading -> outbid
  -- or leading -> winning as later bids land. Nothing else may ever change.
  if tg_op = 'DELETE' then
    -- One explicit escape, for the behavioural test suite only. The purge RPC
    -- validates the auction is a test lot before setting this, and the GUC is
    -- set with SET LOCAL so it cannot outlive that transaction.
    -- Two conditions, not one. The GUC alone would mean any future
    -- security-definer function that sets it makes the entire bid ledger
    -- deletable; requiring the test-data title as well keeps the escape
    -- pinned to test lots even if the GUC leaks.
    if coalesce(current_setting('app.auction_test_purge', true), 'off') = 'on'
       and exists (
         select 1
         from public.marketplace_auctions a
         join public.marketplace_listing_snapshots l on l.listing_id = a.listing_id
         where a.id = old.auction_id and l.title like 'AUCTIONTEST-%'
       )
    then
      return old;
    end if;
    raise exception 'marketplace_auction_bids_append_only';
  end if;
  if new.id is distinct from old.id
     or new.auction_id is distinct from old.auction_id
     or new.sequence is distinct from old.sequence
     or new.bidder_marketplace_account_id is distinct from old.bidder_marketplace_account_id
     or new.max_amount_satang is distinct from old.max_amount_satang
     or new.effective_amount_satang is distinct from old.effective_amount_satang
     or new.placed_at is distinct from old.placed_at then
    raise exception 'marketplace_auction_bids_append_only';
  end if;
  return new;
end;
$$;

drop trigger if exists marketplace_auction_bids_no_mutate on public.marketplace_auction_bids;
create trigger marketplace_auction_bids_no_mutate
before update or delete on public.marketplace_auction_bids
for each row execute function public.marketplace_auction_bids_append_only();

drop trigger if exists marketplace_auctions_touch_updated_at on public.marketplace_auctions;
create trigger marketplace_auctions_touch_updated_at
before update on public.marketplace_auctions
for each row execute function public.marketplace_touch_updated_at();

-- Public realtime fan-out.
--
-- This table exists so that marketplace_auctions and marketplace_auction_bids
-- NEVER need to be published to Supabase Realtime. Those two carry
-- leading_max_satang and max_amount_satang -- every bidder's hidden maximum.
-- Realtime broadcasts to browsers holding the PUBLISHABLE key, so publishing
-- either table would hand every bidder the exact number needed to win.
--
-- This table is structurally incapable of leaking: it has no account id and no
-- maximum column. There is nothing private here to accidentally include.
create table if not exists public.marketplace_auction_events (
  id bigserial primary key,
  auction_id uuid not null references public.marketplace_auctions(id) on delete restrict,
  event_type text not null
    check (event_type in ('opened', 'bid_placed', 'extended', 'closed')),
  current_price_satang integer not null check (current_price_satang >= 0),
  bid_count integer not null check (bid_count >= 0),
  distinct_bidder_count integer not null check (distinct_bidder_count >= 0),
  effective_ends_at timestamptz not null,
  extension_count integer not null check (extension_count >= 0),
  bidder_alias text check (bidder_alias is null or length(bidder_alias) between 4 and 16),
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists marketplace_auction_events_auction_idx
  on public.marketplace_auction_events(auction_id, id desc);
create index if not exists marketplace_auction_events_created_idx
  on public.marketplace_auction_events(created_at);

-- Increment ladder. Versioned by name so changing it later cannot retroactively
-- alter a live auction's minimum.
create or replace function public.marketplace_auction_increment_v1(p_price_satang integer)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_price_satang <    50000 then   1000
    when p_price_satang <   200000 then   2000
    when p_price_satang <   500000 then   5000
    when p_price_satang <  2000000 then  10000
    when p_price_satang <  5000000 then  25000
    when p_price_satang < 20000000 then  50000
    else                                100000
  end;
$$;

create index if not exists marketplace_auctions_due_idx
  on public.marketplace_auctions(effective_ends_at)
  where auction_state = 'live';
create index if not exists marketplace_auctions_listing_idx
  on public.marketplace_auctions(listing_id);
create index if not exists marketplace_auctions_state_end_idx
  on public.marketplace_auctions(auction_state, effective_ends_at desc);
create index if not exists marketplace_auction_bids_auction_seq_idx
  on public.marketplace_auction_bids(auction_id, sequence desc);
create index if not exists marketplace_auction_bids_bidder_idx
  on public.marketplace_auction_bids(bidder_marketplace_account_id, placed_at desc);
-- serves the "has this account bid on this lot before?" check in the bid RPC
create index if not exists marketplace_auction_bids_auction_bidder_idx
  on public.marketplace_auction_bids(auction_id, bidder_marketplace_account_id);
create index if not exists marketplace_listing_format_active_idx
  on public.marketplace_listing_snapshots(listing_format, listing_state, updated_at desc);

-- Teardown for test-marketplace-auction-live.mjs. The bid ledger is
-- append-only, so a plain DELETE from the test harness fails silently and
-- leaves AUCTIONTEST- rows in the production marketplace project forever.
create or replace function public.marketplace_purge_test_auction(p_auction_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  listing uuid;
  title text;
begin
  select a.listing_id, l.title into listing, title
  from public.marketplace_auctions a
  join public.marketplace_listing_snapshots l on l.listing_id = a.listing_id
  where a.id = p_auction_id;

  if title is null or title not like 'AUCTIONTEST-%' then
    raise exception 'marketplace_purge_refused_not_test_data';
  end if;

  set local app.auction_test_purge = 'on';
  delete from public.marketplace_auction_awards where auction_id = p_auction_id;
  delete from public.marketplace_auction_events where auction_id = p_auction_id;
  delete from public.marketplace_auction_bids where auction_id = p_auction_id;
  delete from public.marketplace_auctions where id = p_auction_id;
  return jsonb_build_object('purged', p_auction_id, 'listingId', listing);
end;
$$;

revoke all on function public.marketplace_purge_test_auction(uuid) from public, anon, authenticated;
grant execute on function public.marketplace_purge_test_auction(uuid) to service_role;

alter table public.marketplace_auctions enable row level security;
alter table public.marketplace_auction_bids enable row level security;
revoke all on public.marketplace_auctions from anon, authenticated;
revoke all on public.marketplace_auction_bids from anon, authenticated;
grant select, insert, update on public.marketplace_auctions to service_role;
grant select, insert, update on public.marketplace_auction_bids to service_role;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd Website && node --test scripts/test-marketplace-auction-schema.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add Database/marketplace-supabase/migrations/20260818100000_marketplace_auction_foundation.sql Website/scripts/test-marketplace-auction-schema.mjs
git commit -m "feat(db): add auction listing format, terms table, and append-only bid ledger"
```

### Task 4c: Auction fee rates on the money policy

Two fees, both percentages, both uniform across every auction, both set by you.

- **Buyer's premium** — added **on top** of the hammer price. The winner pays it.
- **Seller's commission** — deducted **from** the hammer price. The consignor pays it.

Both mechanisms already exist: `total = item_price + shipping + service_fee` adds on top, and `payout_amount_satang = item_price_satang - seller_fee_satang` is a hard `check` constraint on `marketplace_seller_payouts`. This task only adds auction-specific *rates*.

**Files:**
- Create: `Database/marketplace-supabase/migrations/20260818100600_marketplace_auction_fees.sql`
- Modify: `Website/src/features/marketplace-ui/admin/FeesSettingsForm.tsx`
- Modify: `Website/scripts/test-marketplace-auction-schema.mjs`

- [ ] **Step 1: Add the failing test**

```js
const fees = compact(readMigration("20260818100600_marketplace_auction_fees.sql"));

test("auction fee rates are nullable and fall back to the standard rates", () => {
  assert.match(fees, /auction_buyer_premium_bps integer/);
  assert.match(fees, /auction_seller_fee_bps integer/);
  assert.match(fees, /auctionbuyerpremiumbps/);
  assert.match(fees, /auctionsellerfeebps/);
});

test("auction fee rates are basis points, bounded 0-10000", () => {
  const bounds = fees.match(/between 0 and 10000/g) ?? [];
  assert.ok(bounds.length >= 2, `expected bounds on both rates, found ${bounds.length}`);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd Website && node --test scripts/test-marketplace-auction-schema.mjs`
Expected: FAIL — `ENOENT ... 20260818100600_...`

- [ ] **Step 3: Write the migration**

```sql
-- Auctions charge different rates from fixed-price sales. The default
-- buyer_service_fee_bps is 1000 (10%); the auction buyer's premium is 300 (3%).
-- Both columns are nullable and fall back to the standard rate when unset, so
-- this migration changes nothing until someone sets a value.

alter table public.marketplace_money_policies
  add column if not exists auction_buyer_premium_bps integer
    check (auction_buyer_premium_bps is null
           or auction_buyer_premium_bps between 0 and 10000),
  add column if not exists auction_seller_fee_bps integer
    check (auction_seller_fee_bps is null
           or auction_seller_fee_bps between 0 and 10000);

-- Seed the agreed 3% buyer's premium on the active policy. Seller commission
-- stays null (falls back to the standard seller fee) because v1 auctions are
-- official-only, where seller_payout_satang is constrained to 0 anyway.
update public.marketplace_money_policies
   set auction_buyer_premium_bps = 300
 where policy_state = 'active'
   and auction_buyer_premium_bps is null;

-- Republish the policy JSON with the two new keys. The close sweep reads
-- auctionBuyerPremiumBps / auctionSellerFeeBps and coalesces to the standard
-- rates, so an unset rate is always safe.
do $$
declare
  definition text;
  patched text;
begin
  definition := pg_get_functiondef(
    'public.marketplace_money_policy_json(public.marketplace_money_policies)'::regprocedure
  );
  if definition is null then
    raise exception 'marketplace_money_policy_json_missing';
  end if;

  patched := replace(
    definition,
    E'\'sellerFeeBps\',',
    E'\'auctionBuyerPremiumBps\', policy_row.auction_buyer_premium_bps,\n    \'auctionSellerFeeBps\', policy_row.auction_seller_fee_bps,\n    \'sellerFeeBps\','
  );
  if patched = definition then
    raise exception 'marketplace_money_policy_json_key_unmatched';
  end if;
  execute patched;
end;
$$;
```

If `marketplace_money_policy_json_key_unmatched` fires, print the deployed body with `select pg_get_functiondef('public.marketplace_money_policy_json(public.marketplace_money_policies)'::regprocedure);` and adjust the anchor string. Do not skip it — without these keys the close sweep silently falls back to the 10% fixed-price rate.

- [ ] **Step 4: Extend `marketplace_admin_set_money_policy` to accept both rates**

Follow the same `pg_get_functiondef` patch pattern: add `p_auction_buyer_premium_bps integer default null` and `p_auction_seller_fee_bps integer default null` as trailing defaulted parameters, and carry them into the new policy row alongside the existing rates.

- [ ] **Step 5: Add an Auctions section to `FeesSettingsForm.tsx`**

Two number inputs beside the existing fee fields, labelled **Buyer's premium (%)** and **Seller commission (%)**, entered as percentages and converted to basis points on submit (3 → 300). Under them, a live worked example that recomputes as the operator types:

> Hammer ฿6,100 → winner pays ฿6,433 (premium ฿183 + shipping ฿150) · seller receives ฿5,795 · YNOTT collects ฿488

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd Website && node --test scripts/test-marketplace-auction-schema.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add Database/marketplace-supabase/migrations/20260818100600_marketplace_auction_fees.sql Website/src/features/marketplace-ui/admin/FeesSettingsForm.tsx Website/scripts/test-marketplace-auction-schema.mjs
git commit -m "feat(marketplace): add settable auction buyer premium and seller commission"
```

### Task 4d: Make the staff flag real

Task 4 adds `marketplace_accounts.is_staff`, but a column nobody writes is worse than no column — it reads as a control while enforcing nothing. The account bridge already computes `isMarketplaceOperator` on every resolve (`src/lib/marketplace/account-bridge.ts:80`); this persists it.

**Files:**
- Modify: `Website/src/lib/marketplace/account-bridge.ts`
- Modify: `Website/scripts/test-marketplace-auction-schema.mjs`

- [ ] **Step 1: Write the failing test**

```js
test("SECURITY: the account bridge persists staff status, it does not only compute it", () => {
  const bridge = readApp("src/lib/marketplace/account-bridge.ts");
  assert.match(bridge, /is_staff/,
    "is_staff must be written on every resolve, or the bid RPC's second admin check is dead weight");
  assert.match(bridge, /staff_synced_at/);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd Website && node --test scripts/test-marketplace-auction-schema.mjs`
Expected: FAIL — `is_staff` not found in `account-bridge.ts`.

- [ ] **Step 3: Persist it on every account resolve**

In `getMarketplaceAccountForProfile`, after the account row is resolved, write the flag whenever it has drifted:

```ts
const isStaff = Boolean(admin?.adminRole);
if (account.is_staff !== isStaff) {
  // Fire-and-forget correction. Staff status is derived in the core project
  // and mirrored here so the bid RPC can enforce the no-house-bidding rule
  // without trusting a parameter its caller might forget to pass.
  const sync = await supabase
    .from("marketplace_accounts")
    .update({ is_staff: isStaff, staff_synced_at: new Date().toISOString() })
    .eq("id", account.id);
  if (sync.error) console.warn("marketplace_staff_sync_failed", sync.error.message);
}
```

**Direction matters.** Promotion to staff must land *before* they can bid, and demotion must land before they lose the block. Because this runs on every resolve and the bid route resolves the account immediately before bidding, the flag is at most one request stale — and the caller-supplied `p_actor_admin_role` covers that window. That is exactly why the RPC checks both.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd Website && node --test scripts/test-marketplace-auction-schema.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Website/src/lib/marketplace/account-bridge.ts Website/scripts/test-marketplace-auction-schema.mjs
git commit -m "fix(security): persist staff status so the no-house-bidding rule is enforceable in SQL"
```

### Task 5: Increment ladder in TypeScript, behaviourally tested

The SQL ladder in Task 4 cannot be unit-tested by a static harness. This TS twin is tested exhaustively and asserted to match the SQL in Task 6.

**Files:**
- Create: `Website/src/lib/marketplace/auction-money.ts`
- Create: `Website/scripts/test-marketplace-auction-money.mjs`

- [ ] **Step 1: Write the failing test**

Create `Website/scripts/test-marketplace-auction-money.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { auctionIncrementSatang, resolveProxyBid } from "../src/lib/marketplace/auction-money.ts";

test("increment ladder boundaries", () => {
  assert.equal(auctionIncrementSatang(0), 1000);
  assert.equal(auctionIncrementSatang(49999), 1000);
  assert.equal(auctionIncrementSatang(50000), 2000);
  assert.equal(auctionIncrementSatang(199999), 2000);
  assert.equal(auctionIncrementSatang(200000), 5000);
  assert.equal(auctionIncrementSatang(499999), 5000);
  assert.equal(auctionIncrementSatang(500000), 10000);
  assert.equal(auctionIncrementSatang(1999999), 10000);
  assert.equal(auctionIncrementSatang(2000000), 25000);
  assert.equal(auctionIncrementSatang(4999999), 25000);
  assert.equal(auctionIncrementSatang(5000000), 50000);
  assert.equal(auctionIncrementSatang(19999999), 50000);
  assert.equal(auctionIncrementSatang(20000000), 100000);
});

test("case A: first bid sits at the start price", () => {
  const r = resolveProxyBid({ cur: 0, curMax: null, leader: null, bidder: "A", newMax: 500000, start: 0 });
  assert.deepEqual(r, { ok: true, price: 0, leader: "A", leadingMax: 500000 });
});

test("case A: first bid below the start price is rejected", () => {
  const r = resolveProxyBid({ cur: 0, curMax: null, leader: null, bidder: "A", newMax: 900, start: 1000 });
  assert.deepEqual(r, { ok: false, code: "auction_bid_below_start" });
});

test("case B: leader raises own max, price does not move", () => {
  const r = resolveProxyBid({ cur: 305000, curMax: 500000, leader: "A", bidder: "A", newMax: 800000, start: 0 });
  assert.deepEqual(r, { ok: true, price: 305000, leader: "A", leadingMax: 800000 });
});

test("case B: leader cannot lower their own max", () => {
  const r = resolveProxyBid({ cur: 305000, curMax: 500000, leader: "A", bidder: "A", newMax: 500000, start: 0 });
  assert.deepEqual(r, { ok: false, code: "auction_bid_not_higher" });
});

test("case C: challenger exceeds the hidden max and takes the lead", () => {
  const r = resolveProxyBid({ cur: 305000, curMax: 500000, leader: "A", bidder: "B", newMax: 600000, start: 0 });
  assert.deepEqual(r, { ok: true, price: 510000, leader: "B", leadingMax: 600000 });
});

test("case C: challenger max caps the price when it lands below max+increment", () => {
  const r = resolveProxyBid({ cur: 305000, curMax: 500000, leader: "A", bidder: "B", newMax: 505000, start: 0 });
  assert.deepEqual(r, { ok: true, price: 505000, leader: "B", leadingMax: 505000 });
});

test("case D: equal maximums, earlier bidder keeps the lead", () => {
  const r = resolveProxyBid({ cur: 305000, curMax: 500000, leader: "A", bidder: "B", newMax: 500000, start: 0 });
  assert.deepEqual(r, { ok: true, price: 500000, leader: "A", leadingMax: 500000 });
});

test("case E: incumbent holds and price rises to challenger max plus one increment", () => {
  const r = resolveProxyBid({ cur: 0, curMax: 500000, leader: "A", bidder: "B", newMax: 300000, start: 0 });
  assert.deepEqual(r, { ok: true, price: 305000, leader: "A", leadingMax: 500000 });
});

test("case E: challenger below the minimum raise is rejected", () => {
  const r = resolveProxyBid({ cur: 305000, curMax: 500000, leader: "A", bidder: "B", newMax: 306000, start: 0 });
  assert.deepEqual(r, { ok: false, code: "auction_bid_below_min" });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd Website && node --experimental-strip-types --test scripts/test-marketplace-auction-money.mjs`
Expected: FAIL — cannot find module `auction-money.ts`.

- [ ] **Step 3: Write the implementation**

Create `Website/src/lib/marketplace/auction-money.ts`:

```ts
/**
 * Auction money rules. This is the TypeScript twin of
 * marketplace_auction_increment_v1 and the proxy resolution inside
 * marketplace_place_auction_bid. The SQL is authoritative at runtime; this
 * exists so the algorithm has behavioural test coverage the static SQL
 * harness cannot provide. test-marketplace-auction-schema.mjs asserts the two
 * stay in step.
 */

const LADDER: ReadonlyArray<readonly [number, number]> = [
  [50000, 1000],
  [200000, 2000],
  [500000, 5000],
  [2000000, 10000],
  [5000000, 25000],
  [20000000, 50000],
];
const TOP_INCREMENT_SATANG = 100000;

export function auctionIncrementSatang(priceSatang: number): number {
  for (const [ceiling, increment] of LADDER) {
    if (priceSatang < ceiling) return increment;
  }
  return TOP_INCREMENT_SATANG;
}

export type ProxyBidInput = {
  cur: number;
  curMax: number | null;
  leader: string | null;
  bidder: string;
  newMax: number;
  start: number;
};

export type ProxyBidResult =
  | { ok: true; price: number; leader: string; leadingMax: number }
  | { ok: false; code: "auction_bid_below_start" | "auction_bid_not_higher" | "auction_bid_below_min" };

export function resolveProxyBid(input: ProxyBidInput): ProxyBidResult {
  const { cur, curMax, leader, bidder, newMax, start } = input;

  // Case A — no bids yet.
  if (leader === null || curMax === null) {
    if (newMax < start) return { ok: false, code: "auction_bid_below_start" };
    return { ok: true, price: start, leader: bidder, leadingMax: newMax };
  }

  // Case B — the leader raising their own maximum. Price does not move.
  if (leader === bidder) {
    if (newMax <= curMax) return { ok: false, code: "auction_bid_not_higher" };
    return { ok: true, price: cur, leader: bidder, leadingMax: newMax };
  }

  // Case D — exact tie. The earlier sequence keeps the lead.
  if (newMax === curMax) {
    return { ok: true, price: curMax, leader, leadingMax: curMax };
  }

  if (newMax < cur + auctionIncrementSatang(cur)) {
    return { ok: false, code: "auction_bid_below_min" };
  }

  // Case C — challenger exceeds the hidden maximum and takes the lead.
  if (newMax > curMax) {
    return {
      ok: true,
      price: Math.min(newMax, curMax + auctionIncrementSatang(curMax)),
      leader: bidder,
      leadingMax: newMax,
    };
  }

  // Case E — incumbent holds.
  return {
    ok: true,
    price: Math.min(curMax, newMax + auctionIncrementSatang(newMax)),
    leader,
    leadingMax: curMax,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd Website && node --experimental-strip-types --test scripts/test-marketplace-auction-money.mjs`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add Website/src/lib/marketplace/auction-money.ts Website/scripts/test-marketplace-auction-money.mjs
git commit -m "feat(marketplace): add proxy-bid resolution with exhaustive unit tests"
```

### Task 6: Close the fixed-price bypass

Without this, any logged-in customer can buy a live auction lot outright with nothing but a `listingId`, voiding every bid. This is the highest-severity task in the plan.

**Files:**
- Create: `Database/marketplace-supabase/migrations/20260818100100_marketplace_auction_fixed_price_guard.sql`
- Modify: `Website/scripts/test-marketplace-auction-schema.mjs`

- [ ] **Step 1: Add the failing test**

Append to `Website/scripts/test-marketplace-auction-schema.mjs`:

```js
const guard = compact(readMigration("20260818100100_marketplace_auction_fixed_price_guard.sql"));

test("every fixed-price listing lock excludes auctions unless explicitly allowed", () => {
  const locks = guard.match(/listing_format = 'fixed_price' or coalesce\(p_allow_auction_format, false\)/g) ?? [];
  assert.ok(locks.length >= 3, `expected the guard on all fixed-price locks, found ${locks.length}`);
  assert.match(guard, /p_allow_auction_format boolean default false/);
});

test("the guard recreates the three purchase entry points", () => {
  assert.match(guard, /create or replace function public\.marketplace_create_pending_payment_order/);
  assert.match(guard, /create or replace function public\.marketplace_create_user_seller_pending_payment_order/);
  assert.match(guard, /create or replace function public\.marketplace_create_multi_listing_checkout/);
});

test("cart refuses auction listings", () => {
  assert.match(guard, /create or replace function public\.marketplace_add_customer_cart_item/);
  assert.match(guard, /marketplace_listing_not_purchasable/);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd Website && node --test scripts/test-marketplace-auction-schema.mjs`
Expected: FAIL — `ENOENT ... 20260818100100_...`

- [ ] **Step 3: Write the migration**

Create `Database/marketplace-supabase/migrations/20260818100100_marketplace_auction_fixed_price_guard.sql`.

Rather than hand-copying four large financial functions and risking divergence, follow the pattern already used by `20260721113000_marketplace_unbounded_checkout_groups.sql`: read the deployed definition and patch the listing lock predicate in place.

```sql
-- A live auction sits in listing_state='active' so the one-open-listing-per-
-- inventory unique index keeps working. That makes it reachable by the
-- ordinary purchase path, which would let any customer buy the lot mid-auction
-- and void every bid. Every fixed-price listing lock must therefore exclude
-- listing_format='auction'.

do $$
declare
  target regprocedure;
  definition text;
  patched text;
  targets regprocedure[] := array[
    'public.marketplace_create_pending_payment_order(uuid,uuid,uuid,text,text,text,integer,integer,integer,jsonb)'::regprocedure,
    'public.marketplace_create_user_seller_pending_payment_order(uuid,uuid,uuid,text,text,text,integer,integer,integer,jsonb)'::regprocedure,
    'public.marketplace_create_multi_listing_checkout(uuid[],uuid,uuid,text,text,text,integer,integer,jsonb)'::regprocedure,
    'public.marketplace_add_customer_cart_item(uuid,uuid,uuid)'::regprocedure
  ];
begin
  foreach target in array targets loop
    definition := pg_get_functiondef(target);
    if definition is null then
      raise exception 'marketplace_auction_guard_target_missing: %', target;
    end if;

    -- Every one of these functions locks the listing with
    --   ... and listing_state = 'active'
    -- (some with `for update`). Add the format predicate immediately after.
    -- The predicate is written against a parameter rather than a bare literal
    -- so auction settlement can reuse these same functions WITHOUT mutating
    -- listing_format around the call. Mutating shared state and relying on
    -- transaction isolation works, but it silently breaks the first time
    -- anyone adds another guard to this path.
    patched := replace(
      definition,
      E'and listing_state = ''active''',
      E'and listing_state = ''active''\n    and (listing_format = ''fixed_price'' or coalesce(p_allow_auction_format, false))'
    );

    -- every guarded creator gains the opt-in flag, defaulted false so all
    -- existing callers keep exactly today's behaviour
    patched := replace(
      patched,
      E'p_shipping_snapshot jsonb default ''{}''::jsonb\n)',
      E'p_shipping_snapshot jsonb default ''{}''::jsonb,\n  p_allow_auction_format boolean default false\n)'
    );

    if patched = definition then
      raise exception 'marketplace_auction_guard_no_lock_found: %', target;
    end if;

    execute patched;
  end loop;
end;
$$;

-- Explicit, readable error when a customer reaches an auction through a
-- fixed-price surface. Without this the listing simply "vanishes" and the
-- caller sees marketplace_listing_not_available, which is misleading.
comment on constraint marketplace_listing_snapshots_listing_format_check
  on public.marketplace_listing_snapshots is
  'marketplace_listing_not_purchasable: auction lots are bought through the award path only';
```

If any `raise exception` fires during apply, the deployed function signature differs from the one assumed here. Print the real signature with
`select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'marketplace_create%';`
and correct the array before re-running. Do not skip a target.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd Website && node --test scripts/test-marketplace-auction-schema.mjs`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add Database/marketplace-supabase/migrations/20260818100100_marketplace_auction_fixed_price_guard.sql Website/scripts/test-marketplace-auction-schema.mjs
git commit -m "fix(db): block fixed-price purchase of live auction lots"
```

### Task 7: Price override on both pending-order RPCs

Both purchase RPCs derive every fee from `inventory_row.item_price_satang`. Without an override an auction charges the start price, not the hammer price.

**Files:**
- Create: `Database/marketplace-supabase/migrations/20260818100200_marketplace_auction_price_override.sql`
- Modify: `Website/scripts/test-marketplace-auction-schema.mjs`

- [ ] **Step 1: Add the failing test**

Append to `Website/scripts/test-marketplace-auction-schema.mjs`:

```js
const override = compact(readMigration("20260818100200_marketplace_auction_price_override.sql"));

test("both pending-order RPCs accept a price override defaulting to null", () => {
  const decls = override.match(/p_price_override_satang integer default null/g) ?? [];
  assert.ok(decls.length >= 2, `expected the override on both RPCs, found ${decls.length}`);
});

test("effective price falls back to the inventory price when the override is null", () => {
  assert.match(override, /coalesce\(p_price_override_satang, inventory_row\.item_price_satang\)/);
});

test("override is rejected when negative", () => {
  assert.match(override, /marketplace_price_override_invalid/);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd Website && node --test scripts/test-marketplace-auction-schema.mjs`
Expected: FAIL — `ENOENT ... 20260818100200_...`

- [ ] **Step 3: Write the migration**

Create `Database/marketplace-supabase/migrations/20260818100200_marketplace_auction_price_override.sql`:

```sql
-- Auction settlement must charge the hammer price, not the seller's asking
-- price. Every fee in both purchase RPCs is derived from
-- inventory_row.item_price_satang, so the auction path needs an explicit
-- override rather than a second copy of the money math.
--
-- Overwriting marketplace_inventory_items.item_price_satang was rejected: it
-- destroys the asking price irrecoverably (indexed, no history table, the
-- coalesce source for admin edits) and a defaulted winner would leave the card
-- relisted at the deadbeat's bid.

do $$
declare
  target regprocedure;
  definition text;
  patched text;
  targets regprocedure[] := array[
    'public.marketplace_create_pending_payment_order(uuid,uuid,uuid,text,text,text,integer,integer,integer,jsonb)'::regprocedure,
    'public.marketplace_create_user_seller_pending_payment_order(uuid,uuid,uuid,text,text,text,integer,integer,integer,jsonb)'::regprocedure
  ];
begin
  foreach target in array targets loop
    definition := pg_get_functiondef(target);
    if definition is null then
      raise exception 'marketplace_price_override_target_missing: %', target;
    end if;

    -- 1. add the parameter (always last, always defaulted, so every existing
    --    caller keeps working unchanged)
    patched := replace(
      definition,
      E'p_shipping_snapshot jsonb default ''{}''::jsonb\n)',
      E'p_shipping_snapshot jsonb default ''{}''::jsonb,\n  p_price_override_satang integer default null\n)'
    );
    if patched = definition then
      raise exception 'marketplace_price_override_signature_unmatched: %', target;
    end if;

    -- 2. validate it
    patched := replace(
      patched,
      E'begin\n',
      E'begin\n  if p_price_override_satang is not null and p_price_override_satang < 0 then\n    raise exception ''marketplace_price_override_invalid'';\n  end if;\n'
    );

    -- 3. route every money derivation through the override
    patched := replace(
      patched,
      'inventory_row.item_price_satang',
      'coalesce(p_price_override_satang, inventory_row.item_price_satang)'
    );

    execute patched;
  end loop;
end;
$$;
```

**Careful:** step 3 rewrites *all* occurrences, including the `update ... set quantity_available` clause if it references the price. After applying, read back each function and confirm only fee/total derivations changed:
`select pg_get_functiondef('public.marketplace_create_pending_payment_order(...)'::regprocedure);`

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd Website && node --test scripts/test-marketplace-auction-schema.mjs`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add Database/marketplace-supabase/migrations/20260818100200_marketplace_auction_price_override.sql Website/scripts/test-marketplace-auction-schema.mjs
git commit -m "fix(db): let auction settlement charge the hammer price"
```

### Task 8: The bid RPC

**Files:**
- Create: `Database/marketplace-supabase/migrations/20260818100300_marketplace_auction_bid_rpc.sql`
- Modify: `Website/scripts/test-marketplace-auction-schema.mjs`

- [ ] **Step 1: Add the failing test**

Append to `Website/scripts/test-marketplace-auction-schema.mjs`:

```js
const bidRpc = compact(readMigration("20260818100300_marketplace_auction_bid_rpc.sql"));

test("bid serialises on the auction row", () => {
  assert.match(bidRpc, /from public\.marketplace_auctions where id = p_auction_id for update/);
});

test("deadline is enforced inside the bid, independent of the closer", () => {
  assert.match(bidRpc, /now\(\) >= auction_row\.effective_ends_at/);
  assert.match(bidRpc, /auction_bid_closed/);
});

test("admins can never bid", () => {
  assert.match(bidRpc, /p_actor_admin_role is not null/);
  assert.match(bidRpc, /auction_bid_admin_forbidden/);
});

test("the seller cannot bid on their own lot", () => {
  assert.match(bidRpc, /auction_bid_seller_forbidden/);
});

test("the kyc gate is checked but defaults open", () => {
  assert.match(bidRpc, /auction_row\.bidder_gate = 'kyc_required'/);
  assert.match(bidRpc, /auction_bid_kyc_required/);
});

test("all five proxy cases are implemented", () => {
  for (const code of ["auction_bid_below_start", "auction_bid_not_higher", "auction_bid_below_min"]) {
    assert.match(bidRpc, new RegExp(code));
  }
  assert.match(bidRpc, /marketplace_auction_increment_v1/);
});

test("idempotency is resolved under the auction lock, not before it", () => {
  const lockAt = bidRpc.indexOf("for update");
  const idemAt = bidRpc.indexOf("scope = 'auction_bid'");
  assert.ok(lockAt > 0 && idemAt > lockAt,
    "the idempotency lookup must come AFTER the auction row lock or concurrent retries raise a unique violation instead of replaying");
});

test("the visible price is mirrored onto the listing", () => {
  assert.match(bidRpc, /update public\.marketplace_listing_snapshots set item_price_satang/);
});

test("anti-snipe extends within a capped count", () => {
  assert.match(bidRpc, /extension_count < auction_row\.max_extensions/);
  assert.match(bidRpc, /anti_snipe_extend_seconds/);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd Website && node --test scripts/test-marketplace-auction-schema.mjs`
Expected: FAIL — `ENOENT ... 20260818100300_...`

- [ ] **Step 3: Write the migration**

Create `Database/marketplace-supabase/migrations/20260818100300_marketplace_auction_bid_rpc.sql`:

```sql
-- Proxy bidding. One transaction, one row lock, fully deterministic.
--
-- The deadline check at step 2 is the correctness anchor for the whole
-- feature: no bid can land at or after effective_ends_at, whether or not the
-- close sweep has run. That is what makes closing a materialisation step
-- rather than a race.

create or replace function public.marketplace_place_auction_bid(
  p_auction_id uuid,
  p_bidder_marketplace_account_id uuid,
  p_bidder_ynot_profile_id uuid,
  p_max_amount_satang integer,
  p_actor_admin_role text,
  p_request_id text,
  p_idempotency_key text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
-- A bid holds an exclusive lock on the auction row, so it must never be able
-- to sit there. lock_timeout returns a clean retryable error to a queued
-- bidder instead of hanging; statement_timeout caps the holder itself.
set lock_timeout = '3s'
set statement_timeout = '5s'
as $$
declare
  idempotency_row public.marketplace_idempotency_keys%rowtype;
  auction_row public.marketplace_auctions%rowtype;
  account_row public.marketplace_accounts%rowtype;
  previous_leader uuid;
  resolved_price integer;
  resolved_leader uuid;
  resolved_max integer;
  increment_satang integer;
  bid_sequence bigint;
  bid_alias text;
  bidder_is_new boolean;
  extended boolean := false;
  distinct_bidders integer;
  normalized_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_hash text := nullif(trim(coalesce(p_request_hash, '')), '');
  response jsonb;
begin
  if p_bidder_marketplace_account_id is null or p_bidder_ynot_profile_id is null then
    raise exception 'marketplace_login_required';
  end if;
  if normalized_key is null or normalized_hash is null then
    raise exception 'marketplace_idempotency_key_required';
  end if;
  if p_max_amount_satang is null or p_max_amount_satang < 0
     or p_max_amount_satang > 100000000 then
    raise exception 'auction_bid_amount_invalid';
  end if;

  -- 0. Resolve the account BEFORE taking the auction lock. The bid acquires
  -- FOR KEY SHARE on this row via three foreign keys later, so any contention
  -- on it should be settled outside the auction's critical section. The
  -- predicate matches every other marketplace entry point: account, profile
  -- linkage, and profile status together.
  select * into account_row
  from public.marketplace_accounts
  where id = p_bidder_marketplace_account_id
    and ynot_profile_id = p_bidder_ynot_profile_id
    and profile_status_snapshot = 'active';

  -- 1. Serialise every bid for this lot.
  --
  -- The lock comes FIRST, before the idempotency lookup. If the lookup ran
  -- first, two concurrent retries of the same key would both miss the row,
  -- both proceed, and the second would die on the
  -- unique (bidder_marketplace_account_id, idempotency_key) constraint --
  -- surfacing "bid failed" for a bid that actually succeeded. Taking the lock
  -- first means the second transaction only proceeds after the first commits,
  -- so it sees the committed idempotency row and replays cleanly.
  select * into auction_row
  from public.marketplace_auctions
  where id = p_auction_id
  for update;

  if auction_row.id is null then
    raise exception 'auction_not_found';
  end if;

  -- Idempotent replay: an identical retry returns the original result rather
  -- than placing a second bid.
  select * into idempotency_row
  from public.marketplace_idempotency_keys
  where ynot_profile_id = p_bidder_ynot_profile_id
    and scope = 'auction_bid:' || p_auction_id::text
    and idempotency_key = normalized_key;

  if idempotency_row.id is not null then
    if idempotency_row.request_hash <> normalized_hash then
      raise exception 'marketplace_idempotency_conflict';
    end if;
    if idempotency_row.response_payload is not null then
      return idempotency_row.response_payload;
    end if;
  end if;

  -- 2. THE CORRECTNESS ANCHOR.
  --
  -- clock_timestamp(), NOT now(). now() is transaction_timestamp() -- fixed at
  -- BEGIN, before this transaction queued on the auction lock above. Thirty
  -- snipers firing at 11:59:59.9 all carry that pre-deadline now() and would
  -- each be admitted as the lock hands round past 12:00:00, with placed_at
  -- recording the stale time so the audit trail corroborates the wrong winner.
  -- Every time evaluation after the lock must use clock_timestamp().
  if auction_row.auction_state <> 'live' then
    raise exception 'auction_bid_closed';
  end if;
  if clock_timestamp() >= auction_row.effective_ends_at then
    raise exception 'auction_bid_closed';
  end if;

  -- 3. Who may bid.
  --
  -- TWO independent sources, either one of which blocks. p_actor_admin_role
  -- comes from the caller and can be omitted by a buggy or new route;
  -- account_row.is_staff is stored in this database and cannot. On official
  -- lots YNOTT is the seller, so a house bid is fraud -- this control does not
  -- get to depend on an argument being remembered.
  if p_actor_admin_role is not null or coalesce(account_row.is_staff, false) then
    raise exception 'auction_bid_admin_forbidden';
  end if;
  if auction_row.seller_marketplace_account_id is not null
     and auction_row.seller_marketplace_account_id = p_bidder_marketplace_account_id then
    raise exception 'auction_bid_seller_forbidden';
  end if;

  if account_row.id is null or account_row.buyer_status <> 'active' then
    raise exception 'auction_bid_account_blocked';
  end if;
  if coalesce(account_row.metadata ->> 'contactVerified', 'false') <> 'true' then
    raise exception 'auction_bid_contact_unverified';
  end if;
  if auction_row.max_bid_satang is not null
     and p_max_amount_satang > auction_row.max_bid_satang then
    raise exception 'auction_bid_above_ceiling';
  end if;
  if auction_row.bidder_gate = 'kyc_required'
     and coalesce(account_row.metadata ->> 'kycStatus', 'none') <> 'approved' then
    raise exception 'auction_bid_kyc_required';
  end if;

  -- 4/5. Resolve the proxy contest. Mirrors resolveProxyBid() exactly;
  -- see the algorithm table in the plan for the five cases.
  previous_leader := auction_row.leading_bidder_account_id;
  increment_satang := public.marketplace_auction_increment_v1(auction_row.current_price_satang);

  if previous_leader is null or auction_row.leading_max_satang is null then
    -- Case A. The opening bid sits at the start price -- except on a lot that
    -- opens at 0, where it sits at one increment instead. Otherwise the very
    -- first thing anyone sees is "Current bid THB 0 - 1 bid", which reads as
    -- broken.
    resolved_price := case
      when auction_row.start_price_satang > 0 then auction_row.start_price_satang
      else public.marketplace_auction_increment_v1(0)
    end;
    if p_max_amount_satang < resolved_price then
      raise exception 'auction_bid_below_start';
    end if;
    resolved_leader := p_bidder_marketplace_account_id;
    resolved_max := p_max_amount_satang;

  elsif previous_leader = p_bidder_marketplace_account_id then
    -- Case B
    if p_max_amount_satang <= auction_row.leading_max_satang then
      raise exception 'auction_bid_not_higher';
    end if;
    resolved_price := auction_row.current_price_satang;
    resolved_leader := p_bidder_marketplace_account_id;
    resolved_max := p_max_amount_satang;

  elsif p_max_amount_satang = auction_row.leading_max_satang then
    -- Case D: tie, earlier sequence keeps the lead
    resolved_price := auction_row.leading_max_satang;
    resolved_leader := previous_leader;
    resolved_max := auction_row.leading_max_satang;

  elsif p_max_amount_satang < auction_row.current_price_satang + increment_satang then
    raise exception 'auction_bid_below_min';

  elsif p_max_amount_satang > auction_row.leading_max_satang then
    -- Case C
    resolved_price := least(
      p_max_amount_satang,
      auction_row.leading_max_satang
        + public.marketplace_auction_increment_v1(auction_row.leading_max_satang)
    );
    resolved_leader := p_bidder_marketplace_account_id;
    resolved_max := p_max_amount_satang;

  else
    -- Case E
    resolved_price := least(
      auction_row.leading_max_satang,
      p_max_amount_satang + public.marketplace_auction_increment_v1(p_max_amount_satang)
    );
    resolved_leader := previous_leader;
    resolved_max := auction_row.leading_max_satang;
  end if;

  -- 6. Record the bid.
  -- Must be evaluated BEFORE the insert below, or this bidder always looks
  -- like a returning one.
  select not exists (
    select 1 from public.marketplace_auction_bids
    where auction_id = p_auction_id
      and bidder_marketplace_account_id = p_bidder_marketplace_account_id
  ) into bidder_is_new;

  bid_sequence := auction_row.next_sequence;
  -- pgcrypto is created by 20260628090000. The function pins
  -- search_path = public, pg_temp, so if pgcrypto lives in the `extensions`
  -- schema on this project, qualify this as extensions.digest(...) instead.
  -- Verify with: select extnamespace::regnamespace from pg_extension where extname = 'pgcrypto';
  -- Salted and keyed. 6 hex chars rather than 4 also drops the birthday
  -- collision rate from roughly 1-in-300 to 1-in-90,000 at twenty bidders.
  bid_alias := 'b' || substr(
    encode(
      hmac(
        p_bidder_marketplace_account_id::text,
        auction_row.alias_salt::text,
        'sha256'
      ),
      'hex'
    ), 1, 6);

  update public.marketplace_auction_bids
  set outcome = 'outbid'
  where auction_id = p_auction_id and outcome = 'leading';

  insert into public.marketplace_auction_bids (
    auction_id, sequence, bidder_marketplace_account_id, bidder_ynot_profile_id,
    bid_kind, max_amount_satang, effective_amount_satang, outcome,
    bidder_alias, request_id, idempotency_key
  ) values (
    p_auction_id, bid_sequence, p_bidder_marketplace_account_id, p_bidder_ynot_profile_id,
    'proxy_max', p_max_amount_satang, resolved_price,
    case when resolved_leader = p_bidder_marketplace_account_id then 'leading' else 'outbid' end,
    bid_alias, p_request_id, normalized_key
  );

  -- If the incumbent held, their bid row is leading again.
  if resolved_leader <> p_bidder_marketplace_account_id then
    update public.marketplace_auction_bids
    set outcome = 'leading'
    where auction_id = p_auction_id
      and bidder_marketplace_account_id = resolved_leader
      and sequence = (
        select max(sequence) from public.marketplace_auction_bids
        where auction_id = p_auction_id and bidder_marketplace_account_id = resolved_leader
      );
  end if;

  -- Maintained incrementally. count(distinct ...) on every bid would scan the
  -- whole auction's bid history, and the cost grows with the bidding war it is
  -- most likely to be running during.
  if bidder_is_new then
    distinct_bidders := auction_row.distinct_bidder_count + 1;
  else
    distinct_bidders := auction_row.distinct_bidder_count;
  end if;

  -- 7. Anti-snipe.
  if auction_row.effective_ends_at - clock_timestamp() < make_interval(secs => auction_row.anti_snipe_window_seconds)
     and auction_row.extension_count < auction_row.max_extensions then
    extended := true;
  end if;

  update public.marketplace_auctions
  set current_price_satang = resolved_price,
      leading_bidder_account_id = resolved_leader,
      leading_max_satang = resolved_max,
      bid_count = bid_count + 1,
      distinct_bidder_count = distinct_bidders,
      next_sequence = next_sequence + 1,
      extension_count = extension_count + (case when extended then 1 else 0 end),
      -- greatest(), not assignment. On a lot configured with
      -- extend_seconds < window_seconds, a bare assignment moves the deadline
      -- BACKWARDS and violates the effective_ends_at >= base_ends_at check.
      -- The 120/120 defaults hide this; a 30s extend with a 120s window does not.
      effective_ends_at = case
        when extended then greatest(
          effective_ends_at,
          clock_timestamp() + make_interval(secs => auction_row.anti_snipe_extend_seconds)
        )
        else effective_ends_at end,
      version = version + 1
  where id = p_auction_id;

  -- NOTE: the bid deliberately does NOT write marketplace_listing_snapshots.
  --
  -- An earlier draft mirrored the live price onto the listing for browse
  -- sorting. That made the bid hold the auction lock while acquiring a listing
  -- row lock -- and four routine unguarded paths take that same listing lock,
  -- including "watch this lot", the single most likely action on an auction
  -- page. One watch click would have serialised the entire bidding queue.
  --
  -- Instead the listing keeps its START price, browse shows it as "from THB X"
  -- with a LIVE AUCTION badge, and the live price is read from
  -- marketplace_auctions.current_price_satang through the public auction
  -- projection. The close sweep writes the final hammer price to the listing
  -- once, when nobody is bidding any more.

  -- Public realtime fan-out. Written in the SAME transaction as the bid, so a
  -- broadcast can never describe a price that did not commit. Carries no
  -- account id and no maximum -- see 20260818100700.
  insert into public.marketplace_auction_events (
    auction_id, event_type, current_price_satang, bid_count,
    distinct_bidder_count, effective_ends_at, extension_count, bidder_alias
  )
  select p_auction_id, case when extended then 'extended' else 'bid_placed' end,
         resolved_price, auction_row.bid_count + 1, distinct_bidders,
         a.effective_ends_at, a.extension_count, bid_alias
  from public.marketplace_auctions a where a.id = p_auction_id;

  insert into public.marketplace_audit_events (
    marketplace_account_id, ynot_profile_id, actor_ynot_profile_id,
    event_type, event_payload, request_id
  ) values (
    p_bidder_marketplace_account_id, p_bidder_ynot_profile_id, p_bidder_ynot_profile_id,
    'auction_bid_placed',
    jsonb_build_object(
      'auctionId', p_auction_id, 'sequence', bid_sequence,
      'effectiveAmountSatang', resolved_price, 'extended', extended
    ),
    p_request_id
  );

  response := jsonb_build_object(
    'auctionId', p_auction_id,
    'sequence', bid_sequence,
    'currentPriceSatang', resolved_price,
    'youAreLeading', resolved_leader = p_bidder_marketplace_account_id,
    'yourMaxSatang', p_max_amount_satang,
    'bidCount', auction_row.bid_count + 1,
    'extended', extended,
    'effectiveEndsAt', (
      select effective_ends_at from public.marketplace_auctions where id = p_auction_id
    )
  );

  insert into public.marketplace_idempotency_keys (
    marketplace_account_id, ynot_profile_id, scope, idempotency_key,
    request_hash, response_payload
  ) values (
    p_bidder_marketplace_account_id, p_bidder_ynot_profile_id,
    'auction_bid:' || p_auction_id::text,
    normalized_key, normalized_hash, response
  )
  on conflict (ynot_profile_id, scope, idempotency_key)
  do update set response_payload = excluded.response_payload;

  return response;
end;
$$;

revoke all on function public.marketplace_place_auction_bid(uuid, uuid, uuid, integer, text, text, text, text) from public, anon, authenticated;
grant execute on function public.marketplace_place_auction_bid(uuid, uuid, uuid, integer, text, text, text, text) to service_role;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd Website && node --test scripts/test-marketplace-auction-schema.mjs`
Expected: PASS, 19 tests.

- [ ] **Step 5: Commit**

```bash
git add Database/marketplace-supabase/migrations/20260818100300_marketplace_auction_bid_rpc.sql Website/scripts/test-marketplace-auction-schema.mjs
git commit -m "feat(db): add proxy bid RPC with anti-snipe and admin bid block"
```

### Task 9: Awards and the close engine

**Files:**
- Create: `Database/marketplace-supabase/migrations/20260818100400_marketplace_auction_close_rpc.sql`
- Modify: `Website/scripts/test-marketplace-auction-schema.mjs`

- [ ] **Step 1: Add the failing test**

Append to `Website/scripts/test-marketplace-auction-schema.mjs`:

```js
const closeRpc = compact(readMigration("20260818100400_marketplace_auction_close_rpc.sql"));

test("awards freeze the money policy at close", () => {
  assert.match(closeRpc, /create table if not exists public\.marketplace_auction_awards/);
  assert.match(closeRpc, /hammer_price_satang integer not null/);
  assert.match(closeRpc, /payment_due_at timestamptz not null/);
  assert.match(closeRpc, /award_rank integer not null default 1/);
});

test("closing is one lot per transaction, never a batch", () => {
  assert.match(closeRpc, /auction_close_requires_target/);
  assert.match(closeRpc, /create or replace function public\.marketplace_list_due_auctions/);
});

test("all three sweeps exist -- open, close, expire", () => {
  assert.match(closeRpc, /marketplace_open_due_auction/);
  assert.match(closeRpc, /marketplace_close_due_auctions/);
  assert.match(closeRpc, /marketplace_expire_due_auction_awards/);
});

test("every post-lock time evaluation uses clock_timestamp", () => {
  assert.doesNotMatch(closeRpc, /<= now\(\)/);
  assert.match(closeRpc, /effective_ends_at <= clock_timestamp\(\)/);
  assert.match(closeRpc, /starts_at <= clock_timestamp\(\)/);
});

test("an expired award frees the card instead of stranding it", () => {
  assert.match(closeRpc, /award_state = 'expired'/);
  assert.match(closeRpc, /listing_state = 'hidden'/);
});

test("close applies the auction fee rates, not the fixed-price ones", () => {
  assert.match(closeRpc, /auctionBuyerPremiumBps/);
  assert.match(closeRpc, /auctionSellerFeeBps/);
});

test("zero bids is the only unsold outcome in v1", () => {
  assert.match(closeRpc, /closed_unsold/);
  assert.match(closeRpc, /no_bids/);
  assert.doesNotMatch(closeRpc, /reserve/);
});

test("a won lot moves the listing to pending_payment", () => {
  assert.match(closeRpc, /listing_state = 'pending_payment'/);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd Website && node --test scripts/test-marketplace-auction-schema.mjs`
Expected: FAIL — `ENOENT ... 20260818100400_...`

- [ ] **Step 3: Write the migration**

Create `Database/marketplace-supabase/migrations/20260818100400_marketplace_auction_close_rpc.sql`:

```sql
-- Closing materialises a result the bid ledger already determined. It is
-- idempotent, so the lazy-close-on-read path and the cron sweep can race
-- freely: whoever arrives first writes the award, the second is a no-op.

create table if not exists public.marketplace_auction_awards (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references public.marketplace_auctions(id) on delete restrict,
  listing_id uuid not null,
  inventory_item_id uuid not null references public.marketplace_inventory_items(id) on delete restrict,
  winner_marketplace_account_id uuid not null references public.marketplace_accounts(id) on delete restrict,
  winner_ynot_profile_id uuid not null,
  award_rank integer not null default 1 check (award_rank >= 1),
  award_state text not null default 'awaiting_payment'
    check (award_state in ('awaiting_payment', 'payment_started', 'paid', 'expired', 'defaulted', 'cancelled', 'superseded')),

  hammer_price_satang integer not null check (hammer_price_satang >= 0),
  buyer_service_fee_bps integer not null check (buyer_service_fee_bps between 0 and 10000),
  seller_fee_bps integer not null check (seller_fee_bps between 0 and 10000),
  shipping_fee_satang integer not null check (shipping_fee_satang >= 0),
  money_policy_id uuid,
  currency text not null default 'THB' check (currency = 'THB'),

  fulfilment_method text not null default 'ship' check (fulfilment_method in ('ship', 'collect')),
  awarded_at timestamptz not null default now(),
  payment_due_at timestamptz not null,
  pending_payment_order_id uuid references public.marketplace_pending_payment_orders(id) on delete restrict,
  order_id uuid references public.marketplace_orders(id) on delete restrict,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (auction_id, award_rank)
);

create index if not exists marketplace_auction_awards_winner_idx
  on public.marketplace_auction_awards(winner_marketplace_account_id, award_state, awarded_at desc);
create index if not exists marketplace_auction_awards_due_idx
  on public.marketplace_auction_awards(payment_due_at)
  where award_state in ('awaiting_payment', 'payment_started');

drop trigger if exists marketplace_auction_awards_touch_updated_at on public.marketplace_auction_awards;
create trigger marketplace_auction_awards_touch_updated_at
before update on public.marketplace_auction_awards
for each row execute function public.marketplace_touch_updated_at();

alter table public.marketplace_auction_awards enable row level security;
revoke all on public.marketplace_auction_awards from anon, authenticated;
grant select, insert, update on public.marketplace_auction_awards to service_role;

-- ONE LOT PER TRANSACTION.
--
-- An earlier draft looped FOR UPDATE SKIP LOCKED over up to 200 auctions and
-- did every listing, ledger and audit write inside that one transaction. A
-- single blocked listing update would then freeze closing AND bidding for the
-- whole batch. Now the worker asks which lots are due and closes them one at a
-- time, so each commits independently and a stuck lock costs exactly one lot.

create or replace function public.marketplace_list_due_auctions(p_limit integer default 200)
returns table (auction_id uuid, due_kind text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id, 'open'::text from public.marketplace_auctions
   where auction_state = 'scheduled' and starts_at <= clock_timestamp()
  union all
  select id, 'close'::text from public.marketplace_auctions
   where auction_state = 'live' and effective_ends_at <= clock_timestamp()
  limit greatest(coalesce(p_limit, 200), 1);
$$;

-- SWEEP 1 of 3: scheduled -> live.
-- Without this nothing ever opens an auction for bidding.
create or replace function public.marketplace_open_due_auction(
  p_auction_id uuid,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set lock_timeout = '3s'
set statement_timeout = '10s'
set search_path = public, pg_temp
as $$
declare
  auction_row public.marketplace_auctions%rowtype;
begin
  select * into auction_row from public.marketplace_auctions
   where id = p_auction_id for update;

  if auction_row.id is null then raise exception 'auction_not_found'; end if;
  if auction_row.auction_state <> 'scheduled'
     or auction_row.starts_at > clock_timestamp() then
    return jsonb_build_object('opened', false);   -- idempotent no-op
  end if;

  update public.marketplace_auctions
     set auction_state = 'live', version = version + 1
   where id = p_auction_id;

  insert into public.marketplace_auction_events (
    auction_id, event_type, current_price_satang, bid_count,
    distinct_bidder_count, effective_ends_at, extension_count
  ) values (
    p_auction_id, 'opened', auction_row.current_price_satang, 0, 0,
    auction_row.effective_ends_at, 0
  );

  insert into public.marketplace_audit_events (event_type, event_payload, request_id)
  values ('auction_opened', jsonb_build_object('auctionId', p_auction_id), p_request_id);

  return jsonb_build_object('opened', true);
end;
$$;

-- SWEEP 2 of 3: live -> closed_won / closed_unsold, for ONE lot.
create or replace function public.marketplace_close_due_auctions(
  p_request_id text default null,
  p_limit integer default 1,
  p_auction_id uuid default null
)
returns jsonb
language plpgsql
security definer
set lock_timeout = '3s'
set statement_timeout = '15s'
set search_path = public, pg_temp
as $$
declare
  auction_row public.marketplace_auctions%rowtype;
  policy jsonb;
  premium_bps integer;
  seller_bps integer;
  payment_window_hours constant integer := 48;
  awarded boolean := false;
begin
  if p_auction_id is null then
    raise exception 'auction_close_requires_target';
  end if;

  policy := public.marketplace_get_active_money_policy();
  -- Auction fees, falling back to the standard marketplace rates when unset.
  premium_bps := coalesce(
    (policy ->> 'auctionBuyerPremiumBps')::integer,
    (policy ->> 'buyerServiceFeeBps')::integer
  );
  seller_bps := coalesce(
    (policy ->> 'auctionSellerFeeBps')::integer,
    (policy ->> 'sellerFeeBps')::integer
  );

  select * into auction_row from public.marketplace_auctions
   where id = p_auction_id for update;

  if auction_row.id is null then raise exception 'auction_not_found'; end if;
  if auction_row.auction_state <> 'live'
     or auction_row.effective_ends_at > clock_timestamp() then
    return jsonb_build_object('closedWon', 0, 'closedUnsold', 0);  -- idempotent no-op
  end if;

  if auction_row.leading_bidder_account_id is null then
    update public.marketplace_auctions
       set auction_state = 'closed_unsold', closed_at = clock_timestamp(),
           close_reason = 'no_bids', version = version + 1
     where id = p_auction_id;

    update public.marketplace_listing_snapshots
       set listing_state = 'hidden', snapshot_version = snapshot_version + 1
     where listing_id = auction_row.listing_id;
  else
    update public.marketplace_auctions
       set auction_state = 'closed_won', closed_at = clock_timestamp(),
           close_reason = 'sold', version = version + 1
     where id = p_auction_id;

    update public.marketplace_auction_bids
       set outcome = 'winning'
     where auction_id = p_auction_id and outcome = 'leading';

    insert into public.marketplace_auction_awards (
      auction_id, listing_id, inventory_item_id,
      winner_marketplace_account_id, winner_ynot_profile_id,
      award_rank, hammer_price_satang,
      buyer_service_fee_bps, seller_fee_bps, shipping_fee_satang,
      money_policy_id, payment_due_at
    )
    select
      p_auction_id, auction_row.listing_id, auction_row.inventory_item_id,
      auction_row.leading_bidder_account_id, bids.bidder_ynot_profile_id,
      1, auction_row.current_price_satang,
      premium_bps, seller_bps, (policy ->> 'shippingFeeSatang')::integer,
      nullif(policy ->> 'policyId', '')::uuid,
      clock_timestamp() + make_interval(hours => payment_window_hours)
    from public.marketplace_auction_bids bids
    where bids.auction_id = p_auction_id
      and bids.bidder_marketplace_account_id = auction_row.leading_bidder_account_id
    order by bids.sequence desc
    limit 1
    on conflict (auction_id, award_rank) do nothing;

    awarded := found;

    -- The one and only time an auction writes its price to the listing: at
    -- close, when there are no more bidders to serialise behind it.
    update public.marketplace_listing_snapshots
       set listing_state = 'pending_payment',
           item_price_satang = auction_row.current_price_satang,
           snapshot_version = snapshot_version + 1
     where listing_id = auction_row.listing_id;
  end if;

  insert into public.marketplace_auction_events (
    auction_id, event_type, current_price_satang, bid_count,
    distinct_bidder_count, effective_ends_at, extension_count
  ) values (
    p_auction_id, 'closed', auction_row.current_price_satang, auction_row.bid_count,
    auction_row.distinct_bidder_count, auction_row.effective_ends_at,
    auction_row.extension_count
  );

  insert into public.marketplace_audit_events (event_type, event_payload, request_id)
  values ('auction_closed', jsonb_build_object(
    'auctionId', p_auction_id,
    'won', auction_row.leading_bidder_account_id is not null,
    'hammerPriceSatang', auction_row.current_price_satang
  ), p_request_id);

  return jsonb_build_object(
    'closedWon', case when awarded then 1 else 0 end,
    'closedUnsold', case when auction_row.leading_bidder_account_id is null then 1 else 0 end
  );
end;
$$;

-- SWEEP 3 of 3: an unpaid award must free the card.
--
-- Without this the award sits in awaiting_payment forever, the listing sits in
-- pending_payment forever, and the one-open-listing-per-inventory unique index
-- keeps that inventory item locked -- the card becomes permanently unsellable
-- by any path.
create or replace function public.marketplace_expire_due_auction_awards(
  p_request_id text default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set statement_timeout = '15s'
set search_path = public, pg_temp
as $$
declare
  award_row public.marketplace_auction_awards%rowtype;
  expired_count integer := 0;
begin
  for award_row in
    select * from public.marketplace_auction_awards
     where award_state in ('awaiting_payment', 'payment_started')
       and payment_due_at <= clock_timestamp()
     order by payment_due_at
     limit greatest(coalesce(p_limit, 100), 1)
     for update skip locked
  loop
    update public.marketplace_auction_awards
       set award_state = 'expired', version = version + 1
     where id = award_row.id;

    -- Free the card. It surfaces in the admin cockpit's expired queue; v1
    -- makes no automatic decision about what happens next.
    update public.marketplace_listing_snapshots
       set listing_state = 'hidden', snapshot_version = snapshot_version + 1
     where listing_id = award_row.listing_id;

    insert into public.marketplace_audit_events (event_type, event_payload, request_id)
    values ('auction_award_expired', jsonb_build_object(
      'awardId', award_row.id, 'auctionId', award_row.auction_id,
      'winnerAccountId', award_row.winner_marketplace_account_id
    ), p_request_id);

    expired_count := expired_count + 1;
  end loop;

  return jsonb_build_object('expired', expired_count);
end;
$$;

revoke all on function public.marketplace_list_due_auctions(integer) from public, anon, authenticated;
revoke all on function public.marketplace_open_due_auction(uuid, text) from public, anon, authenticated;
revoke all on function public.marketplace_close_due_auctions(text, integer, uuid) from public, anon, authenticated;
revoke all on function public.marketplace_expire_due_auction_awards(text, integer) from public, anon, authenticated;
grant execute on function public.marketplace_list_due_auctions(integer) to service_role;
grant execute on function public.marketplace_open_due_auction(uuid, text) to service_role;
grant execute on function public.marketplace_close_due_auctions(text, integer, uuid) to service_role;
grant execute on function public.marketplace_expire_due_auction_awards(text, integer) to service_role;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd Website && node --test scripts/test-marketplace-auction-schema.mjs`
Expected: PASS, 23 tests.

- [ ] **Step 5: Commit**

```bash
git add Database/marketplace-supabase/migrations/20260818100400_marketplace_auction_close_rpc.sql Website/scripts/test-marketplace-auction-schema.mjs
git commit -m "feat(db): add auction awards and the idempotent close engine"
```

### Task 10: Award → pending order

**Files:**
- Create: `Database/marketplace-supabase/migrations/20260818100500_marketplace_auction_award_checkout.sql`
- Modify: `Website/scripts/test-marketplace-auction-schema.mjs`

- [ ] **Step 1: Add the failing test**

```js
const awardCheckout = compact(readMigration("20260818100500_marketplace_auction_award_checkout.sql"));

test("award checkout passes the hammer price as the override", () => {
  assert.match(awardCheckout, /p_price_override_satang => award_row\.hammer_price_satang/);
});

test("only the winner may pay, and only before the deadline", () => {
  assert.match(awardCheckout, /auction_award_not_winner/);
  assert.match(awardCheckout, /auction_award_expired/);
});

test("award checkout opts in rather than mutating listing_format", () => {
  assert.match(awardCheckout, /p_allow_auction_format => true/);
  assert.doesNotMatch(awardCheckout, /set listing_state = 'active', listing_format = 'fixed_price'/);
});

test("the relist invariant is a trigger, not eleven patched writers", () => {
  assert.match(awardCheckout, /create trigger marketplace_listing_guard_auction_relist/);
  assert.match(awardCheckout, /before update on public\.marketplace_listing_snapshots/);
  // rewriting, not raising: raising would abort the whole pending-order expiry sweep
  assert.match(awardCheckout, /new\.listing_state := 'pending_payment'/);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd Website && node --test scripts/test-marketplace-auction-schema.mjs`
Expected: FAIL — `ENOENT ... 20260818100500_...`

- [ ] **Step 3: Write the migration**

```sql
-- The winner pays through the SAME pending-order machinery fixed-price
-- checkout uses. The only difference is the price source.

create or replace function public.marketplace_create_auction_pending_payment_order(
  p_award_id uuid,
  p_buyer_marketplace_account_id uuid,
  p_buyer_ynot_profile_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_shipping_snapshot jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  award_row public.marketplace_auction_awards%rowtype;
  listing_row public.marketplace_listing_snapshots%rowtype;
  child jsonb;
begin
  select * into award_row
  from public.marketplace_auction_awards
  where id = p_award_id
  for update;

  if award_row.id is null then
    raise exception 'auction_award_not_found';
  end if;
  if award_row.winner_marketplace_account_id <> p_buyer_marketplace_account_id then
    raise exception 'auction_award_not_winner';
  end if;
  if award_row.award_state not in ('awaiting_payment', 'payment_started') then
    raise exception 'auction_award_not_payable';
  end if;
  if now() >= award_row.payment_due_at then
    raise exception 'auction_award_expired';
  end if;

  select * into listing_row
  from public.marketplace_listing_snapshots
  where listing_id = award_row.listing_id;

  -- The creators accept p_allow_auction_format (see 20260818100100), so the
  -- auction path opts in explicitly instead of mutating listing_format around
  -- the call. listing_state is already 'pending_payment' from close, which is
  -- inside the creator's lock predicate, so nothing else needs touching.
  if listing_row.listing_source = 'official_shop' then
    child := public.marketplace_create_pending_payment_order(
      award_row.listing_id, p_buyer_marketplace_account_id, p_buyer_ynot_profile_id,
      p_request_id, p_idempotency_key, p_request_hash,
      1, award_row.shipping_fee_satang, award_row.buyer_service_fee_bps,
      p_shipping_snapshot,
      p_price_override_satang => award_row.hammer_price_satang,
      p_allow_auction_format => true
    );
  else
    child := public.marketplace_create_user_seller_pending_payment_order(
      award_row.listing_id, p_buyer_marketplace_account_id, p_buyer_ynot_profile_id,
      p_request_id, p_idempotency_key, p_request_hash,
      1, award_row.shipping_fee_satang, award_row.buyer_service_fee_bps,
      p_shipping_snapshot,
      p_price_override_satang => award_row.hammer_price_satang,
      p_allow_auction_format => true
    );
  end if;

  update public.marketplace_auction_awards
  set award_state = 'payment_started',
      pending_payment_order_id = nullif(child ->> 'pendingPaymentOrderId', '')::uuid,
      order_id = nullif(child ->> 'orderId', '')::uuid,
      version = version + 1
  where id = p_award_id;

  return child || jsonb_build_object('awardId', p_award_id, 'hammerPriceSatang', award_row.hammer_price_satang);
end;
$$;

-- An expired slip window must NOT put a won lot back on sale. The winner still
-- owes it until payment_due_at passes.
--
-- ELEVEN different writers set listing_state = 'active', including the
-- pending-order expiry sweep -- the one that actually runs when an auction
-- winner does not pay. Patching them all with string surgery is both fragile
-- and incomplete, so the invariant is enforced at the table instead. One
-- trigger covers every current writer and every future one.
create or replace function public.marketplace_guard_auction_relist()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.listing_state = 'active'
     and old.listing_state is distinct from 'active'
     and new.listing_format = 'auction'
     and exists (
       select 1
       from public.marketplace_auctions a
       join public.marketplace_auction_awards w on w.auction_id = a.id
       where a.listing_id = new.listing_id
         and a.auction_state = 'closed_won'
         and w.award_state in ('awaiting_payment', 'payment_started')
     )
  then
    -- Rewrite rather than raise. Raising would abort the whole pending-order
    -- expiry sweep and stop it expiring unrelated fixed-price orders.
    new.listing_state := 'pending_payment';
  end if;
  return new;
end;
$$;

drop trigger if exists marketplace_listing_guard_auction_relist on public.marketplace_listing_snapshots;
create trigger marketplace_listing_guard_auction_relist
before update on public.marketplace_listing_snapshots
for each row execute function public.marketplace_guard_auction_relist();

revoke all on function public.marketplace_create_auction_pending_payment_order(uuid, uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.marketplace_create_auction_pending_payment_order(uuid, uuid, uuid, text, text, text, jsonb) to service_role;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd Website && node --test scripts/test-marketplace-auction-schema.mjs`
Expected: PASS, 26 tests.

- [ ] **Step 5: Commit**

```bash
git add Database/marketplace-supabase/migrations/20260818100500_marketplace_auction_award_checkout.sql Website/scripts/test-marketplace-auction-schema.mjs
git commit -m "feat(db): settle won auctions through existing pending-order rails"
```

### Task 11: Apply migrations to the marketplace project

Task 3's backup and PITR check must be complete before this task runs.

- [ ] **Step 1: Confirm the target project**

The marketplace project is `lvdikmsygdstckhektth`. The core gacha project is `szjoarkijeaspazbrchc`. **Never** point an auction migration at the core project — they are separate Supabase projects and nothing here belongs in core.

- [ ] **Step 2: Apply each migration in filename order**

Apply `20260818100000` → `100100` → `100200` → `100300` → `100400` → `100500` via the Supabase Management API (`POST /v1/projects/lvdikmsygdstckhektth/database/query`, curl with a browser User-Agent).

- [ ] **Step 3: Verify each applied**

```sql
select table_name from information_schema.tables
where table_schema = 'public' and table_name like 'marketplace_auction%';
```
Expected: `marketplace_auctions`, `marketplace_auction_bids`, `marketplace_auction_awards`.

- [ ] **Step 4: Confirm the gacha project is untouched**

```sql
-- run against szjoarkijeaspazbrchc
select count(*) from information_schema.tables
where table_schema = 'public' and table_name like '%auction%';
```
Expected: `0`.

- [ ] **Step 5: Record the apply**

```bash
git commit --allow-empty -m "chore(db): apply auction migrations to marketplace production"
```

### Task 12: Behavioural test against production, admin-gated

The static harness cannot prove the proxy algorithm works in SQL. This script runs a real auction end to end against the marketplace project using the service-role key, then cleans up after itself. It is the only behavioural check on the live RPC.

**Files:**
- Create: `Website/scripts/test-marketplace-auction-live.mjs`

- [ ] **Step 1: Write the test**

```js
/**
 * Behavioural test of the auction RPCs against the MARKETPLACE Supabase
 * project. Requires MARKETPLACE_SUPABASE_URL and
 * MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY.
 *
 * Safety: creates its own inventory, listing, auction, and accounts, all
 * prefixed `AUCTIONTEST-`, and deletes them in a finally block. It never
 * touches the core gacha project, which is a different Supabase project
 * entirely.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.MARKETPLACE_SUPABASE_URL;
const key = process.env.MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("skip: MARKETPLACE_SUPABASE_URL / _SERVICE_ROLE_KEY not set");
  process.exit(0);
}
const db = createClient(url, key, { auth: { persistSession: false } });
const PREFIX = `AUCTIONTEST-${Date.now()}`;
const created = { accounts: [], auctions: [], listings: [], inventory: [], sources: [] };

async function seedAccount(label) {
  const profileId = crypto.randomUUID();
  const { data, error } = await db.from("marketplace_accounts").insert({
    ynot_profile_id: profileId,
    display_name_snapshot: `${PREFIX}-${label}`,
    metadata: { contactVerified: "true" },
  }).select().single();
  if (error) throw error;
  created.accounts.push(data.id);
  return { accountId: data.id, profileId };
}

async function seedAuction({ startPriceSatang = 0, endsInSeconds = 3600 } = {}) {
  const { data: source, error: se } = await db.from("marketplace_inventory_sources")
    .insert({ source_kind: "official_stock", source_state: "approved" }).select().single();
  if (se) throw se;
  created.sources.push(source.id);

  const { data: inv, error: ie } = await db.from("marketplace_inventory_items").insert({
    inventory_source_id: source.id, source_kind: "official_stock",
    item_type: "card", item_state: "listed", title_snapshot: `${PREFIX} lot`,
  }).select().single();
  if (ie) throw ie;
  created.inventory.push(inv.id);

  const { data: listing, error: le } = await db.from("marketplace_listing_snapshots").insert({
    inventory_item_id: inv.id, listing_source: "official_shop", listing_state: "active",
    listing_format: "auction", title: `${PREFIX} lot`, item_price_satang: startPriceSatang,
  }).select().single();
  if (le) throw le;
  created.listings.push(listing.listing_id);

  const now = Date.now();
  const { data: auction, error: ae } = await db.from("marketplace_auctions").insert({
    listing_id: listing.listing_id, inventory_item_id: inv.id,
    listing_source: "official_shop", auction_state: "live",
    start_price_satang: startPriceSatang, current_price_satang: startPriceSatang,
    starts_at: new Date(now - 60000).toISOString(),
    base_ends_at: new Date(now + endsInSeconds * 1000).toISOString(),
    effective_ends_at: new Date(now + endsInSeconds * 1000).toISOString(),
  }).select().single();
  if (ae) throw ae;
  created.auctions.push(auction.id);
  return auction;
}

const bid = (auctionId, actor, maxSatang, adminRole = null) =>
  db.rpc("marketplace_place_auction_bid", {
    p_auction_id: auctionId,
    p_bidder_marketplace_account_id: actor.accountId,
    p_bidder_ynot_profile_id: actor.profileId,
    p_max_amount_satang: maxSatang,
    p_actor_admin_role: adminRole,
    p_request_id: PREFIX,
    p_idempotency_key: crypto.randomUUID(),
    p_request_hash: "0".repeat(32),
  });

test("proxy resolution matches the specified five cases", async () => {
  const a = await seedAuction();
  const A = await seedAccount("A");
  const B = await seedAccount("B");

  let r = await bid(a.id, A, 500000);            // Case A
  assert.equal(r.error, null, r.error?.message);
  assert.equal(r.data.currentPriceSatang, 0);

  r = await bid(a.id, B, 300000);                 // Case E
  assert.equal(r.data.currentPriceSatang, 305000);
  assert.equal(r.data.youAreLeading, false);

  r = await bid(a.id, B, 600000);                 // Case C
  assert.equal(r.data.currentPriceSatang, 510000);
  assert.equal(r.data.youAreLeading, true);

  r = await bid(a.id, A, 600000);                 // Case D — tie, B keeps it
  assert.equal(r.data.currentPriceSatang, 600000);
  assert.equal(r.data.youAreLeading, false);
});

test("an admin can never bid", async () => {
  const a = await seedAuction();
  const A = await seedAccount("admin");
  const r = await bid(a.id, A, 100000, "owner");
  assert.match(r.error?.message ?? "", /auction_bid_admin_forbidden/);
});

test("a bid at or after the deadline is rejected even before the closer runs", async () => {
  const a = await seedAuction({ endsInSeconds: -1 });
  await db.from("marketplace_auctions")
    .update({ effective_ends_at: new Date(Date.now() - 1000).toISOString() }).eq("id", a.id);
  const A = await seedAccount("late");
  const r = await bid(a.id, A, 100000);
  assert.match(r.error?.message ?? "", /auction_bid_closed/);
});

test("a late bid extends the auction", async () => {
  const a = await seedAuction({ endsInSeconds: 30 });
  const A = await seedAccount("sniper");
  const r = await bid(a.id, A, 100000);
  assert.equal(r.data.extended, true);
});

test("close is idempotent and produces one award", async () => {
  const a = await seedAuction({ endsInSeconds: 30 });
  const A = await seedAccount("winner");
  await bid(a.id, A, 250000);
  await db.from("marketplace_auctions")
    .update({ effective_ends_at: new Date(Date.now() - 1000).toISOString(), extension_count: 20 })
    .eq("id", a.id);

  const first = await db.rpc("marketplace_close_due_auctions", { p_request_id: PREFIX, p_limit: 50, p_auction_id: a.id });
  assert.equal(first.error, null, first.error?.message);
  assert.equal(first.data.closedWon, 1);

  const second = await db.rpc("marketplace_close_due_auctions", { p_request_id: PREFIX, p_limit: 50, p_auction_id: a.id });
  assert.equal(second.data.closedWon, 0, "second close must be a no-op");

  const { data: awards } = await db.from("marketplace_auction_awards").select("*").eq("auction_id", a.id);
  assert.equal(awards.length, 1);
  assert.equal(awards[0].hammer_price_satang, 0);
});

test("zero-bid lots close unsold", async () => {
  const a = await seedAuction({ endsInSeconds: 30 });
  await db.from("marketplace_auctions")
    .update({ effective_ends_at: new Date(Date.now() - 1000).toISOString() }).eq("id", a.id);
  const r = await db.rpc("marketplace_close_due_auctions", { p_request_id: PREFIX, p_limit: 50, p_auction_id: a.id });
  assert.equal(r.data.closedUnsold, 1);
});

test.after(async () => {
  // marketplace_auction_bids is append-only -- a direct .delete() is REJECTED
  // by the trigger and would silently leave test rows in production. The purge
  // RPC is the only path, and it refuses anything not titled AUCTIONTEST-.
  for (const auctionId of created.auctions) {
    const purge = await db.rpc("marketplace_purge_test_auction", { p_auction_id: auctionId });
    if (purge.error) console.error("PURGE FAILED", auctionId, purge.error.message);
  }
  await db.from("marketplace_listing_snapshots").delete().in("listing_id", created.listings);
  await db.from("marketplace_inventory_items").delete().in("id", created.inventory);
  await db.from("marketplace_inventory_sources").delete().in("id", created.sources);
  await db.from("marketplace_accounts").delete().in("id", created.accounts);
  console.log(`cleaned up ${PREFIX}`);
});
```

- [ ] **Step 2: Run it**

Run: `cd Website && MARKETPLACE_SUPABASE_URL=... MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY=... node --test scripts/test-marketplace-auction-live.mjs`
Expected: PASS, 6 tests, followed by `cleaned up AUCTIONTEST-...`.

- [ ] **Step 3: Confirm cleanup left nothing behind**

```sql
select count(*) from public.marketplace_accounts where display_name_snapshot like 'AUCTIONTEST-%';
```
Expected: `0`. If not, delete manually before proceeding.

- [ ] **Step 4: Add the script and commit**

```json
"test:marketplace-auction-live": "node --test scripts/test-marketplace-auction-live.mjs"
```

```bash
git add Website/scripts/test-marketplace-auction-live.mjs Website/package.json
git commit -m "test: behavioural auction RPC coverage against the marketplace project"
```

### Task 12b: Realtime, with the leak surface closed

Sub-second price updates, and the security work that has to come with them.

**The threat.** Supabase Realtime broadcasts to browsers holding the **publishable** key. Anything in a published table is world-readable. Two columns would be catastrophic if published: `marketplace_auctions.leading_max_satang` and `marketplace_auction_bids.max_amount_satang` — every bidder's hidden maximum. Leak either and any bidder can compute the exact amount needed to win.

**Files:**
- Create: `Database/marketplace-supabase/migrations/20260818100700_marketplace_auction_realtime.sql`
- Create: `Website/tools/verification/verify-marketplace-auction-realtime.mjs`
- Modify: `Website/package.json`

- [ ] **Step 1: Write the failing security gate**

Create `Website/tools/verification/verify-marketplace-auction-realtime.mjs`:

```js
/**
 * Fails the build if a table carrying a bidder's hidden maximum is ever added
 * to the Realtime publication. This is the single check standing between the
 * proxy-bidding model and a total information leak.
 */
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.MARKETPLACE_SUPABASE_URL;
const key = process.env.MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("skip: marketplace Supabase credentials not set");
  process.exit(0);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const FORBIDDEN = ["marketplace_auctions", "marketplace_auction_bids", "marketplace_auction_awards"];

const { data, error } = await db.rpc("marketplace_realtime_published_tables");
assert.equal(error, null, error?.message);

const published = (data ?? []).map((row) => row.table_name);
console.log("published to supabase_realtime:", published.join(", ") || "(none)");

for (const table of FORBIDDEN) {
  assert.ok(
    !published.includes(table),
    `SECURITY: ${table} is in the Realtime publication. It carries bidder maximums and would be readable by every browser.`,
  );
}
assert.ok(
  published.includes("marketplace_auction_events"),
  "marketplace_auction_events must be published or live bidding will not update",
);
console.log("auction realtime publication: safe");
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd Website && MARKETPLACE_SUPABASE_URL=... MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY=... node tools/verification/verify-marketplace-auction-realtime.mjs`
Expected: FAIL — the `marketplace_realtime_published_tables` function does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- Realtime for auctions. ONLY the events table is published.

alter table public.marketplace_auction_events enable row level security;

-- Browsers may read events (they are public by construction) but may never
-- write them. A forged price update would be indistinguishable from a real one
-- in the UI.
drop policy if exists "auction events are public read" on public.marketplace_auction_events;
create policy "auction events are public read"
  on public.marketplace_auction_events
  for select
  to anon, authenticated
  using (true);

revoke insert, update, delete on public.marketplace_auction_events from anon, authenticated;
grant select on public.marketplace_auction_events to anon, authenticated;
grant select, insert, delete on public.marketplace_auction_events to service_role;

-- Publish exactly one table.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'marketplace_auction_events'
  ) then
    alter publication supabase_realtime add table public.marketplace_auction_events;
  end if;
end;
$$;

-- Read-only introspection so CI can assert nothing dangerous was ever added.
create or replace function public.marketplace_realtime_published_tables()
returns table (table_name text)
language sql
stable
security definer
set search_path = public, pg_catalog, pg_temp
as $$
  select tablename::text
  from pg_publication_tables
  where pubname = 'supabase_realtime' and schemaname = 'public';
$$;

revoke all on function public.marketplace_realtime_published_tables() from public, anon, authenticated;
grant execute on function public.marketplace_realtime_published_tables() to service_role;

-- The events table grows one row per bid forever. Prune closed auctions'
-- events after 30 days; the bid ledger remains the permanent record.
create or replace function public.marketplace_prune_auction_events(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  removed integer;
begin
  delete from public.marketplace_auction_events e
  using public.marketplace_auctions a
  where a.id = e.auction_id
    and a.auction_state in ('closed_won', 'closed_unsold', 'cancelled')
    and e.created_at < now() - make_interval(days => greatest(coalesce(p_days, 30), 1));
  get diagnostics removed = row_count;
  return jsonb_build_object('pruned', removed);
end;
$$;

revoke all on function public.marketplace_prune_auction_events(integer) from public, anon, authenticated;
grant execute on function public.marketplace_prune_auction_events(integer) to service_role;
```

- [ ] **Step 4: Run the gate to verify it passes**

Run: `cd Website && MARKETPLACE_SUPABASE_URL=... MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY=... node tools/verification/verify-marketplace-auction-realtime.mjs`
Expected: `published to supabase_realtime: marketplace_auction_events` then `auction realtime publication: safe`.

- [ ] **Step 5: Add the prune call to the sweep and wire the gate into package.json**

Add `marketplace_prune_auction_events` to `runAuctionSweeps` in `src/lib/worker/marketplace-scheduled-jobs.ts`, and:

```json
"verify:marketplace-auction-realtime": "node tools/verification/verify-marketplace-auction-realtime.mjs"
```

Add it to the `verify:marketplace` chain so it runs with every other marketplace gate.

- [ ] **Step 6: Commit**

```bash
git add Database/marketplace-supabase/migrations/20260818100700_marketplace_auction_realtime.sql Website/tools/verification/verify-marketplace-auction-realtime.mjs Website/package.json Website/src/lib/worker/marketplace-scheduled-jobs.ts
git commit -m "feat(realtime): publish auction events only, with a CI gate against leaking bidder maximums"
```

---

## Phase 2 — Service Layer, API, and the Close Sweep

### Task 13: Auction read and bid service modules

**Files:**
- Create: `Website/src/lib/marketplace/auctions.ts`
- Create: `Website/src/lib/marketplace/auction-bids.ts`

Follow the exact shape of `src/lib/marketplace/listings.ts`: `import "server-only"`, `createMarketplaceSupabaseClient()`, `marketplaceRpcError()`, a `UUID_RE` guard on every id.

- [ ] **Step 1: Write `auctions.ts`**

```ts
import "server-only";
import {
  createMarketplaceSupabaseClient,
  marketplaceRpcError,
  MarketplaceServiceError,
} from "./supabase-adapter";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertUuid(value: string, label: string) {
  if (!UUID_RE.test(value)) {
    throw new MarketplaceServiceError(`marketplace_${label}_invalid`, "Marketplace request is invalid.", 400);
  }
  return value.toLowerCase();
}

export type AuctionPublicView = {
  auctionId: string;
  listingId: string;
  title: string;
  photoUrls: string[];
  auctionState: "scheduled" | "live" | "closed_won" | "closed_unsold" | "cancelled";
  bidderGate: "open" | "kyc_required";
  startPriceSatang: number;
  currentPriceSatang: number;
  bidCount: number;
  distinctBidderCount: number;
  startsAt: string;
  effectiveEndsAt: string;
  extensionCount: number;
  maxExtensions: number;
  antiSnipeWindowSeconds: number;
  serverNow: string;
  // NEVER include leadingMaxSatang or leadingBidderAccountId.
};

/**
 * Lazy close on read. Any read of an auction past its deadline materialises
 * the result before projecting, so a watched auction closes within
 * milliseconds regardless of cron cadence.
 */
export async function getAuction(auctionId: string): Promise<AuctionPublicView> {
  const supabase = createMarketplaceSupabaseClient();
  const id = assertUuid(auctionId, "auction_id");

  // CONDITIONAL lazy close. An earlier draft called the close RPC on every
  // page view -- a WRITE function taking a row lock, fired by every reader.
  // At 100 viewers polling a closing lot that was 50 lock attempts a second
  // competing with actual bidders, and in the normal case every one of them
  // was wasted. Read first; only close when the lot is genuinely due.
  const { data: due } = await supabase
    .from("marketplace_auctions")
    .select("auction_state, effective_ends_at, starts_at")
    .eq("id", id)
    .maybeSingle();

  const now = Date.now();
  if (due?.auction_state === "live" && new Date(due.effective_ends_at).getTime() <= now) {
    const closed = await supabase.rpc("marketplace_close_due_auctions", {
      p_request_id: "lazy-close-on-read", p_limit: 1, p_auction_id: id,
    });
    // A failed lazy close must never block the read -- the cron sweep catches it.
    if (closed.error) console.warn("auction_lazy_close_failed", closed.error.message);
  } else if (due?.auction_state === "scheduled" && new Date(due.starts_at).getTime() <= now) {
    const opened = await supabase.rpc("marketplace_open_due_auction", {
      p_auction_id: id, p_request_id: "lazy-open-on-read",
    });
    if (opened.error) console.warn("auction_lazy_open_failed", opened.error.message);
  }

  const { data, error } = await supabase
    .from("marketplace_auctions")
    .select(
      "id, listing_id, auction_state, bidder_gate, start_price_satang, current_price_satang," +
      " bid_count, distinct_bidder_count, starts_at, effective_ends_at, extension_count," +
      " max_extensions, anti_snipe_window_seconds"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw marketplaceRpcError(error);
  if (!data) throw new MarketplaceServiceError("auction_not_found", "Auction not found.", 404);

  const listing = await supabase
    .from("marketplace_listing_snapshots")
    .select("title, photo_urls")
    .eq("listing_id", data.listing_id)
    .maybeSingle();

  return {
    auctionId: data.id,
    listingId: data.listing_id,
    title: listing.data?.title ?? "",
    photoUrls: listing.data?.photo_urls ?? [],
    auctionState: data.auction_state,
    bidderGate: data.bidder_gate,
    startPriceSatang: data.start_price_satang,
    currentPriceSatang: data.current_price_satang,
    bidCount: data.bid_count,
    distinctBidderCount: data.distinct_bidder_count,
    startsAt: data.starts_at,
    effectiveEndsAt: data.effective_ends_at,
    extensionCount: data.extension_count,
    maxExtensions: data.max_extensions,
    antiSnipeWindowSeconds: data.anti_snipe_window_seconds,
    serverNow: new Date().toISOString(),
  };
}

export async function listAuctions(filter: "ending_soon" | "live" | "upcoming" = "ending_soon") {
  const supabase = createMarketplaceSupabaseClient();
  let query = supabase
    .from("marketplace_auctions")
    .select("id, listing_id, auction_state, current_price_satang, bid_count, effective_ends_at, starts_at, bidder_gate");

  if (filter === "upcoming") {
    query = query.eq("auction_state", "scheduled").order("starts_at", { ascending: true });
  } else {
    query = query.eq("auction_state", "live").order("effective_ends_at", { ascending: true });
  }

  const { data, error } = await query.limit(60);
  if (error) throw marketplaceRpcError(error);
  return data ?? [];
}
```

- [ ] **Step 2: Write `auction-bids.ts`**

```ts
import "server-only";
import { createMarketplaceSupabaseClient, marketplaceRpcError } from "./supabase-adapter";

export type PlaceBidInput = {
  auctionId: string;
  bidderAccountId: string;
  bidderProfileId: string;
  maxAmountSatang: number;
  actorAdminRole: string | null;
  requestId: string;
  idempotencyKey: string;
  requestHash: string;
};

export async function placeAuctionBid(input: PlaceBidInput) {
  const supabase = createMarketplaceSupabaseClient();
  const { data, error } = await supabase.rpc("marketplace_place_auction_bid", {
    p_auction_id: input.auctionId,
    p_bidder_marketplace_account_id: input.bidderAccountId,
    p_bidder_ynot_profile_id: input.bidderProfileId,
    p_max_amount_satang: input.maxAmountSatang,
    p_actor_admin_role: input.actorAdminRole,
    p_request_id: input.requestId,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: input.requestHash,
  });
  if (error) throw marketplaceRpcError(error);
  return data;
}

/** Masked history. Aliases only, effective amounts only, never a maximum. */
export async function listAuctionBids(auctionId: string, limit = 30) {
  const supabase = createMarketplaceSupabaseClient();
  const { data, error } = await supabase
    .from("marketplace_auction_bids")
    .select("sequence, bidder_alias, effective_amount_satang, outcome, placed_at")
    .eq("auction_id", auctionId)
    .order("sequence", { ascending: false })
    .limit(limit);
  if (error) throw marketplaceRpcError(error);
  return data ?? [];
}
```

- [ ] **Step 3: Typecheck**

Run: `cd Website && npx tsc --noEmit --pretty false`
Expected: no errors in the two new files.

- [ ] **Step 4: Commit**

```bash
git add Website/src/lib/marketplace/auctions.ts Website/src/lib/marketplace/auction-bids.ts
git commit -m "feat(marketplace): add auction read and bid service modules"
```

### Task 13b: Give auctions their own kill switch

The service-boundary analysis concluded auctions do not need a separate service *because* per-action flags already provide failure isolation. That is only true if auctions have their own flag. Without this, the bid route rides the `checkout` switch and disabling auctions also disables buying.

**Files:**
- Modify: `Website/src/lib/marketplace/config.ts:26-33` (the `MarketplaceAction` union and `MarketplaceActionFlags`)
- Modify: `Website/src/lib/marketplace/config.ts` (`marketplaceActionFlags()`)

- [ ] **Step 1: Extend the action union**

```ts
export type MarketplaceAction =
  | "publicNav"
  | "browse"
  | "checkout"
  | "sellerSubmission"
  | "listingActivation"
  | "paymentProof"
  | "payoutRelease"
  | "auctions";
```

- [ ] **Step 2: Add the flag resolver**

Inside `marketplaceActionFlags(enabled: boolean)`, alongside the existing entries:

```ts
    auctions: firstEnvFlag(
      ["YNOT_MARKETPLACE_AUCTIONS_ENABLED", "MARKETPLACE_AUCTIONS_ENABLED"],
      enabled,
    ),
```

- [ ] **Step 3: Default it OFF in production until the first lot is ready**

In `wrangler.marketplace.jsonc` and `wrangler.marketplace.ci.jsonc` `vars`:

```jsonc
"YNOT_MARKETPLACE_AUCTIONS_ENABLED": "false"
```

- [ ] **Step 4: Typecheck**

Run: `cd Website && npx tsc --noEmit --pretty false`
Expected: no errors. If a `Record<MarketplaceAction, boolean>` somewhere is missing the new key, TypeScript will name the file — add `auctions` there too.

- [ ] **Step 5: Commit**

```bash
git add Website/src/lib/marketplace/config.ts Website/wrangler.marketplace.jsonc Website/wrangler.marketplace.ci.jsonc
git commit -m "feat(marketplace): add an independent auctions kill switch"
```

### Task 14: API routes

**Files:**
- Create: `Website/src/app/api/ynot/marketplace/auctions/route.ts`
- Create: `Website/src/app/api/ynot/marketplace/auctions/[auctionId]/route.ts`
- Create: `Website/src/app/api/ynot/marketplace/auctions/[auctionId]/bids/route.ts`
- Create: `Website/src/app/api/ynot/marketplace/time/route.ts`

- [ ] **Step 1: Write the bid route — the only mutation**

```ts
import { prepareMarketplaceMutation } from "@/lib/marketplace/mutation-guard";
import { placeAuctionBid } from "@/lib/marketplace/auction-bids";
import { getMarketplaceAccountForProfile } from "@/lib/marketplace/account-bridge";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { marketplaceErrorResponse } from "@/lib/marketplace/route-guards";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ auctionId: string }> }) {
  const { auctionId } = await context.params;

  const prepared = await prepareMarketplaceMutation(request, {
    method: "POST",
    accessMode: "customer",
    // Auctions have their own kill switch (Task 13b) so disabling them does
    // not disable ordinary checkout.
    action: "auctions",
    rateLimit: { key: `auction-bid:${auctionId}`, limit: 30, windowMs: 60_000 },
    allowedFields: ["maxAmountSatang"],
    requireIdempotency: true,
  });
  if (!prepared.ok) return prepared.response;

  const admin = await resolveAdminSession(prepared.profile);
  const account = await getMarketplaceAccountForProfile(prepared.profile, admin);
  if (!account) return marketplaceErrorResponse("marketplace_account_missing", 403);

  const maxAmountSatang = prepared.body.maxAmountSatang;
  if (!Number.isInteger(maxAmountSatang) || Number(maxAmountSatang) < 0) {
    return marketplaceErrorResponse("auction_bid_amount_invalid", 400);
  }

  try {
    const result = await placeAuctionBid({
      auctionId,
      bidderAccountId: account.id,
      bidderProfileId: prepared.profile.profileId,
      maxAmountSatang: Number(maxAmountSatang),
      // Passing the admin role through is what lets the RPC reject house bids.
      actorAdminRole: admin?.adminRole ?? null,
      requestId: prepared.requestId,
      idempotencyKey: prepared.idempotencyKey,
      requestHash: await prepared.requestHashForTargetBody("auction_bid", auctionId, prepared.canonicalBody),
    });
    return Response.json({ ok: true, bid: result });
  } catch (error) {
    return marketplaceErrorResponse(
      error instanceof Error ? error.message : "auction_bid_failed",
      400,
    );
  }
}
```

- [ ] **Step 2: Write the server-time route**

```ts
export const dynamic = "force-dynamic";

/** Countdown sync. The browser clock cannot be trusted near a deadline. */
export async function GET() {
  return Response.json(
    { serverNow: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
```

- [ ] **Step 3: Write the detail and list routes**

Both are plain `GET` handlers that call `getAuction(auctionId)` / `listAuctions(filter)` from Task 13 and return `Response.json(...)` with `Cache-Control: no-store`. They take no body and need no mutation guard.

- [ ] **Step 4: Typecheck and commit**

```bash
cd Website && npx tsc --noEmit --pretty false
git add Website/src/app/api/ynot/marketplace/auctions Website/src/app/api/ynot/marketplace/time
git commit -m "feat(api): add auction read, bid, and server-time routes"
```

### Task 14b: One cached public endpoint, one private endpoint

The read path is 99%+ of auction traffic. This collapses it.

**The split.** Anything shared goes in a cacheable public payload. Anything about *you* stays uncached and authenticated. That boundary is not just a caching detail — it is the same discipline `marketplace_public_listing_snapshots` already applies, and it is what makes the cache safe.

| Public — cached 1s | Private — never cached |
|---|---|
| `currentPriceSatang`, `minNextSatang`, `incrementSatang` | `youAreLeading` |
| `bidCount`, `distinctBidderCount` | `yourMaxSatang`, `yourAlias` |
| `effectiveEndsAt`, `extensionCount`, `serverNow` | `canBid`, `cannotBidReason` |
| masked bid history (aliases + effective amounts) | gate/verification status |

**Files:**
- Create: `Website/src/app/api/ynot/marketplace/auctions/[auctionId]/live/route.ts`
- Create: `Website/src/app/api/ynot/marketplace/auctions/[auctionId]/me/route.ts`

- [ ] **Step 1: Write the cached public route**

```ts
import { getAuction } from "@/lib/marketplace/auctions";
import { listAuctionBids } from "@/lib/marketplace/auction-bids";

export const dynamic = "force-dynamic";

const CACHE_TTL_SECONDS = 1;

/**
 * Public auction state plus masked bid history, in ONE response.
 *
 * Two fetches per poll doubled origin load for no reason; merging them halves
 * it. The 1-second Cloudflare edge cache then makes viewer count almost
 * irrelevant -- 300 concurrent watchers collapse to roughly one origin request
 * per second.
 *
 * Nothing viewer-specific may ever be added to this payload. See /me.
 */
export async function GET(request: Request, context: { params: Promise<{ auctionId: string }> }) {
  const { auctionId } = await context.params;
  // Key on origin + pathname ONLY. Including the query string lets anyone
  // defeat the cache with ?x=1, ?x=2, ... and hammer the origin -- which also
  // re-opens the lazy-close thundering herd at the exact closing instant, when
  // the cache is the only thing throttling it.
  const url = new URL(request.url);
  const cacheKey = new Request(`${url.origin}${url.pathname}`, { method: "GET" });
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;

  const hit = await cache?.match(cacheKey);
  if (hit) return hit;

  const [auction, bids] = await Promise.all([
    getAuction(auctionId),
    listAuctionBids(auctionId, 30),
  ]);

  const response = Response.json(
    { auction, bids },
    {
      headers: {
        // s-maxage drives the edge cache; no-store on the browser so a client
        // never shows a price older than its own poll interval.
        "Cache-Control": `public, s-maxage=${CACHE_TTL_SECONDS}, max-age=0, must-revalidate`,
      },
    },
  );

  await cache?.put(cacheKey, response.clone());
  return response;
}
```

- [ ] **Step 2: Write the private per-viewer route**

```ts
import { resolveAdminSession, resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { getMarketplaceAccountForProfile } from "@/lib/marketplace/account-bridge";
import { getViewerAuctionState } from "@/lib/marketplace/auctions";

export const dynamic = "force-dynamic";

/** Never cached. Returns only facts about the calling viewer. */
export async function GET(request: Request, context: { params: Promise<{ auctionId: string }> }) {
  const { auctionId } = await context.params;
  const profile = await resolveCurrentProfile();
  if (!profile) {
    return Response.json(
      { canBid: false, cannotBidReason: "Log in to bid.", youAreLeading: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const admin = await resolveAdminSession(profile);
  const account = await getMarketplaceAccountForProfile(profile, admin);

  return Response.json(
    await getViewerAuctionState({
      auctionId,
      accountId: account?.id ?? null,
      adminRole: admin?.adminRole ?? null,
    }),
    { headers: { "Cache-Control": "no-store" } },
  );
}
```

- [ ] **Step 3: Verify the cache actually engages**

Run the marketplace preview, open an auction, and confirm with two rapid requests that the second returns in single-digit milliseconds. Then confirm the private route is never cached:

Run: `curl -sI "http://localhost:8788/api/ynot/marketplace/auctions/<id>/me" | grep -i cache-control`
Expected: `cache-control: no-store`

- [ ] **Step 4: Commit**

```bash
git add Website/src/app/api/ynot/marketplace/auctions
git commit -m "perf(api): merge auction reads into one cached public endpoint plus a private viewer route"
```

### Task 15: Close sweep on the cron

**Files:**
- Modify: `Website/src/lib/worker/marketplace-scheduled-jobs.ts`
- Modify: `Website/wrangler.marketplace.jsonc:60-61`
- Modify: `Website/wrangler.marketplace.ci.jsonc`

- [ ] **Step 1: Add the sweep to the scheduled job module**

Insert alongside `expireMarketplacePendingPaymentOrders`:

```ts
/**
 * Three sweeps: open what is due to start, close what is due to end, expire
 * awards nobody paid for.
 *
 * Each lot is closed in its OWN transaction. A batch transaction holding 200
 * auction rows would let one stuck listing lock freeze closing and bidding for
 * every lot in the batch.
 */
async function runAuctionSweeps(env: MarketplaceScheduledEnv) {
  if (!env.MARKETPLACE_ENVIRONMENT) return;
  if (!env.MARKETPLACE_SUPABASE_URL || !env.MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY) return;

  const requestId = `cloudflare-cron:${new Date().toISOString()}`;

  let due: Array<{ auction_id: string; due_kind: string }> = [];
  try {
    due = (await callMarketplaceSupabaseRpc(env, "marketplace_list_due_auctions", {
      p_limit: 200,
    })) as typeof due;
  } catch (error) {
    console.warn("marketplace_auction_list_due_failed", {
      reason: error instanceof Error ? error.message.split(":").slice(0, 3).join(":") : "unknown",
    });
    return;
  }

  for (const row of due ?? []) {
    try {
      if (row.due_kind === "open") {
        await callMarketplaceSupabaseRpc(env, "marketplace_open_due_auction", {
          p_auction_id: row.auction_id,
          p_request_id: requestId,
        });
      } else {
        await callMarketplaceSupabaseRpc(env, "marketplace_close_due_auctions", {
          p_request_id: requestId,
          p_limit: 1,
          p_auction_id: row.auction_id,
        });
      }
    } catch (error) {
      // One lot failing must never stop the rest of the sweep.
      console.warn("marketplace_auction_sweep_lot_failed", {
        auctionId: row.auction_id,
        kind: row.due_kind,
        reason: error instanceof Error ? error.message.split(":").slice(0, 3).join(":") : "unknown",
      });
    }
  }

  try {
    await callMarketplaceSupabaseRpc(env, "marketplace_expire_due_auction_awards", {
      p_request_id: requestId,
      p_limit: 100,
    });
  } catch (error) {
    console.warn("marketplace_auction_award_expiry_failed", {
      reason: error instanceof Error ? error.message.split(":").slice(0, 3).join(":") : "unknown",
    });
  }
}
```

and extend the exported runner:

```ts
export async function runMarketplaceScheduledJobs(env: MarketplaceScheduledEnv) {
  await Promise.all([
    expireMarketplacePendingPaymentOrders(env),
    runAuctionSweeps(env),
  ]);
}
```

- [ ] **Step 2: Tighten the cron in BOTH wrangler configs**

In `wrangler.marketplace.jsonc` and `wrangler.marketplace.ci.jsonc`:

```jsonc
"triggers": {
  "crons": ["* * * * *"]
}
```

This bounds worst-case close latency to ~60 seconds for unwatched lots. Watched lots close in milliseconds via the lazy path in Task 13.

- [ ] **Step 3: Verify the Cloudflare config still passes its gate**

Run: `cd Website && npm run verify:cloudflare`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add Website/src/lib/worker/marketplace-scheduled-jobs.ts Website/wrangler.marketplace.jsonc Website/wrangler.marketplace.ci.jsonc
git commit -m "feat(worker): sweep due auctions every minute"
```

---

## Phase 3 — Frontend

### Design System

Auctions extend the existing `.mp-*` token set in `src/features/marketplace-ui/theme/marketplace-theme.css`. No new palette. Auction-specific additions go in `auction.css`:

```css
/* Auction extends the marketplace theme. Gold is already the money accent;
   rose is already the signal colour. Only urgency states are new. */
.mp-root {
  --auc-urgent: var(--mp-rose);
  --auc-urgent-soft: var(--mp-rose-soft);
  --auc-live: var(--mp-green);
  --auc-bid-ring: 0 0 0 3px var(--mp-gold-tint);
  --auc-tap: 44px;              /* minimum touch target */
  --auc-bar-h: 76px;            /* sticky mobile bid bar */
}
```

**Breakpoints:** mobile-first. Base styles target 360–767px. `@media (min-width: 768px)` for tablet, `@media (min-width: 1024px)` for desktop. Test at 360, 390, 768, 1024, 1440.

**Non-negotiable mobile rules.** Bidding happens on a phone in the last two minutes, so:
- The bid control is a **sticky bottom bar**, always reachable, never scrolled away.
- Every tap target is at least 44×44px.
- The countdown uses `font-variant-numeric: tabular-nums` so digits do not reflow each second.
- The bid amount input uses `inputmode="numeric"` so the numeric keypad opens.
- Nothing animates during the final minute except the countdown itself.

### Screen Inventory

| Screen | Mobile | Desktop |
|---|---|---|
| Auction room (live) | Single column; photo, price block, sticky bid bar; history collapsed behind a toggle | Two columns: photo + history left, price/bid/terms right |
| Scheduled lot | Single column; "opens in" block replaces the bid bar | Two columns; right rail shows countdown to open plus gate notice |
| Auction list | One card per row, ending-soon first | Three-column grid with a filter rail, matching `BrowsePage` |
| Won lot | Single column; deadline banner, amount breakdown, sticky Pay button | Two columns: lot summary left, payment panel right |
| Admin auctions | Stacked table cards | Full table, matching `OfficialStockScreen` |
| Admin create/edit | Full-screen sheet | Centred modal, matching `StockModal` |
| Error / gate states | Inline in the bid bar area | Inline in the right rail |

### Task 16: Server-synced countdown

**Files:**
- Create: `Website/src/features/marketplace-ui/auction/AuctionCountdown.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Countdown driven by server time, not the browser clock. On mount we compute
 * the offset between server and client, then tick locally against that offset.
 * A wrong device clock would otherwise show the wrong remaining time on the
 * one screen where seconds decide who wins.
 */
export function AuctionCountdown({
  endsAt,
  serverNow,
  urgentSeconds = 120,
  onExpired,
}: {
  endsAt: string;
  serverNow: string;
  urgentSeconds?: number;
  onExpired?: () => void;
}) {
  const offsetRef = useRef(new Date(serverNow).getTime() - Date.now());
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, new Date(endsAt).getTime() - (Date.now() + offsetRef.current)),
  );
  const firedRef = useRef(false);

  useEffect(() => {
    offsetRef.current = new Date(serverNow).getTime() - Date.now();
  }, [serverNow]);

  useEffect(() => {
    firedRef.current = false;
    const tick = () => {
      const left = Math.max(0, new Date(endsAt).getTime() - (Date.now() + offsetRef.current));
      setRemaining(left);
      if (left === 0 && !firedRef.current) {
        firedRef.current = true;
        onExpired?.();
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [endsAt, onExpired]);

  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const urgent = totalSeconds <= urgentSeconds && totalSeconds > 0;

  const label =
    days > 0
      ? `${days}d ${String(hours).padStart(2, "0")}h`
      : `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return (
    <span
      className={`auc-clock${urgent ? " auc-clock-urgent" : ""}`}
      role="timer"
      aria-live={urgent ? "polite" : "off"}
      aria-label={totalSeconds === 0 ? "Auction ended" : `Time remaining ${label}`}
    >
      {totalSeconds === 0 ? "Ended" : label}
    </span>
  );
}
```

- [ ] **Step 2: Add the styles to `auction.css`**

```css
.auc-clock {
  font-family: var(--mp-mono);
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  font-size: 17px;
  letter-spacing: -0.01em;
  color: var(--mp-ink);
}
.auc-clock-urgent { color: var(--auc-urgent); }
@media (min-width: 1024px) { .auc-clock { font-size: 20px; } }
```

- [ ] **Step 3: Commit**

```bash
git add Website/src/features/marketplace-ui/auction/AuctionCountdown.tsx Website/src/features/marketplace-ui/auction/auction.css
git commit -m "feat(ui): add server-synced auction countdown"
```

### Task 17: Bid panel with the authorise-up-to confirm step

Proxy bidding means the buyer authorises a maximum that may be spent without asking again. That is a consent moment and needs an explicit confirm.

**Files:**
- Create: `Website/src/features/marketplace-ui/auction/BidPanel.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useRef, useState } from "react";
import { formatThb } from "../shared/money";

type BidPanelProps = {
  auctionId: string;
  currentPriceSatang: number;
  minNextSatang: number;
  incrementSatang: number;
  disabled: boolean;
  disabledReason: string | null;
  onPlaced: (result: { currentPriceSatang: number; youAreLeading: boolean; effectiveEndsAt: string }) => void;
};

export function BidPanel(props: BidPanelProps) {
  const [raw, setRaw] = useState("");
  const [stage, setStage] = useState<"entry" | "confirm" | "sending">("entry");
  const [error, setError] = useState<string | null>(null);
  // One key per bid attempt, NOT per submit call. A network timeout followed
  // by a retry must replay the same bid, not place a second one. The key is
  // minted when the buyer opens the confirm step and cleared only on success.
  const idempotencyKeyRef = useRef<string | null>(null);

  const satang = Math.round(Number(raw.replace(/[^0-9.]/g, "")) * 100);
  const valid = Number.isFinite(satang) && satang >= props.minNextSatang;

  async function submit() {
    setStage("sending");
    setError(null);
    try {
      const response = await fetch(`/api/ynot/marketplace/auctions/${props.auctionId}/bids`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-idempotency-key": idempotencyKeyRef.current ?? "",
        },
        body: JSON.stringify({ maxAmountSatang: satang }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(bidErrorMessage(payload.code ?? payload.error));
        setStage("entry");
        return;
      }
      props.onPlaced(payload.bid);
      idempotencyKeyRef.current = null;
      setRaw("");
      setStage("entry");
    } catch {
      setError("Could not reach the server. Your bid was not placed — try again.");
      setStage("entry");
    }
  }

  if (props.disabled) {
    return <p className="auc-gate">{props.disabledReason}</p>;
  }

  return (
    <div className="auc-bid">
      {stage === "entry" && (
        <>
          <label className="auc-bid-label" htmlFor="auc-max">Your maximum</label>
          <div className="auc-quick">
            {[0, 3, 6].map((steps) => {
              const amount = props.minNextSatang + steps * props.incrementSatang;
              return (
                <button
                  key={steps}
                  type="button"
                  className="auc-quick-btn"
                  onClick={() => {
                    setRaw(String(Math.round(amount / 100)));
                    idempotencyKeyRef.current ??= crypto.randomUUID();
                    setStage("confirm");
                  }}
                >
                  {formatThb(amount)}
                </button>
              );
            })}
          </div>
          <div className="auc-bid-row">
            <input
              id="auc-max"
              className="auc-bid-input"
              inputMode="numeric"
              autoComplete="off"
              placeholder={formatThb(props.minNextSatang)}
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
            />
            <button
              type="button"
              className="auc-bid-btn"
              disabled={!valid}
              onClick={() => {
                idempotencyKeyRef.current ??= crypto.randomUUID();
                setStage("confirm");
              }}
            >
              Bid
            </button>
          </div>
          <p className="auc-bid-hint">
            Minimum {formatThb(props.minNextSatang)} (+{formatThb(props.incrementSatang)}).
            We bid only as much as needed to keep you in front, up to your maximum.
          </p>
          {error && <p className="auc-bid-error" role="alert">{error}</p>}
        </>
      )}

      {stage !== "entry" && (
        <div className="auc-confirm" role="dialog" aria-label="Confirm your maximum bid">
          <p className="auc-confirm-lead">
            You are authorising us to bid up to <b>{formatThb(satang)}</b> on your behalf.
          </p>
          <p className="auc-confirm-sub">
            If you win you must pay within 48 hours. This cannot be retracted.
          </p>
          <div className="auc-confirm-actions">
            <button type="button" className="auc-btn-ghost" onClick={() => setStage("entry")} disabled={stage === "sending"}>
              Back
            </button>
            <button type="button" className="auc-bid-btn" onClick={submit} disabled={stage === "sending"}>
              {stage === "sending" ? "Placing…" : `Authorise ${formatThb(satang)}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function bidErrorMessage(code: string) {
  switch (code) {
    case "auction_bid_closed":
      return "This auction has ended. Your bid was not placed.";
    case "auction_bid_below_min":
      return "Someone raised the price while you were typing. Check the new minimum and bid again.";
    case "auction_bid_not_higher":
      return "That is not higher than your current maximum.";
    case "auction_bid_below_start":
      return "That is below the starting price.";
    case "auction_bid_admin_forbidden":
      return "Staff accounts cannot bid.";
    case "auction_bid_seller_forbidden":
      return "You cannot bid on your own lot.";
    case "auction_bid_kyc_required":
      return "This lot is open to verified accounts only. Verify your account to bid.";
    case "auction_bid_contact_unverified":
      return "Verify your email before bidding, so we can reach you if you win.";
    case "auction_bid_account_blocked":
      return "Your account cannot bid right now. Contact support.";
    default:
      return "Your bid could not be placed. Try again.";
  }
}
```

- [ ] **Step 2: Add mobile-first styles including the sticky bar**

```css
.auc-bid {
  position: sticky; bottom: 0; z-index: 20;
  background: var(--mp-paper);
  border-top: 1px solid var(--mp-line-strong);
  padding: 12px 14px calc(12px + env(safe-area-inset-bottom));
  margin: 0 -14px -14px;
  box-shadow: 0 -6px 20px rgba(23, 22, 16, 0.06);
}
.auc-bid-label {
  display: block; font-family: var(--mp-mono); font-size: 10px;
  letter-spacing: .15em; text-transform: uppercase; color: var(--mp-mute);
  font-weight: 700; margin-bottom: 6px;
}
.auc-bid-row { display: flex; gap: 8px; }
/* Typing a number on a phone with thirty seconds left is the wrong
   interaction. One tap bids the minimum or a few steps above it; the text
   field stays for anyone setting a considered proxy maximum. */
.auc-quick { display: flex; gap: 6px; margin-bottom: 8px; }
.auc-quick-btn {
  flex: 1; min-height: var(--auc-tap);
  background: var(--mp-gold-tint); border: 1px solid var(--mp-gold);
  border-radius: var(--mp-r-sm); color: var(--mp-gold-ink);
  font-family: var(--mp-mono); font-variant-numeric: tabular-nums;
  font-size: 13px; font-weight: 700;
}
.auc-quick-btn:focus-visible { outline: 2px solid var(--mp-green); outline-offset: 1px; }
.auc-bid-input {
  flex: 1; min-width: 0; min-height: var(--auc-tap);
  border: 1px solid var(--mp-line-strong); border-radius: var(--mp-r-sm);
  background: var(--mp-bg-soft); padding: 10px 12px;
  font-family: var(--mp-mono); font-size: 16px; /* 16px stops iOS zoom-on-focus */
  color: var(--mp-ink);
}
.auc-bid-input:focus-visible { outline: 2px solid var(--mp-green); outline-offset: 1px; }
.auc-bid-btn {
  min-height: var(--auc-tap); min-width: 96px;
  background: var(--mp-green); color: #fff; border: 0;
  border-radius: var(--mp-r-sm); font-weight: 700; font-size: 15px;
}
.auc-bid-btn:disabled { background: var(--mp-line-strong); color: var(--mp-mute); }
.auc-btn-ghost {
  min-height: var(--auc-tap); background: transparent;
  border: 1px solid var(--mp-line-strong); border-radius: var(--mp-r-sm);
  color: var(--mp-ink); font-weight: 600; padding: 0 16px;
}
.auc-bid-hint { font-size: 11.5px; color: var(--mp-mute); margin: 8px 0 0; }
.auc-bid-error {
  font-size: 12.5px; color: var(--mp-rose); background: var(--mp-rose-soft);
  border-radius: var(--mp-r-sm); padding: 8px 10px; margin: 8px 0 0;
}
.auc-gate {
  font-size: 13px; color: var(--mp-mute); background: var(--mp-bg-soft);
  border: 1px solid var(--mp-line); border-radius: var(--mp-r-md);
  padding: 14px; margin: 0; text-align: center;
}
.auc-confirm-lead { font-size: 15px; margin: 0 0 4px; }
.auc-confirm-sub { font-size: 12px; color: var(--mp-mute); margin: 0 0 12px; }
.auc-confirm-actions { display: flex; gap: 8px; }
.auc-confirm-actions .auc-bid-btn { flex: 1; }

@media (min-width: 1024px) {
  /* On desktop the panel lives in the right rail, not pinned to the viewport. */
  .auc-bid {
    position: static; margin: 0; border: 1px solid var(--mp-gold-bright);
    border-radius: var(--mp-r-md); box-shadow: var(--auc-bid-ring);
    padding: 16px 17px;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add Website/src/features/marketplace-ui/auction/BidPanel.tsx Website/src/features/marketplace-ui/auction/auction.css
git commit -m "feat(ui): add proxy bid panel with authorise-up-to confirmation"
```

### Task 18: Auction room, scheduled lot, list, and won lot

**Files:**
- Create: `Website/src/features/marketplace-ui/auction/AuctionRoom.tsx`
- Create: `Website/src/features/marketplace-ui/auction/BidHistory.tsx`
- Create: `Website/src/features/marketplace-ui/auction/ScheduledLotPanel.tsx`
- Create: `Website/src/features/marketplace-ui/auction/AuctionList.tsx`
- Create: `Website/src/features/marketplace-ui/auction/WonLotPanel.tsx`
- Create: `Website/src/app/(store)/marketplace/auctions/page.tsx`
- Create: `Website/src/app/(store)/marketplace/auctions/[auctionId]/page.tsx`

**Layout contract, mobile (base):**

```
┌─────────────────────────┐
│ ● LIVE   ends 00:01:47  │  status strip, sticky under topbar
├─────────────────────────┤
│      [ lot photo ]      │  aspect-ratio 4/3.4, full bleed
├─────────────────────────┤
│ OFFICIAL SHOP · PSA 10  │  eyebrow
│ Charizard VMAX SV107    │  h1, 21px
│ [Live] [Open to all]    │  chips
├─────────────────────────┤
│ Current bid             │
│ ฿24,800   14 bids       │  mono 30px
├─────────────────────────┤
│ ▸ Bid history (14)      │  collapsed <details>
├─────────────────────────┤
│ If you win …            │  terms panel
├─────────────────────────┤
│ [ your max ] [  Bid  ]  │  STICKY BOTTOM BAR
└─────────────────────────┘
```

**Layout contract, desktop (≥1024px):** two columns, `grid-template-columns: 1.05fr 1fr; gap: 22px`. Left: photo, then bid history expanded. Right: eyebrow, title, chips, price + countdown panel, bid panel, terms panel.

**Live-update contract.** Primary transport is a Supabase Realtime subscription on `marketplace_auction_events` filtered by `auction_id` (Task 12b), giving ~100-300ms. Poll `GET /auctions/[id]/live` is the fallback and runs whenever the socket is not `SUBSCRIBED`. The private `/me` route is polled separately and never cached.

Because the events table carries no account id, the client infers its own status locally: *if I was leading and a `bid_placed` event arrives that I did not cause, I have been outbid.* No per-user channel, nothing private ever crosses the public socket.

**Polling fallback:** every **5000ms**, tightening to **2000ms** when remaining time is under 120s. Polling stops when `auctionState !== "live"`. Every response carries `serverNow`, which re-syncs the countdown offset. On `visibilitychange` to hidden, polling pauses; on visible it fires immediately then resumes.

- [ ] **Step 1: Write `BidHistory.tsx`**

```tsx
import { formatThb } from "../shared/money";

export type BidHistoryRow = {
  sequence: number;
  bidder_alias: string;
  effective_amount_satang: number;
  outcome: string;
  placed_at: string;
};

export function BidHistory({ rows, youAlias }: { rows: BidHistoryRow[]; youAlias: string | null }) {
  if (rows.length === 0) {
    return <p className="auc-hist-empty">No bids yet. Be the first.</p>;
  }
  return (
    <ol className="auc-hist">
      {rows.map((row) => (
        <li key={row.sequence} className={row.bidder_alias === youAlias ? "auc-hist-you" : undefined}>
          <span>{row.bidder_alias === youAlias ? "you" : row.bidder_alias}</span>
          <b>{formatThb(row.effective_amount_satang)}</b>
          <time dateTime={row.placed_at}>{relativeTime(row.placed_at)}</time>
        </li>
      ))}
    </ol>
  );
}

function relativeTime(iso: string) {
  const deltaSeconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (deltaSeconds < 60) return `${deltaSeconds}s ago`;
  if (deltaSeconds < 3600) return `${Math.floor(deltaSeconds / 60)}m ago`;
  if (deltaSeconds < 86400) return `${Math.floor(deltaSeconds / 3600)}h ago`;
  return `${Math.floor(deltaSeconds / 86400)}d ago`;
}
```

- [ ] **Step 2: Write `ScheduledLotPanel.tsx`**

```tsx
import { AuctionCountdown } from "./AuctionCountdown";
import { formatThb } from "../shared/money";

/**
 * Pre-bidding state. This screen carries the KYC lead-time story: a gated lot
 * must tell people to get verified BEFORE bidding opens, or the gate simply
 * locks them out on the day.
 */
export function ScheduledLotPanel({
  startsAt,
  serverNow,
  startPriceSatang,
  bidderGate,
  isVerified,
}: {
  startsAt: string;
  serverNow: string;
  startPriceSatang: number;
  bidderGate: "open" | "kyc_required";
  isVerified: boolean;
}) {
  return (
    <div className="auc-scheduled">
      <p className="mp-eyebrow">Bidding opens in</p>
      <AuctionCountdown endsAt={startsAt} serverNow={serverNow} urgentSeconds={0} />
      <p className="auc-scheduled-start">Starts at {formatThb(startPriceSatang)}</p>

      {bidderGate === "kyc_required" && (
        <div className={`auc-gate-notice${isVerified ? " auc-gate-ok" : ""}`}>
          {isVerified ? (
            <p>Your account is verified. You can bid as soon as this lot opens.</p>
          ) : (
            <>
              <p><b>Verified accounts only.</b> Verify before bidding opens — review takes time.</p>
              <a className="auc-bid-btn auc-gate-cta" href="/marketplace/verify">Verify my account</a>
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write `AuctionRoom.tsx` with the polling loop**

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AuctionCountdown } from "./AuctionCountdown";
import { BidPanel } from "./BidPanel";
import { BidHistory, type BidHistoryRow } from "./BidHistory";
import { formatThb } from "../shared/money";

const POLL_IDLE_MS = 5000;
const POLL_URGENT_MS = 2000;
const URGENT_WINDOW_MS = 120_000;

export type AuctionRoomData = {
  auctionId: string;
  title: string;
  photoUrls: string[];
  auctionState: string;
  bidderGate: "open" | "kyc_required";
  currentPriceSatang: number;
  minNextSatang: number;
  incrementSatang: number;
  bidCount: number;
  distinctBidderCount: number;
  effectiveEndsAt: string;
  extensionCount: number;
  maxExtensions: number;
  serverNow: string;
};

export function AuctionRoom({
  initial,
  initialBids,
  canBid,
  cannotBidReason,
  youAlias,
}: {
  initial: AuctionRoomData;
  initialBids: BidHistoryRow[];
  canBid: boolean;
  cannotBidReason: string | null;
  youAlias: string | null;
}) {
  const [data, setData] = useState(initial);
  const [bids, setBids] = useState(initialBids);
  const timerRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [auctionResponse, bidsResponse] = await Promise.all([
        fetch(`/api/ynot/marketplace/auctions/${initial.auctionId}`, { cache: "no-store" }),
        fetch(`/api/ynot/marketplace/auctions/${initial.auctionId}/bids`, { cache: "no-store" }),
      ]);
      if (auctionResponse.ok) setData(await auctionResponse.json());
      if (bidsResponse.ok) setBids((await bidsResponse.json()).bids ?? []);
    } catch {
      // Transient network failure. The next tick retries; showing an error
      // here would flicker on every subway tunnel.
    }
  }, [initial.auctionId]);

  useEffect(() => {
    function schedule() {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (data.auctionState !== "live" || document.hidden) return;
      const remaining = new Date(data.effectiveEndsAt).getTime() - Date.now();
      const delay = remaining <= URGENT_WINDOW_MS ? POLL_URGENT_MS : POLL_IDLE_MS;
      // Only ONE driver: the timer fires refresh(), refresh() updates state,
      // the state change re-runs this effect, and the effect re-schedules.
      // Calling schedule() from the .then() as well would run two chains
      // through one timerRef.
      timerRef.current = window.setTimeout(() => { void refresh(); }, delay);
    }
    schedule();

    function onVisible() {
      if (!document.hidden) void refresh();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [data.auctionState, data.effectiveEndsAt, refresh]);

  const ended = data.auctionState !== "live";

  return (
    <div className="auc-room">
      <div className="auc-strip">
        <span className={`chip ${ended ? "" : "live"}`}>{ended ? "Ended" : "● Live"}</span>
        <AuctionCountdown
          endsAt={data.effectiveEndsAt}
          serverNow={data.serverNow}
          onExpired={refresh}
        />
      </div>

      <div className="auc-grid">
        <div className="auc-left">
          <div className="auc-photo">
            {data.photoUrls[0]
              ? <img src={data.photoUrls[0]} alt={data.title} width={800} height={680} />
              : <span>NO PHOTOGRAPH</span>}
          </div>
          <details className="auc-hist-wrap" open>
            <summary>Bid history ({data.bidCount})</summary>
            <BidHistory rows={bids} youAlias={youAlias} />
            <p className="auc-hist-note">
              Aliases are stable per auction. Maximum bids are never shown.
            </p>
          </details>
        </div>

        <div className="auc-right">
          <h1 className="auc-title">{data.title}</h1>
          <div className="auc-price-panel">
            <p className="mp-eyebrow">{ended ? "Winning bid" : "Current bid"}</p>
            <p className="auc-price">{formatThb(data.currentPriceSatang)}</p>
            <p className="auc-price-sub">
              {data.bidCount} bids · {data.distinctBidderCount} bidders
              {data.extensionCount > 0 && ` · extended ${data.extensionCount}/${data.maxExtensions}`}
            </p>
          </div>

          {!ended && (
            <BidPanel
              auctionId={data.auctionId}
              currentPriceSatang={data.currentPriceSatang}
              minNextSatang={data.minNextSatang}
              incrementSatang={data.incrementSatang}
              disabled={!canBid}
              disabledReason={cannotBidReason}
              onPlaced={() => { void refresh(); }}
            />
          )}

          <div className="auc-terms">
            <p className="mp-eyebrow">If you win</p>
            <p>
              Pay by bank transfer within <b>48 hours</b>. Shipping and service fee are
              calculated and shown before you transfer. Win several lots and pay once.
            </p>
            <p className="auc-terms-warn">A bid in the last 2 minutes extends the auction by 2 minutes.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add the responsive grid to `auction.css`**

```css
.auc-room { display: block; }
.auc-strip {
  position: sticky; top: 0; z-index: 15;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 0; margin-bottom: 14px;
  background: var(--mp-bg); border-bottom: 1px solid var(--mp-line);
}
.auc-grid { display: grid; grid-template-columns: 1fr; gap: 18px; }
.auc-photo {
  background: var(--mp-paper); border: 1px solid var(--mp-line);
  border-radius: var(--mp-r-md); aspect-ratio: 4 / 3.4;
  display: flex; align-items: center; justify-content: center; overflow: hidden;
}
.auc-photo img { width: 100%; height: 100%; object-fit: contain; }
.auc-title { font-size: 21px; font-weight: 800; letter-spacing: -.015em; margin: 0 0 12px; line-height: 1.15; }
.auc-price-panel {
  background: var(--mp-paper); border: 1px solid var(--mp-line);
  border-radius: var(--mp-r-md); padding: 16px 17px; margin-bottom: 12px;
}
.auc-price {
  font-family: var(--mp-mono); font-variant-numeric: tabular-nums;
  font-size: 30px; font-weight: 700; letter-spacing: -.02em; margin: 4px 0 2px;
}
.auc-price-sub { font-family: var(--mp-mono); font-size: 11px; color: var(--mp-mute); margin: 0; }
.auc-hist-wrap { background: var(--mp-paper); border: 1px solid var(--mp-line); border-radius: var(--mp-r-md); padding: 14px 16px; }
.auc-hist-wrap summary { font-family: var(--mp-mono); font-size: 10px; letter-spacing: .15em; text-transform: uppercase; color: var(--mp-mute); font-weight: 700; cursor: pointer; min-height: var(--auc-tap); display: flex; align-items: center; }
.auc-hist { list-style: none; margin: 8px 0 0; padding: 0; font-family: var(--mp-mono); font-size: 11.5px; }
.auc-hist li { display: flex; justify-content: space-between; gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--mp-line-soft); color: var(--mp-mute); font-variant-numeric: tabular-nums; }
.auc-hist li:last-child { border-bottom: 0; }
.auc-hist b { color: var(--mp-ink); }
.auc-hist-you { color: var(--mp-green-ink); }
.auc-hist-note, .auc-hist-empty { font-size: 11px; color: var(--mp-mute); margin: 10px 0 0; font-style: italic; }
.auc-terms { background: var(--mp-paper); border: 1px solid var(--mp-line); border-radius: var(--mp-r-md); padding: 14px 16px; margin-top: 12px; font-size: 12.5px; color: var(--mp-mute); }
.auc-terms p { margin: 6px 0 0; }
.auc-terms-warn { color: var(--mp-gold-ink); }
.auc-scheduled { background: var(--mp-paper); border: 1px solid var(--mp-line); border-radius: var(--mp-r-md); padding: 18px; text-align: center; }
.auc-scheduled-start { font-family: var(--mp-mono); font-size: 13px; color: var(--mp-mute); margin: 8px 0 0; }
.auc-gate-notice { margin-top: 14px; padding: 12px; border-radius: var(--mp-r-sm); background: var(--mp-gold-tint); border: 1px solid var(--mp-gold); font-size: 12.5px; text-align: left; }
.auc-gate-ok { background: var(--mp-green-tint); border-color: var(--mp-green); }
.auc-gate-cta { display: inline-flex; align-items: center; margin-top: 10px; padding: 0 16px; text-decoration: none; }

@media (min-width: 768px) {
  .auc-title { font-size: 25px; }
}
@media (min-width: 1024px) {
  .auc-grid { grid-template-columns: 1.05fr 1fr; gap: 22px; align-items: start; }
  .auc-title { font-size: 28px; }
  .auc-price { font-size: 38px; }
  .auc-strip { position: static; border-bottom: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .auc-room * { transition: none !important; animation: none !important; }
}
```

- [ ] **Step 5: Wire the two pages**

`src/app/(store)/marketplace/auctions/[auctionId]/page.tsx` is a server component: `export const dynamic = "force-dynamic"`, resolve profile and marketplace account, call `getAuction()` and `listAuctionBids()`, compute `canBid` (state is live, no admin role, contact verified, gate satisfied) plus a `cannotBidReason` string from the same `bidErrorMessage` vocabulary, then render `AuctionRoom` for a live lot or `ScheduledLotPanel` for a scheduled one.

`src/app/(store)/marketplace/auctions/page.tsx` renders `AuctionList` with three tabs backed by `listAuctions("ending_soon" | "live" | "upcoming")`. Mobile: one card per row. Desktop: `grid-template-columns: repeat(3, 1fr)`.

- [ ] **Step 6: Verify responsively**

Use the browser preview at 360, 390, 768, 1024, and 1440px. Confirm: no horizontal scroll at any width; the bid bar is reachable without scrolling on mobile; the countdown does not reflow as digits change; every tap target measures at least 44px.

- [ ] **Step 7: Commit**

```bash
git add Website/src/features/marketplace-ui/auction Website/src/app/\(store\)/marketplace/auctions
git commit -m "feat(ui): add auction room, scheduled lot, and auction list"
```

### Task 19: Won-lot payment

**Files:**
- Create: `Website/src/features/marketplace-ui/auction/WonLotPanel.tsx`
- Modify: `Website/src/features/marketplace-ui/orders/OrdersPage.tsx`

- [ ] **Step 1: Add a "Won" tab to `OrdersPage.tsx`**

Follow the existing `BuyingTab` / `ListingsTab` pattern exactly. The new tab lists awards from `GET /api/ynot/marketplace/awards`, grouped by `award_state`.

- [ ] **Step 2: Write `WonLotPanel.tsx`**

Shows the lot title and photo, the hammer price, the fee breakdown returned by the award, a **deadline banner** driven by `AuctionCountdown` against `payment_due_at`, and a single primary action that POSTs to `/api/ynot/marketplace/awards/[awardId]/checkout` and then routes to the existing `CheckoutFlow` slip-upload step. Mobile: the Pay button is a sticky bottom bar, reusing `.auc-bid` positioning. Desktop: two columns with the payment panel in the right rail.

- [ ] **Step 3: Verify responsively at the five breakpoints, then commit**

```bash
git add Website/src/features/marketplace-ui/auction/WonLotPanel.tsx Website/src/features/marketplace-ui/orders/OrdersPage.tsx
git commit -m "feat(ui): add won-lot payment flow"
```

### Task 20: Admin cockpit

Four jobs on one screen: **create**, **monitor**, **intervene**, **settle**. It becomes the eighth screen under `admin/marketplace`, following `OfficialStockScreen` / `StockModal`.

**Files:**
- Create: `Database/marketplace-supabase/migrations/20260818100800_marketplace_auction_admin_rpcs.sql`
- Create: `Website/src/features/marketplace-ui/admin/AuctionsScreen.tsx`
- Create: `Website/src/features/marketplace-ui/admin/AuctionModal.tsx`
- Create: `Website/src/app/admin/marketplace/auctions/page.tsx`
- Create: `Website/src/app/api/ynot/marketplace/admin/auctions/route.ts`
- Create: `Website/src/app/api/ynot/marketplace/admin/auctions/[auctionId]/route.ts`
- Create: `Website/src/app/api/ynot/marketplace/admin/auctions/[auctionId]/cancel/route.ts`

- [ ] **Step 1: Write the admin RPCs — they MUST take the same first lock as a bid**

Admin edit and cancel are the only other writers of `marketplace_auctions`. If they write through plain PostgREST, they bypass the row lock the entire correctness argument rests on: the `bid_count > 0` freeze check becomes a TOCTOU, a bid can commit against a lot being cancelled, and a listing-then-auction lock order would invert the bid path's auction-then-listing order and deadlock.

```sql
-- Both functions open with the SAME lock as marketplace_place_auction_bid:
--   select ... from marketplace_auctions where id = ? for update
-- Then, and only then, do they touch bids and the listing -- in that order.

create or replace function public.marketplace_update_auction_terms(
  p_auction_id uuid,
  p_admin_profile_id uuid,
  p_admin_role text,
  p_start_price_satang integer,
  p_starts_at timestamptz,
  p_base_ends_at timestamptz,
  p_bidder_gate text,
  p_anti_snipe_window_seconds integer,
  p_anti_snipe_extend_seconds integer,
  p_max_extensions integer,
  p_max_bid_satang integer,
  p_admin_note text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set lock_timeout = '3s'
set search_path = public, pg_temp
as $$
declare
  auction_row public.marketplace_auctions%rowtype;
begin
  if p_admin_role not in ('owner', 'admin') then
    raise exception 'marketplace_admin_required';
  end if;

  select * into auction_row from public.marketplace_auctions
   where id = p_auction_id for update;
  if auction_row.id is null then raise exception 'auction_not_found'; end if;

  -- Checked UNDER the lock. As an unlocked application-side read this is a
  -- plain TOCTOU: a bid landing between the read and the write lets an admin
  -- rewrite the start price of a lot people are already bidding on.
  if auction_row.bid_count > 0 then
    raise exception 'auction_terms_frozen';
  end if;
  if auction_row.auction_state not in ('scheduled', 'live') then
    raise exception 'auction_not_editable';
  end if;
  if p_base_ends_at <= p_starts_at then
    raise exception 'auction_window_invalid';
  end if;

  update public.marketplace_auctions
     set start_price_satang = p_start_price_satang,
         current_price_satang = p_start_price_satang,
         starts_at = p_starts_at,
         base_ends_at = p_base_ends_at,
         effective_ends_at = p_base_ends_at,
         bidder_gate = p_bidder_gate,
         anti_snipe_window_seconds = p_anti_snipe_window_seconds,
         anti_snipe_extend_seconds = p_anti_snipe_extend_seconds,
         max_extensions = p_max_extensions,
         -- Griefing ceiling. Defaults to 100x the start price, floored at
         -- THB 20,000 so a lot opening at 0 still gets a real bound.
         max_bid_satang = coalesce(
           p_max_bid_satang,
           greatest(p_start_price_satang * 100, 2000000)
         ),
         admin_note = p_admin_note,
         version = version + 1
   where id = p_auction_id;

  insert into public.marketplace_audit_events (
    actor_ynot_profile_id, actor_admin_role, event_type, event_payload, request_id
  ) values (
    p_admin_profile_id, p_admin_role, 'auction_terms_updated',
    jsonb_build_object('auctionId', p_auction_id), p_request_id
  );

  return jsonb_build_object('auctionId', p_auction_id, 'updated', true);
end;
$$;

create or replace function public.marketplace_cancel_auction(
  p_auction_id uuid,
  p_admin_profile_id uuid,
  p_admin_role text,
  p_reason text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set lock_timeout = '3s'
set search_path = public, pg_temp
as $$
declare
  auction_row public.marketplace_auctions%rowtype;
  voided integer;
begin
  if p_admin_role not in ('owner', 'admin') then
    raise exception 'marketplace_admin_required';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'auction_cancel_reason_required';
  end if;

  select * into auction_row from public.marketplace_auctions
   where id = p_auction_id for update;
  if auction_row.id is null then raise exception 'auction_not_found'; end if;
  if auction_row.auction_state not in ('scheduled', 'live') then
    raise exception 'auction_not_cancellable';
  end if;

  update public.marketplace_auctions
     set auction_state = 'cancelled', closed_at = clock_timestamp(),
         close_reason = 'cancelled_by_admin', admin_note = p_reason,
         version = version + 1
   where id = p_auction_id;

  update public.marketplace_auction_bids set outcome = 'void'
   where auction_id = p_auction_id and outcome in ('leading', 'outbid');
  get diagnostics voided = row_count;

  update public.marketplace_listing_snapshots
     set listing_state = 'hidden', snapshot_version = snapshot_version + 1
   where listing_id = auction_row.listing_id;

  insert into public.marketplace_audit_events (
    actor_ynot_profile_id, actor_admin_role, event_type, event_payload, request_id
  ) values (
    p_admin_profile_id, p_admin_role, 'auction_cancelled',
    jsonb_build_object('auctionId', p_auction_id, 'reason', p_reason, 'bidsVoided', voided),
    p_request_id
  );

  return jsonb_build_object('auctionId', p_auction_id, 'bidsVoided', voided);
end;
$$;

revoke all on function public.marketplace_update_auction_terms(uuid, uuid, text, integer, timestamptz, timestamptz, text, integer, integer, integer, integer, text, text) from public, anon, authenticated;
revoke all on function public.marketplace_cancel_auction(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.marketplace_update_auction_terms(uuid, uuid, text, integer, timestamptz, timestamptz, text, integer, integer, integer, integer, text, text) to service_role;
grant execute on function public.marketplace_cancel_auction(uuid, uuid, text, text, text) to service_role;
```

- [ ] **Step 2: Add the failing test for the lock discipline**

```js
const adminRpc = compact(readMigration("20260818100800_marketplace_auction_admin_rpcs.sql"));

test("admin writers take the same first lock as a bid", () => {
  const locks = adminRpc.match(/from public\.marketplace_auctions where id = p_auction_id for update/g) ?? [];
  assert.equal(locks.length, 2, "both update and cancel must lock the auction row first");
});

test("the terms freeze is evaluated under the lock, not in the application", () => {
  const frozenAt = adminRpc.indexOf("auction_terms_frozen");
  const lockAt = adminRpc.indexOf("for update");
  assert.ok(lockAt > 0 && frozenAt > lockAt, "bid_count check must come after the lock");
});

test("cancelling requires a reason and voids every bid", () => {
  assert.match(adminRpc, /auction_cancel_reason_required/);
  assert.match(adminRpc, /set outcome = 'void'/);
});
```

- [ ] **Step 3: Build `AuctionModal.tsx` — create and edit**

Mirrors `StockModal.tsx`. Fields: inventory item (searchable select, restricted to `inspection_passed` or `listed`), start price in baht (default 0), opens at, ends at, bidder gate (`open` default / `kyc_required`), anti-snipe window seconds (120), extend seconds (120), max extensions (20), admin note.

Client validation before submit: `ends_at > starts_at`, duration between 1 hour and 30 days, start price ≥ 0, and `extend_seconds` ≥ 1.

When `bid_count > 0` every field renders disabled with: *"Terms are frozen — this lot has bids. You can cancel it with a reason, but you cannot change it."* The server enforces the same rule under the lock, so a stale tab cannot bypass it.

- [ ] **Step 4: Build `AuctionsScreen.tsx` — monitor, intervene, settle**

Three tabs:

**Live & upcoming** — one row per lot: title, state, current price, bid count, distinct bidders, live `AuctionCountdown`, extension count `n/20`, gate badge. Sorted by soonest close. Cancel action per row, opening a reason-required confirm.

**Awaiting payment** — every award in `awaiting_payment` / `payment_started` with a countdown to `payment_due_at`, the winner's masked alias, and the hammer price.

**Expired & unsold** — the queue created by the expire sweep and by zero-bid closes. This is the screen that stops a stranded card disappearing: each row offers *re-auction*, *list fixed-price*, or *hold*, all of which simply route to the existing inventory screens.

Mobile: each row becomes a stacked card. Desktop: a table inside `overflow-x: auto`.

- [ ] **Step 5: Build the three admin routes**

All use `prepareMarketplaceMutation` with `accessMode: "owner"` and `action: "auctions"`. Each calls its RPC and maps RPC error codes to messages — `auction_terms_frozen`, `auction_not_cancellable`, `auction_cancel_reason_required`. No route may write `marketplace_auctions` directly.

- [ ] **Step 6: Verify and commit**

```bash
cd Website && npx tsc --noEmit --pretty false && node --test scripts/test-marketplace-auction-schema.mjs
git add Database/marketplace-supabase/migrations/20260818100800_marketplace_auction_admin_rpcs.sql Website/src/features/marketplace-ui/admin/Auction* Website/src/app/admin/marketplace/auctions Website/src/app/api/ynot/marketplace/admin/auctions
git commit -m "feat(admin): auction cockpit with locked create, cancel, and settle"
```

### Task 21: Full verification before merge

- [ ] **Step 1: Run the whole marketplace gate**

Run: `cd Website && npm run verify:marketplace`
Expected: PASS.

- [ ] **Step 2: Run the auction tests**

Run: `cd Website && node --test scripts/test-marketplace-auction-schema.mjs && node --experimental-strip-types --test scripts/test-marketplace-auction-money.mjs`
Expected: PASS.

- [ ] **Step 3: Re-check the bundle**

Run: `cd Website && npm run cf:build:marketplace && npm run verify:bundle-size`
Expected: under 3072 KiB. If it now exceeds it, stop and split the build target.

- [ ] **Step 4: Confirm the gacha worker is untouched**

Run: `git diff --name-only main...HEAD | grep -v -E '^(Database/marketplace-supabase|Website/src/(app/\(store\)/marketplace|app/admin/marketplace|app/api/ynot/marketplace|features/marketplace-ui|lib/marketplace|lib/worker)|Website/wrangler.marketplace|docs|\.github)' || echo "marketplace-only: gacha worker will not redeploy"`
Expected: `marketplace-only: gacha worker will not redeploy`. Anything listed means Task 1's `paths-ignore` will not protect this merge — review it.

- [ ] **Step 5: Add the auction gates to package.json and commit**

```json
"verify:marketplace-auctions": "node --test scripts/test-marketplace-auction-schema.mjs && node --experimental-strip-types --test scripts/test-marketplace-auction-money.mjs"
```

```bash
git add Website/package.json
git commit -m "chore: add auction verification gate"
```

---

## Deferred to Later Phases

Not in this plan, recorded so nothing is silently dropped:

- **P4 — engagement:** scheduled auction nights, simultaneous closes, outbid notification rail (email via Resend, then a LINE Messaging channel)
- **P5 — risk:** `marketplace_bidder_standing`, strikes, second-chance offers to the runner-up, live exposure caps
- **P6 — reach:** public browse once `OWNER_ONLY` is lifted; seller-run consignment auctions, which is when `auction_seller_fee_bps` starts applying. *Realtime moved into v1 — see Task 12b.*
- **Separate spec — KYC:** ID document upload, admin review queue, PDPA retention and deletion, setting `marketplace_accounts.kyc_status`. Auctions already read the gate, so this lands independently.

## Open Question Owned by You

**The Thai regulatory position on running online auctions** — licensing, consumer-protection obligations, and any AML threshold that would make KYC mandatory rather than optional. Nothing in this plan depends on the answer. The KYC spec does.
