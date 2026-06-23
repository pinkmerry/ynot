import type { Language } from "./i18n";

export type StoreTheme = "dark" | "light";

export type StorePreferences = {
  language: Language;
  theme: StoreTheme;
};

export const defaultStorePreferences: StorePreferences = {
  language: "en",
  theme: "light",
};

export const languageStorageKey = "ynot-language-v2";
export const themeStorageKey = "ynot-theme-v2";
export const preferenceEvent = "ynot-preferences-change";
