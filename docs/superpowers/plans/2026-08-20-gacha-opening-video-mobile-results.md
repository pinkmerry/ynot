# Gacha Opening Video and Mobile Result Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the intermediate spinning-tier presentation with one randomized opening video while retaining the Y-Pack motion, spotlight, final prize result, transaction behavior, and a phone-friendly four-card result viewport.

**Architecture:** Keep reward settlement upstream and immutable: `client.tsx` continues to call the existing open or Pull All path, then passes one completed result into `GachaRevealOverlay`. Add a small client-safe shuffle-bag module for prize-independent media selection, refactor the overlay state machine to `reveal -> openingVideo -> spotlight -> summary`, and constrain all media/layout work to public assets, the overlay, and CSS. Preserve the optional admin tier video as a single-source override so the admin surface remains meaningful without playing two videos.

**Tech Stack:** Next.js `^16.2.5` App Router, React `19.2.4`, TypeScript `^5`, native HTML5 video, CSS, Node `node:test`, existing TypeScript compiler API, macOS `avconvert`/Quick Look/SIPS for lossless media preparation, Cloudflare Workers static assets.

**Spec:** `docs/superpowers/specs/2026-08-20-gacha-opening-video-design.md`

## Global Constraints

- Treat `docs/superpowers/specs/2026-08-20-gacha-opening-video-design.md` as the product source of truth.
- This is one shared reveal-overlay subsystem; do not split settlement, Pull All, or admin video management into new implementations.
- Preserve one API request, one atomic RPC/result, one wallet update, and one reveal result for normal x1/x10/x100 opens.
- Preserve Pull All quote/start/processing/highlight behavior; only its shared presentation changes.
- Do not modify `Website/src/app/api/ynot/gacha/open/route.ts` or any file under `Database/`.
- Do not modify prize selection, tier assignment, odds, Last Prize, item ordering, wallet, stock, collection, exchange, shipping, authentication, or authorization logic.
- Keep the Y-Pack motion, featured-prize spotlight, final tier/result summary, Last Prize badge, repeat actions, navigation, mute preference, auto-skip preference, and direct-to-summary Skip behavior.
- Remove only the intermediate `tierSpin` and `tier` states and their unused CSS/keyframes.
- Universal video selection must not consume prize, tier, quantity, odds, wallet, stock, or Last Prize data.
- Use the current three CapCut exports without further re-encoding; only apply lossless MP4 fast-start remuxing.
- Load only the selected video; do not preload all three.
- Advance on `ended`, not a fixed eight-second delay.
- Use a `10000ms` universal watchdog and `max(10000, durationMs + 2000)` for an admin override.
- Keep x1 as one centered card; keep multi-result layouts at two columns with two complete visible rows before internal scrolling.
- Add no npm dependency.
- Read `Website/node_modules/next/dist/docs/01-app/02-guides/videos.md`, `Website/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/public-folder.md`, and `Website/node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` before editing application code.
- Preserve unrelated work in the dirty worktree. The six root MP4 files are task inputs; do not delete the masters.
- Every implementation commit must follow the repository Lore Commit Protocol.

---

## File Map and Responsibilities

### Create

- `Website/src/features/ynot/gacha-opening-video.ts` — universal video manifest, deterministic shuffle-bag transition, browser session persistence, and in-memory fallback; it knows nothing about prizes.
- `Website/scripts/test-gacha-opening-video.mjs` — executable helper tests, source-contract tests, media-atom checks, and visual-layout contract checks.
- `Website/public/reveal-animations/gacha-opening-01-v1.mp4` — fast-start delivery copy derived from `Gacha_VDO_1.mp4`.
- `Website/public/reveal-animations/gacha-opening-02-v1.mp4` — fast-start delivery copy derived from `Gacha_VDO_2.mp4`.
- `Website/public/reveal-animations/gacha-opening-03-v1.mp4` — fast-start delivery copy derived from `Gacha_VDO_3.mp4`.
- `Website/public/reveal-animations/gacha-opening-01-v1-poster.avif` — lightweight loading poster for video 01.
- `Website/public/reveal-animations/gacha-opening-02-v1-poster.avif` — lightweight loading poster for video 02.
- `Website/public/reveal-animations/gacha-opening-03-v1-poster.avif` — lightweight loading poster for video 03.

### Modify

- `.gitignore` — ignore `/Media/Gacha/` local source/master storage while retaining committed website delivery assets.
- `Website/package.json` — add `test:gacha-opening-video` using the existing Node test runner.
- `Website/src/features/ynot/GachaRevealOverlay.tsx` — state-machine refactor, selected-video preload/playback, autoplay fallback, admin override, cleanup, and unchanged final summary.
- `Website/src/app/globals.css` — remove obsolete tier-spin/tier styles, add portrait-video stage styles, and enlarge the multi-result viewport to two complete rows with a scroll-safe phone summary.
- `Website/scripts/test-pack-opening-flow.mjs` — retain existing settlement/caller checks and add the shared-overlay stage-order assertion where it belongs with the pack-flow contract.

### Move locally but do not commit

- `Random_animation_1.mp4` -> `Media/Gacha/source-masters/Random_animation_1.mp4`
- `Random_animation_2.mp4` -> `Media/Gacha/source-masters/Random_animation_2.mp4`
- `Random_animation_3.mp4` -> `Media/Gacha/source-masters/Random_animation_3.mp4`
- `Gacha_VDO_1.mp4` -> `Media/Gacha/capcut-exports/Gacha_VDO_1.mp4`
- `Gacha_VDO_2.mp4` -> `Media/Gacha/capcut-exports/Gacha_VDO_2.mp4`
- `Gacha_VDO_3.mp4` -> `Media/Gacha/capcut-exports/Gacha_VDO_3.mp4`

### Verify only; no edits expected

- `Website/src/features/ynot/client.tsx` — normal and Pull All callers continue passing completed results into the overlay.
- `Website/src/app/(store)/gacha/[campaignId]/open/page.tsx` — campaign and tier-animation reads remain parallel and unchanged.
- `Website/src/features/ynot/data.ts` — tier-animation loader remains unchanged.
- `Website/src/features/ynot/types.ts` — `YnotTierAnimation` remains unchanged.
- `Website/src/features/ynot/gacha-animation-pref.ts` — existing localStorage preference contract remains unchanged.
- `Website/src/app/api/ynot/gacha/open/route.ts` — open transaction/API remains unchanged.
- `Database/` — no migrations or SQL changes.

---

### Task 1: Lock Settlement and Final-Result Behavior Before Visual Edits

**Files:**
- Create: `Website/scripts/test-gacha-opening-video.mjs`
- Modify: `Website/package.json`
- Read: `Website/src/features/ynot/client.tsx:1073-1282`
- Read: `Website/src/features/ynot/GachaRevealOverlay.tsx:488-670`

**Interfaces:**
- Consumes: the existing `fireOpen()`, normal `revealOverlay`, Pull All `pullAllOverlay`, and summary markup.
- Produces: `npm run test:gacha-opening-video`, a focused regression gate reused by Tasks 2-6.

- [ ] **Step 1: Add the package script**

Insert this script next to the existing gacha test scripts in `Website/package.json`:

```json
"test:gacha-opening-video": "node --test scripts/test-gacha-opening-video.mjs"
```

- [ ] **Step 2: Create the characterization-test scaffold**

Create `Website/scripts/test-gacha-opening-video.mjs` with these utilities and preservation tests:

