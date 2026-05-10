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

## Repository, deployment, and runtime map

This project uses **one** GitHub repo and **two** Vercel projects sharing the same `Website/` Next.js app. Hostname-based middleware (see commit `d951f7e` "Keep LIFF traffic on LIFF domains") switches behavior between the LIFF flow and the normal website flow at runtime.

### Single source of truth

- **GitHub:** `https://github.com/pinkmerry/lucky-draw-liff` (this repo)
- Default branch: `main`
- The repo `pinkmerry/ynot-lucky-draw-platform` is **archived/deprecated** — do not push there. It is kept only as a historical mirror.

### Two independent Vercel projects (same code, different deployments)

| Vercel project | Domain | Purpose | Git config |
|---|---|---|---|
| `ynot-lucky-draw-platform` | `https://www.ynottcg.com` (apex `https://ynottcg.com` redirects here) | Normal website | Connected to `pinkmerry/lucky-draw-liff`, branch `main`, root directory `Website` |
| `lucky-draw-liff` | `https://liff.ynottcg.com`, fallback `https://lucky-draw-liff.vercel.app` | LINE LIFF inside LINE OA | Connected to `pinkmerry/lucky-draw-liff`, branch `main`, root directory `Website` |

A single `git push` to `main` triggers both deploys. They run on independent Vercel infrastructure, so a build failure in one does not roll back the other.

### Why the two projects are not unified

- Different domains, different env vars (LINE LIFF id, redirect URIs).
- LIFF traffic should never redirect to the normal website (and vice versa). The middleware enforces this per Vercel project via env-driven host allow-lists.

### DNS

Add the Squarespace DNS record `A liff.ynottcg.com 76.76.21.21`, then update LINE Console / rich-menu URLs to `https://liff.ynottcg.com`.

## Current next phase

Current online-testing status and next gate:

- `Website/docs/PROJECT_BRIEF_AND_NEXT_PHASE_PLAN.md`
- `Website/docs/verification/2026-05-07-github-vercel-production-deploy.md`
- `Database/docs/verification/2026-05-07-production-db-next-phase-gate.md`
