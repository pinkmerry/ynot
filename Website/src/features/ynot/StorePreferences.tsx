"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { signOutAction } from "@/features/auth/actions";
import type { HomeFilterState, HomeSortOption } from "./types";

type Language = "en" | "th";
type Theme = "dark" | "light";

type StorePreferences = {
  language: Language;
  theme: Theme;
};

const defaults: StorePreferences = {
  language: "th",
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
    button: "Menu",
    title: "Menu",
    language: "Language",
    theme: "Theme",
    en: "EN",
    th: "TH",
    light: "Light",
    dark: "Dark",
    account: "Account",
    admin: "Admin Console",
    logout: "Log out",
    navigation: "Navigation",
    signUp: "Create account",
    login: "Log in",
    close: "Close",
  },
  th: {
    button: "เมนู",
    title: "เมนู",
    language: "ภาษา",
    theme: "ธีม",
    en: "EN",
    th: "TH",
    light: "สว่าง",
    dark: "มืด",
    account: "บัญชี",
    admin: "หน้าแอดมิน",
    logout: "ออกจากระบบ",
    navigation: "เมนูนำทาง",
    signUp: "สมัครสมาชิก",
    login: "เข้าสู่ระบบ",
    close: "ปิด",
  },
} as const;

const customerNav = [
  { key: "main", href: "/", protected: false },
  { key: "profile", href: "/profile", protected: true },
  { key: "wallet", href: "/wallet", protected: true },
  { key: "personalInfo", href: "/profile/personal-info", protected: true },
] as const;

function safeLanguage(value: string | null | undefined): Language {
  if (value === "th" || value === "en") return value;
  return defaults.language;
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

function protectedHref(
  href: string,
  authenticated: boolean,
  isProtected: boolean,
) {
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

export function StoreSortSelect({
  homeFilter,
}: {
  homeFilter: HomeFilterState;
}) {
  const router = useRouter();

  return (
    <label className="store-sort-select">
      <span>Sort</span>
      <select
        aria-label="Sort mystery packs"
        onChange={(event) => {
          const sort = event.target.value;
          if (!isHomeSortOption(sort)) return;
          router.replace(homeSortHref({ ...homeFilter, sort }), {
            scroll: false,
          });
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
        <Link
          className="store-nav-link"
          href={protectedHref(item.href, authenticated, item.protected)}
          key={item.href}
        >
          {labels[item.key]}
        </Link>
      ))}
    </nav>
  );
}

export function StoreSettingsMenu({
  authenticated = false,
  isAdmin = false,
}: {
  authenticated?: boolean;
  isAdmin?: boolean;
  variant?: "bell" | "language";
} = {}) {
  const { preferences, setLanguage } = useStorePreferences();
  const [open, setOpen] = useState(false);
  const copy = settingsCopy[preferences.language];
  const navStrings = navLabels[preferences.language];

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", closeOnEscape);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function closeAfter(action?: () => void) {
    return () => {
      action?.();
      setOpen(false);
    };
  }

  return (
    <div className="settings-menu">
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={copy.button}
        className="settings-menu-button hamburger-button"
        onClick={() => setOpen((value) => !value)}
        title={copy.button}
        type="button"
      >
        <span aria-hidden className="settings-menu-icon">
          <svg
            viewBox="0 0 24 24"
            width="1em"
            height="1em"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="square"
            strokeLinejoin="miter"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M3.5 5.5 V18.5" strokeOpacity="0.6" strokeWidth="1.2" />
            <path d="M3.5 7 H18.5" />
            <path d="M3.5 12 H16" strokeOpacity="0.88" />
            <path d="M3.5 17 H13" strokeOpacity="0.7" />
            <rect x="18" y="6" width="2.4" height="2.4" fill="currentColor" stroke="none" />
            <rect x="15.5" y="11" width="2.4" height="2.4" fill="currentColor" stroke="none" fillOpacity="0.88" />
            <rect x="12.5" y="16" width="2.4" height="2.4" fill="currentColor" stroke="none" fillOpacity="0.7" />
          </svg>
        </span>
        <span className="settings-menu-label">{copy.button}</span>
      </button>

      <div
        className={`store-drawer-backdrop${open ? " open" : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden={!open}
      />
      <aside
        className={`store-drawer${open ? " open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={copy.button}
        aria-hidden={!open}
      >
        <header className="store-drawer-head">
          <span className="store-drawer-title">{copy.button}</span>
          <button
            aria-label={copy.close}
            className="store-drawer-close"
            onClick={() => setOpen(false)}
            type="button"
          >
            <svg
              viewBox="0 0 24 24"
              width="1.2em"
              height="1.2em"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M6 6 L18 18 M18 6 L6 18" />
            </svg>
          </button>
        </header>

        <nav className="store-drawer-section" aria-label={copy.navigation}>
          <span className="store-drawer-label">{copy.navigation}</span>
          <ul className="store-drawer-nav">
            {customerNav.map((item) => (
              <li key={item.href}>
                <Link
                  className="store-drawer-link"
                  href={protectedHref(item.href, authenticated, item.protected)}
                  onClick={closeAfter()}
                >
                  {navStrings[item.key]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="store-drawer-section">
          <span className="store-drawer-label">{copy.account}</span>
          {authenticated ? (
            <div className="store-drawer-stack">
              {isAdmin && (
                <Link
                  className="store-drawer-link"
                  href="/admin"
                  onClick={closeAfter()}
                >
                  {copy.admin}
                </Link>
              )}
              <form action={signOutAction}>
                <button
                  className="store-drawer-link store-drawer-link-danger"
                  type="submit"
                >
                  {copy.logout}
                </button>
              </form>
            </div>
          ) : (
            <div className="store-drawer-stack">
              <Link
                className="store-drawer-link store-drawer-link-primary"
                href="/signup"
                onClick={closeAfter()}
              >
                {copy.signUp}
              </Link>
              <Link
                className="store-drawer-link"
                href="/login"
                onClick={closeAfter()}
              >
                {copy.login}
              </Link>
            </div>
          )}
        </div>

        <div className="store-drawer-section">
          <span className="store-drawer-label">{copy.language}</span>
          <div className="store-drawer-langgrid">
            <button
              className={`store-drawer-langbtn${preferences.language === "th" ? " active" : ""}`}
              onClick={() => setLanguage("th")}
              type="button"
            >
              {copy.th}
            </button>
            <button
              className={`store-drawer-langbtn${preferences.language === "en" ? " active" : ""}`}
              onClick={() => setLanguage("en")}
              type="button"
            >
              {copy.en}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