```js
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function sectionBetween(source, startPattern, endPattern, label) {
  const start = source.search(startPattern);
  assert.notEqual(start, -1, `${label} start exists`);
  const rest = source.slice(start);
  const end = rest.search(endPattern);
  assert.notEqual(end, -1, `${label} end exists`);
  return rest.slice(0, end);
}

function loadTsModule(path) {
  const source = read(path);
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const cjsModule = { exports: {} };
  vm.runInNewContext(outputText, {
    exports: cjsModule.exports,
    module: cjsModule,
    require,
  });
  return cjsModule.exports;
}

test("gacha overlay remains downstream of one settled normal-open result", () => {
  const client = read("src/features/ynot/client.tsx");
  const overlay = read("src/features/ynot/GachaRevealOverlay.tsx");
  const fireOpen = sectionBetween(
    client,
    /function fireOpen\b/,
    /function openAgain\b/,
    "fireOpen",
  );
  const normalOverlay = sectionBetween(
    client,
    /const revealOverlay =/,
    /const pullAllOverlay =/,
    "normal reveal overlay",
  );

  assert.equal(
    (fireOpen.match(/postJson\("\/api\/ynot\/gacha\/open"/g) ?? []).length,
    1,
  );
  assert.match(fireOpen, /setRevealResult\(result\)/);
  assert.match(fireOpen, /applyWalletBalanceCoins/);
  assert.match(fireOpen, /setRemainingState/);
  assert.match(normalOverlay, /result=\{revealResult\}/);
  assert.match(normalOverlay, /quantity=\{quantity\}/);
  assert.doesNotMatch(overlay, /postJson\(|fetch\(|createServiceSupabaseClient/);
});

test("normal and Pull All keep one shared final-result overlay", () => {
  const client = read("src/features/ynot/client.tsx");
  const normalOverlay = sectionBetween(
    client,
    /const revealOverlay =/,
    /const pullAllOverlay =/,
    "normal reveal overlay",
  );
  const pullAllOverlay = sectionBetween(
    client,
    /const pullAllOverlay =/,
    /const pendingOverlay =/,
    "Pull All reveal overlay",
  );

  assert.match(normalOverlay, /<GachaRevealOverlay/);
  assert.match(normalOverlay, /tierAnimations=\{tierAnimations\}/);
  assert.match(pullAllOverlay, /<GachaRevealOverlay/);
  assert.match(pullAllOverlay, /result=\{pullAllRevealOverlayResult\}/);
  assert.match(pullAllOverlay, /displayQuantity=\{pullAllRevealSession\.totalPurchasedRewards\}/);
  assert.match(pullAllOverlay, /tierAnimations=\{tierAnimations\}/);
});

test("final prize summary retains result, tier, Last Prize, and actions", () => {
  const overlay = read("src/features/ynot/GachaRevealOverlay.tsx");
  const summary = sectionBetween(
    overlay,
    /\{stage === "summary"/,
    /\{stage !== "summary"/,
    "final prize summary",
  );

  assert.match(summary, /tierLabel\(highestTier, language\)/);
  assert.match(summary, /items\.map\(\(item\)/);
  assert.match(summary, /className="gacha-reveal-card-image"/);
  assert.match(summary, /item\.isLastPrize === true/);
  assert.match(summary, /LAST ONE PRIZE!/);
  assert.match(summary, /onOpenAgain\?\.\(option\.quantity\)/);
  assert.match(summary, /onPullAllAgain\?\.\(\)/);
  assert.match(summary, /onClick=\{onFinish\}/);
  assert.match(summary, /onClick=\{onClose\}/);
});
```

- [ ] **Step 3: Run the characterization test before production edits**

Run:

```bash
cd Website
npm run test:gacha-opening-video
```

Expected: `3` tests pass and `0` fail. A failure here means the local code differs from the mapped baseline; reconcile the test with the current source before continuing.

- [ ] **Step 4: Run the existing pack-flow baseline**

Run:

```bash
cd Website
npm run test:pack-opening-flow
npm run test:pack-open-pull-contract
npm run test:gacha-open-launch-safety
npm run test:gacha-open-bundle
npm run test:local-stock-subsku-flow
npm run typecheck
```

Expected: all commands exit `0`; the previously observed baseline is `40` targeted tests passing across these five test scripts, plus a clean typecheck.

- [ ] **Step 5: Commit the behavior lock**

```bash
git add Website/package.json Website/scripts/test-gacha-opening-video.mjs
git commit \
  -m "Protect settled rewards while the reveal presentation changes" \
  --trailer "Constraint: Keep normal and Pull All settlement outside the overlay" \
  --trailer "Confidence: high" \
  --trailer "Scope-risk: narrow" \
  --trailer "Directive: Do not move API, wallet, stock, or prize logic into GachaRevealOverlay" \
  --trailer "Tested: npm run test:gacha-opening-video; npm run test:pack-opening-flow; npm run test:pack-open-pull-contract; npm run typecheck" \
  --trailer "Not-tested: New video playback is not implemented in this commit"
```

---

### Task 2: Organize, Fast-Start, and Validate the Three Videos

**Files:**
- Modify: `.gitignore`
- Modify: `Website/scripts/test-gacha-opening-video.mjs`
- Create: `Website/public/reveal-animations/gacha-opening-01-v1.mp4`
- Create: `Website/public/reveal-animations/gacha-opening-02-v1.mp4`
- Create: `Website/public/reveal-animations/gacha-opening-03-v1.mp4`
- Create: `Website/public/reveal-animations/gacha-opening-01-v1-poster.avif`
- Create: `Website/public/reveal-animations/gacha-opening-02-v1-poster.avif`
- Create: `Website/public/reveal-animations/gacha-opening-03-v1-poster.avif`
- Move locally: the six root MP4 inputs into `Media/Gacha/source-masters/` and `Media/Gacha/capcut-exports/`

**Interfaces:**
- Consumes: the six root MP4 inputs and macOS `avconvert`, `qlmanage`, `sips`, `mdls`.
- Produces: six versioned public assets and the exact URLs consumed by `GACHA_OPENING_VIDEOS` in Task 3.

- [ ] **Step 1: Extend the test with MP4 atom and size checks**

Append this code to `Website/scripts/test-gacha-opening-video.mjs`:

```js
const openingMedia = [
  {
    id: "01",
    video: "public/reveal-animations/gacha-opening-01-v1.mp4",
    poster: "public/reveal-animations/gacha-opening-01-v1-poster.avif",
  },
  {
    id: "02",
    video: "public/reveal-animations/gacha-opening-02-v1.mp4",
    poster: "public/reveal-animations/gacha-opening-02-v1-poster.avif",
  },
  {
    id: "03",
    video: "public/reveal-animations/gacha-opening-03-v1.mp4",
    poster: "public/reveal-animations/gacha-opening-03-v1-poster.avif",
  },
];

function topLevelAtomOffset(buffer, wantedType) {
  let offset = 0;
  while (offset + 8 <= buffer.length) {
    let size = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    let headerSize = 8;
    if (size === 1) {
      assert.ok(offset + 16 <= buffer.length, `${type} extended header is complete`);
      size = Number(buffer.readBigUInt64BE(offset + 8));
      headerSize = 16;
    } else if (size === 0) {
      size = buffer.length - offset;
    }
    assert.ok(size >= headerSize, `${type} atom has a valid size`);
    if (type === wantedType) return offset;
    offset += size;
  }
  return -1;
}

test("opening media is versioned, bounded, and fast-start ready", () => {
  for (const asset of openingMedia) {
    const videoUrl = new URL(`../${asset.video}`, import.meta.url);
    const posterUrl = new URL(`../${asset.poster}`, import.meta.url);
    assert.ok(existsSync(videoUrl), `${asset.id} video exists`);
    assert.ok(existsSync(posterUrl), `${asset.id} poster exists`);

    const videoStat = statSync(videoUrl);
    const posterStat = statSync(posterUrl);
    assert.ok(videoStat.size >= 2_000_000, `${asset.id} video is not an empty placeholder`);
    assert.ok(videoStat.size <= 4_200_000, `${asset.id} video stays at or below 4.2MB`);
    assert.ok(posterStat.size > 0, `${asset.id} poster is not empty`);
    assert.ok(posterStat.size <= 200_000, `${asset.id} poster stays at or below 200KB`);

    const bytes = readFileSync(videoUrl);
    assert.equal(bytes.toString("ascii", 4, 8), "ftyp", `${asset.id} is an MP4`);
    const moov = topLevelAtomOffset(bytes, "moov");
    const mdat = topLevelAtomOffset(bytes, "mdat");
    assert.notEqual(moov, -1, `${asset.id} has a moov atom`);
    assert.notEqual(mdat, -1, `${asset.id} has an mdat atom`);
    assert.ok(moov < mdat, `${asset.id} has fast-start atom order`);
  }
});
```

- [ ] **Step 2: Run the media test and confirm the expected failure**

Run:

```bash
cd Website
npm run test:gacha-opening-video
```

Expected: FAIL because `public/reveal-animations/gacha-opening-01-v1.mp4` does not exist yet. The three characterization tests remain green.

- [ ] **Step 3: Ignore and create the local media archive**

