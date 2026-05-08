# Lucky Draw / YNot Project

This is the main project folder. The project is organized into clear areas so it is easy to see what belongs where.

## Folder map

```text
Lucky Draw/
├── Website/       Normal production website app, website UI, website APIs, and website plan/docs
├── Database/      Supabase migrations, database architecture, RLS/RPC plans, and DB runbooks
├── Line LIFF/     LINE LIFF integration notes and original LIFF/design references
├── AGENTS.md      Agent/project instructions
└── README.md      This project map
```

## Where to work

### Website

Use this when building or testing the normal website:

```bash
cd Website
npm run dev -- -p 3005
npm run check
```

Website plan/status files live in:

- `Website/docs/PROJECT_BRIEF_AND_NEXT_PHASE_PLAN.md`
- `Website/docs/PROJECT_STATUS.md`
- `Website/docs/plans/`

### Database

Use this for schema/migration planning and Supabase migration files:

- `Database/supabase/migrations/`
- `Database/docs/DATABASE_ARCHITECTURE.md`
- `Database/docs/plans/`

Website verification scripts read migration files directly from `../Database/supabase`.

### Line LIFF

Use this for LINE LIFF notes and references:

- `Line LIFF/README.md`
- `Line LIFF/docs/LIFF_INTEGRATION_MAP.md`
- `Line LIFF/design-references/`

## Production URL map

- Normal website: `https://www.ynottcg.com`
- Apex website redirect: `https://ynottcg.com` -> `https://www.ynottcg.com`
- Website Vercel project: `ynot-lucky-draw-platform` with root directory `Website`
- LINE LIFF intended URL: `https://liff.ynottcg.com`
- Temporary LIFF fallback while DNS is pending: `https://lucky-draw-liff.vercel.app`

The LIFF app should not redirect `liff.ynottcg.com` or `lucky-draw-liff.vercel.app` to the normal website. Add the Squarespace DNS record `A liff.ynottcg.com 76.76.21.21`, then update LINE Console / rich-menu URLs to `https://liff.ynottcg.com`.

## Current next phase

Current online-testing status and next gate:

- `Website/docs/PROJECT_BRIEF_AND_NEXT_PHASE_PLAN.md`
- `Website/docs/verification/2026-05-07-github-vercel-production-deploy.md`
- `Database/docs/verification/2026-05-07-production-db-next-phase-gate.md`
