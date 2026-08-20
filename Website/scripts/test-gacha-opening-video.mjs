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

test("opening video keeps an in-memory bag when storage is unusable", () => {
  const { nextSessionGachaOpeningVideo } = loadTsModule(
    "src/features/ynot/gacha-opening-video.ts",
  );
  const storage = {
    getItem() {
      throw new Error("storage unavailable");
    },
    setItem() {
      throw new Error("quota exceeded");
    },
  };

  const first = nextSessionGachaOpeningVideo(storage, () => 0);
  const second = nextSessionGachaOpeningVideo(storage, () => 0);
  const third = nextSessionGachaOpeningVideo(storage, () => 0);

  assert.equal(new Set([first.id, second.id, third.id]).size, 3);
});

test("opening video keeps an in-memory bag when storage writes fail", () => {
  const { nextSessionGachaOpeningVideo } = loadTsModule(
    "src/features/ynot/gacha-opening-video.ts",
  );
  const storage = {
    getItem() {
      return null;
    },
    setItem() {
      throw new Error("quota exceeded");
    },
  };

  const first = nextSessionGachaOpeningVideo(storage, () => 0);
  const second = nextSessionGachaOpeningVideo(storage, () => 0);
  const third = nextSessionGachaOpeningVideo(storage, () => 0);

  assert.equal(new Set([first.id, second.id, third.id]).size, 3);
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