Add this block to the root `.gitignore`:

```gitignore
# Local gacha video masters and editor exports; delivery copies live in Website/public.
/Media/Gacha/
```

Then organize every source file:

```bash
mkdir -p Media/Gacha/source-masters Media/Gacha/capcut-exports Website/public/reveal-animations
mv Random_animation_1.mp4 Media/Gacha/source-masters/Random_animation_1.mp4
mv Random_animation_2.mp4 Media/Gacha/source-masters/Random_animation_2.mp4
mv Random_animation_3.mp4 Media/Gacha/source-masters/Random_animation_3.mp4
mv Gacha_VDO_1.mp4 Media/Gacha/capcut-exports/Gacha_VDO_1.mp4
mv Gacha_VDO_2.mp4 Media/Gacha/capcut-exports/Gacha_VDO_2.mp4
mv Gacha_VDO_3.mp4 Media/Gacha/capcut-exports/Gacha_VDO_3.mp4
```

Expected: the root no longer contains loose MP4 files, both local source folders contain three files, and `git status --short` does not list `Media/Gacha/`.

- [ ] **Step 4: Produce lossless fast-start delivery copies**

Run from the repository root:

```bash
avconvert --source "Media/Gacha/capcut-exports/Gacha_VDO_1.mp4" --preset PresetPassthrough --output "Website/public/reveal-animations/gacha-opening-01-v1.mp4" --replace
avconvert --source "Media/Gacha/capcut-exports/Gacha_VDO_2.mp4" --preset PresetPassthrough --output "Website/public/reveal-animations/gacha-opening-02-v1.mp4" --replace
avconvert --source "Media/Gacha/capcut-exports/Gacha_VDO_3.mp4" --preset PresetPassthrough --output "Website/public/reveal-animations/gacha-opening-03-v1.mp4" --replace
```

Expected: each command completes successfully, retains the H.264 and AAC tracks, and changes only container layout/metadata rather than recompressing frames.

- [ ] **Step 5: Generate compact AVIF posters from the delivery copies**

Run from the repository root:

```bash
poster_work_dir="$(mktemp -d /tmp/ynott-gacha-posters.XXXXXX)"
qlmanage -t -s 720 -o "$poster_work_dir" Website/public/reveal-animations/gacha-opening-01-v1.mp4
qlmanage -t -s 720 -o "$poster_work_dir" Website/public/reveal-animations/gacha-opening-02-v1.mp4
qlmanage -t -s 720 -o "$poster_work_dir" Website/public/reveal-animations/gacha-opening-03-v1.mp4
sips -s format avif "$poster_work_dir/gacha-opening-01-v1.mp4.png" --out Website/public/reveal-animations/gacha-opening-01-v1-poster.avif
sips -s format avif "$poster_work_dir/gacha-opening-02-v1.mp4.png" --out Website/public/reveal-animations/gacha-opening-02-v1-poster.avif
sips -s format avif "$poster_work_dir/gacha-opening-03-v1.mp4.png" --out Website/public/reveal-animations/gacha-opening-03-v1-poster.avif
```

Inspect the three AVIF files before removing the exact temporary directory:

```bash
open Website/public/reveal-animations/gacha-opening-01-v1-poster.avif
open Website/public/reveal-animations/gacha-opening-02-v1-poster.avif
open Website/public/reveal-animations/gacha-opening-03-v1-poster.avif
rm -r "$poster_work_dir"
```

Expected: every poster shows a real frame from its matching clip, has no unrelated Quick Look border, and stays below `200KB`.

- [ ] **Step 6: Verify codec, dimensions, duration, and atom order**

Run:

```bash
mdls -name kMDItemCodecs -name kMDItemDurationSeconds -name kMDItemPixelWidth -name kMDItemPixelHeight Website/public/reveal-animations/gacha-opening-01-v1.mp4
mdls -name kMDItemCodecs -name kMDItemDurationSeconds -name kMDItemPixelWidth -name kMDItemPixelHeight Website/public/reveal-animations/gacha-opening-02-v1.mp4
mdls -name kMDItemCodecs -name kMDItemDurationSeconds -name kMDItemPixelWidth -name kMDItemPixelHeight Website/public/reveal-animations/gacha-opening-03-v1.mp4
cd Website
npm run test:gacha-opening-video
```

Expected:

- each `mdls` result lists `H.264` and `MPEG-4 AAC`;
- width is `720` and height is `1280`;
- durations remain approximately `6.583`, `7.292`, and `7.125` seconds;
- the test reports `4` passing tests and `0` failures.

- [ ] **Step 7: Commit only delivery assets and the local-ignore rule**

```bash
git add .gitignore Website/public/reveal-animations Website/scripts/test-gacha-opening-video.mjs
git commit \
  -m "Deliver opening clips without another quality loss" \
  --trailer "Constraint: Preserve the approved CapCut picture and embedded sound" \
  --trailer "Rejected: Re-encode at a lower bitrate | Current files are already below 4MB and visually accepted" \
  --trailer "Confidence: high" \
  --trailer "Scope-risk: narrow" \
  --trailer "Directive: Replace media with a new versioned filename instead of overwriting cached v1 bytes" \
  --trailer "Tested: MP4 H.264/AAC metadata; 720x1280 dimensions; duration; moov-before-mdat; npm run test:gacha-opening-video" \
  --trailer "Not-tested: Browser autoplay behavior is covered after overlay integration"
```

---

### Task 3: Implement the Prize-Independent Session Shuffle Bag

**Files:**
- Create: `Website/src/features/ynot/gacha-opening-video.ts`
- Modify: `Website/scripts/test-gacha-opening-video.mjs`

**Interfaces:**
- Consumes: `StorageLike.getItem()`, `StorageLike.setItem()`, and an injectable `RandomSource` returning a number in `[0, 1)`.
- Produces: `GACHA_OPENING_VIDEOS`, `takeNextGachaOpeningVideo(state, random)`, and `nextSessionGachaOpeningVideo(storage, random)`.

- [ ] **Step 1: Append failing shuffle-bag tests**

Append this code to `Website/scripts/test-gacha-opening-video.mjs`:

```js
test("opening video bag uses all three clips before repeating", () => {
  const { takeNextGachaOpeningVideo } = loadTsModule(
    "src/features/ynot/gacha-opening-video.ts",
  );
  let state = { remaining: [], lastPlayed: null };
  const played = [];

  for (let index = 0; index < 7; index += 1) {
    const next = takeNextGachaOpeningVideo(state, () => 0);
    played.push(next.video.id);
    state = next.state;
  }

  assert.equal(new Set(played.slice(0, 3)).size, 3);
  assert.equal(new Set(played.slice(3, 6)).size, 3);
  assert.notEqual(played[2], played[3]);
});

test("opening video session state persists and tolerates corrupt storage", () => {
  const { nextSessionGachaOpeningVideo } = loadTsModule(
    "src/features/ynot/gacha-opening-video.ts",
  );
  const values = new Map([["gacha:openingVideoBag:v1", "not-json"]]);
  const storage = {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };

  const first = nextSessionGachaOpeningVideo(storage, () => 0);
  const second = nextSessionGachaOpeningVideo(storage, () => 0);
  const persisted = JSON.parse(values.get("gacha:openingVideoBag:v1"));

  assert.notEqual(first.id, second.id);
  assert.equal(persisted.lastPlayed, second.id);
  assert.equal(Array.isArray(persisted.remaining), true);
});

test("opening video manifest contains only the selected public media contract", () => {
  const { GACHA_OPENING_VIDEOS } = loadTsModule(
    "src/features/ynot/gacha-opening-video.ts",
  );
  assert.deepEqual(
    Array.from(GACHA_OPENING_VIDEOS, (video) => ({
      id: video.id,
      src: video.src,
      poster: video.poster,
    })),
    [
      {
        id: "01",
        src: "/reveal-animations/gacha-opening-01-v1.mp4",
        poster: "/reveal-animations/gacha-opening-01-v1-poster.avif",
      },
      {
        id: "02",
        src: "/reveal-animations/gacha-opening-02-v1.mp4",
        poster: "/reveal-animations/gacha-opening-02-v1-poster.avif",
      },
      {
        id: "03",
        src: "/reveal-animations/gacha-opening-03-v1.mp4",
        poster: "/reveal-animations/gacha-opening-03-v1-poster.avif",
      },
    ],
  );
});
```

