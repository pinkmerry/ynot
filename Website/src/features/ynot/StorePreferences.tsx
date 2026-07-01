"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import type { HomeFilterState, HomeSortOption } from "./types";
import { CoinMark } from "./cr/Icons";
import type { Language } from "./i18n";
import {
  defaultStorePreferences as defaults,
  languageStorageKey,
  preferenceEvent,
  themeStorageKey,
  type StorePreferences,
  type StoreTheme,
} from "./preference-constants";

export type { Language } from "./i18n";

function isPlainPrimaryClick(event: ReactMouseEvent<HTMLElement>) {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.shiftKey
  );
}

function scrollHomeToTop() {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

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
    mysteryPacks: "Y-Packs",
    marketplace: "Marketplace",
    profile: "Profile",
    cardHistory: "Card history",
    wallet: "Wallet",
    personalInfo: "Personal Info",
    admin: "Admin",
  },
  th: {
    main: "หน้าหลัก",
    mysteryPacks: "Y-Packs",
    marketplace: "ตลาด",
    profile: "โปรไฟล์",
    cardHistory: "ประวัติการ์ด",
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
  // "Home" is intentionally omitted — both the YNOT logo lockup and the
  // browser back affordance take users home, so duplicating it in the nav
  // adds noise without informational value.
  //
  // Card history (/collection) replaces the old generic "Profile" link so
  // the drawer entry matches what the page actually renders: a collection
  // grid + reward timeline. Profile edit lives under Personal Info; we do
  // not want two drawer items that both feel like "edit profile".
  { key: "mysteryPacks", href: "/packs", protected: false, placement: ["left", "drawer"] },
  { key: "marketplace", href: "/marketplace", protected: false, ownerOnly: true, placement: ["left", "drawer"] },
  // Card history, Wallet + Personal Info intentionally omitted from the
  // hamburger drawer — they all live in the My Page (account) drawer now,
  // so listing them here too is redundant.
] as const;

type HeaderMegaMenu = {
  links: Array<{ label: string; href: string }>;
  features: Array<{ title: string; href: string; image: string; alt: string }>;
};

type HeaderMegaKey = "main" | "mysteryPacks" | "marketplace";
type SignOutFormAction = (formData: FormData) => void | Promise<void>;

const headerMegaMenus: Record<
  Language,
  Partial<Record<HeaderMegaKey, HeaderMegaMenu>>
> = {
  en: {
    main: {
      links: [
        { label: "New Y-Packs", href: "/packs" },
        { label: "Marketplace", href: "/marketplace" },
        { label: "Pokemon", href: "/packs?series=pokemon" },
        { label: "One Piece", href: "/packs?series=one_piece" },
      ],
      features: [
        {
          title: "Y-Packs",
          href: "/packs",
          image: "/ynot-pack-psa-cards.jpg",
          alt: "PSA graded Pokemon cards",
        },
        {
          title: "Marketplace",
          href: "/marketplace",
          image: "/ynot-pack-pokemon.jpg",
          alt: "Pokemon cards",
        },
      ],
    },
    mysteryPacks: {
      links: [
        { label: "All Packs", href: "/packs" },
        { label: "Pokemon", href: "/packs?series=pokemon" },
        { label: "One Piece", href: "/packs?series=one_piece" },
      ],
      features: [
        {
          title: "Pokemon",
          href: "/packs?series=pokemon",
          image: "/ynot-pack-psa-cards-mobile.jpg",
          alt: "Pokemon card mystery pack",
        },
        {
          title: "One Piece",
          href: "/packs?series=one_piece",
          image: "/ynot-pack-psa-cards-mobile.jpg",
          alt: "One Piece card mystery pack",
        },
      ],
    },
    marketplace: {
      links: [
        { label: "Shop Marketplace", href: "/marketplace" },
        { label: "My Collection", href: "/collection" },
        { label: "Wallet", href: "/wallet" },
      ],
      features: [
        {
          title: "Marketplace",
          href: "/marketplace",
          image: "/ynot-pack-pokemon.jpg",
          alt: "Trading card marketplace",
        },
        {
          title: "My Collection",
          href: "/collection",
          image: "/ynot-pack-psa-cards-mobile.jpg",
          alt: "Card collection",
        },
      ],
    },
  },
  th: {
    main: {
      links: [
        { label: "Y-Packs ใหม่", href: "/packs" },
        { label: "ตลาด", href: "/marketplace" },
        { label: "Pokemon", href: "/packs?series=pokemon" },
        { label: "One Piece", href: "/packs?series=one_piece" },
      ],
      features: [
        {
          title: "Y-Packs",
          href: "/packs",
          image: "/ynot-pack-psa-cards.jpg",
          alt: "การ์ด Pokemon เกรด PSA",
        },
        {
          title: "ตลาด",
          href: "/marketplace",
          image: "/ynot-pack-pokemon.jpg",
          alt: "การ์ด Pokemon",
        },
      ],
    },
    mysteryPacks: {
      links: [
        { label: "Y-Packs ทั้งหมด", href: "/packs" },
        { label: "Pokemon", href: "/packs?series=pokemon" },
        { label: "One Piece", href: "/packs?series=one_piece" },
      ],
      features: [
        {
          title: "Pokemon",
          href: "/packs?series=pokemon",
          image: "/ynot-pack-psa-cards-mobile.jpg",
          alt: "กล่องสุ่มการ์ด Pokemon",
        },
        {
          title: "One Piece",
          href: "/packs?series=one_piece",
          image: "/ynot-pack-psa-cards-mobile.jpg",
          alt: "กล่องสุ่มการ์ด One Piece",
        },
      ],
    },
    marketplace: {
      links: [
        { label: "ตลาดทั้งหมด", href: "/marketplace" },
        { label: "คอลเลกชันของฉัน", href: "/collection" },
        { label: "วอลเล็ต", href: "/wallet" },
      ],
      features: [
        {
          title: "ตลาด",
          href: "/marketplace",
          image: "/ynot-pack-pokemon.jpg",
          alt: "ตลาดการ์ดสะสม",
        },
        {
          title: "คอลเลกชัน",
          href: "/collection",
          image: "/ynot-pack-psa-cards-mobile.jpg",
          alt: "คอลเลกชันการ์ด",
        },
      ],
    },
  },
};

