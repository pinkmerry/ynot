# Verification: Project Organization

> 2026-05-10 update: this is historical evidence from before the final YNOTT rename. Current source of truth is `YNOTT/`, GitHub `pinkmerry/ynott`, Vercel projects `ynott-website` and `ynott-line-liff`, and verification note `2026-05-10-ynott-final-migration-cleanup.md`.

Date: 2026-05-07

## Claim

`Lucky Draw/` is the main project folder and is organized into visible project areas:

```text
Lucky Draw/
├── Website/
├── Database/
└── Line LIFF/
```

## Final structure

- `Website/` — active Next.js website app, website APIs, website UI, website docs, website plans, website verification scripts, and website design references.
- `Database/` — Supabase migration source of truth and database architecture/planning docs.
- `Line LIFF/` — LIFF integration notes and original Lucky Draw/LIFF design references.

## Important implementation detail

`Website/supabase` is intentionally **not** a symlink. A symlink to `../Database/supabase` caused Next/Turbopack dev mode to return 500s because the symlink left the app root. Website verification scripts were updated to read migration files directly from `../Database/supabase` instead.

Updated scripts:

- `Website/tools/verification/verify-phase1-auth-db.mjs`
- `Website/tools/verification/verify-platform-foundation.mjs`

## Verification evidence

Run from `Website/` after final organization:

```bash
npm run check
```

Result: passed.

It ran lint, typecheck, `verify:ynot`, and production build successfully. The static verifiers confirmed database migrations from `../Database/supabase/migrations/`.

Local dev server restarted from `Website/`:

```bash
npm run dev -- -p 3005
```

Local route smoke passed on `http://localhost:3005`:

```text
PASS 200 /
PASS 200 /gacha/pokemon-gold-07
PASS 200 /gacha/pokemon-gold-07/open
PASS 200 /collection
PASS 200 /ranking
PASS 200 /exchange
PASS 200 /shipping
PASS 200 /wallet
PASS 200 /profile
PASS 200 /login
PASS 200 /signup
PASS 200 /admin
```

## Production impact

Production was not touched.