- [ ] **Step 2: Run the selector tests and confirm the expected failure**

Run:

```bash
cd Website
npm run test:gacha-opening-video
```

Expected: FAIL with `ENOENT` for `src/features/ynot/gacha-opening-video.ts`.

- [ ] **Step 3: Create the complete shuffle-bag module**

Create `Website/src/features/ynot/gacha-opening-video.ts`:

```ts
export type GachaOpeningVideoId = "01" | "02" | "03";

export type GachaOpeningVideo = {
  id: GachaOpeningVideoId;
  src: string;
  poster: string;
};

export type GachaOpeningVideoBagState = {
  remaining: GachaOpeningVideoId[];
  lastPlayed: GachaOpeningVideoId | null;
};

export type GachaOpeningVideoStorage = Pick<Storage, "getItem" | "setItem">;
export type GachaOpeningVideoRandomSource = () => number;

export const GACHA_OPENING_VIDEOS = [
  {
    id: "01",
    src: "/reveal-animations/gacha-opening-01-v1.mp4",
    poster: "/reveal-animations/gacha-opening-01-v1-poster.avif",
  },
  {
    id: "02",
    src: "/reveal-animations/gacha-opening-02-v1.mp4",
    poster: "/reveal-animations/gacha-opening-02-v1-poster.avif",
  },
  {
    id: "03",
    src: "/reveal-animations/gacha-opening-03-v1.mp4",
    poster: "/reveal-animations/gacha-opening-03-v1-poster.avif",
  },
] as const satisfies readonly GachaOpeningVideo[];

const STORAGE_KEY = "gacha:openingVideoBag:v1";
const VIDEO_IDS = GACHA_OPENING_VIDEOS.map((video) => video.id);
const EMPTY_STATE: GachaOpeningVideoBagState = {
  remaining: [],
  lastPlayed: null,
};

let fallbackState: GachaOpeningVideoBagState = EMPTY_STATE;

function isVideoId(value: unknown): value is GachaOpeningVideoId {
  return typeof value === "string" && VIDEO_IDS.includes(value as GachaOpeningVideoId);
}

function normalizeState(value: unknown): GachaOpeningVideoBagState {
  if (!value || typeof value !== "object") return EMPTY_STATE;
  const candidate = value as Partial<GachaOpeningVideoBagState>;
  const remaining = Array.isArray(candidate.remaining)
    ? candidate.remaining.filter(isVideoId).filter((id, index, values) => values.indexOf(id) === index)
    : [];
  return {
    remaining,
    lastPlayed: isVideoId(candidate.lastPlayed) ? candidate.lastPlayed : null,
  };
}

function shuffledVideoIds(
  random: GachaOpeningVideoRandomSource,
): GachaOpeningVideoId[] {
  const ids = [...VIDEO_IDS];
  for (let index = ids.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(random() * (index + 1));
    [ids[index], ids[randomIndex]] = [ids[randomIndex], ids[index]];
  }
  return ids;
}

function refillBag(
  lastPlayed: GachaOpeningVideoId | null,
  random: GachaOpeningVideoRandomSource,
): GachaOpeningVideoId[] {
  const remaining = shuffledVideoIds(random);
  if (lastPlayed && remaining[0] === lastPlayed) {
    const swapIndex = remaining.findIndex((id) => id !== lastPlayed);
    [remaining[0], remaining[swapIndex]] = [remaining[swapIndex], remaining[0]];
  }
  return remaining;
}

export function takeNextGachaOpeningVideo(
  state: GachaOpeningVideoBagState,
  random: GachaOpeningVideoRandomSource = Math.random,
): { video: GachaOpeningVideo; state: GachaOpeningVideoBagState } {
  const normalized = normalizeState(state);
  const remaining = normalized.remaining.length
    ? [...normalized.remaining]
    : refillBag(normalized.lastPlayed, random);
  const nextId = remaining.shift() ?? VIDEO_IDS[0];
  const video = GACHA_OPENING_VIDEOS.find((entry) => entry.id === nextId) ?? GACHA_OPENING_VIDEOS[0];
  return {
    video,
    state: {
      remaining,
      lastPlayed: video.id,
    },
  };
}

function browserSessionStorage(): GachaOpeningVideoStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function nextSessionGachaOpeningVideo(
  storage: GachaOpeningVideoStorage | null = browserSessionStorage(),
  random: GachaOpeningVideoRandomSource = Math.random,
): GachaOpeningVideo {
  let state = fallbackState;
  if (storage) {
    try {
      state = normalizeState(JSON.parse(storage.getItem(STORAGE_KEY) ?? "null"));
    } catch {
      state = EMPTY_STATE;
    }
  }

  const next = takeNextGachaOpeningVideo(state, random);
  fallbackState = next.state;
  if (storage) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(next.state));
    } catch {
      // Private browsing and storage quotas fall back to the in-memory bag.
    }
  }
  return next.video;
}
```

- [ ] **Step 4: Run helper tests and typecheck**

Run:

```bash
cd Website
npm run test:gacha-opening-video
npm run typecheck
```

Expected: `7` tests pass, `0` fail, and TypeScript exits `0`.

- [ ] **Step 5: Verify the public selector has no prize dependency**

Run:

```bash
rg -n "tier|prize|result|odds|wallet|stock|quantity|last.?prize" Website/src/features/ynot/gacha-opening-video.ts
```

Expected: no matches.

- [ ] **Step 6: Commit the visual-only selector**

```bash
git add Website/src/features/ynot/gacha-opening-video.ts Website/scripts/test-gacha-opening-video.mjs
git commit \
  -m "Vary opening presentation without coupling it to rewards" \
  --trailer "Constraint: Universal video choice must be independent of prize outcome" \
  --trailer "Rejected: Select by tier | It would leak outcome into a cosmetic selector and repeat the removed tier presentation" \
  --trailer "Confidence: high" \
  --trailer "Scope-risk: narrow" \
  --trailer "Directive: Keep reward, quantity, wallet, and stock inputs out of this module" \
  --trailer "Tested: npm run test:gacha-opening-video; npm run typecheck" \
  --trailer "Not-tested: React playback lifecycle is implemented in the next task"
```

---

### Task 4: Replace `tierSpin` and `tier` With the Opening-Video Stage

**Files:**
- Modify: `Website/src/features/ynot/GachaRevealOverlay.tsx:3-344`
- Modify: `Website/src/features/ynot/GachaRevealOverlay.tsx:396-454`
- Modify: `Website/scripts/test-gacha-opening-video.mjs`
- Modify: `Website/scripts/test-pack-opening-flow.mjs`

**Interfaces:**
- Consumes: `nextSessionGachaOpeningVideo(): GachaOpeningVideo`, optional `YnotTierAnimation`, `pref.muted`, `pref.autoSkip`, and the existing settled `YnotGachaOpenResult`.
- Produces: `RevealStage = "reveal" | "openingVideo" | "spotlight" | "summary"`, one persistent selected `<video>` during reveal/video stages, and unchanged spotlight/summary output.

- [ ] **Step 1: Add failing state-machine and fallback assertions**

Append this code to `Website/scripts/test-gacha-opening-video.mjs`:

