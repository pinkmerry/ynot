# Pack-detail cache verification (2026-06-04)

Verifies the leak guards and correctness of the public campaign-detail cache
added in commit `81ef636` (Task 3 of `docs/superpowers/plans/2026-06-04-pack-detail-open-perf.md`).

## Build

`npm run build` (Next.js 16.2.6, Turbopack): **PASS** — compiled successfully
in 96s, TypeScript clean, 15/15 static pages generated, all routes compiled. The
only warning is the pre-existing `middleware`→`proxy` deprecation, unrelated to
this change.

## Leak-guard cases (confirmed by spec + code-quality review of `81ef636`)

1. **Admin viewer** → `!viewer.isAdmin` is false → cache skipped → dynamic
   `includePrivateDetail` path → full house detail, uncached. ✅
2. **Customer, normal public pack** → cache hit → returns only
   `publicYnotCampaign(...)` (internal `id` replaced by `slug`; `logicMode`,
   odds/weights, raw tier, prize-unit counts, stock identity, internal prize
   UUIDs all stripped via `publicYnotCampaign` + `publicPrizeLineup`). ✅
3. **Customer, test pack** → loader filters `is_test = false` → returns `null`
   → falls through to the dynamic path → `canReadTestCampaign` tester gate
   preserved. ✅
4. **Admin publishes / edits odds / adjusts stock** → existing
   `revalidateTag("campaigns", "max")` on every admin campaign-mutation route
   busts the `"campaigns"`-tagged detail cache. ✅

## Oversell / staleness

`revalidate: 30` with no per-open invalidation means `openable`/stock can be up
to ~30s stale. This is advisory UI only — the `open_gacha_campaign` RPC is the
atomic source of truth and rejects oversell server-side. Worst case: a customer
briefly sees "openable" on a just-sold-out pack and the open RPC cleanly
rejects. No oversell, no overspend.

## Viewer-independence

`loadPublicCampaignDetailImpl` calls no `getYnotViewer`, `cookies()`, or
`headers()`; the `unstable_cache` thunk closes over only the slug string. Safe
to cache and share across all non-admin viewers.
