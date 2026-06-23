"use client";

import { useEffect } from "react";
import {
  defaultStorePreferences,
  languageStorageKey,
  preferenceEvent,
  themeStorageKey,
  type StorePreferences,
  type StoreTheme,
} from "./preference-constants";
import type { Language } from "./i18n";

function safeLanguage(value: string | null | undefined): Language {
  return value === "en" || value === "th"
    ? value
    : defaultStorePreferences.language;
}

function safeTheme(value: string | null | undefined): StoreTheme {
  return value === "light" || value === "dark"
    ? value
    : defaultStorePreferences.theme;
}

function readPreferences(): StorePreferences {
  return {
    language: safeLanguage(window.localStorage.getItem(languageStorageKey)),
    theme: safeTheme(window.localStorage.getItem(themeStorageKey)),
  };
}

function applyPreferences(preferences: StorePreferences) {
  document.documentElement.dataset.ynotLanguage = preferences.language;
  document.documentElement.dataset.ynotTheme = preferences.theme;
  document.documentElement.lang = preferences.language;
}

export function PreferenceHydrator() {
  useEffect(() => {
    const sync = () => applyPreferences(readPreferences());

    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(preferenceEvent, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(preferenceEvent, sync);
    };
  }, []);

  return null;
}