```js
test("overlay uses reveal, opening video, spotlight, and summary only", () => {
  const overlay = read("src/features/ynot/GachaRevealOverlay.tsx");
  assert.match(
    overlay,
    /type RevealStage = "reveal" \| "openingVideo" \| "spotlight" \| "summary";/,
  );
  assert.match(overlay, /setStage\("openingVideo"\)/);
  assert.match(overlay, /stage !== "openingVideo"/);
  assert.match(overlay, /setStage\("spotlight"\)/);
  assert.doesNotMatch(overlay, /stage === "tierSpin"/);
  assert.doesNotMatch(overlay, /stage === "tier"/);
  assert.doesNotMatch(overlay, /TIER_SPIN_MS|TIER_RESULT_MS/);
});

test("selected video preloads once and advances without a fixed eight-second timer", () => {
  const overlay = read("src/features/ynot/GachaRevealOverlay.tsx");
  assert.match(overlay, /nextSessionGachaOpeningVideo\(\)/);
  assert.match(overlay, /preload="auto"/);
  assert.match(overlay, /playsInline/);
  assert.match(overlay, /onEnded=\{finishOpeningVideo\}/);
  assert.match(overlay, /onError=\{handleOpeningVideoError\}/);
  assert.match(overlay, /OPENING_VIDEO_WATCHDOG_MS = 10_000/);
  assert.doesNotMatch(overlay, /setTimeout\([^)]*8_000|setTimeout\([^)]*8000/);
});

test("skip and non-media fallbacks preserve access to the settled result", () => {
  const overlay = read("src/features/ynot/GachaRevealOverlay.tsx");
  const skip = sectionBetween(
    overlay,
    /function skipToSummary\b/,
    /return \(/,
    "skipToSummary",
  );
  assert.match(skip, /setStage\("summary"\)/);
  assert.match(overlay, /video\.muted = true/);
  assert.match(overlay, /setAutoplayMuted\(true\)/);
  assert.match(overlay, /finishOpeningVideo/);
});

test("admin tier media remains a single-source override", () => {
  const overlay = read("src/features/ynot/GachaRevealOverlay.tsx");
  assert.match(overlay, /tierAsset\?\.videoUrl/);
  assert.match(overlay, /kind: "admin"/);
  assert.match(overlay, /kind: "universal"/);
  assert.match(
    overlay,
    /Math\.max\(\s*OPENING_VIDEO_WATCHDOG_MS,\s*tierAsset\.durationMs \+ 2_000,?\s*\)/,
  );
  assert.match(overlay, /Boolean\(openingVideoSource\.soundUrl\)/);
});
```

Add this assertion to the existing pack-flow test file near its current overlay tests:

```js
test("shared reveal stage order changes presentation without changing final result", () => {
  const overlay = read("src/features/ynot/GachaRevealOverlay.tsx");
  assert.match(
    overlay,
    /type RevealStage = "reveal" \| "openingVideo" \| "spotlight" \| "summary";/,
  );
  assert.doesNotMatch(overlay, /stage === "tierSpin"|stage === "tier"/);
  assert.match(overlay, /\{stage === "spotlight"/);
  assert.match(overlay, /\{stage === "summary"/);
  assert.match(overlay, /items\.map\(\(item\)/);
});
```

- [ ] **Step 2: Run the tests and confirm the expected failure**

Run:

```bash
cd Website
npm run test:gacha-opening-video
npm run test:pack-opening-flow
```

Expected: FAIL because the overlay still declares `tierSpin` and `tier` and has no `openingVideo` stage.

- [ ] **Step 3: Add the selector import and exact playback source type**

In `Website/src/features/ynot/GachaRevealOverlay.tsx`, add:

```ts
import {
  nextSessionGachaOpeningVideo,
  type GachaOpeningVideo,
} from "./gacha-opening-video";
```

Replace the stage/timer declarations with:

```ts
type RevealStage = "reveal" | "openingVideo" | "spotlight" | "summary";
type PullRarity = "normal" | "rare" | "blackout" | "jackpot";

type OpeningVideoSource = {
  id: string;
  kind: "admin" | "universal";
  src: string;
  poster: string | undefined;
  soundUrl: string | null;
  watchdogMs: number;
};

const OPENING_VIDEO_WATCHDOG_MS = 10_000;
const SPOTLIGHT_MS = 2100;
```

Add this pure adapter below `findTierAnimation()`:

```ts
function resolveOpeningVideoSource(
  tierAsset: YnotTierAnimation | null,
  universalVideo: GachaOpeningVideo | null,
): OpeningVideoSource | null {
  if (tierAsset?.videoUrl) {
    return {
      id: `admin-${tierAsset.tier}`,
      kind: "admin",
      src: tierAsset.videoUrl,
      poster: tierAsset.posterUrl ?? undefined,
      soundUrl: tierAsset.soundUrl,
      watchdogMs: Math.max(
        OPENING_VIDEO_WATCHDOG_MS,
        tierAsset.durationMs + 2_000,
      ),
    };
  }
  if (!universalVideo) return null;
  return {
    id: `universal-${universalVideo.id}`,
    kind: "universal",
    src: universalVideo.src,
    poster: universalVideo.poster,
    soundUrl: null,
    watchdogMs: OPENING_VIDEO_WATCHDOG_MS,
  };
}
```

- [ ] **Step 4: Select one universal video after client mount**

Keep all hooks unconditional. After `tierAsset` is calculated, add:

```ts
const [universalOpeningVideo, setUniversalOpeningVideo] =
  useState<GachaOpeningVideo | null>(null);
const openingVideoSelectedRef = useRef(false);
const [autoplayMuted, setAutoplayMuted] = useState(false);
const [openingVideoFailed, setOpeningVideoFailed] = useState(false);
const effectiveMuted = pref.muted || autoplayMuted;
const openingVideoSource = useMemo(
  () => resolveOpeningVideoSource(tierAsset, universalOpeningVideo),
  [tierAsset, universalOpeningVideo],
);

useEffect(() => {
  if (stage !== "reveal") return;
  if (tierAsset?.videoUrl) return;
  if (openingVideoSelectedRef.current) return;
  openingVideoSelectedRef.current = true;
  setUniversalOpeningVideo(nextSessionGachaOpeningVideo());
}, [stage, tierAsset?.videoUrl]);
```

This effect deliberately has no prize/tier argument when it calls the universal selector. It does not run for initial `summary`, so auto-skip/reduced-motion views do not consume a bag entry.

- [ ] **Step 5: Replace the three old stage timers with the new sequence**

Set the Y-Pack duration independently from admin video duration:

```ts
const revealDurationMs = revealMotionDurationMs(motionRarity, quantity);
```

Replace the `reveal`, `tierSpin`, and `tier` timer effects with:

```ts
useEffect(() => {
  if (stage !== "reveal") return;
  const timer = window.setTimeout(
    () => setStage("openingVideo"),
    revealDurationMs,
  );
  return () => window.clearTimeout(timer);
}, [stage, revealDurationMs]);

useEffect(() => {
  if (stage !== "openingVideo") return;
  if (!openingVideoSource || openingVideoFailed) {
    setStage("spotlight");
    return;
  }
  const timer = window.setTimeout(
    () => setStage("spotlight"),
    openingVideoSource.watchdogMs,
  );
  return () => window.clearTimeout(timer);
}, [stage, openingVideoSource, openingVideoFailed]);

useEffect(() => {
  if (stage !== "spotlight") return;
  const timer = window.setTimeout(() => setStage("summary"), SPOTLIGHT_MS);
  return () => window.clearTimeout(timer);
}, [stage]);
```

- [ ] **Step 6: Replace old video playback effects with preload, autoplay fallback, and cleanup**

Keep `audioRef` and `videoRef`, remove `videoReady`, remove `resetRevealVideo()`, and replace the existing audio/video effects with:

```ts
useEffect(() => {
  if (stage !== "openingVideo") return;
  if (!openingVideoSource?.soundUrl) return;
  if (effectiveMuted) return;
  const audio = new Audio(openingVideoSource.soundUrl);
  audio.volume = 0.7;
  void audio.play().catch(() => {
    // The video fallback still reaches the settled result if audio is blocked.
  });
  audioRef.current = audio;
  return () => {
    audio.pause();
    audio.currentTime = 0;
    audioRef.current = null;
  };
}, [stage, openingVideoSource?.soundUrl, effectiveMuted]);

useEffect(() => {
  if (stage !== "openingVideo") return;
  const video = videoRef.current;
  if (!video || !openingVideoSource || openingVideoFailed) return;
  let active = true;
  video.currentTime = 0;

  async function startPlayback() {
    try {
      await video.play();
    } catch {
      if (!active) return;
      setAutoplayMuted(true);
      video.muted = true;
      try {
        await video.play();
      } catch {
        if (active) setStage("spotlight");
      }
    }
  }

  void startPlayback();
  return () => {
    active = false;
    video.pause();
  };
}, [stage, openingVideoSource, openingVideoFailed]);

function finishOpeningVideo() {
  setStage((current) =>
    current === "openingVideo" ? "spotlight" : current,
  );
}

function handleOpeningVideoError() {
  setOpeningVideoFailed(true);
  finishOpeningVideo();
}

function handleMuteToggle() {
  const nextMuted = !effectiveMuted;
  setAutoplayMuted(false);
  setMuted(nextMuted);
  const video = videoRef.current;
  if (!video) return;
  video.muted = nextMuted || Boolean(openingVideoSource?.soundUrl);
  if (!nextMuted && stage === "openingVideo") {
    void video.play().catch(() => setAutoplayMuted(true));
  }
}
```

