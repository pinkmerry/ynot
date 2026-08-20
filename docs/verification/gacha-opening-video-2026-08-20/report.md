# Gacha Opening Video Verification

| Check | Result |
| --- | --- |
| Y-Pack -> one video -> spotlight -> summary | PASS - Browser rehearsal reached final summary in `summary-single-390x844.png`; local route issued 0 `POST /api/ynot/gacha/open` requests. Source contract `npm run test:gacha-opening-video` passed 16/16 and asserts `reveal -> openingVideo -> spotlight -> summary`. |
| No tierSpin or intermediate tier screen | PASS - `npm run test:gacha-opening-video` passed 16/16 and asserts no `tierSpin`, `tier`, `TIER_SPIN_MS`, or `TIER_RESULT_MS`; screenshots show final result cards, not an intermediate tier card. |
| x1 centered card | PASS - `summary-single-390x844.png` shows one centered final card; source contract asserts `.gacha-reveal-grid[data-quantity="1"]` has `max-width: 280px`. |
| Multi-result four-card viewport at 375x667 | PASS - `summary-375x667.png` is a true PNG and browser DOM measurement recorded 5 cards with 4 complete cards visible before inner scroll. |
| Multi-result four-card viewport at 390x844 | PASS - `summary-390x844.png` is a true PNG and shows four complete cards plus repeat/navigation controls. |
| Multi-result four-card viewport at 430x932 | PASS - `summary-430x932.png` is a true PNG and shows four complete cards plus repeat/navigation controls. |
| x10 one API request and complete result | PASS with contract evidence - no safe authenticated local x10 pack was available; `npm run test:pack-open-pull-contract` passed 10/10 and `npm run test:pack-opening-flow` passed 16/16, asserting x10 uses the normal one-open path and shared overlay. |
| x100 one API request and complete result | PASS with contract evidence - no safe authenticated local x100 pack was available; `npm run test:pack-open-pull-contract` passed 10/10 and `npm run test:pack-opening-flow` passed 16/16, asserting quantity 100 remains valid and uses one protected open path. |
| Pull All shared overlay and no normal-open retry | PASS with contract evidence - no safe authenticated local Pull All campaign was available; `npm run test:pack-open-pull-contract` passed 10/10 and `npm run test:pack-opening-flow` passed 16/16, asserting Pull All uses the shared overlay and separate quote/start/current flow. |
| Last Prize badge retained | PASS with contract evidence - `npm run test:gacha-opening-video` passed 16/16 and asserts `LAST ONE PRIZE!`; `npm run test:pack-open-pull-contract` passed 10/10 and asserts Last Prize remains first-class. |
| Skip direct to summary | PASS - Browser 375 rehearsal clicked `[ SKIP ]` and reached `.gacha-reveal-grid[data-quantity="5"]`; local route recorded 0 normal-open API requests. Source contract also asserts `skipToSummary` sets `summary`. |
| Audible, muted, blocked-autoplay, blocked-file, and Slow 3G paths | PARTIAL PASS - Source contracts passed for muted retry, video error, watchdog, and settled-result fallback (`test:gacha-opening-video` 16/16). Browser directly proved mute control presence and final-summary continuity, but direct sensory audio playback, DevTools file blocking, and Slow 3G throttling were not fully observable through the available Browser wrapper. |
| Zero console errors | PASS for captured local browser route - `browser-observations.json` recorded 0 console errors for the 375 summary recapture. |

## Browser Evidence

- Route: `http://127.0.0.1:3000/local-stock-subsku-test`
- Files captured and inspected:
  - `summary-375x667.png` - true PNG, 375x667, x5 final summary with 4 complete cards visible before inner scroll.
  - `summary-390x844.png` - true PNG, 390x844, x5 final summary with 4 complete cards and controls visible.
  - `summary-430x932.png` - true PNG, 430x932, x5 final summary with 4 complete cards and controls visible.
  - `summary-768x1024.png` - true PNG, 768x1024, x5 final summary with 4 complete cards and controls visible.
  - `summary-1440x900.png` - true PNG, 1440x900, x5 final summary with 4 complete cards and controls visible.
  - `summary-single-390x844.png` - true PNG, 390x844, x1 final summary with one centered card.
