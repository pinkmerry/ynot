# Gacha Opening Video and Mobile Result Grid Design

**Status:** Owner-approved for implementation planning

**Date:** 2026-08-20

**Related plan:** `docs/superpowers/plans/2026-08-20-gacha-opening-video-mobile-results.md`

## Objective

Replace the intermediate spinning tier card and full-screen tier result in the shared YNOTT gacha reveal with one of three randomized portrait videos, while preserving the existing server result, reward spotlight, final prize summary, wallet and stock behavior, Last Prize behavior, repeat actions, and navigation.

The multi-prize summary must keep two columns but expose two complete rows—four prizes—before its internal list scrolls. A single-prize result remains one large centered card.

## Current Evidence

- `Website/src/features/ynot/client.tsx` completes `POST /api/ynot/gacha/open`, applies the wallet snapshot, applies remaining-stock data, and stores one `YnotGachaOpenResult` before rendering the reveal overlay.
- `Website/src/features/ynot/GachaRevealOverlay.tsx` is a client-side presentation component. It does not award prizes, debit a wallet, reserve stock, or call the open API.
- The current animated sequence is `reveal -> tierSpin -> tier -> spotlight -> summary`.
- The existing Skip action goes directly to `summary`; that behavior must remain unchanged.
- Normal opens and Pull All highlights both render the same `GachaRevealOverlay` component.
- Active tier-animation database rows currently have no video, poster, or sound URL. The admin storage/API/page remains a supported future override and is not removed by this work.
- The existing multi-result grid uses two columns but constrains itself to `clamp(220px, 40vh, 360px)`, and to `34vh` on short screens. That height commonly shows only one complete row.

## Approved Reveal Sequence

### Animated path

1. The existing customer action settles through the existing API/RPC path exactly once.
2. The overlay receives the already-settled, immutable prize result.
3. The existing Y-Pack CSS/image opening motion plays.
4. One opening video plays.
5. The existing featured-prize spotlight plays for `2100ms`.
6. The existing final result summary renders every returned item.

The new state sequence is:

```text
reveal -> openingVideo -> spotlight -> summary
```

The following intermediate states and their UI are removed:

```text
tierSpin
tier
```

### Skip and accessibility paths

- Pressing `[ SKIP ]` during any non-summary stage continues directly to `summary`, matching current behavior.
- The existing “Skip animation next time” preference continues to open directly on `summary` unless `forceAnimation` is true.
- `prefers-reduced-motion: reduce` continues to open directly on `summary` unless `forceAnimation` is true.
- Skipping animation never changes, recomputes, or retries the settled result.

## Final Result Contract

The summary retains:

- the highest public prize tier in the summary eyebrow;
- the displayed pull count;
- the owner-supplied Pull All title and summary note;
- every returned prize image or existing placeholder;
- the Last Prize gold frame and “LAST ONE PRIZE!” badge;
- remaining-stock messaging;
- normal repeat-pull actions and Pull All action;
- Back to pack detail, View collection, and animation-preference controls.

“Remove tier showing” refers only to the intermediate full-screen tier state. Tier information attached to the actual final prize result remains visible.

## Video Sources

### Universal production videos

| Source file | Current bytes | Current duration | Delivery filename |
| --- | ---: | ---: | --- |
| `Gacha_VDO_1.mp4` | 3,361,642 | 6.583 seconds | `gacha-opening-01-v1.mp4` |
| `Gacha_VDO_2.mp4` | 3,932,419 | 7.292 seconds | `gacha-opening-02-v1.mp4` |
| `Gacha_VDO_3.mp4` | 3,838,196 | 7.125 seconds | `gacha-opening-03-v1.mp4` |

All three current delivery candidates are:

- MP4 containers;
- H.264 video;
- AAC stereo audio;
- `720x1280` portrait (`9:16`);
- `24fps`;
- below `4.0MB` before fast-start remuxing.

They are acceptable at their current visual bitrate. Do not recompress them again. Apply a lossless `PresetPassthrough` remux so the MP4 `moov` atom precedes `mdat`, allowing playback metadata to arrive before the full media payload.

The clips are not exactly eight seconds after the CapCut reduction. Playback advances on the real `ended` event; it must not pad, freeze, crop, speed-change, or wait for a fixed eight-second timer.

### Local source organization

```text
Media/Gacha/source-masters/
├── Random_animation_1.mp4
├── Random_animation_2.mp4
└── Random_animation_3.mp4

Media/Gacha/capcut-exports/
├── Gacha_VDO_1.mp4
├── Gacha_VDO_2.mp4
└── Gacha_VDO_3.mp4
```

`Media/Gacha/` is local source material and is ignored by Git. It is not part of the Cloudflare website bundle.

### Website delivery organization

```text
Website/public/reveal-animations/
├── gacha-opening-01-v1.mp4
├── gacha-opening-01-v1-poster.avif
├── gacha-opening-02-v1.mp4
├── gacha-opening-02-v1-poster.avif
├── gacha-opening-03-v1.mp4
└── gacha-opening-03-v1-poster.avif
```

