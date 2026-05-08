# Verification: Website Folder Move

Date: 2026-05-07

## Claim

The active YNot/Lucky Draw website app has been moved into `Website/` and still runs from that folder.

## Commands run from `Website/`

```bash
npm run check
npm run dev -- -p 3005
node route-smoke
```

## Evidence

`npm run check` passed after the move. It ran:

- `npm run lint`
- `npm run typecheck`
- `npm run verify:ynot`
- `npm run build`

The build completed successfully with Next.js `16.2.5` and listed the expected app routes.

Local route smoke on `http://localhost:3005` passed:

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

- Production was not changed.
- `.git` remains in the parent folder intentionally; `Website/` is now the active app root.
- Port `3005` is being served by `npm run dev -- -p 3005` from `Website/` after this verification.