Update the mute button to use `effectiveMuted` for its label/icon and `handleMuteToggle` for `onClick`.

Also update the existing two-frame Y-Pack arming effect so an admin override no longer suppresses the pack motion. Its dependency list becomes `[stage, revealInstanceKey]` and it no longer checks `tierAsset?.videoUrl`:

```ts
useEffect(() => {
  if (stage !== "reveal") return;
  let secondFrame = 0;
  const frame = window.requestAnimationFrame(() => {
    secondFrame = window.requestAnimationFrame(() => {
      setMotionArmed(true);
    });
  });
  return () => {
    window.cancelAnimationFrame(frame);
    window.cancelAnimationFrame(secondFrame);
  };
}, [stage, revealInstanceKey]);
```

- [ ] **Step 7: Always render the existing Y-Pack motion during `reveal`**

Remove the conditional branch that currently begins with `{tierAsset?.videoUrl ? (` at line 327 and ends with the matching `)}` after the `pack-open-prototype` block. Delete the old `<video>` branch and its ternary tokens only. Leave the existing `pack-open-prototype` element and every child from `pack-open-grain` through `gacha-reveal-pack-light-card` byte-for-byte unchanged inside the existing `stage === "reveal"` wrapper.

The resulting wrapper and retained element openings must be:

```tsx
{stage === "reveal" && (
  <div
    className="gacha-reveal-stage gacha-reveal-show gacha-reveal-pack-open-stage"
    data-shake={animation.screenShake ? "1" : "0"}
  >
    <div
      key={`pack-${revealInstanceKey}`}
      className={`pack-open-prototype gacha-reveal-pack-motion ${motionArmed ? "charging" : ""} ${quantity > 1 ? "batch" : "single"} phase-pull rarity-${motionRarity} speed-2`}
      data-animation-key={revealInstanceKey}
      role="group"
      aria-label={localized(
        { en: "Opening pack animation", th: "แอนิเมชันเปิดแพ็ก" },
        language,
      )}
    >
```

Immediately after the self-closing `gacha-reveal-pack-light-card`, the resulting block must contain exactly five `</div>` tags followed by `)}`: `pack-open-card-wrap`, `gacha-reveal-pack-motion-layer-card`, `pack-open-visual`, `pack-open-prototype`, and `gacha-reveal-stage`.

- [ ] **Step 8: Mount only the selected video across preload and visible stages**

Insert this block immediately before the retained `reveal` block. Keeping it in a stable sibling position ensures the selected DOM video is not remounted when `reveal` changes to `openingVideo`:

```tsx
{openingVideoSource &&
  (stage === "reveal" || stage === "openingVideo") && (
    <div
      key={`opening-stage-${openingVideoSource.id}`}
      className={`gacha-reveal-stage gacha-reveal-opening-video-stage ${
        stage === "openingVideo" ? "is-visible" : "is-preloading"
      }`}
      aria-hidden={stage !== "openingVideo"}
    >
      <video
        key={openingVideoSource.id}
        ref={videoRef}
        className="gacha-reveal-opening-video"
        src={openingVideoSource.src}
        poster={openingVideoSource.poster}
        muted={effectiveMuted || Boolean(openingVideoSource.soundUrl)}
        playsInline
        preload="auto"
        aria-label={localized(
          { en: "Gacha opening animation", th: "วิดีโอเปิดกาชา" },
          language,
        )}
        onEnded={finishOpeningVideo}
        onError={handleOpeningVideoError}
      >
        <I18nText
          en="Your browser cannot play this opening video."
          th="เบราว์เซอร์ไม่สามารถเล่นวิดีโอเปิดกาชานี้ได้"
        />
      </video>
    </div>
  )}
```

Because the condition includes both consecutive stages, the block precedes the conditional Y-Pack sibling, and both keys stay stable, the same selected `<video>` preloads during the Y-Pack motion and becomes visible without mounting either unused universal source.

- [ ] **Step 9: Delete only the obsolete tier-stage markup**

Delete the complete blocks guarded by:

```tsx
stage === "tierSpin"
stage === "tier"
```

Keep the complete `spotlight` and `summary` blocks unchanged. Keep `tierLabel()`, `highestTierConfig`, inline card ring/glow variables, and `CSSProperties`, because the final summary and spotlight still use them.

- [ ] **Step 10: Preserve direct-to-summary Skip behavior**

Keep this function exactly:

```ts
function skipToSummary() {
  setStage("summary");
}
```

Keep the non-summary Skip button and `onClick={skipToSummary}`. Do not route Skip through `openingVideo` or `spotlight`.

- [ ] **Step 11: Run targeted tests and typecheck**

Run:

```bash
cd Website
npm run test:gacha-opening-video
npm run test:pack-opening-flow
npm run test:pack-open-pull-contract
npm run typecheck
```

Expected: all tests pass, no TypeScript errors, the final summary contract stays green, and source assertions find no old tier stage.

- [ ] **Step 12: Commit the state-machine replacement**

```bash
git add Website/src/features/ynot/GachaRevealOverlay.tsx Website/scripts/test-gacha-opening-video.mjs Website/scripts/test-pack-opening-flow.mjs
git commit \
  -m "Keep the reward reveal focused on the pack, video, and prize" \
  --trailer "Constraint: Remove intermediate tier presentation without changing settled results" \
  --trailer "Rejected: Remove tier data entirely | Final prize cards and Last Prize still require it" \
  --trailer "Confidence: high" \
  --trailer "Scope-risk: moderate" \
  --trailer "Directive: Video failures must advance the existing result and must never call the open API" \
  --trailer "Tested: npm run test:gacha-opening-video; npm run test:pack-opening-flow; npm run test:pack-open-pull-contract; npm run typecheck" \
  --trailer "Not-tested: Responsive browser dimensions are completed after CSS integration"
```

---

### Task 5: Add Portrait Video Styling and a Four-Card Mobile Result Viewport

**Files:**
- Modify: `Website/src/app/globals.css:14508-15647`
- Modify: `Website/src/app/globals.css:34184-34259`
- Modify: `Website/scripts/test-gacha-opening-video.mjs`

**Interfaces:**
- Consumes: `.gacha-reveal-opening-video-stage`, `.gacha-reveal-opening-video`, `.gacha-reveal-grid[data-quantity]`, and the existing summary footer/dock markup.
- Produces: hidden selected-video preload state, visible `9:16` video state, x1 centered layout, two-column/four-card multi layout, and scroll-safe short-phone behavior.

- [ ] **Step 1: Append failing CSS contract tests**

Append this code to `Website/scripts/test-gacha-opening-video.mjs`:

```js
test("portrait opening video has explicit preload and visible states", () => {
  const css = read("src/app/globals.css");
  assert.match(css, /\.gacha-reveal-opening-video-stage\.is-preloading \{[\s\S]*opacity:\s*0/);
  assert.match(css, /\.gacha-reveal-opening-video-stage\.is-visible/);
  assert.match(css, /\.gacha-reveal-opening-video \{[\s\S]*aspect-ratio:\s*9\s*\/\s*16/);
  assert.match(css, /\.gacha-reveal-opening-video \{[\s\S]*object-fit:\s*contain/);
});

test("multi-result summary exposes two complete phone rows before scrolling", () => {
  const css = read("src/app/globals.css");
  assert.match(
    css,
    /\.gacha-reveal-grid:not\(\[data-quantity="1"\]\) \{[\s\S]*grid-template-columns:\s*repeat\(2,[\s\S]*max-width:\s*348px[\s\S]*max-height:\s*min\(486px,\s*calc\(140vw - 46px\)\)[\s\S]*overflow-y:\s*auto/,
  );
  assert.match(
    css,
    /\.gacha-reveal-grid\[data-quantity="1"\] \{[\s\S]*grid-template-columns:\s*1fr[\s\S]*max-width:\s*280px/,
  );
});

test("phone summary and final dock remain reachable without clipping", () => {
  const css = read("src/app/globals.css");
  assert.match(
    css,
    /@media \(max-width:\s*560px\) \{[\s\S]*\.gacha-reveal-overlay\[data-stage="summary"\][\s\S]*overflow-y:\s*auto/,
  );
  assert.match(
    css,
    /@media \(max-width:\s*560px\) \{[\s\S]*\.gacha-reveal-summary-footer \.gacha-reveal-dock[\s\S]*grid-template-columns:\s*repeat\(2,/,
  );
});
```

