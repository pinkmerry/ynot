# YNOTT Project

This repository is the main **YNOTT** project. It keeps the normal website and Supabase database source of truth together so agents and humans do not split work across the wrong repo.

## Folder map

```text
YNOTT/
├── Website/       YNOTT Website: production Next.js website, admin/customer UI, APIs, docs
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

### LINE Login

LINE Login is part of the website, not a separate LIFF app:

- OAuth start/callback routes live in `Website/src/app/api/line/`.
- LINE account linking helpers live in `Website/src/lib/line/`.
- The website callback URL is `https://www.ynotopen.com/api/line/callback`.

There is no active `Line LIFF/` folder, LIFF Worker, or `liff.ynotopen.com` production surface for now. Recreate LIFF intentionally if it comes back later.

### Database

Use `Database/` for Supabase:

- `Database/supabase/migrations/`
- `Database/docs/DATABASE_ARCHITECTURE.md`
- `Database/docs/plans/`
- `Database/docs/verification/`

Website verification scripts read migrations directly from `../Database/supabase`.

## Production/deployment topology

| Surface | Cloudflare Worker | Root Directory | Domain |
| --- | --- | --- | --- |
| YNOTT Website | `ynott-website` | `Website` | `https://www.ynotopen.com` |
| YNOTT Website apex | `ynott-website` | `Website` | `https://ynotopen.com` -> `www` |
| YNOTT Website fallback | `ynott-website` | `Website` | `https://ynott-website.puppeteer-55b.workers.dev` |

Important: website deploys must target `ynott-website` only. The old LIFF Worker/deploy target is retired.

## Retired names

Do not use the old local folder, old repo names, or old Vercel aliases for new work:

- old local folder: `Lucky Draw/`
- old repos: `pinkmerry/lucky-draw-liff`, `pinkmerry/ynot-lucky-draw-platform`
- old Vercel aliases: `lucky-draw-liff.vercel.app`, `ynot-lucky-draw-platform.vercel.app`
- old LIFF Worker/deploy target: `ynott-line-liff`

Current source of truth is `YNOTT/` + `https://github.com/pinkmerry/ynot`.

## Current production gate

Do not apply production Supabase migrations until Phase 1 backup/PITR and restore-drill gates are satisfied.

Current status:

- `Website/docs/PROJECT_STATUS.md`
- `Website/docs/verification/2026-05-10-phase-1-production-inventory-backup.md`
