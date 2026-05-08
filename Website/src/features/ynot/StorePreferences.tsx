"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { HomeFilterState, HomeSortOption } from "./types";

type Language = "en" | "th";
type Theme = "dark" | "light";

type StorePreferences = {
  language: Language;
  theme: Theme;
};

const defaults: StorePreferences = {
  language: "en",
  theme: "dark",
};

const languageStorageKey = "ynot-language";
const themeStorageKey = "ynot-theme";
const preferenceEvent = "ynot-preferences-change";

const navLabels = {
  en: {
    main: "Main",
    profile: "Profile",
    wallet: "Wallet",
    personalInfo: "Personal Info",
  },
  th: {
    main: "หน้าหลัก",
    profile: "โปรไฟล์",
    wallet: "วอลเล็ต",
    personalInfo: "ข้อมูลส่วนตัว",
  },
} as const;

const settingsCopy = {
  en: {
    button: "Settings",
    title: "Settings",
    language: "Language",
    theme: "Theme",
    en: "EN",
    th: "TH",
    light: "Light",
    dark: "Dark",
  },
  th: {
    button: "ตั้งค่า",
    title: "ตั้งค่า",
    language: "ภาษา",
    theme: "ธีม",
    en: "EN",
    th: "TH",
    light: "สว่าง",
    dark: "มืด",
  },
} as const;

const customerNav = [
  { key: "main", href: "/", protected: false },
  { key: "profile", href: "/profile", protected: true },
  { key: "wallet", href: "/wallet", protected: true },
  { key: "personalInfo", href: "/profile#personal-info", protected: true },
] as const;

function safeLanguage(value: string | null | undefined): Language {
  return value === "th" ? "th" : "en";
}

function safeTheme(value: string | null | undefined): Theme {
  return value === "light" ? "light" : "dark";
}

function readPreferences(): StorePreferences {
  if (typeof window === "undefined") return defaults;
  return {
    language: safeLanguage(window.localStorage.getItem(languageStorageKey)),
    theme: safeTheme(window.localStorage.getItem(themeStorageKey)),
  };
}

function applyPreferences(preferences: StorePreferences) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.ynotLanguage = preferences.language;
  document.documentElement.dataset.ynotTheme = preferences.theme;
  document.documentElement.lang = preferences.language;

  if (typeof window !== "undefined") {
    window.localStorage.setItem(languageStorageKey, preferences.language);
    window.localStorage.setItem(themeStorageKey, preferences.theme);
    window.dispatchEvent(new CustomEvent(preferenceEvent));
  }
}

function useStorePreferences() {
  const [preferences, setPreferences] = useState<StorePreferences>(defaults);

  useEffect(() => {
    const sync = () => {
      const next = readPreferences();
      setPreferences(next);
      if (document.documentElement.dataset.ynotLanguage !== next.language) {
        document.documentElement.dataset.ynotLanguage = next.language;
      }
      if (document.documentElement.dataset.ynotTheme !== next.theme) {
        document.documentElement.dataset.ynotTheme = next.theme;
      }
      document.documentElement.lang = next.language;
    };

    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(preferenceEvent, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(preferenceEvent, sync);
    };
  }, []);

  function update(next: Partial<StorePreferences>) {
    setPreferences((current) => {
      const merged = { ...current, ...next };
      applyPreferences(merged);
      return merged;
    });
  }

  return {
    preferences,
    setLanguage: (language: Language) => update({ language }),
    setTheme: (theme: Theme) => update({ theme }),
  };
}

function protectedHref(href: string, authenticated: boolean, isProtected: boolean) {
  if (authenticated || !isProtected) return href;
  return `/login?next=${encodeURIComponent(href)}`;
}

const sortOptions: Array<{ value: HomeSortOption; label: string }> = [
  { value: "recommended", label: "Recommended" },
  { value: "latest", label: "Latest" },
  { value: "coins-desc", label: "Coins in Descending Order" },
  { value: "coins-asc", label: "Lowest Coins First" },
];

function isHomeSortOption(value: string): value is HomeSortOption {
  return sortOptions.some((option) => option.value === value);
}

function homeSortHref(filter: HomeFilterState) {
  const params = new URLSearchParams();
  if (filter.series !== "all") params.set("series", filter.series);
  if (filter.tag !== "all") params.set("tag", filter.tag);
  if (filter.sort !== "recommended") params.set("sort", filter.sort);
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

export function StoreSortSelect({ homeFilter }: { homeFilter: HomeFilterState }) {
  const router = useRouter();

  return (
    <label className="store-sort-select">
      <span>Sort</span>
      <select
        aria-label="Sort mystery packs"
        onChange={(event) => {
          const sort = event.target.value;
          if (!isHomeSortOption(sort)) return;
          router.replace(homeSortHref({ ...homeFilter, sort }), { scroll: false });
        }}
        value={homeFilter.sort}
      >
        {sortOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function StoreHeaderNav({ authenticated }: { authenticated: boolean }) {
  const { preferences } = useStorePreferences();
  const labels = navLabels[preferences.language];

  return (
    <nav className="store-nav" aria-label="Primary navigation">
      {customerNav.map((item) => (
        <Link className="store-nav-link" href={protectedHref(item.href, authenticated, item.protected)} key={item.href}>
          {labels[item.key]}
        </Link>
      ))}
    </nav>
  );
}

export function StoreSettingsMenu() {
  const { preferences, setLanguage, setTheme } = useStorePreferences();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const copy = settingsCopy[preferences.language];

  useEffect(() => {
    function closeOnOutside(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <div className="settings-menu" ref={menuRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={copy.button}
        className="settings-menu-button"
        onClick={() => setOpen((value) => !value)}
        title={copy.button}
        type="button"
      >
        <span aria-hidden className="settings-menu-icon">⚙</span>
        <span className="settings-menu-label">{copy.button}</span>
      </button>

      {open && (
        <div className="settings-menu-panel" role="menu">
          <strong>{copy.title}</strong>
          <div className="settings-menu-group">
            <span>{copy.language}</span>
            <div className="settings-toggle-row">
              <button className={preferences.language === "en" ? "active" : ""} onClick={() => setLanguage("en")} type="button">
                {copy.en}
              </button>
              <button className={preferences.language === "th" ? "active" : ""} onClick={() => setLanguage("th")} type="button">
                {copy.th}
              </button>
            </div>
          </div>
          <div className="settings-menu-group">
            <span>{copy.theme}</span>
            <div className="settings-toggle-row">
              <button className={preferences.theme === "light" ? "active" : ""} onClick={() => setTheme("light")} type="button">
                {copy.light}
              </button>
              <button className={preferences.theme === "dark" ? "active" : ""} onClick={() => setTheme("dark")} type="button">
                {copy.dark}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
