"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

const STORAGE_KEY = "gacha:animationPref";

export type GachaAnimationPref = {
  autoSkip: boolean;
  muted: boolean;
};

const DEFAULT_PREF: GachaAnimationPref = {
  autoSkip: false,
  muted: false,
};

const DEFAULT_SNAPSHOT = JSON.stringify(DEFAULT_PREF);

function subscribe(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) onChange();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

function getSnapshot(): string {
  if (typeof window === "undefined") return DEFAULT_SNAPSHOT;
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? DEFAULT_SNAPSHOT;
  } catch {
    return DEFAULT_SNAPSHOT;
  }
}

function getServerSnapshot(): string {
  return DEFAULT_SNAPSHOT;
}

function notifyChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
}

function writePref(pref: GachaAnimationPref) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pref));
    notifyChange();
  } catch {
    // ignore quota / privacy mode errors
  }
}

export function useGachaAnimationPref() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const pref = useMemo<GachaAnimationPref>(() => {
    try {
      const parsed = JSON.parse(raw) as Partial<GachaAnimationPref>;
      return {
        autoSkip: Boolean(parsed.autoSkip),
        muted: Boolean(parsed.muted),
      };
    } catch {
      return DEFAULT_PREF;
    }
  }, [raw]);

  const setAutoSkip = useCallback(
    (autoSkip: boolean) => {
      writePref({ ...pref, autoSkip });
    },
    [pref],
  );

  const setMuted = useCallback(
    (muted: boolean) => {
      writePref({ ...pref, muted });
    },
    [pref],
  );

  return { pref, setAutoSkip, setMuted };
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}
