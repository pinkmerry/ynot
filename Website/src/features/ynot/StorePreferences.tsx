"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
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
  theme: "light",
};

const languageStorageKey = "ynot-language-v2";
const themeStorageKey = "ynot-theme-v2";
const preferenceEvent = "ynot-preferences-change";

function subscribeToHydration(onStoreChange: () => void) {
  const timeoutId = window.setTimeout(onStoreChange, 0);
  return () => window.clearTimeout(timeoutId);
}

function getHydratedSnapshot() {
  return true;
}

function getServerHydrationSnapshot() {
  return false;
}

function useHydrated() {
  return useSyncExternalStore(
    subscribeToHydration,
    getHydratedSnapshot,
    getServerHydrationSnapshot,
  );
}

const navLabels = {
  en: {
    main: "Home",
    mysteryPacks: "Mystery Packs",
    marketplace: "Marketplace",
    profile: "Profile",
    wallet: "Wallet",
    personalInfo: "Personal Info",
    admin: "Admin",
  },
  th: {
    main: "หน้าหลัก",
    mysteryPacks: "Mystery Packs",
    marketplace: "Marketplace",
    profile: "โปรไฟล์",
    wallet: "วอลเล็ต",
    personalInfo: "ข้อมูลส่วนตัว",
    admin: "หน้าแอดมิน",
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

/** Placement: where the nav item should render.
 *  - "left"   = inline links on the left side of the topbar
 *  - "drawer" = inside the profile drawer (right side) or mobile hamburger
 */
const customerNav = [
  { key: "main", href: "/", protected: false, placement: ["left", "drawer"] },
  { key: "mysteryPacks", href: "/packs", protected: false, placement: ["left", "drawer"] },
  { key: "marketplace", href: "/marketplace", protected: false, placement: ["left", "drawer"] },
  { key: "profile", href: "/profile", protected: true, placement: ["drawer"] },
  { key: "wallet", href: "/wallet", protected: true, placement: ["drawer"] },
  { key: "personalInfo", href: "/profile/personal-info", protected: true, placement: ["drawer"] },
] as const;

const adminHeaderNavItem = {
  key: "admin",
  href: "/admin",
  protected: true,
} as const;

function safeLanguage(value: string | null | undefined): Language {
  if (value === "th" || value === "en") return value;
  return defaults.language;
}

function safeTheme(value: string | null | undefined): Theme {
  if (value === "light" || value === "dark") return value;
  return defaults.theme;
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
      setPreferences((current) =>
        current.language === next.language && current.theme === next.theme
          ? current
          : next,
      );
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
    const merged = { ...preferences, ...next };
    setPreferences(merged);
    applyPreferences(merged);
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

function isNavActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function StoreHeaderNav({
  authenticated,
  isAdmin = false,
}: {
  authenticated: boolean;
  isAdmin?: boolean;
}) {
  const { preferences } = useStorePreferences();
  const labels = navLabels[preferences.language];
  const pathname = usePathname();

  const leftNav = customerNav.filter((item) =>
    (item.placement as readonly string[]).includes("left"),
  );
  const visibleNav =
    authenticated && isAdmin ? [...leftNav, adminHeaderNavItem] : leftNav;

  return (
    <nav className="store-nav" aria-label="Primary navigation">
      {visibleNav.map((item) => {
        const active = isNavActive(pathname, item.href);
        return (
          <Link
            className={`store-nav-link${active ? " active" : ""}`}
            href={protectedHref(item.href, authenticated, item.protected)}
            key={item.href}
            aria-current={active ? "page" : undefined}
          >
            {labels[item.key]}
          </Link>
        );
      })}
    </nav>
  );
}

const accountCopy = {
  en: {
    title: "Account",
    edit: "Edit profile",
    balance: "Balance",
    coins: "Coins",
    cardHistory: "Card history",
    notifications: "Notifications",
    address: "Add or change delivery address",
    coupon: "Enter coupon code",
    buyCoins: "Buy coins",
    setting: "Settings",
    language: "Language",
    en: "EN",
    th: "TH",
    close: "Close",
  },
  th: {
    title: "บัญชี",
    edit: "แก้ไขโปรไฟล์",
    balance: "ยอดคงเหลือ",
    coins: "เหรียญ",
    cardHistory: "ประวัติการ์ด",
    notifications: "การแจ้งเตือน",
    address: "เพิ่ม/แก้ไขที่อยู่จัดส่ง",
    coupon: "ใส่โค้ดคูปอง",
    buyCoins: "ซื้อเหรียญ",
    setting: "ตั้งค่า",
    language: "ภาษา",
    en: "EN",
    th: "TH",
    close: "ปิด",
  },
} as const;

/** Right-side account: shows "Login" link when signed out, profile avatar when signed in. */
export function StoreHeaderRightNav({
  authenticated,
}: {
  authenticated: boolean;
}) {
  const { preferences, setLanguage } = useStorePreferences();
  const copy = settingsCopy[preferences.language];
  const account = accountCopy[preferences.language];
  const [profileOpen, setProfileOpen] = useState(false);
  const hydrated = useHydrated();

  useEffect(() => {
    if (!profileOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setProfileOpen(false);
    }
    document.addEventListener("keydown", closeOnEscape);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [profileOpen]);

  if (!authenticated) {
    return (
      <Link
        className="store-nav-link store-nav-link--right"
        href="/login"
        aria-current={undefined}
      >
        {copy.login}
      </Link>
    );
  }

  const profileDrawer = (
    <>
      <div
        className={`store-profile-backdrop${profileOpen ? " open" : ""}`}
        onClick={() => setProfileOpen(false)}
        aria-hidden={!profileOpen}
      />
      <aside
        className={`store-profile-drawer${profileOpen ? " open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={account.title}
        aria-hidden={!profileOpen}
      >
        <header className="store-profile-head">
          <span className="store-profile-title">{account.title}</span>
          <button
            aria-label={account.close}
            className="store-profile-close"
            onClick={() => setProfileOpen(false)}
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

        <div className="store-profile-section store-profile-identity">
          <span className="store-profile-avatar-large" aria-hidden>
            <svg
              viewBox="0 0 24 24"
              width="100%"
              height="100%"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.1"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="11" />
              <circle cx="12" cy="10" r="3" />
              <path d="M5.5 19c1.6-3 4-4.5 6.5-4.5s4.9 1.5 6.5 4.5" />
            </svg>
          </span>
          <Link
            className="store-profile-edit"
            href="/profile"
            onClick={() => setProfileOpen(false)}
          >
            {account.edit}
          </Link>
        </div>

        <div className="store-profile-section">
          <span className="store-profile-section-label">{account.balance}</span>
          <Link
            className="store-profile-balance-row"
            href="/wallet"
            onClick={() => setProfileOpen(false)}
          >
            <span>{account.coins}</span>
            <span className="store-profile-balance-value">— +</span>
          </Link>
          <Link
            className="store-profile-cta"
            href="/wallet"
            onClick={() => setProfileOpen(false)}
          >
            {account.buyCoins}
          </Link>
        </div>

        <nav className="store-profile-section" aria-label={account.title}>
          <span className="store-profile-section-label">{account.title}</span>
          <ul className="store-profile-list">
            <li>
              <Link
                className="store-profile-link"
                href="/wallet"
                onClick={() => setProfileOpen(false)}
              >
                {navLabels[preferences.language].wallet}
              </Link>
            </li>
            <li>
              <Link
                className="store-profile-link"
                href="/profile/personal-info"
                onClick={() => setProfileOpen(false)}
              >
                {navLabels[preferences.language].personalInfo}
              </Link>
            </li>
            <li>
              <Link
                className="store-profile-link"
                href="/collection"
                onClick={() => setProfileOpen(false)}
              >
                {account.cardHistory}
              </Link>
            </li>
            <li>
              <Link
                className="store-profile-link"
                href="/notifications"
                onClick={() => setProfileOpen(false)}
              >
                {account.notifications}
              </Link>
            </li>
            <li>
              <form action={signOutAction}>
                <button
                  className="store-profile-link store-profile-link-danger"
                  type="submit"
                >
                  {copy.logout}
                </button>
              </form>
            </li>
          </ul>
        </nav>

        <div className="store-profile-section">
          <span className="store-profile-section-label">{account.language}</span>
          <div className="store-profile-langgrid">
            <button
              type="button"
              className={`store-profile-langbtn${preferences.language === "th" ? " active" : ""}`}
              onClick={() => setLanguage("th")}
            >
              {account.th}
            </button>
            <button
              type="button"
              className={`store-profile-langbtn${preferences.language === "en" ? " active" : ""}`}
              onClick={() => setLanguage("en")}
            >
              {account.en}
            </button>
          </div>
        </div>
      </aside>
    </>
  );

  return (
    <>
      <button
        type="button"
        className="store-profile-avatar"
        onClick={() => setProfileOpen(true)}
        aria-label={navLabels[preferences.language].profile}
        aria-expanded={profileOpen}
        aria-haspopup="dialog"
      >
        <span aria-hidden className="store-profile-avatar-icon">
          <svg
            viewBox="0 0 24 24"
            width="100%"
            height="100%"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinecap="round"
            strokeLinejoin="round"
            focusable="false"
          >
            {/* Outer ring fills the avatar circle */}
            <circle cx="12" cy="12" r="11" />
            {/* Head */}
            <circle cx="12" cy="10" r="3" />
            {/* Shoulders / body curve */}
            <path d="M5.5 19c1.6-3 4-4.5 6.5-4.5s4.9 1.5 6.5 4.5" />
          </svg>
        </span>
      </button>
      {hydrated ? createPortal(profileDrawer, document.body) : null}
    </>
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
  const hydrated = useHydrated();

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

  const drawerMarkup = (
    <>
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
            {customerNav
              .filter((item) =>
                (item.placement as readonly string[]).includes("drawer"),
              )
              .map((item) => (
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
    </>
  );

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
            strokeWidth="1.1"
            strokeLinecap="square"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M4 10 H20" />
            <path d="M4 14 H20" />
          </svg>
        </span>
        <span className="settings-menu-label">{copy.button}</span>
      </button>

      {/* Portal drawer + backdrop to document.body so it escapes the header's
          transformed containing block (will-change: transform on .storefront-header). */}
      {hydrated ? createPortal(drawerMarkup, document.body) : null}
    </div>
  );
}