The filenames are versioned so a future replacement can use `v2` without relying on stale cached bytes.

## Video Selection Contract

- Universal selection receives no prize, tier, quantity, odds, card, wallet, stock, or Last Prize input.
- A session-scoped shuffle bag stores state under `gacha:openingVideoBag:v1`.
- Each of videos `01`, `02`, and `03` plays once before the bag refills.
- The final video of one bag cannot immediately repeat as the first video of the next bag.
- A missing, corrupt, blocked, or quota-limited `sessionStorage` falls back to an in-memory bag.
- Selection occurs once per animated overlay instance after client mount.
- Auto-skipped and reduced-motion summaries do not consume a video from the bag.
- Only the selected file uses `preload="auto"` during the Y-Pack motion; the other two files are not mounted or preloaded.

## Admin Tier-Animation Compatibility

The existing active tier-animation video remains an explicit presentation override:

1. If the highest non-Last-Prize tier has an active `videoUrl`, play that configured video after the Y-Pack motion.
2. Otherwise, play the selected universal video.
3. Never play both in one reveal.
4. If the admin record has `soundUrl`, mute the video's embedded track and play the separate sound once to prevent doubled audio.
5. If the admin record has no `soundUrl`, use its embedded audio like a universal video.
6. Use `max(10000, durationMs + 2000)` as the admin-video watchdog, preserving longer configured files.

No database, type, API, upload limit, admin page, or data-loader change is required.

## Playback and Failure Contract

- Use the native HTML `<video>` element with `playsInline`, `preload="auto"`, and an MP4 source.
- Attempt playback using the current mute preference.
- If audible autoplay is rejected, retry the same settled reveal once with that video muted.
- If the muted retry is rejected, the media emits `error`, or the watchdog expires, continue to `spotlight`.
- A universal-video watchdog is exactly `10000ms`.
- Playback failure does not close the overlay, call the API, repeat a pull, or alter the final result.
- Leaving the video stage pauses the video and any separate admin sound.
- The mute control reflects the effective mute state, including an autoplay-forced mute, and allows a later user click to retry audible playback.

## Mobile Result Layout

### Single prize

- One column.
- Maximum card width remains `280px`.
- The card remains centered.

### Multiple prizes

- Exactly two columns on phone, tablet, and desktop.
- Grid maximum width is `348px` with a `10px` gap, keeping cards near their current phone width.
- The grid viewport uses `min(486px, calc(140vw - 46px))`, which follows the actual two-column `5:7` card height on narrow phones and caps at two rows on wider screens.
- This exposes two complete `5:7` card rows before internal vertical scrolling begins.
- x10, x100, and Pull All highlight results all use the same multi-result rule.
- The entire summary overlay may scroll on short phones so the header, four-card viewport, repeat actions, and footer remain reachable without clipping.
- The two final dock actions use two phone columns and a compact `56px` minimum height.
- Dock hint text may hide at widths up to `420px`; the action labels remain visible.
- Safe-area insets remain respected.

## Functional Boundaries

This work must not modify:

- `Website/src/app/api/ynot/gacha/open/route.ts`;
- files under `Database/`;
- wallet deduction or public wallet snapshot logic;
- inventory reservation, stock hydration, or remaining-stock calculation;
- prize selection, tier assignment, odds, Last Prize, or result ordering;
- idempotency keys or duplicate-request guards;
- normal x1/x10/x100 quantity handling;
- Pull All quote, start, processing, completion, or highlight selection;
- collection, exchange, shipping, authentication, or admin authorization logic.

No new npm dependency is allowed.

## Acceptance Criteria

1. The animated flow is `reveal -> openingVideo -> spotlight -> summary`.
2. No `tierSpin` or intermediate `tier` stage, markup, selector, or keyframe remains.
3. The Y-Pack motion still renders before the video.
4. One and only one opening video mounts for a reveal.
5. The universal selector is prize-independent, exhausts all three variants per bag, and prevents a boundary repeat.
6. All three public MP4 files exist, remain at or below `4.2MB`, and have `moov` before `mdat`.
7. All three clips retain H.264 video, AAC audio, `720x1280`, and their current durations after the fast-start remux.
8. Video end, error, rejected autoplay, and timeout all reach the already-settled result without a second API request.
9. Skip, auto-skip, and reduced-motion behavior remain direct-to-summary.
10. Spotlight and final-summary prize images continue using the returned item image.
11. Tier labels and Last Prize remain visible in the final result.
12. A multi-result phone summary shows four complete cards before inner scrolling; x1 remains one large centered card.
13. All repeat and navigation controls remain reachable and clickable at `375x667`, `390x844`, and `430x932`.
14. Normal open and Pull All continue to share the overlay without changing their settlement logic.
15. Targeted tests, typecheck, lint, and the Cloudflare website build pass.

## Out of Scope

- Changing prize odds, tiers, card ordering, or reward selection.
- Changing the API response or database schema.
- Replacing the final prize cards with video.
- Adding a video-management dependency or third-party video player.
- Re-encoding the approved CapCut exports.
- Deploying to production as part of plan creation.