- [ ] **Step 2: Run the CSS tests and confirm the expected failure**

Run:

```bash
cd Website
npm run test:gacha-opening-video
```

Expected: FAIL because the new video classes and `486px` multi-grid contract do not exist.

- [ ] **Step 3: Replace the obsolete generic reveal-video rule**

Replace `.gacha-reveal-video` and `.gacha-reveal-video[data-ready="0"]` with:

```css
.gacha-reveal-opening-video-stage {
  width: min(100%, 430px);
  min-height: 0;
  gap: 0;
}

.gacha-reveal-opening-video-stage.is-preloading {
  position: fixed;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}

.gacha-reveal-opening-video-stage.is-visible {
  isolation: isolate;
}

.gacha-reveal-opening-video {
  display: block;
  width: min(72vw, 405px);
  max-height: min(78dvh, 720px);
  aspect-ratio: 9 / 16;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 24px;
  background: #000;
  object-fit: contain;
  box-shadow: 0 28px 72px rgba(0, 0, 0, 0.58);
}
```

- [ ] **Step 4: Replace the multi-result grid constraint**

Keep the base `.gacha-reveal-grid` declarations for list reset and grid behavior, but move multi-only sizing into this exact rule:

```css
.gacha-reveal-grid:not([data-quantity="1"]) {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  width: min(100%, 348px);
  max-width: 348px;
  max-height: min(486px, calc(140vw - 46px));
  margin: 0 auto;
  padding-right: 6px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
```

Keep the existing single-card rule exactly responsible for x1:

```css
.gacha-reveal-grid[data-quantity="1"] {
  grid-template-columns: 1fr;
  max-width: 280px;
  margin: 0 auto;
}
```

Remove the old multi-grid values `clamp(220px, 40vh, 360px)` and `34vh`.

- [ ] **Step 5: Make the phone summary itself scroll-safe and compact**

Add after the summary/footer rules:

```css
@media (max-width: 560px) {
  .gacha-reveal-overlay[data-stage="summary"] {
    justify-content: flex-start;
    padding:
      calc(env(safe-area-inset-top, 0px) + 64px)
      12px
      calc(env(safe-area-inset-bottom, 0px) + 18px);
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .gacha-reveal-stage.gacha-reveal-summary {
    gap: 12px;
    margin: 0 auto;
  }

}
```

Change the late dock default at `globals.css:34185` to two columns so it does not override the phone rule:

```css
.gacha-reveal-summary-footer .gacha-reveal-dock {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  width: min(420px, 100%);
  margin: 0 auto;
  pointer-events: auto;
}
```

Delete the old `@media (min-width: 560px)` dock switch because the dock is now two columns at every supported phone width.

After the complete late dock block ending at the current `globals.css:34259`, add the compact overrides so later source order cannot overwrite them:

```css
@media (max-width: 560px) {
  .gacha-reveal-summary-footer .gacha-reveal-dock {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .gacha-reveal-summary-footer .gacha-reveal-dock-action {
    min-height: 56px;
    padding: 8px 10px;
  }
}

@media (max-width: 420px) {
  .gacha-reveal-summary-footer .gacha-reveal-dock-action-hint {
    display: none;
  }
}
```

- [ ] **Step 6: Delete only obsolete tier presentation CSS**

Delete these selectors and keyframes:

```text
.gacha-reveal-tier-result
.gacha-reveal-tier-spin-card
.gacha-reveal-tier-spin-face
.gacha-reveal-tier-spin-face::before
.gacha-reveal-tier-spin-face span
.gacha-reveal-tier-card
.gacha-reveal-tier-face
.gacha-reveal-tier-face::before
.gacha-reveal-tier-face-back
.gacha-reveal-tier-face-back span
.gacha-reveal-tier-face-front
.gacha-reveal-tier-face-front span
.gacha-reveal-tier-face-front small
.gacha-reveal-tier-face-front strong
.gacha-reveal-tier-copy
@keyframes gacha-tier-card-spin
@keyframes gacha-tier-card-flip
```

Remove those tier selectors from the `prefers-reduced-motion` selector list. Keep spotlight, summary-card, Y-Pack, and other reduced-motion rules.

- [ ] **Step 7: Run CSS and source tests**

Run:

```bash
cd Website
npm run test:gacha-opening-video
npm run test:pack-opening-flow
npm run typecheck
npm run lint
```

Expected: all commands exit `0`; source search finds no obsolete selector or stage:

```bash
rg -n "tierSpin|gacha-reveal-tier-spin|gacha-reveal-tier-card|gacha-tier-card-spin|gacha-tier-card-flip" Website/src/features/ynot/GachaRevealOverlay.tsx Website/src/app/globals.css
```

Expected: no matches.

- [ ] **Step 8: Commit responsive presentation**

```bash
git add Website/src/app/globals.css Website/scripts/test-gacha-opening-video.mjs
git commit \
  -m "Let phone users inspect four rewards before scrolling" \
  --trailer "Constraint: Keep two columns and preserve the large single-card result" \
  --trailer "Rejected: Four phone columns | Prize art and tier badges would become unreadably narrow" \
  --trailer "Confidence: high" \
  --trailer "Scope-risk: narrow" \
  --trailer "Directive: Keep short-phone overflow on the summary container so actions remain reachable" \
  --trailer "Tested: npm run test:gacha-opening-video; npm run test:pack-opening-flow; npm run typecheck; npm run lint" \
  --trailer "Not-tested: Device screenshots are captured in the next task"
```

---

### Task 6: Verify Normal, x10, x100, Pull All, and Failure Paths in a Browser

**Files:**
- Verify: `Website/src/features/ynot/LocalStockSubSkuTest.tsx:531-660`
- Verify: `Website/src/features/ynot/client.tsx:1073-1282`
- Create verification evidence: `docs/verification/gacha-opening-video-2026-08-20/`

**Interfaces:**
- Consumes: the shared overlay through the localhost-only stock/Sub-SKU rehearsal and, where available, authenticated local x10/x100/Pull All test packs.
- Produces: viewport screenshots, network/console evidence, and a written acceptance matrix. No production request or deployment is part of this task.

- [ ] **Step 1: Start the local development server**

Run:

```bash
cd Website
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Expected: the server becomes ready at `http://127.0.0.1:3000` without a compile error.

- [ ] **Step 2: Exercise the production-like local reveal without database writes**

Open:

```text
http://127.0.0.1:3000/local-stock-subsku-test
```

Use the customer rehearsal to open one prize and then a multi-prize option. Confirm:

- Y-Pack motion appears first;
- exactly one of the three universal videos appears second;
- no spinning YNOT card appears;
- no full-screen Bronze/Silver/Gold/Rainbow card appears;
- featured-prize spotlight appears after video end;
- the final summary contains the same returned prize cards;
- Skip jumps directly to summary;
- View collection, Back to pack detail, repeat actions, and the preference toggle remain clickable.

- [ ] **Step 3: Capture the mobile layout matrix**

Create the evidence directory:

```bash
mkdir -p docs/verification/gacha-opening-video-2026-08-20
```

At each viewport below, capture the multi-result summary after four cards are visible:

```text
375x667  -> docs/verification/gacha-opening-video-2026-08-20/summary-375x667.png
390x844  -> docs/verification/gacha-opening-video-2026-08-20/summary-390x844.png
430x932  -> docs/verification/gacha-opening-video-2026-08-20/summary-430x932.png
768x1024 -> docs/verification/gacha-opening-video-2026-08-20/summary-768x1024.png
1440x900 -> docs/verification/gacha-opening-video-2026-08-20/summary-1440x900.png
```

For `375x667`, scroll the outer summary and prove all footer controls are reachable. For `390x844` and `430x932`, prove the grid shows two complete rows before its own scrollbar advances. For x1, capture `summary-single-390x844.png` and confirm one centered card remains at most `280px` wide.

- [ ] **Step 4: Verify x10, x100, and Pull All contracts**

Use an authenticated local/test campaign that already offers x10 and x100; do not use a production customer pack. For each quantity:

