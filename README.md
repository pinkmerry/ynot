# YNOTT Project

This repository is the main **YNOTT** project. It keeps the normal website, LINE LIFF integration notes, and Supabase database source of truth together so agents and humans do not split work across the wrong repo.

## Folder map

```text
YNOTT/
├── Website/       YNOTT Website: production Next.js website, admin/customer UI, APIs, docs
├── Line LIFF/     YNOTT LIFF: LINE Console/rich-menu/LIFF notes and compatibility references
├── Database/      Supabase migrations, schema docs, backup/restore evidence, RLS/RPC plans
├── AGENTS.md      Root agent instructions and repo/deployment topology
└── README.md      This project map
```

## Which folder should an agent use?

### YNOTT Website

Use `Website/` for the normal web product:

```bash
cd Website
npm run dev -- -p 3005
npm run check
```

Website docs/status:

- `Website/docs/PROJECT_BRIEF_AND_NEXT_PHASE_PLAN.md`
- `Website/docs/PROJECT_STATUS.md`
- `Website/docs/plans/`
- `Website/docs/verification/`

### YNOTT LIFF

Use `Line LIFF/` for LINE-specific product ownership:

- LINE Console / LIFF settings
- LINE rich-menu URLs
- `liff.ynottcg.com`
- LIFF compatibility notes and original design references

Current LIFF-compatible runtime code is still shared in `Website/src`. Until a separate LIFF app exists, the LIFF Vercel project must also build from `Website/`.

### Database

Use `Database/` for Supabase:

- `Database/supabase/migrations/`
- `Database/docs/DATABASE_ARCHITECTURE.md`
- `Database/docs/plans/`
- `Database/docs/verification/`

Website verification scripts read migrations directly from `../Database/supabase`.

## Production/deployment topology

| Surface | Vercel project | Root Directory | Domain |
| --- | --- | --- | --- |
| YNOTT Website | `ynott-website` | `Website` | `https://www.ynottcg.com` |
| YNOTT Website apex | `ynott-website` | `Website` | `https://ynottcg.com` -> `www` |
| YNOTT LIFF | `ynott-line-liff` | `Website` for now | `https://liff.ynottcg.com` |

Important: do **not** set either Vercel project Root Directory to `.` while the Next.js app lives in `Website/`.

## Retired names

Do not use the old local folder, old repo names, or old Vercel aliases for new work:

- old local folder: `Lucky Draw/`
- old repos: `pinkmerry/lucky-draw-liff`, `pinkmerry/ynot-lucky-draw-platform`
- old Vercel aliases: `lucky-draw-liff.vercel.app`, `ynot-lucky-draw-platform.vercel.app`

Current source of truth is `YNOTT/` + `https://github.com/pinkmerry/ynott`.

## Current production gate

Do not apply production Supabase migrations until Phase 1 backup/PITR and restore-drill gates are satisfied.

Current status:

- `Website/docs/PROJECT_STATUS.md`
- `Website/docs/verification/2026-05-10-phase-1-production-inventory-backup.md`
