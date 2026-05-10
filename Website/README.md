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

| Surface | Vercel project | Root Directory | Domain |
| --- | --- | --- | --- |
| YNOTT Website | `ynott-website` | `Website` | `https://www.ynottcg.com` |
| YNOTT LIFF compatibility deploy | `ynott-line-liff` | `Website` until LIFF extraction | `https://liff.ynottcg.com` |

This folder is the app root for both Vercel projects right now. Do not configure Vercel Root Directory as `.` while the Next.js app remains in `Website/`.