1. Clear the Network panel.
2. Trigger one open.
3. Confirm exactly one `POST /api/ynot/gacha/open` for x10 and exactly one for x100.
4. Confirm the result grid renders every returned item and initially exposes four complete cards.
5. Scroll the result grid to the last item.
6. Confirm repeat buttons do not trigger until clicked.

For Pull All, use the existing test flow and confirm it reaches the same overlay only after its completed highlight result exists. Confirm no normal-open request is issued by video end, video error, Skip, spotlight, or summary rendering.

- [ ] **Step 5: Verify sound, mute, and media failure behavior**

Run this matrix:

| Scenario | Expected evidence |
| --- | --- |
| Default sound allowed | One video's embedded sound plays; no separate duplicate track plays for universal media. |
| Mute preference enabled | Video plays silently and the mute icon reflects muted state. |
| Audible autoplay rejected | The same video retries muted and the reveal continues. |
| Selected MP4 request blocked | Overlay reaches spotlight and summary without a second open request. |
| Network throttled to Slow 3G | Y-Pack remains visible while the selected source preloads; the watchdog prevents a trap. |
| `[ SKIP ]` pressed | Summary appears directly and the settled result is unchanged. |
| Reduced motion enabled without force | Summary appears directly and no universal bag entry is consumed. |

Use DevTools request blocking for one selected `gacha-opening-*-v1.mp4`; remove the block after confirming the fallback.

- [ ] **Step 6: Write the acceptance matrix**

Create `docs/verification/gacha-opening-video-2026-08-20/report.md` with this exact structure and fill each Result cell with `PASS` or `FAIL` plus the observed filename/request count:

```markdown
# Gacha Opening Video Verification

| Check | Result |
| --- | --- |
| Y-Pack -> one video -> spotlight -> summary | |
| No tierSpin or intermediate tier screen | |
| x1 centered card | |
| Multi-result four-card viewport at 375x667 | |
| Multi-result four-card viewport at 390x844 | |
| Multi-result four-card viewport at 430x932 | |
| x10 one API request and complete result | |
| x100 one API request and complete result | |
| Pull All shared overlay and no normal-open retry | |
| Last Prize badge retained | |
| Skip direct to summary | |
| Audible, muted, blocked-autoplay, blocked-file, and Slow 3G paths | |
| Zero console errors | |
```

- [ ] **Step 7: Run the complete automated verification set**

Run sequentially from `Website/`:

```bash
npm run test:gacha-opening-video
npm run test:pack-opening-flow
npm run test:pack-open-pull-contract
npm run test:gacha-open-launch-safety
npm run test:gacha-open-performance
npm run test:gacha-open-bundle
npm run test:local-stock-subsku-flow
npm run test:subsku-images
npm run test:pack-open-privacy
npm run test:rate-limits
npm run typecheck
npm run lint
npm run cf:build:website
```

Expected: every command exits `0`. The Cloudflare build includes all six public delivery assets and reports no per-asset or bundle failure.

- [ ] **Step 8: Prove protected logic remained untouched**

Run from the repository root:

```bash
git diff --name-only -- Website/src/app/api/ynot/gacha/open/route.ts Database Website/src/features/ynot/data.ts Website/src/features/ynot/types.ts Website/src/features/ynot/gacha-animation-pref.ts
git diff -- Website/src/features/ynot/client.tsx
git status --short
```

Expected:

- the first command prints nothing;
- the `client.tsx` diff prints nothing;
- `Media/Gacha/` does not appear in status;
- status contains only the planned code, test, public media, documentation, and verification-evidence paths.

- [ ] **Step 9: Commit verification evidence**

```bash
git add docs/verification/gacha-opening-video-2026-08-20
git commit \
  -m "Record proof that visual changes preserve pack outcomes" \
  --trailer "Constraint: Verification must cover short phones, x100 atomicity, Pull All, and media failure" \
  --trailer "Confidence: high" \
  --trailer "Scope-risk: narrow" \
  --trailer "Directive: Re-run the browser matrix whenever reveal stages or result-grid sizing changes" \
  --trailer "Tested: Targeted gacha suites; typecheck; lint; Cloudflare website build; responsive browser matrix" \
  --trailer "Not-tested: Production deployment and real-customer transactions"
```

---

### Task 7: Final Diff Review and Delivery Gate

**Files:**
- Review: all files changed since the Task 1 baseline commit
- Review: `docs/superpowers/specs/2026-08-20-gacha-opening-video-design.md`
- Review: `docs/verification/gacha-opening-video-2026-08-20/report.md`

**Interfaces:**
- Consumes: all implementation commits and verification evidence.
- Produces: a release-ready local branch with no deployment side effect and a concise handoff naming any remaining validation gap.

- [ ] **Step 1: Inspect the complete implementation diff**

Run:

```bash
git diff --stat HEAD~6..HEAD
git diff --check HEAD~6..HEAD
git diff HEAD~6..HEAD -- Website/src/features/ynot/gacha-opening-video.ts Website/src/features/ynot/GachaRevealOverlay.tsx Website/src/app/globals.css Website/scripts/test-gacha-opening-video.mjs Website/scripts/test-pack-opening-flow.mjs Website/package.json .gitignore
```

Expected: no whitespace errors; no unexpected route, database, settlement, wallet, stock, prize, or authentication changes.

- [ ] **Step 2: Reconcile the diff against every acceptance criterion**

Read `docs/superpowers/specs/2026-08-20-gacha-opening-video-design.md` from “Acceptance Criteria” through “Out of Scope”. For criteria 1-15, identify one passing automated test, screenshot, network observation, or diff proof in `docs/verification/gacha-opening-video-2026-08-20/report.md`.

Expected: every criterion has evidence and no Result cell remains empty or `FAIL`.

- [ ] **Step 3: Run the final quick gate after review changes**

Run:

```bash
cd Website
npm run test:gacha-opening-video
npm run test:pack-opening-flow
npm run test:pack-open-pull-contract
npm run typecheck
npm run lint
```

Expected: every command exits `0` after the final diff review.

- [ ] **Step 4: Stop before production deployment**

Do not run a Cloudflare deploy command. Hand off:

- the exact changed-file list;
- the three public MP4 sizes and durations;
- automated test/build results;
- browser screenshot paths;
- confirmation that protected logic files are unchanged;
- any browser/device path that could not be exercised.

The implementation is complete only when there are no known errors, every required local test/build passes, the browser matrix proves four visible multi-result cards and reachable actions, and no protected logic file changed.

---

## Self-Review Results

### Spec coverage

- New sequence and removal of both intermediate tier states: Tasks 4 and 5.
- Y-Pack retained: Task 4, Steps 5 and 7.
- Three random, prize-independent videos with no immediate repeat: Task 3.
- Media type, sound, size, duration, fast start, and folder organization: Task 2.
- Admin Reveal Video compatibility without double playback: Task 4, Steps 3 and 6.
- End/error/autoplay/timeout/Skip behavior: Task 4 and Task 6.
- Final prize, tier, Last Prize, actions, x1, x10, x100, and Pull All preservation: Tasks 1, 4, 5, and 6.
- Two columns and four visible multi-result cards with short-phone reachability: Task 5 and Task 6.
- No API/database/business-logic changes: Tasks 1, 6, and 7.
- No production deployment: Task 7.

No uncovered specification requirement remains.

### Placeholder scan

The plan contains no deferred implementation marker, generic error-handling instruction, or unnamed test requirement. Every code-producing step names the exact file, code shape, command, and expected result.

### Type and interface consistency

- `GachaOpeningVideo`, `GachaOpeningVideoBagState`, `GachaOpeningVideoStorage`, and `GachaOpeningVideoRandomSource` are defined in Task 3 before the overlay consumes them in Task 4.
- `nextSessionGachaOpeningVideo()` returns the `GachaOpeningVideo` consumed by `resolveOpeningVideoSource()`.
- `OpeningVideoSource` consistently provides `id`, `kind`, `src`, `poster`, `soundUrl`, and `watchdogMs` to effects and JSX.
- The stage name is consistently `openingVideo` in types, effects, JSX, CSS tests, and pack-flow tests.
- Skip consistently targets `summary`; media completion/failure consistently targets `spotlight`.
- Universal audio consistently uses the embedded AAC track; admin `soundUrl` consistently mutes the video's embedded track to prevent double playback.