function safeLanguage(value: string | null | undefined): Language {
  if (value === "th" || value === "en") return value;
  return defaults.language;
}

function safeTheme(value: string | null | undefined): StoreTheme {
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

export function useStorePreferences() {
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
    setTheme: (theme: StoreTheme) => update({ theme }),
  };
}

export function useStoreLanguage() {
  return useStorePreferences().preferences.language;
}

function protectedHref(
  href: string,
  authenticated: boolean,
  isProtected: boolean,
) {
  if (authenticated || !isProtected) return href;
  return `/login?next=${encodeURIComponent(href)}`;
}

const sortCopy = {
  en: {
    label: "Sort",
    ariaLabel: "Sort mystery packs",
    options: {
      recommended: "Recommended",
      latest: "Latest",
      "coins-desc": "Coins in Descending Order",
      "coins-asc": "Lowest Coins First",
    },
  },
  th: {
    label: "เรียง",
    ariaLabel: "เรียงลำดับ Y-Packs",
    options: {
      recommended: "แนะนำ",
      latest: "ใหม่ล่าสุด",
      "coins-desc": "เหรียญมากไปน้อย",
      "coins-asc": "เหรียญน้อยไปมาก",
    },
  },
} as const;

const sortOptions: Array<{ value: HomeSortOption }> = [
  { value: "recommended" },
  { value: "latest" },
  { value: "coins-desc" },
  { value: "coins-asc" },
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
  const { preferences } = useStorePreferences();
  const copy = sortCopy[preferences.language];

  return (
    <label className="store-sort-select">
      <span>{copy.label}</span>
      <select
        aria-label={copy.ariaLabel}
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
            {copy.options[option.value]}
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

function canRenderCustomerNavItem(
  item: (typeof customerNav)[number],
  flags: { isAdmin: boolean; isOwner: boolean },
) {
  if ("ownerOnly" in item && item.ownerOnly && !flags.isOwner) return false;
  if ("adminOnly" in item && item.adminOnly && !flags.isAdmin) return false;
  return true;
}

export function StoreHeaderNav({
  authenticated,
  isAdmin = false,
  isOwner = false,
}: {
  authenticated: boolean;
  /** Kept for compatibility — admin nav now renders on the right side. */
  isAdmin?: boolean;
  isOwner?: boolean;
}) {
  const { preferences } = useStorePreferences();
  const labels = navLabels[preferences.language];
  const pathname = usePathname();
  const [openMegaKey, setOpenMegaKey] = useState<string | null>(null);

  // Publish a data attribute on <html> describing what kind of element the
  // pointer is currently over inside the storefront header — "active" when
  // on the current-page link, "other" when on another link/button, absent
  // when on whitespace or outside the header. CSS uses this to fade the
  // active underline only when an interactive peer is hovered.
  useEffect(() => {
    const header = document.querySelector<HTMLElement>(".storefront-header");
    if (!header) return;

    function resolve(target: EventTarget | null): "active" | "other" | null {
      if (!(target instanceof Element)) return null;
      // Submenu items live inside an open megamenu. Treat hovering anything
      // in there as if the user is still on the current page so the header's
      // active underline does not flicker off while exploring submenus.
      if (target.closest(".ynot-mega-panel")) return "active";
      const interactive = target.closest("a, button");
      if (!interactive || !header!.contains(interactive)) return null;
      const isActive = interactive.matches(
        '.store-nav-link.active, .store-nav-link[aria-current="page"]',
      );
      return isActive ? "active" : "other";
    }

    function apply(state: "active" | "other" | null) {
      if (state) {
        document.documentElement.dataset.headerHoverTarget = state;
      } else {
        delete document.documentElement.dataset.headerHoverTarget;
      }
    }

    function onPointerMove(event: PointerEvent) {
      apply(resolve(event.target));
    }
    function onPointerLeave() {
      apply(null);
    }

    header.addEventListener("pointermove", onPointerMove);
    header.addEventListener("pointerleave", onPointerLeave);
    return () => {
      header.removeEventListener("pointermove", onPointerMove);
      header.removeEventListener("pointerleave", onPointerLeave);
      apply(null);
    };
  }, []);

  const leftNav = customerNav.filter((item) =>
    (item.placement as readonly string[]).includes("left") &&
    canRenderCustomerNavItem(item, { isAdmin, isOwner }),
  );

  return (
    <nav className="store-nav" aria-label="Primary navigation / เมนูหลัก">
      {leftNav.map((item) => {
        const active = isNavActive(pathname, item.href);
        const mega =
          headerMegaMenus[preferences.language][item.key as HeaderMegaKey];
        const isMegaOpen = openMegaKey === item.key;
        const megaId = `ynot-mega-${item.key}`;

        return (
          <div
            className={`ynot-nav-item${isMegaOpen ? " is-mega-open" : ""}`}
            key={item.href}
            onBlur={(event) => {
              if (
                mega &&
                !event.currentTarget.contains(event.relatedTarget as Node | null)
              ) {
                setOpenMegaKey((current) =>
                  current === item.key ? null : current,
                );
              }
            }}
            onFocus={() => {
              if (mega) setOpenMegaKey(item.key);
            }}
            onMouseEnter={() => {
              if (mega) setOpenMegaKey(item.key);
            }}
            onMouseLeave={() => {
              if (mega) {
                setOpenMegaKey((current) =>
                  current === item.key ? null : current,
                );
              }
            }}
          >
            <Link
              className={`store-nav-link${active ? " active" : ""}`}
              href={protectedHref(item.href, authenticated, item.protected)}
              prefetch={false}
              aria-controls={mega ? megaId : undefined}
              aria-current={active ? "page" : undefined}
              aria-expanded={mega ? isMegaOpen : undefined}
            >
              {labels[item.key]}
            </Link>
            {mega && (
              <div className="ynot-mega-panel" id={megaId}>
                <div className="ynot-mega-links">
                  {mega.links.map((link) => (
                    <Link
                      className="ynot-mega-link"
                      href={link.href}
                      prefetch={false}
                      key={`${item.key}-${link.href}`}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
                <div className="ynot-mega-media">
                  {mega.features.map((feature) => (
                    <Link
                      className="ynot-mega-card"
                      href={feature.href}
                      prefetch={false}
                      key={`${item.key}-${feature.href}-${feature.title}`}
                    >
                      <Image
                        src={feature.image}
                        alt={feature.alt}
                        width={480}
                        height={640}
                        sizes="(min-width: 1024px) 180px, 0px"
                        className="ynot-mega-card-image"
                      />
                      <span className="ynot-mega-card-title">
                        {feature.title}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export function StoreBrandHomeLink() {
  const pathname = usePathname();

  function handleClick(event: ReactMouseEvent<HTMLAnchorElement>) {
    if (!isPlainPrimaryClick(event)) return;

    // Always tell the drawer to close — covers the on-home case where
    // pathname doesn't change so the drawer's pathname effect won't fire.
    window.dispatchEvent(new Event("ynot:close-drawer"));

    if (pathname !== "/") return;

    event.preventDefault();
    scrollHomeToTop();
  }

  return (
    <Link
      href="/"
      className="brand-lockup"
      aria-label="YNOT home / หน้าแรก YNOT"
      prefetch={false}
      onClick={handleClick}
    >
      <picture>
        <source srcSet="/ynot-logo-black.webp?v=1" type="image/webp" />
        <img
          src="/ynot-logo-black.png?v=1"
          alt="YNOT"
          width={1896}
          height={596}
          loading="eager"
          decoding="async"
          fetchPriority="high"
          className="brand-logo brand-logo--black"
        />
      </picture>
      <picture>
        <source srcSet="/ynot-logo-white.webp?v=1" type="image/webp" />
        <img
          src="/ynot-logo-white.png?v=1"
          alt=""
          width={1896}
          height={596}
          loading="eager"
          decoding="async"
          fetchPriority="high"
          aria-hidden="true"
          className="brand-logo brand-logo--white"
        />
      </picture>
    </Link>
  );
}

const accountCopy = {
  en: {
    heading: "My Page",
    title: "Account",
    fallbackName: "Nameless Collector",
    edit: "Edit Profile",
    balance: "Balance",
    coins: "Coins",
    coinsLabel: "Coins:",
    topUp: "Top up coins",
    aboutExpiration: "About coin expiration",
    expirationLabel: "Scheduled for expiration:",
    expirationNote:
      "※The validity period of the coins is 180 days from the last usage date or the date of issuance. Please be aware that coins will expire if they remain unused for 180 days.",
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
    heading: "มายเพจ",
    title: "บัญชี",
    fallbackName: "นักสะสมไร้นาม",
    edit: "แก้ไขโปรไฟล์",
    balance: "ยอดคงเหลือ",
    coins: "เหรียญ",
    coinsLabel: "เหรียญ:",
    topUp: "เติมเหรียญ",
    aboutExpiration: "เกี่ยวกับการหมดอายุของเหรียญ",
    expirationLabel: "วันหมดอายุ:",
    expirationNote:
      "※เหรียญมีอายุการใช้งาน 180 วันนับจากวันใช้งานล่าสุดหรือวันที่ออก หากไม่มีการใช้งานครบ 180 วัน เหรียญจะหมดอายุโดยอัตโนมัติ",
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

const coinExpirationWindowMs = 180 * 24 * 60 * 60 * 1000;
const approximateCoinExpirationDate = new Date(
  Date.now() + coinExpirationWindowMs,
);

type LanguageOption = {
  value: Language;
  code: string;
  title: string;
  label: string;
};

const languageOptions: ReadonlyArray<LanguageOption> = [
  { value: "en", code: "EN", title: "English", label: "(EN) English" },
  { value: "th", code: "TH", title: "ไทย", label: "(TH) ไทย" },
];

/** Topbar language picker — compact FOG-style text menu.
 *  Menu is portaled to <body> so it can escape the topbar's overflow clip. */
export function StoreLanguageToggle() {
  const { preferences, setLanguage } = useStorePreferences();
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(
    null,
  );
  const [menuSurface, setMenuSurface] = useState<"light" | "dark">("light");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLUListElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const hydrated = useHydrated();
  const pathname = usePathname();
  const current = preferences.language;
  const currentLabel = current.toUpperCase();
  const copy = settingsCopy[preferences.language];

  const updateMenuPosition = useCallback(() => {
    const trigger = containerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const isDarkHeader =
      pathname === "/" &&
      document.documentElement.dataset.headerAtTop === "true";
    setMenuPos({
      top: rect.bottom + 10,
      right: Math.max(8, window.innerWidth - rect.right),
    });
    setMenuSurface(isDarkHeader ? "dark" : "light");
  }, [pathname]);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  function openMenu() {
    clearCloseTimer();
    updateMenuPosition();
    setOpen(true);
  }

  function scheduleCloseMenu() {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, 120);
  }

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    document.documentElement.classList.add("has-language-open");
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function handleReposition() {
      updateMenuPosition();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      clearCloseTimer();
      document.documentElement.classList.remove("has-language-open");
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [clearCloseTimer, open, updateMenuPosition]);

  function pickLanguage(value: Language) {
    setLanguage(value);
    setOpen(false);
  }

  const menu =
    hydrated && menuPos
      ? createPortal(
          <ul
            ref={menuRef}
            className={`store-language-toggle-menu store-language-toggle-menu--compact store-language-toggle-menu--${menuSurface}${open ? " is-open" : ""}`}
            role="listbox"
            aria-label={copy.language}
            onMouseEnter={clearCloseTimer}
            onMouseLeave={scheduleCloseMenu}
            style={{
              top: `${menuPos.top}px`,
              right: `${menuPos.right}px`,
            }}
          >
            {languageOptions.map((option) => {
              const isActive = current === option.value;
              return (
                <li key={option.value} role="none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    className={`store-language-toggle-item${isActive ? " is-active" : ""}`}
                    onClick={() => pickLanguage(option.value)}
                  >
                    <span className="store-language-toggle-title">
                      {option.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body,
        )
      : null;

  return (
    <div
      ref={containerRef}
      className={`store-language-toggle${open ? " is-open" : ""}`}
      onMouseEnter={openMenu}
      onMouseLeave={scheduleCloseMenu}
      onFocus={openMenu}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          scheduleCloseMenu();
        }
      }}
    >
      <button
        type="button"
        className="store-language-toggle-trigger"
        onClick={() => {
          clearCloseTimer();
          updateMenuPosition();
          setOpen((value) => !value);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={copy.language}
      >
        <span className="store-language-toggle-current">{currentLabel}</span>
      </button>
      {menu}
    </div>
  );
}

/** Inline admin shortcut shown in the topbar's right section.
 *  Renders nothing when the viewer isn't an authenticated admin. */
export function StoreAdminLink({
  authenticated,
  isAdmin = false,
}: {
  authenticated: boolean;
  isAdmin?: boolean;
}) {
  const { preferences } = useStorePreferences();
  if (!authenticated || !isAdmin) return null;
  return (
    <Link
      className="store-nav-link store-nav-link--right store-admin-link"
      href="/admin"
      prefetch={false}
    >
      {navLabels[preferences.language].admin}
    </Link>
  );
}

/** Right-side account: shows "Login" link when signed out, profile avatar when signed in. */
export function StoreHeaderRightNav({
  authenticated,
  isAdmin = false,
  displayName,
  balance,
  signOutAction,
}: {
  authenticated: boolean;
  /** When true, the My Page drawer surfaces the Admin Console link. */
  isAdmin?: boolean;
  /** Viewer's display name; falls back to an editorial placeholder if empty. */
  displayName?: string;
  /** Viewer's current coin balance — formatted for the My Page surface. */
  balance?: number;
  signOutAction?: SignOutFormAction;
}) {
  const { preferences } = useStorePreferences();
  const copy = settingsCopy[preferences.language];
  const account = accountCopy[preferences.language];
  const [profileOpen, setProfileOpen] = useState(false);
  const [expirationOpen, setExpirationOpen] = useState(false);
  const hydrated = useHydrated();
  // Expiration is 180 days from "now" — matches the toreca rule (180 days
  // from issuance OR last usage). Without a stored last-activity timestamp
  // we can only approximate from today; this is the worst-case ceiling.
  const expirationDate = new Intl.DateTimeFormat(
    preferences.language === "th" ? "th-TH" : "en-US",
    { year: "numeric", month: "long", day: "numeric" },
  ).format(approximateCoinExpirationDate);

  useEffect(() => {
    if (!profileOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setProfileOpen(false);
    }
    document.addEventListener("keydown", closeOnEscape);
    // Full scroll lock — body + html overflow + touch-action, mirroring
    // the hamburger drawer. Plain body { overflow: hidden } leaks touch
    // scrolling on iOS Safari, so html and touch-action must be locked too.
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyTouchAction = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    document.documentElement.dataset.ynotProfileOpen = "true";
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.touchAction = previousBodyTouchAction;
      delete document.documentElement.dataset.ynotProfileOpen;
    };
  }, [profileOpen]);

  useEffect(() => {
    function handleClose() {
      setProfileOpen(false);
    }
    window.addEventListener("ynot:close-profile-drawer", handleClose);
    return () => window.removeEventListener("ynot:close-profile-drawer", handleClose);
  }, []);

  if (!authenticated) {
    return (
      <Link
        className="store-nav-link store-nav-link--right"
        href="/login"
        prefetch={false}
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
        aria-label={account.heading}
        aria-hidden={!profileOpen}
      >
        <header className="store-profile-head">
          <span className="store-profile-title">{account.heading}</span>
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
          <div className="store-profile-identity-text">
            <span className="store-profile-identity-name">
              {displayName?.trim() || account.fallbackName}
            </span>
            <Link
              className="store-profile-identity-edit"
              href="/profile/personal-info"
              prefetch={false}
              onClick={() => setProfileOpen(false)}
            >
              {account.edit}
            </Link>
          </div>
        </div>

        <div className="store-profile-section store-profile-balance">
          <span className="store-profile-section-label">{account.balance}</span>
          <div className="store-profile-coins-row">
            {/* Brand coin (C1) — unified site-wide trident mark */}
            <CoinMark size={28} />
            <span className="store-profile-coins-label">{account.coinsLabel}</span>
            <span className="store-profile-coins-value">
              {typeof balance === "number" ? balance.toLocaleString() : "0"}
            </span>
            <Link
              className="store-profile-coins-plus"
              href="/wallet"
              prefetch={false}
              aria-label={account.topUp}
              onClick={() => setProfileOpen(false)}
            >
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden focusable="false">
                <path
                  d="M8 3 V13 M3 8 H13"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </Link>
          </div>
          <button
            type="button"
            className={`store-profile-expiration-toggle${expirationOpen ? " open" : ""}`}
            aria-expanded={expirationOpen}
            onClick={() => setExpirationOpen((value) => !value)}
          >
            <svg
              viewBox="0 0 14 14"
              width="12"
              height="12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              focusable="false"
              className="store-profile-expiration-chev"
            >
              <path d="M3 9 L7 5 L11 9" />
            </svg>
            <span>{account.aboutExpiration}</span>
          </button>
          {expirationOpen && (
            <div className="store-profile-expiration-body">
              <p className="store-profile-expiration-date">
                <span>{account.expirationLabel}</span>
                {expirationDate}
              </p>
              <p className="store-profile-expiration-note">
                {account.expirationNote}
              </p>
            </div>
          )}
        </div>

        <nav className="store-profile-section" aria-label={account.title}>
          <ul className="store-profile-list">
            <li>
              <Link
                className="store-profile-link"
                href="/wallet"
                prefetch={false}
                onClick={() => setProfileOpen(false)}
              >
                {navLabels[preferences.language].wallet}
              </Link>
            </li>
            <li>
              <Link
                className="store-profile-link"
                href="/profile/personal-info"
                prefetch={false}
                onClick={() => setProfileOpen(false)}
              >
                {navLabels[preferences.language].personalInfo}
              </Link>
            </li>
            <li>
              <Link
                className="store-profile-link"
                href="/collection"
                prefetch={false}
                onClick={() => setProfileOpen(false)}
              >
                {account.cardHistory}
              </Link>
            </li>
            <li>
              <Link
                className="store-profile-link"
                href="/notifications"
                prefetch={false}
                onClick={() => setProfileOpen(false)}
              >
                {account.notifications}
              </Link>
            </li>
          </ul>
        </nav>

        {/* Foot group pushed to the bottom of the drawer (margin-top:auto),
            mirroring the hamburger drawer where Admin / Log out / language
            sit at the very bottom rather than inline with the nav list. */}
        <div className="store-profile-foot">
          <div className="store-profile-foot-actions">
            {isAdmin && (
              <Link
                className="store-profile-link"
                href="/admin"
                prefetch={false}
                onClick={() => setProfileOpen(false)}
              >
                {copy.admin}
              </Link>
            )}
            {signOutAction ? (
              <form action={signOutAction}>
                <button
                  className="store-profile-link store-profile-link-danger"
                  type="submit"
                >
                  {copy.logout}
                </button>
              </form>
            ) : null}
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
        onClick={() => {
          if (!profileOpen) window.dispatchEvent(new Event("ynot:close-drawer"));
          setProfileOpen((value) => !value);
        }}
        aria-label={navLabels[preferences.language].profile}
        aria-expanded={profileOpen}
        aria-haspopup="dialog"
      >
        <span aria-hidden className="store-profile-avatar-icon">
          {profileOpen ? (
            // Mirrors the hamburger's open-state X: same 14×14 viewBox, same
            // stroke math, so the open glyph reads as the right-side twin of
            // the left-side close cross.
            <svg
              viewBox="0 0 14 14"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.6"
              strokeLinecap="butt"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M13 1 L1 13" />
              <path d="M1 1 L13 13" />
            </svg>
          ) : (
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
          )}
        </span>
      </button>
      {hydrated ? createPortal(profileDrawer, document.body) : null}
    </>
  );
}

export function StoreSettingsMenu({
  authenticated = false,
  isAdmin = false,
  isOwner = false,
}: {
  authenticated?: boolean;
  isAdmin?: boolean;
  isOwner?: boolean;
  variant?: "bell" | "language";
} = {}) {
  const { preferences, setLanguage } = useStorePreferences();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Drill-down state — null means the main level is showing.
  const [activeSubMenu, setActiveSubMenu] = useState<HeaderMegaKey | null>(null);
  const [renderedSubMenu, setRenderedSubMenu] = useState<HeaderMegaKey | null>(null);
  const featureRailRef = useRef<HTMLDivElement | null>(null);
  const copy = settingsCopy[preferences.language];
  const navStrings = navLabels[preferences.language];
  const hydrated = useHydrated();

  // Close the drawer whenever the route changes — covers tapping the brand
  // logo, in-drawer links, and browser back navigation.
  useEffect(() => {
    const closeRouteDrawer = window.setTimeout(() => {
      setOpen(false);
      setActiveSubMenu(null);
    }, 0);
    return () => window.clearTimeout(closeRouteDrawer);
  }, [pathname]);

  // Same-page logo taps don't trigger the pathname effect, so the brand link
  // also dispatches an explicit close signal we listen for here.
  useEffect(() => {
    function handleClose() {
      setOpen(false);
      setActiveSubMenu(null);
    }
    window.addEventListener("ynot:close-drawer", handleClose);
    return () => window.removeEventListener("ynot:close-drawer", handleClose);
  }, []);

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", closeOnEscape);
    // Lock the page scroll while the drawer is open. Setting overflow:hidden
    // on <body> breaks position:sticky on the storefront header (sticky
    // requires a scrollable ancestor), so we publish a data-attribute on
    // <html> that the CSS uses to swap the header to position:fixed for the
    // duration of the drawer open state. We also lock the <html> element so
    // touch scrolling / wheel events cannot escape the drawer.
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyTouchAction = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    document.documentElement.dataset.ynotMenuOpen = "true";
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.touchAction = previousBodyTouchAction;
      delete document.documentElement.dataset.ynotMenuOpen;
    };
  }, [open]);

  // Reset the drill-down level whenever the drawer closes so the next open
  // always lands on the main level.
  useEffect(() => {
    if (open) return;
    const resetSubMenu = window.setTimeout(() => {
      setActiveSubMenu(null);
    }, 0);
    return () => window.clearTimeout(resetSubMenu);
  }, [open]);

  useEffect(() => {
    if (activeSubMenu) {
      const renderSubMenu = window.setTimeout(() => {
        setRenderedSubMenu(activeSubMenu);
      }, 0);
      return () => window.clearTimeout(renderSubMenu);
    }

    const clearSubMenu = window.setTimeout(() => {
      setRenderedSubMenu(null);
    }, 330);

    return () => window.clearTimeout(clearSubMenu);
  }, [activeSubMenu]);

  useEffect(() => {
    if (!activeSubMenu) return;
    window.requestAnimationFrame(() => {
      if (featureRailRef.current) featureRailRef.current.scrollLeft = 0;
    });
  }, [activeSubMenu]);

  function closeAfter(action?: () => void) {
    return () => {
      action?.();
      setOpen(false);
    };
  }

  const megaForLang = headerMegaMenus[preferences.language] ?? {};
  const activeMega = renderedSubMenu ? megaForLang[renderedSubMenu] : null;
  const subMenuTitle = renderedSubMenu ? navStrings[renderedSubMenu] : "";

  // FoG/Justin Reed-style drill-down mobile drawer. Main panel lists every
  // top-level item; categories with submenus (mysteryPacks / marketplace)
  // open a sub-panel that slides in from the right with a back affordance.
  const drawerMarkup = (
    <>
      <div
        className={`store-drawer-backdrop${open ? " open" : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden={!open}
      />
      <aside
        className={`store-drawer${open ? " open" : ""}${activeSubMenu ? " drilled" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={copy.button}
        aria-hidden={!open}
      >
        {/* Main panel — primary nav + bottom group */}
        <div className="store-drawer-main">
          <nav className="store-drawer-primary" aria-label={copy.navigation}>
            <ul>
              {customerNav
                .filter((item) =>
                  (item.placement as readonly string[]).includes("drawer") &&
                  canRenderCustomerNavItem(item, { isAdmin, isOwner }),
                )
                .map((item) => {
                  // Cast to a plain string[] so `.includes` doesn't narrow
                  // item.key to a literal union — otherwise, when every
                  // remaining nav entry has a submenu, TypeScript narrows the
                  // fallthrough branch's `item` to `never`.
                  const hasSubmenu = (
                    ["mysteryPacks", "marketplace"] as readonly string[]
                  ).includes(item.key);
                  if (hasSubmenu) {
                    return (
                      <li key={item.href}>
                        <button
                          type="button"
                          className="store-drawer-link store-drawer-link-drill"
                          aria-haspopup="true"
                          aria-expanded={activeSubMenu === item.key}
                          onClick={() =>
                            setActiveSubMenu(item.key as HeaderMegaKey)
                          }
                        >
                          <span>{navStrings[item.key]}</span>
                          <span className="store-drawer-chev" aria-hidden>
                            {/* Thin geometric chevron, fixed at 7×12 so the
                                stroke stays hairline-thin no matter the
                                surrounding font-size. */}
                            <svg
                              viewBox="0 0 7 12"
                              width="7"
                              height="12"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1"
                              strokeLinecap="square"
                              strokeLinejoin="miter"
                              aria-hidden="true"
                              focusable="false"
                            >
                              <polyline points="0.5 0.5 6 6 0.5 11.5" />
                            </svg>
                          </span>
                        </button>
                      </li>
                    );
                  }
                  return (
                    <li key={item.href}>
                      <Link
                        className="store-drawer-link"
                        href={protectedHref(
                          item.href,
                          authenticated,
                          item.protected,
                        )}
                        prefetch={false}
                        onClick={closeAfter()}
                      >
                        {navStrings[item.key]}
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </nav>

          {/* Account actions (Admin / Log out) live in the My Page drawer
              for authenticated users; the language toggle stays here in the
              hamburger for everyone. Guests also keep sign up / log in. */}
          <div className="store-drawer-bottom">
            {!authenticated && (
              <div className="store-drawer-bottom-stack">
                <Link
                  className="store-drawer-bottom-link"
                  href="/signup"
                  prefetch={false}
                  onClick={closeAfter()}
                >
                  {copy.signUp}
                </Link>
                <Link
                  className="store-drawer-bottom-link"
                  href="/login"
                  prefetch={false}
                  onClick={closeAfter()}
                >
                  {copy.login}
                </Link>
              </div>
            )}

            <div className="store-drawer-lang-inline" role="group" aria-label={copy.language}>
              <button
                type="button"
                className={`store-drawer-lang-link${preferences.language === "en" ? " active" : ""}`}
                onClick={() => setLanguage("en")}
                aria-pressed={preferences.language === "en"}
              >
                {copy.en}
              </button>
              <span aria-hidden className="store-drawer-lang-sep">/</span>
              <button
                type="button"
                className={`store-drawer-lang-link${preferences.language === "th" ? " active" : ""}`}
                onClick={() => setLanguage("th")}
                aria-pressed={preferences.language === "th"}
              >
                {copy.th}
              </button>
            </div>
          </div>
        </div>

        {/* Sub-panel — slides in from right when a category is drilled into */}
        <div
          className={`store-drawer-sub${activeSubMenu ? " open" : ""}`}
          aria-hidden={!activeSubMenu}
        >
          <button
            type="button"
            className="store-drawer-back"
            onClick={() => setActiveSubMenu(null)}
            aria-label={preferences.language === "th" ? "กลับ" : "Back"}
          >
            <span className="store-drawer-back-arrow" aria-hidden>
              <svg
                viewBox="0 0 7 12"
                width="7"
                height="12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinecap="square"
                strokeLinejoin="miter"
                aria-hidden="true"
                focusable="false"
              >
                <polyline points="6.5 0.5 1 6 6.5 11.5" />
              </svg>
            </span>
            <span>{subMenuTitle}</span>
          </button>
          {activeMega && (
            <>
              <nav
                className="store-drawer-primary"
                aria-label={subMenuTitle}
              >
                <ul>
                  {activeMega.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        className="store-drawer-link"
                        href={link.href}
                        prefetch={false}
                        onClick={closeAfter()}
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
              <div
                ref={featureRailRef}
                className="store-drawer-feature-rail"
                aria-label={`${subMenuTitle} featured`}
              >
                {activeMega.features.map((feature) => (
                  <Link
                    key={feature.href}
                    className="store-drawer-feature-card"
                    href={feature.href}
                    prefetch={false}
                    onClick={closeAfter()}
                  >
                    <span className="store-drawer-feature-image-wrap">
                      <Image
                        src={feature.image}
                        alt={feature.alt}
                        width={266}
                        height={355}
                        sizes="266px"
                        className="store-drawer-feature-image"
                      />
                    </span>
                    <span className="store-drawer-feature-title">
                      {feature.title}
                    </span>
                  </Link>
                ))}
              </div>
            </>
          )}
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
        onClick={() => {
          if (!open) window.dispatchEvent(new Event("ynot:close-profile-drawer"));
          setOpen((value) => !value);
        }}
        title={copy.button}
        type="button"
      >
        <span aria-hidden className="settings-menu-icon">
          {/* Editorial menu glyph. 14×14 box centres the burger lines in the
              same spot the close cross uses so swapping between states does
              not shift the icon's apparent centre. */}
          <svg
            viewBox="0 0 14 14"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth={open ? "0.6" : "1"}
            strokeLinecap="butt"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            {open ? (
              <>
                <path d="M13 1 L1 13" />
                <path d="M1 1 L13 13" />
              </>
            ) : (
              <>
                <path d="M0 4.68 H14" />
                <path d="M0 9.68 H14" />
              </>
            )}
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
