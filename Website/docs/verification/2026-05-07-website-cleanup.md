# Verification: Website Folder Cleanup

Date: 2026-05-07

## Claim

The `Website/` folder has been reorganized into a cleaner Next.js app-root structure without breaking app commands.

## Clean layout

```text
Website/
├── src/                 Next.js source, routes, APIs, components, features
├── public/              public website assets
├── docs/                website docs, plans, verification, references, archive
├── tools/               verification scripts and fixtures
├── package.json         commands/dependencies
├── next.config.ts       Next.js config
├── tsconfig.json        TypeScript config
├── eslint.config.mjs    lint config
├── postcss.config.mjs   CSS/PostCSS config
└── AGENTS.md            local instructions
```

## Files moved

- `scripts/*.mjs` -> `tools/verification/*.mjs`
- `tests/fixtures/button-map.json` -> `tools/fixtures/button-map.json`
- `design-references/YNot Wireframes Standalone.html` -> `docs/references/design/YNot Wireframes Standalone.html`
- `docs/LUCKY_DRAW_PROJECT_PLAN.md` -> `docs/archive/LUCKY_DRAW_PROJECT_PLAN.md`
- `CLAUDE.md` -> `docs/agent-notes/CLAUDE.md`

## Config updates

- `package.json` scripts now call `tools/verification/...`.
- `verify-lucky-draw-plan.mjs` resolves the Website app root from its new nested path.
- `verify-platform-foundation.mjs` reads `tools/fixtures/button-map.json`.
- `tsconfig.json` writes TypeScript build info under `.next/cache/` instead of the Website root.

## Verification evidence

Run from `Website/`:

```bash
npm run check
```

Result: passed.

Local route smoke on `http://localhost:3005`:

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

## Notes

- `node_modules/`, `.next/`, `.vercel/`, `.omx/`, and `.env.local` are still local/generated/tooling folders and are ignored where appropriate.
- Production was not touched.
