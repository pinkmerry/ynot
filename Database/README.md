# Database

This folder is the database area for the Lucky Draw / YNot project.

## Source of truth

- `supabase/migrations/` — Supabase schema, RLS, RPC, realtime, wallet, payment, gacha, exchange, and shipping migrations.
- `docs/DATABASE_ARCHITECTURE.md` — database architecture notes.
- `docs/plans/` — database and same-LIFF/website architecture planning artifacts.

## Website compatibility

Website verification scripts read this folder directly through `../Database/supabase`. Do not add a `Website/supabase` symlink because Next/Turbopack dev mode can fail when scanning a symlink that leaves the app root.

## Production rule

Do not apply production migrations until backup, staging/preview verification, provider callback checks, and owner/admin bootstrap checks are complete.
