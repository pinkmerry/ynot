# 2026-05-08 Nav Cleanup Verification

## Scope

Localhost-only UX cleanup for the YNot website navigation:

- Top customer category nav reduced to Pokemon and One Piece.
- Store filter chips reduced to All, New, and PSA10.
- Desktop left rail reduced to Mystery Packs, Ranking, and Exchange.
- Mobile bottom tabbar changed to Main, Profile, Wallet, and Personal Info.
- Profile page now exposes quick actions for Collection and Ship Card, and a `#personal-info` anchor.
- Added CSS alignment overrides for desktop nav/left rail and compact mobile tab labels.

## Files touched

- `src/features/ynot/components.tsx`
- `src/app/(store)/profile/page.tsx`
- `src/app/globals.css`

## Verification

Commands run from `Website/`:

```bash
npm run check
npm run dev -- -p 3005
python3 - <<'PY'
from urllib.request import urlopen
checks = {
    '/': ['Pokemon', 'One Piece', 'All', 'New', 'PSA10', 'Main', 'Profile', 'Wallet', 'Personal Info', 'Mystery Packs', 'Ranking', 'Exchange'],
    '/profile': ['Collection', 'Ship Card', 'Personal Info', 'Wallet'],
}
for path, expected in checks.items():
    text = urlopen('http://localhost:3005' + path, timeout=10).read().decode('utf-8', errors='ignore')
    print(path, 'status=200', 'bytes=', len(text))
    for token in expected:
        print(' ', token, 'YES' if token in text else 'NO')
    if path == '/':
        for token in ['Hobby', 'POPMART', 'Yu-Gi-Oh!', 'Few left', 'Login Bonus', 'Oripa Gift']:
            print(' removed', token, 'FOUND' if token in text else 'not found')
PY
```

Evidence:

- `npm run check` passed: lint, typecheck, static YNot/auth/platform verification, and production build.
- Dev server started at `http://localhost:3005`.
- Route smoke returned `200` for `/`, `/profile`, `/wallet`, `/ranking`, `/exchange`, and `/shipping`.
- HTML smoke confirmed `/` contains Pokemon, One Piece, All, New, PSA10, Main, Profile, Wallet, Personal Info, Mystery Packs, Ranking, and Exchange.
- HTML smoke confirmed removed home nav/filter labels were absent: Hobby, POPMART, Yu-Gi-Oh!, Few left, Login Bonus, Oripa Gift.
- HTML smoke confirmed `/profile` contains Collection, Ship Card, Personal Info, and Wallet.

## Remaining notes

- The Exchange page still has its own marketplace category strip because this slice only cleaned the global/home navigation requested for localhost review.
- No API, database, auth, payment, or production deployment logic changed.
