# YNot / Lucky Draw Website

This folder is the normal production website app.

## Clean folder map

```text
Website/
├── src/                 Next.js App Router source, pages, APIs, components, features
├── public/              public website assets
├── docs/                website plan, status, verification, references, archive
├── tools/               verification scripts and static fixtures
├── package.json         app commands/dependencies
├── next.config.ts       Next.js config
├── tsconfig.json        TypeScript config
├── eslint.config.mjs    lint config
├── postcss.config.mjs   CSS/PostCSS config
└── AGENTS.md            local agent instructions
```

Generated/local folders such as `.next/`, `node_modules/`, `.vercel/`, `.omx/`, and `.env.local` are intentionally not part of the clean source map.

## Main commands

```bash
npm run dev -- -p 3005
npm run check
```

## Main docs

- `docs/PROJECT_BRIEF_AND_NEXT_PHASE_PLAN.md`
- `docs/PROJECT_STATUS.md`
- `docs/plans/`
- `docs/verification/`

## Database location

Database migrations are organized at project level, outside this app folder:

```text
../Database/supabase/migrations/
```

The Website verification scripts read those migration files directly.


## Production URL map

This `Website/` Next.js app is the same code for both Vercel deployments. Hostname middleware switches LIFF vs. normal-website behavior at runtime.

- Normal website (Vercel project `ynot-lucky-draw-platform`): `https://www.ynottcg.com` (apex `https://ynottcg.com` redirects here), fallback `https://ynot-lucky-draw-platform.vercel.app`
- LINE LIFF (Vercel project `lucky-draw-liff`): `https://liff.ynottcg.com`, fallback `https://lucky-draw-liff.vercel.app`

Both Vercel projects connect to GitHub `pinkmerry/lucky-draw-liff`, branch `main`, root directory `Website`. A single push triggers both deploys but they run independently. The previously separate repo `pinkmerry/ynot-lucky-draw-platform` is archived — do not push there.

`liff.ynottcg.com` still needs the Squarespace DNS record documented in `docs/verification/2026-05-07-domain-reorganization.md` before using it in LINE Console/rich menu.