- Request counts from captured local route:
  - Local visual route database writes: 0.
  - `POST /api/ynot/gacha/open` during local visual recapture: 0, expected because the route is a localhost-only in-memory rehearsal.
- 375x667 DOM measurement:
  - Before scroll: 5 `.gacha-reveal-card` nodes, 4 complete cards visible, 0 console errors, 0 normal-open API requests.
  - Footer reachability limitation: browser scroll attempt did not move the overlay enough to bring `Back to pack detail`, `View collection`, or the preference toggle into the 375x667 viewport. Source contract still asserts the phone overlay has `overflow-y: auto`, but this browser pass did not prove the footer row reachable on 375x667.

## Automated Verification

| Command | Exit | Count / note |
| --- | ---: | --- |
| `npm run test:gacha-opening-video` | 0 | 16/16 passing |
| `npm run test:pack-opening-flow` | 0 | 16/16 passing |
| `npm run test:pack-open-pull-contract` | 0 | 10/10 passing |
| `npm run test:gacha-open-launch-safety` | 0 | 7/7 passing |
| `npm run test:gacha-open-performance` | 0 | 5/5 passing |
| `npm run test:gacha-open-bundle` | 0 | 3/3 passing |
| `npm run test:local-stock-subsku-flow` | 0 | 5/5 passing |
| `npm run test:subsku-images` | 0 | 14/14 passing |
| `npm run test:pack-open-privacy` | 1 | 22/23 passing; unchanged branch-start test expects `campaignVisibility: "public"` in `(store)/packs/page.tsx`, while unchanged source now delegates it inside `PackCatalogRoute.tsx`. |
| `npm run test:rate-limits` | 0 | 3/3 passing |
| `npm run typecheck` | 0 | Passed |
| `npm run lint` | 1 | Known unchanged `PhotoUploader.tsx:63:21` `react-hooks/refs`; 2 errors, 26 warnings. |
| `npm run cf:build:website` | 0 | Passed; OpenNext worker generated successfully. |
| `npx eslint src/features/ynot/GachaRevealOverlay.tsx src/features/ynot/gacha-opening-video.ts` | 0 | Focused lint passed for changed TS/TSX files. |

## Protected Diff Proof

- `git diff --name-only -- Website/src/app/api/ynot/gacha/open/route.ts Database Website/src/features/ynot/data.ts Website/src/features/ynot/types.ts Website/src/features/ynot/gacha-animation-pref.ts` printed nothing.
- `git diff -- Website/src/features/ynot/client.tsx` printed nothing.
- `git diff --quiet 116eb3261f8dd0eec915a1bc4f423ca12b10d97e..HEAD -- 'Website/src/app/(store)/packs/page.tsx' Website/src/features/ynot/PackCatalogRoute.tsx Website/scripts/test-pack-open-privacy.mjs` exited 0, so the `test:pack-open-privacy` failure is not introduced by this visual branch.
- `git diff --quiet 116eb3261f8dd0eec915a1bc4f423ca12b10d97e..HEAD -- Website/src/features/marketplace-ui/sell/PhotoUploader.tsx` exited 0, so the lint error file is unchanged from branch start.

## Limitations / Failures

- FAIL: Complete Task 6 gate is not clean because `npm run test:pack-open-privacy` exits 1. This failure is outside Task 6 evidence ownership and unchanged from branch start, so it was not fixed here.
- FAIL/LIMITATION: 375x667 footer reachability was not proved by real browser scroll. The four-card viewport itself is proved, but final dock/navigation/preference controls are below the initial 667px viewport in the captured DOM measurement.
- LIMITATION: x10, x100, and Pull All were verified by existing contract suites only. No non-production authenticated campaign was available without credential or production risk.
- LIMITATION: Browser wrapper did not expose direct DevTools request blocking or network throttling controls; blocked-file, autoplay retry, and watchdog behavior are covered by focused source-contract tests rather than direct sensory observation.
