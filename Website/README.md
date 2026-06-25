# YNOTT Website

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

## LINE Login

LINE Login is still part of the website. OAuth start/callback/session code lives under `src/app/api/line/`, and shared helpers live under `src/lib/line/`.

The separate LIFF app is retired for now. Do not add LIFF deploy commands back unless a new LIFF product surface is intentionally recreated.

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


## Production/deployment map

| Surface | Cloudflare Worker | Root Directory | Domain |
| --- | --- | --- | --- |
| YNOTT Website | `ynott-website` | `Website` | `https://www.ynotopen.com` |

This folder is the app root for the active website Worker only.
