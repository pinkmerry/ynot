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
let storageUnavailable = false;

function isVideoId(value: unknown): value is GachaOpeningVideoId {
  return typeof value === "string" && VIDEO_IDS.includes(value as GachaOpeningVideoId);
}

function normalizeState(value: unknown): GachaOpeningVideoBagState {
  if (!value || typeof value !== "object") return EMPTY_STATE;
  const candidate = value as Partial<GachaOpeningVideoBagState>;
  const remaining = Array.isArray(candidate.remaining)
    ? candidate.remaining
        .filter(isVideoId)
        .filter((id, index, values) => values.indexOf(id) === index)
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
  const video =
    GACHA_OPENING_VIDEOS.find((entry) => entry.id === nextId) ??
    GACHA_OPENING_VIDEOS[0];
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
  const canUseStorage = storage && !storageUnavailable;

  if (canUseStorage) {
    let rawState: string | null = null;
    try {
      rawState = storage.getItem(STORAGE_KEY);
    } catch {
      storageUnavailable = true;
      state = fallbackState;
    }
    if (!storageUnavailable) {
      try {
        state = normalizeState(JSON.parse(rawState ?? "null"));
      } catch {
        state = EMPTY_STATE;
      }
    }
  }

  const next = takeNextGachaOpeningVideo(state, random);
  fallbackState = next.state;

  if (canUseStorage && !storageUnavailable) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(next.state));
    } catch {
      storageUnavailable = true;
    }
  }

  return next.video;
}
