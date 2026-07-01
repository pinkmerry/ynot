# Database

This folder is the database area for the YNOTT project.

## Source of truth

- `supabase/migrations/` — YNOTT core Supabase schema, RLS, RPC, realtime, wallet, payment, gacha, exchange, Customer Bag, reward conversion, and reward shipping migrations.
- `marketplace-supabase/migrations/` — separate Marketplace Supabase schema for THB marketplace accounts, inventory, listings, orders, payment proof, fees, payouts, audit, and reconciliation. Marketplace real-money migrations must stay out of the core `supabase/migrations/` stream.
- `docs/DATABASE_ARCHITECTURE.md` — database architecture notes.
- `docs/plans/` — database and same-LIFF/website architecture planning artifacts.

## Website compatibility

Website verification scripts read this folder directly through `../Database/supabase` for YNOTT core checks and `../Database/marketplace-supabase` for marketplace checks. Do not add a `Website/supabase` symlink because Next/Turbopack dev mode can fail when scanning a symlink that leaves the app root.

## Production rule

Do not apply production migrations until backup, staging/preview verification, provider callback checks, and owner/admin bootstrap checks are complete.
