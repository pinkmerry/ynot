import { cookies } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { isDevAuthAllowed } from "@/lib/security/dev-auth";
import type {
  HomeFilterState,
  HomeSeriesFilter,
  HomeSortOption,
  HomeTagFilter,
  YnotCampaign,
  YnotCategory,
  YnotCollectionItem,
  YnotDashboardData,
  YnotExchangeOrder,
  YnotOwnerApprovalRequest,
  YnotPaymentMethod,
  YnotPrizePreview,
  YnotRankingRow,
  YnotShippingRequest,
  YnotTopUp,
  YnotViewer,
  YnotWallet,
} from "./types";
import {
  featuredCampaigns,
  rewardTiers,
} from "./storefront-content";
import { allowDemoStorefront, productionSafetyLabel } from "./runtime-flags";
import { CoinMark } from "./cr/Icons";
import { FilterScrollGuard } from "./FilterScrollGuard";
import { HeaderScrollEffect } from "./HeaderScrollEffect";
import { MarketplaceFilterControls } from "./MarketplaceFilterControls";
import { normalizeOpenQuantityOptions } from "./open-quantity";
import {
  StoreAdminLink,
  StoreBrandHomeLink,
  StoreHeaderNav,
  StoreHeaderRightNav,
  StoreLanguageToggle,
  StoreSettingsMenu,
} from "./StorePreferences";
import { PackDragDrop } from "./PackDragDrop";
import {
  DEMO_PACK_ORDER_COOKIE,
  HERO_PACKS_COOKIE,
  applyDemoPackOrderOverrides,
  parseDemoPackOrderCookie,
  parseHeroPacksCookie,
} from "./demo-pack-order";
import {
  type PrizeDisplayTier,
  prizeDisplayTierOptions,
  prizeDisplayTierValue,
} from "./prize-tier";
import { getWallet } from "./data";
import {
  ynotShippingStatusCustomerLabel,
  ynotShippingTrackingLabel,
} from "./shipping-status";
import { TopUpTable } from "./TopUpTable";
import { I18nText, i18n } from "./i18n";

const defaultHomeFilter: HomeFilterState = {
  series: "all",
  tag: "all",
  sort: "recommended",
};

const adminNavItems = [
  { href: "/admin", label: "Dashboard", kicker: "Control" },
  { href: "/admin/campaigns", label: "Random Packs", kicker: "Studio" },
  { href: "/admin/categories", label: "Categories", kicker: "Catalog" },
  { href: "/admin/prizes", label: "Prizes", kicker: "Cards" },
  { href: "/admin/users", label: "Users", kicker: "Accounts" },
  { href: "/admin/top-ups", label: "Top-ups", kicker: "Wallet" },
  { href: "/admin/marketplace", label: "Marketplace", kicker: "Orders" },
  { href: "/admin/rankings", label: "Rankings", kicker: "Leaderboard" },
  { href: "/admin/shipping", label: "Shipping", kicker: "Fulfill" },
  { href: "/admin/settings", label: "Settings", kicker: "Payments" },
  { href: "/admin/tier-animations", label: "Reveal Videos", kicker: "Gacha" },
  { href: "/admin/audit", label: "Audit", kicker: "Log" },
  { href: "/admin/health", label: "Health", kicker: "System" },
] as const;

const adminCategoryCards = [
  {
    series: "pokemon",
    title: "Pokemon",
    subtitle: "PSA10, Japanese chase cards, sealed pack campaigns",
    accent: "⚡",
    status: "Active fixed series",
  },
  {
    series: "one_piece",
    title: "One Piece",
    subtitle: "Manga rare, leader parallel, treasure box campaigns",
    accent: "☠️",
    status: "Active fixed series",
  },
] as const;

const VALID_HOME_SERIES: ReadonlySet<HomeSeriesFilter> = new Set<HomeSeriesFilter>([
  "all",
  "pokemon",
  "one_piece",
  "football",
  "basketball",
  "soccer",
  "baseball",
  "magical",
  "super",
  "multi_sport",
]);

export function normalizeHomeSeries(
  value: string | string[] | undefined,
): HomeSeriesFilter {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return rawValue && VALID_HOME_SERIES.has(rawValue as HomeSeriesFilter)
    ? (rawValue as HomeSeriesFilter)
    : "all";
}

export function normalizeHomeTag(
  value: string | string[] | undefined,
): HomeTagFilter {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return rawValue === "new" || rawValue === "psa10" ? rawValue : "all";
}

export function normalizeHomeSort(
  value: string | string[] | undefined,
): HomeSortOption {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return rawValue === "latest" ||
    rawValue === "coins-desc" ||
    rawValue === "coins-asc"
    ? rawValue
    : "recommended";
}

function displayCampaigns(campaigns: YnotCampaign[]) {
  return campaigns.length
    ? campaigns
    : allowDemoStorefront()
      ? featuredCampaigns
      : [];
}

type PackTier = "legendary" | "gold" | "silver" | "common";

const PACK_TIER_ORDER: PackTier[] = ["legendary", "gold", "silver", "common"];
const PACK_TIER_COPY: Record<
  PackTier,
  { label: ReactNode; heading: ReactNode; aria: string; subtitle: (count: number) => ReactNode }
> = {
  legendary: {
    label: i18n("Legendary", "ระดับตำนาน"),
    heading: i18n("LEGENDARY", "ระดับตำนาน"),
    aria: "Legendary mystery packs / Y-Packs ระดับตำนาน",
    subtitle: (count) => i18n(
      `${count} slab${count === 1 ? "" : "s"}/pack`,
      `${count} แพ็กสแลบ`,
    ),
  },
  gold: {
    label: i18n("Gold", "โกลด์"),
    heading: i18n("GOLD", "โกลด์"),
    aria: "Gold mystery packs / Y-Packs โกลด์",
    subtitle: (count) => i18n(
      `${count} slab${count === 1 ? "" : "s"}/pack`,
      `${count} แพ็กสแลบ`,
    ),
  },
  silver: {
    label: i18n("Silver", "ซิลเวอร์"),
    heading: i18n("SILVER", "ซิลเวอร์"),
    aria: "Silver mystery packs / Y-Packs ซิลเวอร์",
    subtitle: (count) => i18n(
      `${count} slab${count === 1 ? "" : "s"}/pack`,
      `${count} แพ็กสแลบ`,
    ),
  },
  common: {
    label: i18n("Common", "ทั่วไป"),
    heading: i18n("COMMON", "ทั่วไป"),
    aria: "Common mystery packs / Y-Packs ทั่วไป",
    subtitle: (count) => i18n(
      `${count} slab${count === 1 ? "" : "s"}/pack`,
      `${count} แพ็กสแลบ`,
    ),
  },
};

/** Assign a tier bucket based on coin cost. Lets the storefront mirror
 *  arenaclub.com's tiered slab-pack sections (Legendary / Gold / Silver…)
 *  without requiring a separate tier column on the campaigns table. */
function packTier(campaign: YnotCampaign): PackTier {
  const cost = Number.isFinite(campaign.costCoins)
    ? Number(campaign.costCoins)
    : 0;
  if (cost >= 200) return "legendary";
  if (cost >= 100) return "gold";
  if (cost >= 50) return "silver";
  return "common";
}

function seriesLabel(series: YnotCampaign["series"]) {
  return series === "pokemon" ? "Pokemon" : "One Piece";
}

function campaignStatusLabel(status: YnotCampaign["status"]) {
  switch (status) {
    case "live":
      return i18n("Live", "เปิดขาย");
    case "draft":
      return i18n("Draft", "ฉบับร่าง");
    case "closed":
      return i18n("Closed", "ปิดแล้ว");
    case "archived":
      return i18n("Archived", "เก็บถาวร");
  }
}

function campaignTitleText(campaign: YnotCampaign) {
  return campaign.titleEn || campaign.titleTh || campaign.slug || "Y-Pack";
}

function campaignTitle(campaign: YnotCampaign) {
  return i18n(
    campaign.titleEn || campaign.titleTh || campaign.slug || "Y-Pack",
    campaign.titleTh || campaign.titleEn || campaign.slug || "Y-Pack",
  );
}

function homeFilterHref(
  nextFilter: Partial<HomeFilterState> & { baseHref?: string },
) {
  const baseHref = nextFilter.baseHref ?? "/";
  const filter = { ...defaultHomeFilter, ...nextFilter };
  const params = new URLSearchParams();
  if (filter.series !== "all") params.set("series", filter.series);
  if (filter.tag !== "all") params.set("tag", filter.tag);
  if (filter.sort !== "recommended") params.set("sort", filter.sort);
  const query = params.toString();
  return query ? `${baseHref}?${query}` : baseHref;
}

function campaignTagSearchText(campaign: YnotCampaign) {
  return [
    campaign.titleTh,
    campaign.titleEn,
    campaign.categoryLabel,
    campaign.heroLabel,
    ...campaignDisplayTags(campaign),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function campaignMatchesTag(campaign: YnotCampaign, tag: HomeTagFilter) {
  if (tag === "all") return true;
  const searchText = campaignTagSearchText(campaign);
  if (tag === "new") return searchText.includes("new");
  return searchText.includes("psa10");
}

function campaignTimestamp(campaign: YnotCampaign) {
  const rawDate = campaign.startsAt ?? campaign.createdAt ?? campaign.endsAt;
  if (!rawDate) return 0;
  const timestamp = Date.parse(rawDate);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function byTitle(left: YnotCampaign, right: YnotCampaign) {
  return (left.titleTh || left.titleEn).localeCompare(
    right.titleTh || right.titleEn,
  );
}

function sortedCampaigns(campaigns: YnotCampaign[], sort: HomeSortOption) {
  if (sort === "recommended") {
    // Honor the admin-controlled sortOrder column. Lower numbers float to the
    // top — first two land in the featured slots, the rest fill the LEGENDARY
    // grid. Campaigns without an explicit value sink to the bottom but stay in
    // their original order.
    return [...campaigns].sort((left, right) => {
      const leftOrder = Number.isFinite(left.sortOrder)
        ? (left.sortOrder as number)
        : Number.POSITIVE_INFINITY;
      const rightOrder = Number.isFinite(right.sortOrder)
        ? (right.sortOrder as number)
        : Number.POSITIVE_INFINITY;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return byTitle(left, right);
    });
  }
  const items = [...campaigns];
  if (sort === "latest") {
    return items.sort(
      (left, right) =>
        campaignTimestamp(right) - campaignTimestamp(left) ||
        byTitle(left, right),
    );
  }
  return items.sort((left, right) => {
    const priceSort =
      sort === "coins-desc"
        ? right.costCoins - left.costCoins
        : left.costCoins - right.costCoins;
    return priceSort || byTitle(left, right);
  });
}

function filteredCampaigns(
  campaigns: YnotCampaign[],
  filter: HomeFilterState,
  demoOverrides: Record<string, number> = {},
) {
  // displayCampaigns may swap in the hardcoded featuredCampaigns demo fallback
  // when the real list is empty. Apply the cookie-driven overrides on that
  // fallback too so admin reorder works in dev mode.
  const displayed = displayCampaigns(campaigns);
  const sourceWithOverrides = Object.keys(demoOverrides).length
    ? applyDemoPackOrderOverrides(displayed, demoOverrides)
    : displayed;
  const filtered = sourceWithOverrides.filter((campaign) => {
    const matchesSeries =
      filter.series === "all" ||
      (campaign.series as string) === (filter.series as string);
    return matchesSeries && campaignMatchesTag(campaign, filter.tag);
  });
  return sortedCampaigns(filtered, filter.sort);
}

type PackReorderInfo = {
  campaignId: string;
  position: number;
  currentSortOrder: number;
  prevId: string | null;
  prevSortOrder: number | null;
  nextId: string | null;
  nextSortOrder: number | null;
};

async function AdminPackPickerLauncher({
  enabled,
  variant,
  targetTier,
}: {
  enabled: boolean;
  variant?: "card" | "button";
  targetTier?: PackTier;
}) {
  if (!enabled) return null;
  const { PackPickerLauncher } = await import("./StorefrontAdminControls");
  return <PackPickerLauncher variant={variant} targetTier={targetTier} />;
}

async function AdminPackManagementControls({
  enabled,
  campaignId,
  campaignTitle,
  variant,
  reorderInfo,
}: {
  enabled: boolean;
  campaignId: string;
  campaignTitle: string;
  variant: "card" | "feature";
  reorderInfo?: PackReorderInfo | null;
}) {
  if (!enabled) return null;
  const { PackDeleteButton, PackOrderControls } = await import(
    "./StorefrontAdminControls"
  );
  return (
    <>
      <PackDeleteButton
        campaignId={campaignId}
        campaignTitle={campaignTitle}
        variant={variant}
      />
      {reorderInfo && (
        <PackOrderControls
          campaignId={reorderInfo.campaignId}
          position={reorderInfo.position}
          currentSortOrder={reorderInfo.currentSortOrder}
          prevId={reorderInfo.prevId}
          prevSortOrder={reorderInfo.prevSortOrder}
          nextId={reorderInfo.nextId}
          nextSortOrder={reorderInfo.nextSortOrder}
          canMoveUp={!!reorderInfo.prevId}
          canMoveDown={!!reorderInfo.nextId}
          variant={variant}
        />
      )}
    </>
  );
}

async function AdminOwnerApprovalQueue({
  enabled,
  requests,
  viewerRole,
}: {
  enabled: boolean;
  requests: YnotOwnerApprovalRequest[];
  viewerRole?: "owner" | "admin" | "staff" | null;
}) {
  if (!enabled) return null;
  const { OwnerApprovalQueue } = await import("./StorefrontAdminControls");
  return <OwnerApprovalQueue requests={requests} viewerRole={viewerRole} />;
}

async function AdminCategoryRowActionsSlot({
  categoryId,
  categorySlug,
  categoryName,
  packCount,
  isLegacySeries,
}: {
  categoryId: string;
  categorySlug: string;
  categoryName: string;
  packCount: number;
  isLegacySeries: boolean;
}) {
  const { AdminCategoryRowActions } = await import("./StorefrontAdminControls");
  return (
    <AdminCategoryRowActions
      categoryId={categoryId}
      categorySlug={categorySlug}
      categoryName={categoryName}
      packCount={packCount}
      isLegacySeries={isLegacySeries}
    />
  );
}

/** Build the neighbour map used by the admin reorder UI. Campaigns without an
 *  explicit `sortOrder` get a synthetic value derived from their position so
 *  the swap API still has a real number to write back. */
function buildPackReorderInfo(
  campaigns: YnotCampaign[],
): Map<string, PackReorderInfo> {
  const effective = campaigns.map((campaign, index) => ({
    id: campaign.id,
    sortOrder: Number.isFinite(campaign.sortOrder)
      ? (campaign.sortOrder as number)
      : (index + 1) * 10,
  }));
  const map = new Map<string, PackReorderInfo>();
  for (let index = 0; index < effective.length; index += 1) {
    const current = effective[index];
    const previous = index > 0 ? effective[index - 1] : null;
    const next = index < effective.length - 1 ? effective[index + 1] : null;
    map.set(current.id, {
      campaignId: current.id,
      position: index + 1,
      currentSortOrder: current.sortOrder,
      prevId: previous?.id ?? null,
      prevSortOrder: previous?.sortOrder ?? null,
      nextId: next?.id ?? null,
      nextSortOrder: next?.sortOrder ?? null,
    });
  }
  return map;
}

function remaining(campaign: YnotCampaign) {
  const remainingSlots = campaign.remainingSlots;
  if (typeof remainingSlots !== "number" || !Number.isFinite(remainingSlots))
    return null;
  return Math.max(0, remainingSlots);
}

function isCampaignSoldOut(campaign: YnotCampaign) {
  const remainingSlots = remaining(campaign);
  return (
    Boolean(campaign.soldOut) ||
    (remainingSlots !== null && remainingSlots <= 0)
  );
}

function remainingPercent(campaign: YnotCampaign) {
  if (isCampaignSoldOut(campaign)) return 0;
  const remainingSlots = remaining(campaign);
  if (remainingSlots === null) return null;
  return Math.max(
    3,
    Math.min(100, (remainingSlots / Math.max(campaign.totalSlots, 1)) * 100),
  );
}

function remainingRatioText(campaign: YnotCampaign) {
  if (isCampaignSoldOut(campaign)) return i18n("Sold out", "หมดแล้ว");
  const remainingSlots = remaining(campaign);
  if (remainingSlots === null) return i18n("Server-tracked stock", "สต็อกตรวจสอบโดยระบบ");
  return `${remainingSlots.toLocaleString()}/${campaign.totalSlots.toLocaleString()}`;
}

function ProgressTrack({ campaign }: { campaign: YnotCampaign }) {
  const percent = remainingPercent(campaign);
  if (percent === null)
    return (
      <div
        className="progress-track stock-untracked"
        aria-label="Stock is tracked server-side / สต็อกตรวจสอบโดยระบบ"
      />
    );
  return (
    <div className="progress-track">
      <span style={{ width: `${percent}%` }} />
    </div>
  );
}

function campaignDisplayTags(campaign: YnotCampaign) {
  const fallback = campaign.series === "pokemon" ? ["PSA10"] : ["Manga"];
  const tags =
    campaign.displayTags?.map((tag) => tag.trim()).filter(Boolean) ?? [];
  return (tags.length ? tags : fallback).slice(0, 3);
}

function formatCoins(value: number) {
  return value.toLocaleString();
}

export async function YnotShell({
  viewer,
  children,
  homeFilter,
  homeFilterBaseHref = "/",
  walletBalance,
  showHeaderCoin = true,
  shellClassName,
  viewerMode = "preview",
}: {
  viewer: YnotViewer;
  children: ReactNode;
  homeFilter?: HomeFilterState;
  homeFilterBaseHref?: string;
  walletBalance?: number;
  showHeaderCoin?: boolean;
  shellClassName?: string;
  viewerMode?: "preview" | "literal";
}) {
  let renderViewer = viewer;
  let renderBalance = walletBalance;
  // Explicit dev-auth preview: production keeps the real viewer untouched,
  // and localhost only gets owner rendering when the dev flag is set.
  if (viewerMode === "preview" && isDevAuthAllowed()) {
    renderViewer = {
      ...viewer,
      authenticated: true,
      displayName: viewer.displayName || "Preview User",
      isAdmin: true,
      adminRole: viewer.adminRole ?? "owner",
      authSource: viewer.authSource ?? "supabase",
    };
    if (typeof renderBalance !== "number" || renderBalance === 0) {
      renderBalance = 1250;
    }
  }
  if (showHeaderCoin && renderViewer.authenticated && typeof renderBalance !== "number") {
    renderBalance = (await getWallet(renderViewer.profileId)).balanceCoins;
  }
  return (
    <main className={`app-shell store-shell mobile-safe space-y-7${shellClassName ? ` ${shellClassName}` : ""}`}>
      <header className="storefront-header sticky top-0 z-50">
        <div className="store-topbar">
          <div className="store-topbar-left">
            {renderViewer.authenticated ? (
              <StoreSettingsMenu
                authenticated
                isAdmin={renderViewer.isAdmin}
                isOwner={renderViewer.adminRole === "owner"}
              />
            ) : (
              <StoreSettingsMenu />
            )}
            <StoreHeaderNav
              authenticated={renderViewer.authenticated}
              isAdmin={renderViewer.isAdmin}
              isOwner={renderViewer.adminRole === "owner"}
            />
          </div>
          <StoreBrandHomeLink />
          <div className="store-topbar-right">
            <StoreAdminLink
              authenticated={renderViewer.authenticated}
              isAdmin={renderViewer.isAdmin}
            />
            <StoreLanguageToggle />
            {showHeaderCoin && renderViewer.authenticated && (
              <Link
                href="/wallet"
                className="header-coin-pill"
                aria-label={`Coin balance ${typeof renderBalance === "number" ? formatCoins(renderBalance) : "0"} · Tap to top up / ยอดเหรียญ ${typeof renderBalance === "number" ? formatCoins(renderBalance) : "0"} · แตะเพื่อเติมเหรียญ`}
              >
                <TopUpCoinIcon />
                <span className="header-coin-amount">
                  {typeof renderBalance === "number"
                    ? formatCoins(renderBalance)
                    : "—"}
                </span>
              </Link>
            )}
            <StoreHeaderRightNav
              authenticated={renderViewer.authenticated}
              isAdmin={renderViewer.isAdmin}
              displayName={renderViewer.displayName}
              balance={renderBalance}
            />
          </div>
        </div>
        {homeFilter && (
          <StoreFilterStrip
            homeFilter={homeFilter}
            baseHref={homeFilterBaseHref}
          />
        )}
      </header>
      <HeaderScrollEffect />
      {homeFilter && <FilterScrollGuard />}
      {children}
      <YnotFooter />
    </main>
  );
}

function YnotFooter() {
  return (
    <footer className="ynot-footer" aria-label="Site footer / ส่วนท้ายเว็บไซต์">
      <div className="ynot-footer-interior">
        <nav className="ynot-footer-nav" aria-label="Footer navigation / เมนูส่วนท้าย">
          <ul className="ynot-footer-list">
            <li className="ynot-footer-item">
              <span
                className="ynot-footer-link is-disabled"
                aria-disabled="true"
                role="link"
                tabIndex={-1}
              >
                <span className="i18n-en">How It Works</span>
                <span className="i18n-th">วิธีใช้งาน</span>
              </span>
            </li>
            <li className="ynot-footer-item">
              <span
                className="ynot-footer-link is-disabled"
                aria-disabled="true"
                role="link"
                tabIndex={-1}
              >
                <span className="i18n-en">Terms &amp; Conditions</span>
                <span className="i18n-th">ข้อกำหนดและเงื่อนไข</span>
              </span>
            </li>
            <li className="ynot-footer-item">
              <Link href="/contact" className="ynot-footer-link" prefetch={false}>
                <span className="i18n-en">Contact</span>
                <span className="i18n-th">ติดต่อเรา</span>
              </Link>
            </li>
            <li className="ynot-footer-item">
              <a
                href="https://instagram.com/ynot"
                target="_blank"
                rel="noreferrer"
                className="ynot-footer-link"
              >
                <span className="i18n-en">Social</span>
                <span className="i18n-th">โซเชียล</span>
              </a>
            </li>
          </ul>
        </nav>
      </div>
      <div className="ynot-footer-copyright-row">
        <p className="ynot-footer-copyright">
          <span className="ynot-copy-symbol">©</span> 2026 YNOT
        </p>
      </div>
    </footer>
  );
}

function TopUpCoinIcon() {
  // Brand coin in the header balance pill. filter:none overrides the legacy
  // orange glow on .header-coin-mark so the green mark doesn't get an orange halo.
  return (
    <span aria-hidden className="header-coin-mark" style={{ filter: "none" }}>
      <CoinMark />
    </span>
  );
}

type StoreFilterChip = { label: ReactNode; series: HomeSeriesFilter };

const storeFilterChips: readonly StoreFilterChip[] = [
  { label: i18n("All", "ทั้งหมด"), series: "all" },
  { label: i18n("Football", "ฟุตบอลอเมริกัน"), series: "football" },
  { label: "Pokemon", series: "pokemon" },
  { label: "One Piece", series: "one_piece" },
  { label: i18n("Basketball", "บาสเกตบอล"), series: "basketball" },
  { label: i18n("Soccer", "ฟุตบอล"), series: "soccer" },
  { label: i18n("Baseball", "เบสบอล"), series: "baseball" },
  { label: i18n("Magical", "เวทมนตร์"), series: "magical" },
  { label: i18n("Super", "ซูเปอร์"), series: "super" },
  { label: i18n("Multi-Sport", "กีฬารวม"), series: "multi_sport" },
];

/** Inline icon for each category chip. Arena Club's /slab-packs filter bar
 *  ships every pill with a small monochrome glyph; we mirror that here so
 *  the row reads at a glance instead of being a wall of text. Icons are
 *  intentionally simple line/fill SVGs (no external icon library round trip)
 *  sized to 14×14 so they slot between the pill padding without resizing. */
function StoreFilterChipIcon({ series }: { series: HomeSeriesFilter }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
  };
  switch (series) {
    case "all":
      return (
        <svg {...common}>
          <rect x="2" y="2" width="5" height="5" rx="1" />
          <rect x="9" y="2" width="5" height="5" rx="1" />
          <rect x="2" y="9" width="5" height="5" rx="1" />
          <rect x="9" y="9" width="5" height="5" rx="1" />
        </svg>
      );
    case "football":
      return (
        <svg {...common}>
          <ellipse cx="8" cy="8" rx="6" ry="3.6" transform="rotate(-30 8 8)" />
          <path d="M5.6 8.5l4.8-1.6" />
          <path d="M6.6 9.6l0.6-0.6" />
          <path d="M7.6 10.2l0.6-0.6" />
          <path d="M8.6 10.8l0.6-0.6" />
        </svg>
      );
    case "pokemon":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6" />
          <path d="M2 8h12" />
          <circle cx="8" cy="8" r="1.8" fill="currentColor" />
        </svg>
      );
    case "one_piece":
      return (
        <svg {...common}>
          <path d="M4 6c0-2 1.8-3.4 4-3.4S12 4 12 6v2.4c0 .6-.4 1-1 1H5c-.6 0-1-.4-1-1V6z" />
          <circle cx="6.4" cy="6.4" r="0.7" fill="currentColor" stroke="none" />
          <circle cx="9.6" cy="6.4" r="0.7" fill="currentColor" stroke="none" />
          <path d="M6.5 11l3 2.4M9.5 11l-3 2.4" />
        </svg>
      );
    case "basketball":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6" />
          <path d="M2 8h12M8 2v12" />
          <path d="M3.2 4.4c1.8 1 3 2.6 3 4.4M12.8 4.4c-1.8 1-3 2.6-3 4.4" />
        </svg>
      );
    case "soccer":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6" />
          <polygon points="8,5 10.3,6.7 9.4,9.4 6.6,9.4 5.7,6.7" />
          <path d="M8 2.4v2.6M2.4 8.2l3.3-1.5M13.6 8.2l-3.3-1.5M5 13.6l1.6-2.2M11 13.6l-1.6-2.2" />
        </svg>
      );
    case "baseball":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6" />
          <path d="M3.2 4.6c2 1 3.6 2.6 4.6 4.6" />
          <path d="M12.8 4.6c-2 1-3.6 2.6-4.6 4.6" />
        </svg>
      );
    case "magical":
      return (
        <svg {...common}>
          <path d="M8 2v3M8 11v3M2 8h3M11 8h3" />
          <path d="M4 4l2 2M12 4l-2 2M4 12l2-2M12 12l-2-2" />
          <circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none" />
        </svg>
      );
    case "super":
      return (
        <svg {...common}>
          <path d="M9 2L3.5 9h3l-1 5L12 7h-3l1-5z" />
        </svg>
      );
    case "multi_sport":
      return (
        <svg {...common}>
          <circle cx="5.2" cy="5.2" r="2.8" />
          <circle cx="10.8" cy="5.2" r="2.8" />
          <circle cx="8" cy="10.4" r="2.8" />
        </svg>
      );
    default:
      return null;
  }
}

function StoreFilterStrip({
  homeFilter,
  baseHref,
}: {
  homeFilter: HomeFilterState;
  baseHref: string;
}) {
  return (
    <div
      className="store-filter-strip"
      aria-label="Mystery pack filters / ตัวกรอง Y-Packs"
    >
      <div className="store-filter-scroll">
        {storeFilterChips.map((category) => {
          const isActive = homeFilter.series === category.series;
          return (
            <Link
              key={category.series}
              aria-current={isActive ? "page" : undefined}
              className={`filter-chip filter-chip--with-icon ${isActive ? "active" : ""}`}
              href={homeFilterHref({
                series: category.series,
                tag: homeFilter.tag,
                sort: homeFilter.sort,
                baseHref,
              })}
              scroll={false}
            >
              <span className="filter-chip-icon" aria-hidden>
                <StoreFilterChipIcon series={category.series} />
              </span>
              <span className="filter-chip-label">{category.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="page-intro">
      <div className="min-w-0">
        <p className="section-label">{eyebrow}</p>
        <h2 className="page-title">{title}</h2>
        <p className="page-description">{description}</p>
      </div>
      {action && <div className="page-action">{action}</div>}
    </section>
  );
}

function PhoneTopBar({
  title,
  coin,
  action,
}: {
  title: ReactNode;
  coin?: number | string;
  action?: ReactNode;
}) {
  return (
    <div className="template-top-bar">
      <h2>{title}</h2>
      <div className="template-top-actions">
        {coin !== undefined && (
          <span className="coin-pill">
            <CoinIcon /> {typeof coin === "number" ? formatCoins(coin) : coin}
          </span>
        )}
        {action}
      </div>
    </div>
  );
}

function PhoneRule() {
  return (
    <div className="phone-rule" aria-hidden>
      <span />
      <span />
      <span />
    </div>
  );
}

export function YnotHomeExperience({
  data,
  homeFilter = defaultHomeFilter,
}: {
  data: YnotDashboardData;
  homeFilter?: HomeFilterState;
}) {
  const campaigns = filteredCampaigns(data.campaigns, homeFilter);
  const showMarketplace = data.viewer.adminRole === "owner";

  return (
    <>
      <MobileTorecaHero campaign={campaigns[0]} />
      <SeriesEssentialsSection showMarketplace={showMarketplace} />
    </>
  );
}

/** Mystery Packs page — arenaclub.com/slab-packs inspired layout in FOG mint theme.
 *  Two-up promo banners on top, category filter (from header), then pack card grid.
 *  When the viewer is an admin, every card shows a small "EDIT" badge that
 *  shortcuts to /admin/campaigns; customers see only the standard gacha flow. */
export async function PacksExperience({
  data,
  homeFilter = defaultHomeFilter,
}: {
  data: YnotDashboardData;
  homeFilter?: HomeFilterState;
}) {
  // Demo-mode reorder overrides. In production data.configured is true and we
  // rely on the database's sort_order; in dev/demo we layer cookie-driven
  // overrides on top of the hardcoded featuredCampaigns fallback so admin
  // reorder clicks actually move cards around between refreshes.
  const cookieStore = await cookies();
  const demoOverrides = data.configured
    ? {}
    : parseDemoPackOrderCookie(cookieStore.get(DEMO_PACK_ORDER_COOKIE)?.value);
  // Demo packs (id prefix "storefront-") are hardcoded fallbacks and can't
  // be archived by admins — their archive controls are hidden in the JSX
  // below — so we always render the full demo set when the DB is empty.
  const sourceCampaigns = Object.keys(demoOverrides).length
    ? applyDemoPackOrderOverrides(data.campaigns, demoOverrides)
    : data.campaigns;
  const campaigns = filteredCampaigns(sourceCampaigns, homeFilter, demoOverrides);
  // "Featured" packs are tracked in an independent cookie so reordering
  // inside tier sections never promotes / demotes anything. The cookie
  // stores the explicit hero order; campaigns missing from `campaigns`
  // (filtered out by series / tag) are skipped without disturbing the
  // cookie state.
  const heroIds = parseHeroPacksCookie(
    cookieStore.get(HERO_PACKS_COOKIE)?.value,
  );
  const campaignsById = new Map(campaigns.map((c) => [c.id, c]));
  const featuredCampaignsList = heroIds
    .map((id) => campaignsById.get(id))
    .filter((c): c is YnotCampaign => !!c);
  // Dev-auth bypass mirrors AdminGate / YnotShell. Production still requires
  // the real admin role.
  const isAdmin = data.viewer.isAdmin || isDevAuthAllowed();
  // The reorder map is built off the full sorted list (NOT the duplicated
  // grid items) so swapping always targets real campaign ids.
  const reorderInfo = isAdmin ? buildPackReorderInfo(campaigns) : null;

  return (
    <div className="store-home-grid packs-page">
      <PackDragDrop enabled={isAdmin} />
      <div className="store-main-stack">
        <div className="catalog-toolbar packs-toolbar">
          <h1>Y-Packs</h1>
          <p>
            {i18n(
              `${campaigns.length} slab pack${campaigns.length === 1 ? "" : "s"}`,
              `${campaigns.length} แพ็กสแลบ`,
            )}
          </p>
          <AdminPackPickerLauncher enabled={isAdmin} variant="button" />
        </div>

        {(featuredCampaignsList.length > 0 || isAdmin) && (
          <section
            className="packs-feature-row"
            data-hero-count={featuredCampaignsList.length}
            aria-label="Featured mystery packs / Y-Packs แนะนำ"
          >
            {featuredCampaignsList.map((campaign, index) => {
              const info = reorderInfo?.get(campaign.id) ?? null;
              // Alternate blue / amber for visual contrast in the hero — the
              // exact palette doesn't carry meaning, it's just FoG/arenaclub
              // style "two-tone hero" banding.
              const palette = index % 2 === 0 ? "blue" : "amber";
              return (
                <div
                  key={campaign.id}
                  data-pack-id={isAdmin ? campaign.id : campaign.slug}
                  data-pack-sort-order={
                    info?.currentSortOrder ?? campaign.sortOrder ?? ""
                  }
                  className={`packs-feature-card-wrap${isAdmin ? " has-admin-edit" : ""}`}
                >
                  {isAdmin && (
                    <span
                      className="pack-drag-handle"
                      data-pack-drag-handle="true"
                      title="Drag to reorder"
                      aria-label="Drag to reorder this pack"
                    >
                      <svg
                        viewBox="0 0 12 16"
                        width="14"
                        height="14"
                        fill="currentColor"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <circle cx="3.5" cy="3" r="1.2" />
                        <circle cx="3.5" cy="8" r="1.2" />
                        <circle cx="3.5" cy="13" r="1.2" />
                        <circle cx="8.5" cy="3" r="1.2" />
                        <circle cx="8.5" cy="8" r="1.2" />
                        <circle cx="8.5" cy="13" r="1.2" />
                      </svg>
                    </span>
                  )}
                  <Link
                    href={`/packs/${campaign.slug}`}
                    className={`packs-feature-card packs-feature-card--${palette}`}
                  >
                    <span className="packs-feature-eyebrow">
                      {seriesLabel(campaign.series)} · <I18nText en="Series" th="ซีรีส์" />
                    </span>
                    <strong className="packs-feature-title">
                      {campaignTitle(campaign)}
                    </strong>
                    <span className="packs-feature-price">
                      <CoinIcon /> {formatCoins(campaign.costCoins)}{" "}
                      <I18nText en="/ pack" th="/ แพ็ก" />
                    </span>
                    <span className="packs-feature-cta">
                      <I18nText en="Buy now" th="ซื้อเลย" />
                    </span>
                  </Link>
                  {isAdmin && (
                    <Link
                      className="pack-admin-edit"
                      href="/admin/campaigns"
                      aria-label={`Edit ${campaign.titleEn || campaign.titleTh} in admin`}
                    >
                      Edit
                    </Link>
                  )}
                  <AdminPackManagementControls
                    enabled={isAdmin}
                    campaignId={campaign.id}
                    campaignTitle={campaign.titleEn || campaign.titleTh}
                    variant="feature"
                    reorderInfo={info}
                  />
                </div>
              );
            })}
            {/* Empty-state placeholder — only shown when zero packs are
                featured. Once at least one card is in the hero row the
                grid distributes cards evenly (1/1, 1/2, 1/3 …) without
                an empty slot stealing a column. Admin can still add more
                packs via the "+ Add pack" button near the heading. */}
            <AdminPackPickerLauncher
              enabled={isAdmin && featuredCampaignsList.length === 0}
            />
          </section>
        )}

        {(() => {
          // Group every pack (including the featured ones, so customers can
          // also see them in their tier shelves) by computed tier and render
          // a separate section per non-empty tier — mirroring the way
          // arenaclub.com lays out "Legendary / Gold / Silver / Misc" rows.
          const sourceForTiers = campaigns.length ? campaigns : [];
          const grouped = new Map<PackTier, YnotCampaign[]>();
          for (const campaign of sourceForTiers) {
            const tier = packTier(campaign);
            const bucket = grouped.get(tier) ?? [];
            bucket.push(campaign);
            grouped.set(tier, bucket);
          }
          const nonEmptyTiers = PACK_TIER_ORDER.filter((tier) => {
            const list = grouped.get(tier);
            return list && list.length > 0;
          });
          if (!nonEmptyTiers.length) {
            return (
              <section className="home-pack-board product-section" aria-label="Mystery pack catalog / แคตตาล็อก Y-Packs">
                <CampaignGrid
                  campaigns={[]}
                  emptyTitle={i18n(
                    "No real live packs are published yet",
                    "ยังไม่มีแพ็กจริงที่เผยแพร่",
                  )}
                  emptyBody={i18n(
                    "Published Supabase campaigns will appear here after an owner makes them live and public.",
                    "แคมเปญที่เผยแพร่จาก Supabase จะแสดงที่นี่หลังเจ้าของตั้งค่าเป็น live และ public",
                  )}
                  showAdminEdit={isAdmin}
                />
              </section>
            );
          }
          return (
            <>
              {nonEmptyTiers.map((tier) => {
                const tierCampaigns = grouped.get(tier) ?? [];
                return (
                  <div key={tier} className={`packs-tier-block packs-tier-block--${tier}`}>
                    <header className="packs-tier-heading">
                      <h2 className="packs-tier-title">
                        {PACK_TIER_COPY[tier].heading}
                      </h2>
                      <p className="packs-tier-subtitle">
                        {PACK_TIER_COPY[tier].subtitle(tierCampaigns.length)}
                      </p>
                      <AdminPackPickerLauncher
                        enabled={isAdmin}
                        variant="button"
                        targetTier={tier}
                      />
                    </header>
                    <section
                      className="home-pack-board product-section"
                      aria-label={PACK_TIER_COPY[tier].aria}
                    >
                      <CampaignGrid
                        campaigns={tierCampaigns}
                        emptyTitle={i18n("No packs match this filter", "ไม่มีแพ็กตรงกับตัวกรองนี้")}
                        emptyBody={i18n(
                          "Try All, switch category, or ask admin to add matching pack labels.",
                          "ลองเลือกทั้งหมด เปลี่ยนหมวดหมู่ หรือให้แอดมินเพิ่มป้ายกำกับแพ็กที่ตรงกัน",
                        )}
                        showAdminEdit={isAdmin}
                        reorderInfo={reorderInfo ?? undefined}
                      />
                    </section>
                  </div>
                );
              })}
            </>
          );
        })()}
      </div>
    </div>
  );
}

const marketplaceFilters = [
  { label: i18n("All offers", "ทั้งหมด"), key: "all" },
  { label: i18n("Official Shop", "ร้านทางการ"), key: "official_shop" },
  { label: i18n("User Sellers", "ผู้ขายทั่วไป"), key: "user_seller" },
  { label: i18n("Pokemon", "Pokemon"), key: "pokemon" },
  { label: i18n("One Piece", "One Piece"), key: "one_piece" },
  { label: i18n("PSA 10", "PSA 10"), key: "psa10" },
  { label: i18n("Raw", "การ์ดไม่เกรด"), key: "raw" },
  { label: i18n("Holo", "โฮโล"), key: "holo" },
  { label: i18n("Promo", "โปรโม"), key: "promo" },
] as const;

type MarketplaceFilterKey = (typeof marketplaceFilters)[number]["key"];
type MarketplaceSortKey =
  | "recommended"
  | "popular"
  | "newest"
  | "price_asc"
  | "price_desc"
  | "recent_sales";
type MarketplaceFilterCount = {
  productCount: number;
  offerCount: number;
};
type MarketplaceFilterCounts = Partial<Record<MarketplaceFilterKey, MarketplaceFilterCount>>;

type MarketplaceCapabilityStatus = {
  canBrowse: boolean;
  canCheckout: boolean;
  canSell: boolean;
  canAcceptSellerTerms: boolean;
  canReceivePayout: boolean;
  isMarketplaceOperator: boolean;
  isMarketplaceOwner: boolean;
};

type MarketplaceAccountStatus = {
  account: null | {
    accountId: string;
    buyerStatus: string;
    sellerStatus: string;
    payoutStatus: string;
    sellerTermsVersion: string | null;
    sellerTermsAcceptedAt: string | null;
    buyerTermsVersion: string | null;
    buyerTermsAcceptedAt: string | null;
    capabilities: MarketplaceCapabilityStatus;
  };
  capabilities?: MarketplaceCapabilityStatus;
};

type MarketplaceLaunchStatus = {
  enabled: boolean;
  configured: boolean;
  ownerOnly: boolean;
  mockData?: boolean;
  reason: string | null;
  actions?: {
    publicNav: boolean;
    browse: boolean;
    checkout: boolean;
    sellerSubmission: boolean;
    listingActivation: boolean;
    paymentProof: boolean;
    payoutRelease: boolean;
  };
};

type MarketplaceListing = {
  listing_id: string;
  listing_source: string;
  title: string;
  item_price_satang: number;
  currency: string;
  quantity_available_snapshot: number;
  public_description: string | null;
  photo_urls: string[] | null;
  snapshot_payload: {
    sourceBadge?: string;
    itemType?: string;
    conditionCode?: string | null;
    productSlug?: string;
  } | null;
};

type MarketplaceProduct = {
  product_id: string;
  product_slug: string;
  title: string;
  brand: string | null;
  category: string | null;
  series_name: string | null;
  set_name: string | null;
  card_code: string | null;
  language: string | null;
  hero_image_url: string | null;
  product_metadata: Record<string, unknown>;
  active_listing_count: number;
  official_listing_count: number;
  user_seller_listing_count: number;
  variant_count: number;
  lowest_price_satang: number;
  highest_price_satang: number;
  recent_listing_at: string | null;
  sold_count: number;
  last_sold_at: string | null;
  ranking_score: number;
};

function marketplaceThb(amountSatang: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(amountSatang / 100);
}

function marketplaceItemTypeLabel(value: string | undefined) {
  switch (value) {
    case "sealed_box":
      return i18n("Sealed box", "กล่องซีล");
    case "sealed_pack":
      return i18n("Sealed pack", "แพ็กซีล");
    default:
      return i18n("Card", "การ์ด");
  }
}

function marketplaceFilterParams(filterKey: MarketplaceFilterKey) {
  const params = new URLSearchParams();
  switch (filterKey) {
    case "official_shop":
      params.set("source", "official_shop");
      break;
    case "user_seller":
      params.set("source", "user_seller");
      break;
    case "pokemon":
      params.set("q", "pokemon");
      break;
    case "one_piece":
      params.set("q", "one piece");
      break;
    case "psa10":
      params.set("grade", "psa_10");
      break;
    case "raw":
      params.set("condition", "raw_a");
      break;
    case "holo":
      params.set("q", "holo");
      break;
    case "promo":
      params.set("q", "promo");
      break;
    case "all":
    default:
      break;
  }
  return params;
}

function marketplaceFilterLabel(filterKey: MarketplaceFilterKey) {
  return marketplaceFilters.find((filter) => filter.key === filterKey)?.label ?? "All";
}

function marketplaceSearchHiddenFields(
  filterKey: MarketplaceFilterKey,
  sortKey: MarketplaceSortKey,
) {
  const params = marketplaceFilterParams(filterKey);
  if (filterKey !== "official_shop" && filterKey !== "user_seller") {
    params.delete("q");
  }
  if (sortKey !== "recommended") params.set("sort", sortKey);
  return Array.from(params);
}

function marketplaceSourceLabel(source: string) {
  return source === "user_seller"
    ? i18n("User seller", "ผู้ขายทั่วไป")
    : i18n("Official shop", "ร้านทางการ");
}

function marketplaceProductSourceLabel(product: MarketplaceProduct) {
  if (product.official_listing_count > 0 && product.user_seller_listing_count > 0) {
    return i18n("Official + sellers", "ร้านทางการ + ผู้ขาย");
  }
  if (product.user_seller_listing_count > 0) {
    return i18n("User sellers", "ผู้ขายทั่วไป");
  }
  return i18n("Official shop", "ร้านทางการ");
}

function marketplaceProductMeta(product: MarketplaceProduct) {
  return [
    product.card_code,
    product.set_name,
    product.language,
    product.brand,
  ].filter(Boolean);
}

function marketplaceNextProductPageHref(
  filterKey: MarketplaceFilterKey,
  sortKey: MarketplaceSortKey,
  cursor: string | null | undefined,
) {
  const params = marketplaceFilterParams(filterKey);
  if (sortKey !== "recommended") params.set("sort", sortKey);
  if (cursor) params.set("cursor", cursor);
  const query = params.toString();
  return query ? `/marketplace?${query}` : "/marketplace";
}

function marketplaceListingHref(item: MarketplaceListing) {
  const productSlug =
    typeof item.snapshot_payload?.productSlug === "string"
      ? item.snapshot_payload.productSlug
      : null;
  return productSlug
    ? `/marketplace/products/${productSlug}`
    : `/marketplace/listings/${item.listing_id}`;
}

/** Marketplace page. Prelaunch stays owner-gated while browse reads public-safe
 *  grouped product summaries from the Marketplace service. */
export function MarketplaceExperience({
  accountStatus,
  launchStatus,
  marketplaceProducts,
  productNextCursor,
  filterCounts = {},
  selectedFilterKey = "all",
  selectedSort = "recommended",
}: {
  accountStatus: MarketplaceAccountStatus;
  launchStatus: MarketplaceLaunchStatus;
  marketplaceProducts?: MarketplaceProduct[];
  productNextCursor?: string | null;
  filterCounts?: MarketplaceFilterCounts;
  selectedFilterKey?: MarketplaceFilterKey;
  selectedSort?: MarketplaceSortKey;
}) {
  const products = marketplaceProducts ?? [];
  const activeFilterLabel = marketplaceFilterLabel(selectedFilterKey);
  const canOpenMarketplaceAdmin = Boolean(
    accountStatus.capabilities?.isMarketplaceOperator ||
      accountStatus.capabilities?.isMarketplaceOwner,
  );
  const officialCount = products.reduce(
    (count, product) => count + product.official_listing_count,
    0,
  );
  const userSellerCount = products.reduce(
    (count, product) => count + product.user_seller_listing_count,
    0,
  );
  const currentOfferCount = products.reduce(
    (count, product) => count + product.active_listing_count,
    0,
  );
  const lowestPriceSatang =
    products.length > 0
      ? products.reduce(
          (lowest, product) => Math.min(lowest, product.lowest_price_satang),
          products[0]?.lowest_price_satang ?? 0,
        )
      : null;
  const heroProducts = products.slice(0, 3);
  const searchDefault = ["pokemon", "one_piece", "holo", "promo"].includes(
    selectedFilterKey,
  )
    ? marketplaceFilterParams(selectedFilterKey).get("q") ?? ""
    : "";

  return (
    <div className="store-home-grid marketplace-page">
      <div className="store-main-stack marketplace-shell">
        <section className="marketplace-masthead" aria-label="Marketplace overview">
          <div className="marketplace-masthead-copy">
            <span className="marketplace-kicker">
              {i18n("YNOT", "YNOT")}
            </span>
            <h1>{i18n("Marketplace", "Marketplace")}</h1>
            <p>
              {i18n(
                "Search one card, compare every offer, and choose the exact listing by photo, grade, seller source, and market price.",
                "ค้นหาการ์ดหนึ่งใบ เทียบทุกข้อเสนอ แล้วเลือกสินค้าจริงจากรูป เกรด แหล่งผู้ขาย และราคาตลาด",
              )}
            </p>
            <div className="marketplace-masthead-actions">
              <Link href="/marketplace/cart" className="btn btn-ghost" prefetch={false}>
                {i18n("Cart", "รถเข็น")}
              </Link>
              <Link href="/marketplace/watchlist" className="btn btn-ghost" prefetch={false}>
                {i18n("Watchlist", "รายการที่สนใจ")}
              </Link>
              <Link href="/marketplace/orders" className="btn btn-ghost" prefetch={false}>
                {i18n("My orders", "ออเดอร์ของฉัน")}
              </Link>
              <Link href="/marketplace/seller" className="btn btn-sm" prefetch={false}>
                {i18n("Sell cards", "ฝากขายการ์ด")}
              </Link>
              {canOpenMarketplaceAdmin ? (
                <Link href="/admin/marketplace" className="btn btn-sm" prefetch={false}>
                  {i18n("Admin", "แอดมิน")}
                </Link>
              ) : null}
            </div>
          </div>

          <div className="marketplace-market-snapshot" aria-label="Live marketplace summary">
            <dl className="marketplace-snapshot-grid">
              <div>
                <dt>{i18n("Products", "สินค้า")}</dt>
                <dd>{products.length}</dd>
              </div>
              <div>
                <dt>{i18n("Official offers", "ข้อเสนอร้านทางการ")}</dt>
                <dd>{officialCount}</dd>
              </div>
              <div>
                <dt>{i18n("Seller offers", "ข้อเสนอผู้ขาย")}</dt>
                <dd>{userSellerCount}</dd>
              </div>
              <div>
                <dt>{i18n("Best from price", "ราคาเริ่มต้น")}</dt>
                <dd>{lowestPriceSatang === null ? "-" : marketplaceThb(lowestPriceSatang)}</dd>
              </div>
            </dl>
            {heroProducts.length > 0 ? (
              <div className="marketplace-preview-stack" aria-hidden="true">
                {heroProducts.map((product, index) => (
                  <span
                    key={product.product_id}
                    className={`marketplace-preview-card marketplace-preview-card--${index + 1}`}
                    style={
                      product.hero_image_url
                        ? { backgroundImage: `url(${product.hero_image_url})` }
                        : undefined
                    }
                  />
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <section
          className="marketplace-discovery"
          aria-label="Marketplace filters / ตัวกรองตลาด"
        >
          <div className="marketplace-discovery-head">
            <div>
              <span className="marketplace-kicker">
                {i18n("Filter marketplace", "กรองสินค้าในตลาด")}
              </span>
              <h2>{activeFilterLabel}</h2>
            </div>
            <span className="marketplace-result-count">
              {i18n(
                `${products.length} product${products.length === 1 ? "" : "s"} / ${currentOfferCount} offer${currentOfferCount === 1 ? "" : "s"}`,
                `${products.length} สินค้า / ${currentOfferCount} ข้อเสนอ`,
              )}
            </span>
          </div>

          <form className="marketplace-search" action="/marketplace">
            {marketplaceSearchHiddenFields(selectedFilterKey, selectedSort).map(
              ([key, value]) => (
                <input key={key} type="hidden" name={key} value={value} />
              ),
            )}
            <label htmlFor="marketplace-search-input">
              {i18n("Search card name or code", "ค้นหาชื่อหรือรหัสการ์ด")}
            </label>
            <div className="marketplace-search-box">
              <input
                id="marketplace-search-input"
                type="search"
                name="q"
                defaultValue={searchDefault}
                placeholder="EB02-001, Zoro, PSA 10..."
              />
              <button type="submit">{i18n("Search", "ค้นหา")}</button>
            </div>
          </form>

          <MarketplaceFilterControls
            selectedFilterKey={selectedFilterKey}
            selectedSort={selectedSort}
            resultCount={products.length}
            filterCounts={filterCounts}
          />
        </section>

        <section
          className="marketplace-grid"
          aria-label="Marketplace products / สินค้าในตลาด"
        >
          {products.length ? (
            <>
              {products.map((product) => {
                const meta = marketplaceProductMeta(product);
                const imageUrl = product.hero_image_url;
              return (
                <Link
                  key={product.product_id}
                  href={`/marketplace/products/${product.product_slug}`}
                  className="marketplace-card"
                  prefetch={false}
                >
                  <div
                    className="marketplace-card-art"
                    aria-label={product.title}
                    style={
                      imageUrl
                        ? { backgroundImage: `url(${imageUrl})` }
                        : undefined
                    }
                  >
                    <span className="marketplace-source-badge marketplace-source-badge--product">
                      {marketplaceProductSourceLabel(product)}
                    </span>
                    {!imageUrl ? <span>{product.title.slice(0, 1)}</span> : null}
                  </div>
                  <div className="marketplace-card-body">
                    <div className="marketplace-card-meta-row">
                      <span className="marketplace-card-eyebrow">
                        {product.card_code ?? product.brand ?? i18n("Trading card", "การ์ดสะสม")}
                      </span>
                      <span>
                        {i18n(
                          `${product.active_listing_count} offer${product.active_listing_count === 1 ? "" : "s"}`,
                          `${product.active_listing_count} ข้อเสนอ`,
                        )}
                      </span>
                    </div>
                    <strong className="marketplace-card-title">
                      {product.title}
                    </strong>
                    <div className="marketplace-card-details">
                      {meta.length ? (
                        meta.slice(0, 3).map((value) => (
                          <span key={String(value)}>{value}</span>
                        ))
                      ) : (
                        <span>{marketplaceItemTypeLabel("card")}</span>
                      )}
                    </div>
                    <p>
                      {i18n(
                        `${product.variant_count} variant${product.variant_count === 1 ? "" : "s"} available from official shop and member sellers.`,
                        `${product.variant_count} รุ่นย่อยจากร้านทางการและผู้ขายสมาชิก`,
                      )}
                    </p>
                    <div className="marketplace-card-foot">
                      <span className="marketplace-card-price">
                        <small>{i18n("From", "เริ่มต้น")}</small>
                        {marketplaceThb(product.lowest_price_satang)}
                      </span>
                      <span className="marketplace-card-cta">
                        {i18n("View prices", "ดูราคา")}
                      </span>
                    </div>
                  </div>
                </Link>
              );
              })}
              {productNextCursor ? (
                <Link
                  href={marketplaceNextProductPageHref(
                    selectedFilterKey,
                    selectedSort,
                    productNextCursor,
                  )}
                  className="marketplace-more-link"
                  prefetch={false}
                  scroll={false}
                >
                  {i18n("Show more products", "ดูสินค้าเพิ่มเติม")}
                </Link>
              ) : null}
            </>
          ) : (
            <div className="marketplace-empty">
              <strong>{i18n("No products found", "ไม่พบสินค้า")}</strong>
              <p>
                {i18n(
                  "Try another filter or search term. Product pages appear here when at least one offer is available.",
                  "ลองเปลี่ยนตัวกรองหรือคำค้นหา หน้าสินค้าจะแสดงเมื่อมีข้อเสนอขายอย่างน้อยหนึ่งรายการ",
                )}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/** Series essentials section — FOG-style 2-column image cards with CTA. */
function SeriesEssentialsSection({
  showMarketplace = false,
}: {
  showMarketplace?: boolean;
}) {
  return (
    <section
      className="series-essentials"
      aria-label="Where to begin / เริ่มต้นที่นี่"
    >
      <h2 className="series-essentials-heading">
        <span className="i18n-en">Where to Begin</span>
        <span className="i18n-th">เริ่มต้นที่นี่</span>
      </h2>
      <div className="series-essentials-grid">
        <Link
          href="/packs"
          className="series-essentials-card series-essentials-card--pokemon"
        >
          <div className="series-essentials-art" aria-hidden />
          <span className="series-essentials-cta">
            <span className="i18n-en">Y-Packs</span>
            <span className="i18n-th">Y-Packs</span>
          </span>
        </Link>
        {showMarketplace ? (
          <Link
            href="/marketplace"
            className="series-essentials-card series-essentials-card--one-piece"
          >
            <div className="series-essentials-art" aria-hidden />
            <span className="series-essentials-cta">
              <span className="i18n-en">Marketplace</span>
              <span className="i18n-th">ตลาด</span>
            </span>
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function MobileTorecaHero({ campaign }: { campaign?: YnotCampaign }) {
  const openHref = campaign
    ? `/packs/${campaign.slug}`
    : "/packs";
  return (
    <section className="toreca-mobile-hero" aria-label="YNot mobile hero / ฮีโร่มือถือ YNOT">
      <div className="hero-card-fan" aria-hidden>
        {Array.from({ length: 8 }).map((_, index) => (
          <span key={index} />
        ))}
      </div>
      <div className="hero-copy">
        <h1>
          <span className="i18n-en">YNOT</span>
          <span className="i18n-th">YNOT</span>
        </h1>
        <p>
          <span className="i18n-en">WHY NOT OPEN?</span>
          <span className="i18n-th">WHY NOT OPEN?</span>
        </p>
        <Link className="hero-rip-button" href={openHref}>
          <span className="i18n-en">View Y-Pack</span>
          <span className="i18n-th">ดู Y-Pack</span>
        </Link>
      </div>
    </section>
  );
}

export function MetricGrid({
  wallet,
  topUps,
  collection,
  campaigns,
}: {
  wallet: YnotWallet;
  topUps: YnotTopUp[];
  collection: YnotCollectionItem[];
  campaigns: YnotCampaign[];
}) {
  const pendingTopUps = topUps.filter(
    (topUp) =>
      topUp.status === "pending_review" || topUp.status === "pending_slip",
  ).length;
  return (
    <div className="metric-grid">
      <Metric
        label="Coin balance"
        value={`${(wallet.balanceCoins || 0).toLocaleString()} coins`}
      />
      <Metric label="Pending top-ups" value={String(pendingTopUps)} />
      <Metric
        label="Owned cards"
        value={String(
          collection.filter((item) => item.status === "owned").length,
        )}
      />
      <Metric
        label="Live campaigns"
        value={String(
          campaigns.filter((campaign) => campaign.status === "live").length,
        )}
      />
    </div>
  );
}

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <p className="section-label">{label}</p>
      <p className="title-h mt-1">{value}</p>
    </div>
  );
}

export function CampaignGrid({
  campaigns,
  fallbackToFeatured = false,
  emptyTitle = i18n("No campaigns yet", "ยังไม่มีแคมเปญ"),
  emptyBody = i18n(
    "Admin can publish campaigns after the platform migration is applied.",
    "แอดมินสามารถเผยแพร่แคมเปญได้หลังระบบพร้อมใช้งาน",
  ),
  showAdminEdit = false,
  reorderInfo,
}: {
  campaigns: YnotCampaign[];
  fallbackToFeatured?: boolean;
  emptyTitle?: ReactNode;
  emptyBody?: ReactNode;
  showAdminEdit?: boolean;
  reorderInfo?: Map<string, PackReorderInfo>;
}) {
  const items = fallbackToFeatured ? displayCampaigns(campaigns) : campaigns;
  if (!items.length) return <EmptyState title={emptyTitle} body={emptyBody} />;
  return (
    <div className="campaign-grid">
      {items.map((campaign) => (
        <CampaignCard
          key={campaign.id}
          campaign={campaign}
          showAdminEdit={showAdminEdit}
          reorderInfo={reorderInfo?.get(campaign.id) ?? null}
        />
      ))}
    </div>
  );
}

export function CampaignCard({
  campaign,
  showAdminEdit = false,
  reorderInfo = null,
}: {
  campaign: YnotCampaign;
  showAdminEdit?: boolean;
  reorderInfo?: PackReorderInfo | null;
}) {
  const title = campaignTitleText(campaign);
  const titleNode = campaignTitle(campaign);
  const displayTags = campaignDisplayTags(campaign);
  const soldOut = isCampaignSoldOut(campaign);
  const remainingSlots = remaining(campaign);
  const remainingLabel = soldOut
    ? i18n("Sold out", "หมดแล้ว")
    : remainingSlots === null
      ? i18n("Stock tracked by server", "สต็อกตรวจสอบโดยระบบ")
      : i18n(
          `Remaining ${remainingSlots.toLocaleString()}/${campaign.totalSlots.toLocaleString()}`,
          `เหลือ ${remainingSlots.toLocaleString()}/${campaign.totalSlots.toLocaleString()}`,
        );
  const remainingLabelText = soldOut
    ? "Sold out / หมดแล้ว"
    : remainingSlots === null
      ? "Stock tracked by server / สต็อกตรวจสอบโดยระบบ"
      : `Remaining ${remainingSlots.toLocaleString()}/${campaign.totalSlots.toLocaleString()} / เหลือ ${remainingSlots.toLocaleString()}/${campaign.totalSlots.toLocaleString()}`;
  const sortOrderForAttr =
    reorderInfo?.currentSortOrder ?? campaign.sortOrder ?? "";
  const tier = packTier(campaign);
  return (
    <article
      className={`product-card clean-pack-card pack-card-tier-${tier}`}
      data-pack-id={showAdminEdit ? campaign.id : campaign.slug}
      data-pack-sort-order={sortOrderForAttr}
      data-pack-tier={tier}
    >
      <div className="pack-card-tier-pill">{PACK_TIER_COPY[tier].label}</div>
      {showAdminEdit && (
        <span
          className="pack-drag-handle pack-drag-handle--card"
          data-pack-drag-handle="true"
          title="Drag to reorder"
          aria-label="Drag to reorder this pack"
        >
          <svg
            viewBox="0 0 12 16"
            width="14"
            height="14"
            fill="currentColor"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx="3.5" cy="3" r="1.2" />
            <circle cx="3.5" cy="8" r="1.2" />
            <circle cx="3.5" cy="13" r="1.2" />
            <circle cx="8.5" cy="3" r="1.2" />
            <circle cx="8.5" cy="8" r="1.2" />
            <circle cx="8.5" cy="13" r="1.2" />
          </svg>
        </span>
      )}
      <div className="pack-card-top">
        <div
          className="product-tags pack-info-tags"
          aria-label="Pack status and tags / สถานะและป้ายกำกับแพ็ก"
        >
          <span className="status-pill">{campaignStatusLabel(campaign.status)}</span>
          {displayTags.map((tag, index) => (
            <span
              key={`${campaign.id}-tag-${index}-${tag}`}
              className="soft-pill campaign-label-pill"
            >
              {tag}
            </span>
          ))}
          {showAdminEdit && (
            <Link
              className="pack-admin-edit"
              href="/admin/campaigns"
              aria-label={`Edit ${title} in admin`}
            >
              Edit
            </Link>
          )}
          <AdminPackManagementControls
            enabled={showAdminEdit && Boolean(reorderInfo)}
            campaignId={reorderInfo?.campaignId ?? campaign.id}
            campaignTitle={title}
            variant="card"
            reorderInfo={reorderInfo}
          />
        </div>
        <h3 className="title-m pack-card-title">{titleNode}</h3>
      </div>
      <Link
        className="pack-image-link"
        href={`/packs/${campaign.slug}`}
        aria-label={`View ${title} / ดู ${title}`}
      >
        <CampaignArtwork campaign={campaign} clean />
      </Link>
      <div
        className="pack-card-bottom"
        aria-label="Pack price and stock status / ราคาและสต็อกแพ็ก"
      >
        <span
          className="pack-price-line"
          aria-label={`${formatCoins(campaign.costCoins)} coins per pack / ${formatCoins(campaign.costCoins)} เหรียญต่อแพ็ก`}
        >
          <CoinIcon /> {formatCoins(campaign.costCoins)}
          <I18nText en="/pack" th="/แพ็ก" />
        </span>
        <span className="pack-remaining-line" aria-label={remainingLabelText}>
          {remainingLabel}
        </span>
      </div>
      <ProgressTrack campaign={campaign} />
      <div className="product-actions">
        <Link className="secondary-action" href={`/packs/${campaign.slug}`}>
          <I18nText en="Details" th="รายละเอียด" />
        </Link>
        {soldOut ? (
          <button className="primary-action" type="button" disabled>
            <I18nText en="Sold out" th="หมดแล้ว" />
          </button>
        ) : (
          <Link className="primary-action" href={`/gacha/${campaign.slug}/open`}>
            <I18nText en="Open" th="เปิด" />
          </Link>
        )}
      </div>
    </article>
  );
}

export function CampaignDetailPanel({
  campaign,
  showAdminEdit = false,
}: {
  campaign: YnotCampaign;
  showAdminEdit?: boolean;
}) {
  const detailOpenOptions = normalizeOpenQuantityOptions(
    campaign.openQuantityOptions,
  );
  const detailTags = campaignDisplayTags(campaign);
  const soldOut = isCampaignSoldOut(campaign);
  const canOpen =
    campaign.demo || (!soldOut && (campaign.openable || isDevAuthAllowed()));
  const unavailableCopy = soldOut
    ? i18n("Sold out", "หมดแล้ว")
    : i18n(
        "This pack is not ready to open yet. Please check back later.",
        "แพ็กนี้ยังไม่พร้อมเปิด กรุณากลับมาตรวจสอบอีกครั้ง",
      );
  const packTitle = campaignTitle(campaign);
  const packTitleText = campaignTitleText(campaign);
  const packReference = campaign.slug || campaign.id;

  return (
    <section className="product-detail-grid detail-layout gacha-detail-page">
      <PhoneTopBar
        title={packTitle}
        action={
          <>
            <Link className="template-icon-button" href="/">
              ‹
            </Link>
            <Link className="template-icon-button" href="/collection">
              ♡
            </Link>
            {showAdminEdit && (
              <Link
                className="pack-admin-edit pack-admin-edit-inline"
                href="/admin/campaigns"
                aria-label={`Edit ${packTitleText} in admin / แก้ไข ${packTitleText} ในหน้าแอดมิน`}
              >
                Edit
              </Link>
            )}
          </>
        }
      />
      <PhoneRule />
      <div className="gacha-detail-hero-art">
        <CampaignArtwork campaign={campaign} large />
      </div>
      <aside className="detail-info-card gacha-detail-buy-panel">
        <div className="gacha-detail-title-stack">
          <p className="section-label">
            {campaign.categoryLabel ?? seriesLabel(campaign.series)} Y-Pack
          </p>
          <h1 className="page-title">{packTitle}</h1>
          <p className="page-description">
            {campaign.heroLabel ??
              i18n(
                "High-value chase cards, exchangeable collection rewards, and real shipping support.",
                "การ์ดไล่ล่ามูลค่าสูง รางวัลคอลเลกชันที่แลกได้ และรองรับการจัดส่งจริง",
              )}
          </p>
        </div>
        <div className="filter-chip-row" aria-label="Pack tags / ป้ายกำกับแพ็ก">
          {detailTags.map((tag, index) => (
            <span
              className={`filter-chip ${index === 0 ? "active" : ""}`}
              key={tag}
            >
              {tag}
            </span>
          ))}
          <span className="filter-chip">
            <I18nText en="Exchange available" th="แลกเหรียญได้" />
          </span>
          <span className="filter-chip">
            <I18nText en="Shipping ready" th="พร้อมจัดส่ง" />
          </span>
        </div>
        <div className="detail-stat-grid">
          <div className="detail-stat-card detail-stat-card-price">
            <span>
              <I18nText en="Price per pull" th="ราคาต่อครั้ง" />
            </span>
            <strong>
              <span className="detail-stat-number">
                <CoinIcon /> {formatCoins(campaign.costCoins)}
              </span>
              <small>
                <I18nText en="coins" th="เหรียญ" />
              </small>
            </strong>
            <em>
              <I18nText en="Every pack open" th="ทุกการเปิดแพ็ก" />
            </em>
          </div>
          <div className="detail-stat-card detail-stat-card-stock">
            <span>
              <I18nText en="Stock" th="สต็อก" />
            </span>
            <strong>{soldOut ? i18n("Sold out", "หมดแล้ว") : remainingRatioText(campaign)}</strong>
            <em>{soldOut ? i18n("No packs left", "แพ็กหมดแล้ว") : i18n("Remaining", "คงเหลือ")}</em>
          </div>
        </div>
        <ProgressTrack campaign={campaign} />
        <div className="detail-note-card detail-note-card-warning">
          <strong>
            <I18nText en="Note before opening" th="หมายเหตุก่อนเปิด" />
          </strong>
          <p>
            <I18nText
              en="Prize images are examples from this pack's saved prize pool. Mystery pack results are final after opening, so review the collectible details before you choose to open."
              th="รูปภาพรางวัลเป็นตัวอย่างจากพูลรางวัลที่บันทึกไว้ของแพ็กนี้ ผลการเปิดแพ็กถือเป็นที่สิ้นสุดหลังเปิด กรุณาตรวจรายละเอียดของสะสมก่อนตัดสินใจเปิด"
            />
          </p>
        </div>
      </aside>
      <section className="gacha-detail-prize-panel">
        <div className="section-heading-row">
          <div>
            <p className="section-label">
              <I18nText en="Prize lineup" th="รายการรางวัล" />
            </p>
            <h2 className="title-m">
              <I18nText en="Dynamic tier details" th="รายละเอียดระดับรางวัล" />
            </h2>
          </div>
          <span className="status-pill">{campaignStatusLabel(campaign.status)}</span>
        </div>
        {campaign.prizeLineup?.length ? (
          <PrizeLineup prizes={campaign.prizeLineup} />
        ) : campaign.demo && allowDemoStorefront() ? (
          <RewardTierList />
        ) : (
          <EmptyState
            title={i18n("Prize lineup unavailable", "ยังแสดงรายการรางวัลไม่ได้")}
            body={i18n(
              "Featured rewards are temporarily unavailable. Please check back later.",
              "รางวัลแนะนำยังไม่พร้อมแสดงผล กรุณากลับมาตรวจสอบอีกครั้ง",
            )}
          />
        )}
      </section>
      <section className="gacha-detail-terms-panel" aria-label="YNOT pack notes / หมายเหตุแพ็ก YNOT">
        <div className="section-heading-row">
          <div>
            <p className="section-label">
              <I18nText en="Pack notes" th="หมายเหตุแพ็ก" />
            </p>
            <h2 className="title-m">
              <I18nText en="Important before opening" th="ข้อมูลสำคัญก่อนเปิด" />
            </h2>
          </div>
          <span className="status-pill">
            <I18nText en="Ref" th="อ้างอิง" />: {packReference}
          </span>
        </div>
        <div className="gacha-detail-terms-grid">
          <p>
            <I18nText
              en="Product images, prize images, and grades are shown for reference. Actual card condition can vary, and graded cards follow the grading company's assigned grade and case standards."
              th="รูปสินค้า รูปรางวัล และเกรดแสดงเพื่ออ้างอิง สภาพการ์ดจริงอาจแตกต่างได้ และการ์ดที่มีเกรดจะยึดตามเกรดและมาตรฐานเคสของบริษัทผู้ให้เกรด"
            />
          </p>
          <p>
            <I18nText
              en="Every pack open is random. Featured collectibles are shown so you can review the series, artwork, and grading details before you choose to open."
              th="การเปิดแพ็กทุกครั้งเป็นการสุ่ม ของสะสมที่แสดงช่วยให้คุณตรวจซีรีส์ งานภาพ และรายละเอียดเกรดก่อนเลือกเปิด"
            />
          </p>
          <p>
            <I18nText
              en="Pull results are final once opened. For shipping or dispute cases, keep your order reference and photo or video evidence from delivery through opening."
              th="ผลการเปิดถือเป็นที่สิ้นสุดเมื่อเปิดแล้ว หากมีกรณีจัดส่งหรือโต้แย้ง กรุณาเก็บเลขอ้างอิงออเดอร์และหลักฐานรูปหรือวิดีโอตั้งแต่รับพัสดุจนถึงการเปิด"
            />
          </p>
        </div>
      </section>
      <div className="transparent-note">
        <strong>
          <I18nText en="Server-recorded Y-Pack" th="Y-Pack ที่บันทึกโดยเซิร์ฟเวอร์" />
        </strong>
        <span>
          <I18nText
            en="Every production pull is recorded by YNOT before rewards can move to collection, exchange, or shipping."
            th="การเปิดแพ็กจริงทุกครั้งถูกบันทึกโดย YNOT ก่อนรางวัลจะย้ายไปคอลเลกชัน แลกเหรียญ หรือจัดส่งได้"
          />
        </span>
      </div>
      <div
        className="gacha-detail-open-dock"
        role="region"
        aria-label={soldOut ? "Pack sold out / แพ็กหมดแล้ว" : "Open this pack / เปิดแพ็กนี้"}
      >
        <div className="gacha-detail-open-dock-info">
          <p className="section-label">
            {soldOut ? i18n("Pack sold out", "แพ็กหมดแล้ว") : i18n("Open this pack", "เปิดแพ็กนี้")}
          </p>
          <strong>
            <CoinIcon /> {formatCoins(campaign.costCoins)}
            <span>
              <I18nText en=" / pack" th=" / แพ็ก" />
            </span>
          </strong>
        </div>
        <div className="gacha-detail-open-dock-actions">
          {canOpen ? (
            <>
              {detailOpenOptions.map((option, index) => (
                <Link
                  className={index === 0 ? "primary-action" : "orange-action"}
                  href={`/gacha/${campaign.slug}/open?qty=${option}`}
                  key={option}
                >
                  {option === 1 ? (
                    <I18nText en="Open Pack" th="เปิดแพ็ก" />
                  ) : (
                    i18n(`Open ${option}x`, `เปิด ${option}x`)
                  )}
                </Link>
              ))}
              <Link
                className="secondary-action gacha-detail-open-dock-wallet"
                href="/wallet"
              >
                <I18nText en="Wallet" th="วอลเล็ต" />
              </Link>
            </>
          ) : (
            <p className="admin-form-message gacha-detail-open-dock-disabled">
              {unavailableCopy}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export function RewardTierList({ compact = false }: { compact?: boolean }) {
  const rewardTierCopy: Record<
    (typeof rewardTiers)[number]["rank"],
    { name: ReactNode; note: ReactNode }
  > = {
    S: {
      name: i18n("Signature hits", "รางวัลซิกเนเจอร์"),
      note: i18n("Charizard SAR", "Charizard SAR"),
    },
    A: {
      name: i18n("Premium hits", "รางวัลพรีเมียม"),
      note: i18n("SR support cards", "การ์ดซัพพอร์ต SR"),
    },
    B: {
      name: i18n("Chase cards", "การ์ดไล่ล่า"),
      note: i18n("SR / RR", "SR / RR"),
    },
    C: {
      name: i18n("Foil cards", "การ์ดฟอยล์"),
      note: i18n("R foil", "ฟอยล์ R"),
    },
    D: {
      name: i18n("Base rewards", "รางวัลพื้นฐาน"),
      note: i18n(
        "Can be exchanged for coins",
        "สามารถแลกเป็นเหรียญได้",
      ),
    },
  };

  return (
    <div className="reward-tier-list">
      {rewardTiers.map((tier, index) => (
        <div key={tier.rank} className="reward-tier-card">
          <div className="tier-heading">
            <div>
              <span className={`tier-rank tier-${tier.rank.toLowerCase()}`}>
                {tier.rank}
              </span>
              <strong>{rewardTierCopy[tier.rank].name}</strong>
            </div>
            <span>
              {tier.remain} <I18nText en="left" th="เหลือ" />
            </span>
          </div>
          <div className="tier-cards">
            {tier.cards.map((card, cardIndex) => (
              <PrizeCard
                key={`${tier.rank}-${cardIndex}`}
                label={card}
                rare={index < 2}
                compact={compact}
              />
            ))}
          </div>
          <p className="txt-s">{rewardTierCopy[tier.rank].note}</p>
        </div>
      ))}
    </div>
  );
}

function PrizeLineupImage({ prize }: { prize: YnotPrizePreview }) {
  const fallbackLabel = (prize.cardCode ?? prize.cardName)
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="reward-prize-image">
      {prize.cardImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- Catalog prize URLs are Supabase/storage assets already managed outside Next image config.
        <img src={prize.cardImageUrl} alt={prize.cardName} loading="lazy" />
      ) : (
        <span>{fallbackLabel}</span>
      )}
    </div>
  );
}

const detailPrizeTierCopy: Record<
  PrizeDisplayTier,
  { title: ReactNode; description: ReactNode }
> = {
  rainbow: {
    title: i18n("Rainbow 1st Prize", "รางวัลที่ 1 ระดับเรนโบว์"),
    description: i18n("Top chase rewards for this Y-Pack.", "รางวัลไล่ล่าสูงสุดของ Y-Pack นี้"),
  },
  gold: {
    title: i18n("Gold 2nd Prize", "รางวัลที่ 2 ระดับโกลด์"),
    description: i18n("Premium chase rewards below Rainbow.", "รางวัลไล่ล่าพรีเมียมรองจากเรนโบว์"),
  },
  silver: {
    title: i18n("Silver 3rd Prize", "รางวัลที่ 3 ระดับซิลเวอร์"),
    description: i18n("Strong mid-tier rewards from this pack.", "รางวัลระดับกลางที่น่าสนใจจากแพ็กนี้"),
  },
  bronze: {
    title: i18n("Bronze 4th Prize", "รางวัลที่ 4 ระดับบรอนซ์"),
    description: i18n("Base and category rewards for regular pulls.", "รางวัลพื้นฐานและรางวัลตามหมวดสำหรับการเปิดทั่วไป"),
  },
};

function PrizeLineup({ prizes }: { prizes: YnotPrizePreview[] }) {
  const sections = prizeDisplayTierOptions
    .map((option) => {
      const tier = option.value;
      const copy = detailPrizeTierCopy[tier];
      return {
        key: tier,
        label: copy.title,
        description: copy.description,
        prizes: prizes
          .filter((prize) => prizeLineupTier(prize) === tier)
          .sort(
            (left, right) =>
              (left.tierRank ?? left.rank) - (right.tierRank ?? right.rank),
          ),
      };
    })
    .filter((section) => section.prizes.length > 0);

  return (
    <div className="reward-lineup-groups gacha-tier-lineup">
      {sections.map((section) => (
        <section
          className={`reward-lineup-section gacha-tier-section tier-section-${section.key}`}
          key={section.key}
        >
          <div className="reward-lineup-section-head">
            <div>
              <strong>{section.label}</strong>
              <span>{section.description}</span>
            </div>
            <em>
              {i18n(
                `${section.prizes.length} prize${section.prizes.length === 1 ? "" : "s"}`,
                `${section.prizes.length} รางวัล`,
              )}
            </em>
          </div>
          <div className="reward-tier-list reward-tier-list-structured">
            {section.prizes.map((prize) => (
              <div className="reward-tier-card gacha-prize-card" key={prize.id}>
                <PrizeLineupImage prize={prize} />
                <strong className="gacha-prize-name">{prize.cardName}</strong>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function prizeLineupTier(prize: YnotPrizePreview) {
  if (prize.displayTier) return prizeDisplayTierValue(prize.displayTier);
  if (prize.displayGroup) return prizeDisplayTierValue(prize.displayGroup);
  if (prize.displayTierLabel) {
    const label = prize.displayTierLabel.toLowerCase();
    if (label.includes("rainbow")) return "rainbow";
    if (label.includes("gold")) return "gold";
    if (label.includes("silver")) return "silver";
    if (label.includes("bronze")) return "bronze";
    return prizeDisplayTierValue(prize.displayTierLabel);
  }
  if (prize.tier === "high" && prize.rank <= 3) return "rainbow";
  if (prize.tier === "high") return "gold";
  return "bronze";
}

function CampaignArtwork({
  campaign,
  large = false,
  clean = false,
  quiet = false,
}: {
  campaign: YnotCampaign;
  large?: boolean;
  clean?: boolean;
  quiet?: boolean;
}) {
  const heroPrizes =
    large && !clean && !quiet
      ? (campaign.prizeLineup ?? [])
          .filter((prize) => Boolean(prize.cardImageUrl))
          .slice(0, 5)
      : [];
  const bannerImageUrl = campaign.bannerImageUrl?.trim() ?? "";
  const hasBannerImage = Boolean(bannerImageUrl);
  const hasPackAsset = Boolean(
    campaign.demo &&
    allowDemoStorefront() &&
    campaign.slug === "pokemon-gold-07",
  );
  return (
    <div
      className={`campaign-art ${campaign.series === "pokemon" ? "pokemon" : "one-piece"} ${hasPackAsset || hasBannerImage ? "has-asset" : ""} ${hasBannerImage ? "has-banner-image" : ""} ${!hasBannerImage && heroPrizes.length ? "has-prize-preview" : ""} ${large ? "large" : ""} ${clean ? "clean-art" : ""} ${quiet ? "quiet-art" : ""}`}
    >
      <span className="art-glow" aria-hidden />
      {hasBannerImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- Pack banners are user-managed Supabase assets.
        <img
          alt=""
          aria-hidden="true"
          className="campaign-art-banner-image"
          loading="lazy"
          src={bannerImageUrl}
        />
      ) : null}
      {!hasBannerImage && heroPrizes.length ? (
        <div className="campaign-art-prize-fan" aria-label="Featured prizes / รางวัลแนะนำ">
          {heroPrizes.map((prize, index) => (
            <span
              className={`campaign-art-prize-card campaign-art-prize-card-${index + 1}`}
              key={prize.id}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- Prize pool images are user-managed Supabase assets. */}
              <img src={prize.cardImageUrl ?? ""} alt={prize.cardName} />
            </span>
          ))}
        </div>
      ) : null}
      {clean && !quiet && !hasPackAsset && !hasBannerImage && (
        <span className="clean-pack-cover" aria-hidden>
          <span className="clean-cover-kicker">
            {campaign.categoryLabel ?? seriesLabel(campaign.series)}
          </span>
          <span className="clean-cover-title">{campaignTitle(campaign)}</span>
          <span className="clean-cover-footer">Y-Pack</span>
        </span>
      )}
      {!clean && !quiet && (
        <>
          <span className="art-count">
            {large ? "SERVER RECORDED" : `1/${formatCoins(campaign.costCoins)}`}
          </span>
          <span className="art-category">
            {campaign.categoryLabel ?? seriesLabel(campaign.series)}
          </span>
          <strong>{campaignTitle(campaign)}</strong>
          <p>{campaign.heroLabel ?? seriesLabel(campaign.series)}</p>
          <span className="art-coin">
            <CoinIcon /> {formatCoins(campaign.costCoins)}
          </span>
          <span className="art-stock">{remainingRatioText(campaign)}</span>
        </>
      )}
    </div>
  );
}

function PrizeCard({
  label,
  rare,
  compact,
}: {
  label: string;
  rare?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={`prize-card ${rare ? "rare" : ""} ${compact ? "compact" : ""}`}
    >
      <span>{label}</span>
    </div>
  );
}

export function CoinIcon() {
  return (
    <span aria-label="coin" className="coin-icon" role="img">
      <CoinMark />
    </span>
  );
}

export function WalletPanel({
  wallet,
  paymentMethods,
  topUps,
}: {
  wallet: YnotWallet;
  paymentMethods: YnotPaymentMethod[];
  topUps: YnotTopUp[];
}) {
  return (
    <div className="wallet-panel-stack">
      <section className="soft-card wallet-balance-card">
        <PhoneTopBar title="Top Up" coin={wallet.balanceCoins} />
        <p className="txt-s mt-2">Choose payment</p>
        <span className="vip-bonus">1 THB = 1 coin</span>
      </section>
      <section className="soft-card wallet-method-card">
        <h3 className="title-m">Bank Transfer</h3>
        <div className="mt-4 grid gap-3">
          {paymentMethods.length ? (
            paymentMethods.map((method) => (
              <div key={method.id} className="payment-method-card">
                <span className="payment-icon">
                  {method.type === "promptpay_qr" ? "▣" : "🏦"}
                </span>
                <p className="title-s text-[var(--gold)]">
                  {method.displayName}
                </p>
                <p className="txt-s mt-1">
                  {method.bankName ?? "Bank Transfer"} ·{" "}
                  {method.accountName ??
                    method.promptpayId ??
                    "Configured by admin"}
                </p>
                {method.accountNumber && (
                  <p className="txt-mono mt-1">{method.accountNumber}</p>
                )}
                {method.instructions && (
                  <p className="txt-s mt-2">{method.instructions}</p>
                )}
                <span className="payment-chevron">›</span>
              </div>
            ))
          ) : (
            <EmptyState
              title="No payment method"
              body="Admin settings must add at least one active bank/QR method."
            />
          )}
        </div>
      </section>
      <section className="soft-card wallet-history-card">
        <h3 className="title-m">Top-up history</h3>
        <TopUpTable topUps={topUps} />
      </section>
    </div>
  );
}

export function CollectionGrid({
  collection,
}: {
  collection: YnotCollectionItem[];
}) {
  if (!collection.length) {
    return (
      <EmptyState
        title={i18n("No real collection cards yet", "ยังไม่มีการ์ดในคอลเลกชัน")}
        body={i18n(
          "Open a live pack first. Demo sample cards are not shown as customer inventory in production-safe mode.",
          "เปิด Y-Pack ที่ใช้งานจริงก่อน การ์ดตัวอย่างเดโมจะไม่แสดงเป็นคอลเลกชันของลูกค้า",
        )}
      />
    );
  }
  return (
    <div className="collection-list">
      {collection.map((item) => (
        <CollectionCard key={item.id} item={item} />
      ))}
    </div>
  );
}

function CollectionCard({ item }: { item: YnotCollectionItem }) {
  const statusCopy: Record<YnotCollectionItem["status"], ReactNode> = {
    owned: i18n("Owned", "ที่มี"),
    locked: i18n("Locked", "ถูกล็อก"),
    exchange_requested: i18n("Exchange requested", "ขอแลกแล้ว"),
    exchanged: i18n("Exchanged", "แลกแล้ว"),
    converting: i18n("Converting", "กำลังแลก"),
    shipping_preparing: i18n("Preparing shipment", "กำลังเตรียมจัดส่ง"),
    shipping_requested: i18n("Shipping requested", "ขอจัดส่งแล้ว"),
    shipped: i18n("Shipped", "จัดส่งแล้ว"),
    void: i18n("Voided", "ยกเลิกรายการ"),
  };

  return (
    <article
      className={`collection-card vertical${item.sourceIsLastPrize ? " is-last-prize" : ""}`}
    >
      <div className="collection-art large">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Collection images are Supabase/storage URLs managed by admins.
          <img src={item.imageUrl} alt={item.cardName} loading="lazy" />
        ) : (
          <span>{item.cardCode ?? i18n("YNot Card", "การ์ด YNot")}</span>
        )}
      </div>
      {item.sourceIsLastPrize && (
        <span className="collection-last-prize-badge">
          <I18nText en="Last Prize" th="รางวัลสุดท้าย" />
        </span>
      )}
      <h3 className="title-s mt-4">{item.cardName}</h3>
      <p className="txt-mono mt-1 text-xs">
        {item.sourceIsLastPrize
          ? i18n("Last Prize", "รางวัลสุดท้าย")
          : item.serialNo ?? item.cardCode ?? i18n("Collection reward", "รางวัลในคอลเลกชัน")}{" "}
        · {statusCopy[item.status]}
      </p>
    </article>
  );
}

export function RankingTable({ rankings }: { rankings: YnotRankingRow[] }) {
  const [top, ...rest] = rankings;
  return (
    <section className="soft-card ranking-phone phone-surface">
      <PhoneTopBar
        title={i18n("Ranking", "อันดับ")}
        action={
          <span className="orange-chip">
            🏆 <I18nText en="Reward" th="รางวัล" />
          </span>
        }
      />
      <div className="ranking-tabs">
        <span className="active">
          <I18nText en="Yesterday" th="เมื่อวาน" />
        </span>
        <span>
          <I18nText en="Week" th="สัปดาห์" />
        </span>
        <span>
          <I18nText en="Month" th="เดือน" />
        </span>
        <span>
          <I18nText en="All-time" th="ทั้งหมด" />
        </span>
      </div>
      {top && (
        <div className="ranking-hero">
          <span className="crown">👑</span>
          <div className="ranking-avatar">🐺</div>
          <h3>{top.displayName}</h3>
          <p>
            {top.value.toLocaleString()} <I18nText en="coin" th="เหรียญ" />
          </p>
          <strong>★ TOP 1</strong>
        </div>
      )}
      {rankings.length ? (
        <div className="ranking-list">
          {rest.map((row) => (
            <div className="leader-row" key={`${row.metric}-${row.rank}`}>
              <span className="leader-rank">
                {row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : row.rank}
              </span>
              <span className="leader-avatar" />
              <strong>{row.displayName}</strong>
              <em>{row.value.toLocaleString()}</em>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title={i18n("No ranking data yet", "ยังไม่มีข้อมูลอันดับ")}
          body={i18n(
            "Ranking rows will appear after real customer activity is recorded.",
            "อันดับจะแสดงหลังมีการใช้งานจริงจากลูกค้า",
          )}
        />
      )}
    </section>
  );
}

export function ExchangeCatalogPanel({
  wallet,
  collectionCount,
  requestCount,
}: {
  wallet: YnotWallet;
  collectionCount: number;
  requestCount: number;
}) {
  return (
    <section className="market-shell phone-surface">
      <PhoneTopBar title={i18n("Exchange", "แลกเหรียญ")} coin={wallet.balanceCoins} />
      <PhoneRule />
      <div
        className="category-strip market-categories"
        aria-label="Exchange status / สถานะการแลก"
      >
        <span className="category-tab active">
          <I18nText en="Owned" th="ที่มี" /> {collectionCount}
        </span>
        <span className="category-tab">
          <I18nText en="Requests" th="คำขอ" /> {requestCount}
        </span>
        <span className="category-tab">
          <I18nText en="Admin review" th="รอแอดมินตรวจ" />
        </span>
      </div>
      <div className="exchange-bonus-strip">
        <strong>
          <I18nText en="Real exchange requests only" th="ใช้คำขอแลกจริงเท่านั้น" />
        </strong>{" "}
        ·{" "}
        <I18nText
          en="Select owned collection cards below; admin review records approved coin value."
          th="เลือกการ์ดที่คุณมีด้านล่าง แอดมินจะตรวจและบันทึกมูลค่าเหรียญที่อนุมัติ"
        />
      </div>
      <EmptyState
        title={i18n("No public exchange catalog yet", "ยังไม่มีแคตตาล็อกแลกเหรียญ")}
        body={i18n(
          "Production exchange value comes from admin-reviewed collection requests until an admin-managed exchange catalog is added.",
          "มูลค่าแลกเหรียญจริงมาจากคำขอคอลเลกชันที่แอดมินตรวจ จนกว่าจะมีแคตตาล็อกแลกเหรียญที่จัดการโดยแอดมิน",
        )}
      />
    </section>
  );
}

export function OrderList({
  title,
  orders,
}: {
  title: ReactNode;
  orders: Array<YnotExchangeOrder | YnotShippingRequest>;
}) {
  function isShippingRequest(
    order: YnotExchangeOrder | YnotShippingRequest,
  ): order is YnotShippingRequest {
    return "items" in order;
  }

  function exchangeStatusLabel(status: YnotExchangeOrder["status"]) {
    const labels: Record<YnotExchangeOrder["status"], ReactNode> = {
      draft: i18n("Draft", "แบบร่าง"),
      submitted: i18n("Submitted", "ส่งคำขอแล้ว"),
      approved: i18n("Approved", "อนุมัติแล้ว"),
      rejected: i18n("Rejected", "ปฏิเสธแล้ว"),
      completed: i18n("Completed", "เสร็จสมบูรณ์"),
      cancelled: i18n("Cancelled", "ยกเลิกแล้ว"),
    };
    return labels[status] ?? status;
  }

  function shippingDetails(order: YnotExchangeOrder | YnotShippingRequest) {
    if (!isShippingRequest(order)) return null;
    const firstItem = order.items?.[0];
    const itemCount = order.items?.length ?? 0;
    const itemLabel = firstItem
      ? `${firstItem.cardName}${itemCount > 1 ? ` +${itemCount - 1}` : ""}`
      : i18n("Reward details pending", "รอรายละเอียดรางวัล");
    const packLabel = firstItem?.sourceCampaignTitle ?? i18n("Pack source pending", "รอข้อมูลแพ็ก");
    const trackingLabel = i18n(
      ynotShippingTrackingLabel(order, "en"),
      ynotShippingTrackingLabel(order, "th"),
    );

    return (
      <div className="mt-3 grid gap-1 text-xs text-[var(--text-muted)]">
        <p>
          <I18nText en="Reward" th="รางวัล" />: <strong>{itemLabel}</strong>
        </p>
        <p>
          <I18nText en="Pack" th="แพ็ก" />: {packLabel}
        </p>
        <p className="font-mono">
          <I18nText en="Tracking" th="เลขติดตาม" />: {trackingLabel}
        </p>
      </div>
    );
  }

  return (
    <section className="soft-card order-history-card rounded-[28px] p-5">
      <h3 className="title-m">{title}</h3>
      {!orders.length ? (
        <EmptyState
          title={i18n("No requests", "ยังไม่มีคำขอ")}
          body={i18n(
            "Submit a collection request to create one.",
            "ส่งคำขอจากคอลเลกชันเพื่อสร้างรายการ",
          )}
        />
      ) : (
        <div className="mt-4 grid gap-3">
          {orders.map((order) => (
            <div key={order.id} className="request-card">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono font-bold">{order.publicCode}</p>
                <StatusBadge
                  status={
                    isShippingRequest(order)
                      ? i18n(
                          ynotShippingStatusCustomerLabel(order.status, "en"),
                          ynotShippingStatusCustomerLabel(order.status, "th"),
                        )
                      : exchangeStatusLabel(order.status)
                  }
                />
              </div>
              <p className="txt-mono mt-2 text-xs">
                <I18nText en="Created" th="สร้างเมื่อ" />{" "}
                {new Date(order.createdAt).toLocaleString()}
              </p>
              {shippingDetails(order)}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function AdminSectionShell({
  viewer,
  activeHref,
  children,
}: {
  viewer: YnotViewer;
  activeHref: string;
  children: ReactNode;
}) {
  return (
    <AdminGate viewer={viewer}>
      <YnotShell viewer={viewer}>
        <div className="admin-workspace admin-redesign-reference">
          <AdminNav activeHref={activeHref} viewerRole={viewer.adminRole} />
          <section className="admin-workspace-main">{children}</section>
        </div>
      </YnotShell>
    </AdminGate>
  );
}

function AdminRouteLink({
  href,
  className,
  children,
}: {
  href: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <Link className={className} href={href} prefetch={false}>
      {children}
    </Link>
  );
}

function adminNavVisibleForRole(
  item: (typeof adminNavItems)[number],
  viewerRole: YnotViewer["adminRole"],
) {
  return item.href !== "/admin/marketplace" || viewerRole === "owner";
}

export function AdminNav({
  activeHref,
  viewerRole,
}: {
  activeHref: string;
  viewerRole?: YnotViewer["adminRole"];
}) {
  const visibleItems = adminNavItems.filter((item) =>
    adminNavVisibleForRole(item, viewerRole),
  );
  const activeItem =
    visibleItems.find((item) => item.href === activeHref) ?? visibleItems[0];

  return (
    <aside className="admin-side-nav soft-card" aria-label="Admin sections">
      <div className="admin-side-nav-head">
        <p className="admin-kicker">Admin menu</p>
        <strong>Control Panel</strong>
        <span>{activeItem.label}</span>
      </div>
      <div className="admin-side-nav-links">
        {visibleItems.map((item) => (
          <AdminRouteLink
            key={item.href}
            className={`admin-side-nav-link ${activeHref === item.href ? "active" : ""}`}
            href={item.href}
          >
            <span>{item.label}</span>
            <em>{item.kicker}</em>
          </AdminRouteLink>
        ))}
      </div>
      <Link className="admin-storefront-link" href="/" prefetch={false}>
        Back to storefront →
      </Link>
    </aside>
  );
}

function healthCounts(data: YnotDashboardData) {
  const checks = data.platformHealth?.checks ?? [];
  return {
    total: checks.length,
    failing: checks.filter((check) => check.status === "fail").length,
    warnings: checks.filter((check) => check.status === "warn").length,
    passing: checks.filter((check) => check.status === "pass").length,
  };
}

function liveCampaignCount(campaigns: YnotCampaign[]) {
  return campaigns.filter(
    (campaign) =>
      campaign.status === "live" && campaign.visibility === "public",
  ).length;
}

export function AdminControlCenter({ data }: { data: YnotDashboardData }) {
  const health = healthCounts(data);
  const pendingTopUps = data.adminTopUps.filter(
    (topUp) =>
      topUp.status === "pending_review" || topUp.status === "pending_slip",
  ).length;
  const pendingShipping = data.shipping.filter(
    (request) => request.status === "submitted" || request.status === "packing",
  ).length;
  const pendingOwnerApprovals = data.ownerApprovalRequests.filter(
    (request) => request.approvalStatus === "pending_review",
  ).length;
  const livePacks = liveCampaignCount(data.campaigns);
  const draftPacks = data.campaigns.filter(
    (campaign) =>
      campaign.status === "draft" || campaign.visibility !== "public",
  ).length;
  const healthTone = health.failing
    ? "danger"
    : health.warnings
      ? "warn"
      : "ready";
  const healthLabel = health.failing
    ? `${health.failing} failing`
    : health.warnings
      ? `${health.warnings} warning`
      : "ready";
  const quickActions = [
    {
      href: "/admin/campaigns",
      label: "New Random Pack",
      detail: "Create draft, set price, labels, and submit owner review.",
    },
    {
      href: "/admin/campaigns",
      label: "Owner Review",
      detail: `${pendingOwnerApprovals} random drop request${pendingOwnerApprovals === 1 ? "" : "s"} waiting.`,
    },
    {
      href: "/admin/prizes",
      label: "Add Card / Prize",
      detail: "Build the card catalog and prize pools.",
    },
    {
      href: "/admin/top-ups",
      label: "Review Top-ups",
      detail: `${pendingTopUps} waiting for admin review.`,
    },
    {
      href: "/admin/shipping",
      label: "Shipping Queue",
      detail: `${pendingShipping} open customer requests.`,
    },
  ];
  const mainTools = [
    {
      href: "/admin/campaigns",
      title: "Random Pack Studio",
      body: "Create and update pack drafts, customer tags, price, slot count, and owner approval requests.",
      meta: `${data.campaigns.length} pack records`,
    },
    {
      href: "/admin/categories",
      title: "Category Manager",
      body: "Review the active Pokemon and One Piece storefront categories and the future dynamic category contract.",
      meta: "2 active now",
    },
    {
      href: "/admin/prizes",
      title: "Prize / Card Catalog",
      body: "Create card records and connect them to random pack prize pools before publishing.",
      meta: "Card records",
    },
    {
      href: "/admin/users",
      title: "Users & Roles",
      body: "Review profiles, account merge requests, and owner/admin/staff role assignments.",
      meta: data.viewer.adminRole ?? "admin",
    },
    {
      href: "/admin/top-ups",
      title: "Wallet Top-ups",
      body: "Approve or reject bank transfer slip requests before coins are credited.",
      meta: `${pendingTopUps} pending`,
    },
    {
      href: "/admin/shipping",
      title: "Shipping",
      body: "Move submitted card-shipping requests through packing, shipped, delivered, or cancelled states.",
      meta: `${pendingShipping} open`,
    },
    {
      href: "/admin/settings",
      title: "Payment Settings",
      body: "Configure bank transfer methods used by customer wallet top-ups.",
      meta: `${data.paymentMethods.length} methods`,
    },
    {
      href: "/admin/rankings",
      title: "Rankings",
      body: "Inspect ranking snapshots before future public moderation and publishing controls.",
      meta: `${data.rankings.length} rows`,
    },
    {
      href: "/admin/audit",
      title: "Audit Log",
      body: "Trace admin, payment, gacha, exchange, shipping, and account events when debugging operations.",
      meta: "Trace",
    },
  ];

  return (
    <div className="admin-clean-dashboard">
      <section className="admin-clean-hero soft-card">
        <div>
          <p className="admin-kicker">Admin Control Center</p>
          <h2>What do you want to manage?</h2>
          <p>
            Use this clean dashboard for daily work: open packs, add prize
            cards, review money, ship cards, and check system readiness only
            when needed.
          </p>
        </div>
        <div className="admin-clean-status">
          <span>Signed in as</span>
          <strong>{data.viewer.displayName}</strong>
          <p>
            {data.viewer.adminRole ?? "admin"} · {livePacks} live pack
            {livePacks === 1 ? "" : "s"} · {draftPacks} draft/private ·{" "}
            {pendingOwnerApprovals} owner review
          </p>
        </div>
      </section>

      <AdminOwnerApprovalQueue
        enabled={data.viewer.adminRole === "owner"}
        requests={data.ownerApprovalRequests}
        viewerRole={data.viewer.adminRole}
      />

      <section
        className="admin-clean-section"
        aria-labelledby="admin-quick-actions-title"
      >
        <div className="admin-section-title">
          <span id="admin-quick-actions-title">Quick actions</span>
          <p>The buttons most owners use first.</p>
        </div>
        <div className="admin-quick-grid">
          {quickActions.map((action) => (
            <AdminRouteLink
              key={`${action.href}-${action.label}`}
              className="admin-quick-action soft-card"
              href={action.href}
            >
              <strong>{action.label}</strong>
              <p>{action.detail}</p>
            </AdminRouteLink>
          ))}
        </div>
      </section>

      <section
        className="admin-clean-section"
        aria-labelledby="admin-main-tools-title"
      >
        <div className="admin-section-title">
          <span id="admin-main-tools-title">Main tools</span>
          <p>
            All owner/admin pages are grouped by job, not by technical status.
          </p>
        </div>
        <div className="admin-tool-list">
          {mainTools.map((tool) => (
            <AdminRouteLink
              key={tool.href}
              className="admin-tool-row soft-card"
              href={tool.href}
            >
              <div>
                <h3>{tool.title}</h3>
                <p>{tool.body}</p>
              </div>
              <strong>{tool.meta}</strong>
            </AdminRouteLink>
          ))}
        </div>
      </section>

      <section className="admin-system-strip soft-card">
        <div>
          <span>System status</span>
          <strong>{healthLabel}</strong>
          <p>
            {health.passing}/{health.total || 0} readiness checks passing. Open
            health for migration/provider details when preparing production.
          </p>
        </div>
        <AdminRouteLink
          className={`status-pill ${healthTone}`}
          href="/admin/health"
        >
          Open health
        </AdminRouteLink>
      </section>
    </div>
  );
}

export function AdminCategoryManager({
  campaigns,
  categories = [],
}: {
  campaigns: YnotCampaign[];
  categories?: YnotCategory[];
}) {
  const futureCategories = [
    {
      title: "Pop Mart",
      body: "Add only after the shared categories table is live for the website storefront.",
    },
    {
      title: "Hobby",
      body: "Use the same future contract for image, sort order, hide/show, and labels.",
    },
  ];

  return (
    <div className="admin-category-page">
      <section className="admin-category-intro soft-card">
        <div>
          <p className="admin-kicker">Category Manager</p>
          <h3>Active storefront categories</h3>
          <p>
            Categories now come from the shared database when the production
            readiness migration is applied. Pokemon and One Piece remain
            backward compatible through <strong>draw_rounds.series</strong>.
          </p>
        </div>
        <Link className="secondary-action compact" href="/admin/campaigns">
          Open Random Pack Studio
        </Link>
      </section>

      <section
        className="admin-clean-section"
        aria-labelledby="admin-active-categories-title"
      >
        <div className="admin-section-title">
          <span id="admin-active-categories-title">Active categories</span>
          <p>These are live-safe now and already used by customer filters.</p>
        </div>
        <div className="admin-category-list">
          {(categories.length
            ? categories
            : adminCategoryCards.map(
                (category) =>
                  ({
                    id: category.series,
                    slug: category.series,
                    nameTh: category.title,
                    nameEn: category.title,
                    description: category.subtitle,
                    icon: category.accent,
                    legacySeries: category.series,
                    sortOrder: 0,
                    isActive: true,
                    isTest: false,
                  }) satisfies YnotCategory,
              )
          ).map((category) => {
            const categoryCampaigns = campaigns.filter(
              (campaign) =>
                campaign.categoryIds?.includes(category.id) ||
                campaign.categorySlugs?.includes(category.slug) ||
                (category.legacySeries &&
                  campaign.series === category.legacySeries),
            );
            const publicLive = categoryCampaigns.filter(
              (campaign) =>
                campaign.status === "live" && campaign.visibility === "public",
            ).length;
            return (
              <article
                key={category.id}
                className="admin-category-clean-card soft-card"
              >
                <div className="admin-category-clean-icon" aria-hidden>
                  {category.icon ?? "✨"}
                </div>
                <div className="admin-category-clean-body">
                  <span>
                    {category.isActive ? "Active" : "Hidden"}
                    {category.isTest ? " · TEST" : ""}
                  </span>
                  <h3>{category.nameEn}</h3>
                  <p>{category.description ?? category.nameTh}</p>
                  <dl>
                    <div>
                      <dt>Total packs</dt>
                      <dd>{categoryCampaigns.length}</dd>
                    </div>
                    <div>
                      <dt>Live public</dt>
                      <dd>{publicLive}</dd>
                    </div>
                    <div>
                      <dt>DB value</dt>
                      <dd>
                        <code>{category.slug}</code>
                      </dd>
                    </div>
                  </dl>
                </div>
                <div className="admin-category-clean-actions">
                  <Link
                    className="secondary-action compact"
                    href={
                      category.legacySeries
                        ? `/packs?series=${category.legacySeries}`
                        : `/packs?category=${category.slug}`
                    }
                  >
                    Preview storefront
                  </Link>
                  <AdminCategoryRowActionsSlot
                    categoryId={category.id}
                    categorySlug={category.slug}
                    categoryName={category.nameEn || category.nameTh}
                    packCount={categoryCampaigns.length}
                    isLegacySeries={Boolean(category.legacySeries)}
                  />
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section
        className="admin-clean-section"
        aria-labelledby="admin-future-categories-title"
      >
        <div className="admin-section-title">
          <span id="admin-future-categories-title">Future categories</span>
          <p>
            The UI is ready for these, but saving them waits for the shared DB
            migration.
          </p>
        </div>
        <div className="admin-future-category-grid">
          {futureCategories.map((category) => (
            <article
              key={category.title}
              className="admin-future-category-card soft-card"
            >
              <strong>{category.title}</strong>
              <span>Coming later</span>
              <p>{category.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="admin-category-contract soft-card">
        <h3>Future DB-backed category contract</h3>
        <div className="admin-roadmap-grid">
          <div>
            <strong>1. categories</strong>
            <p>Create slug, name TH/EN, image/icon, status, sort order.</p>
          </div>
          <div>
            <strong>2. draw_rounds.category_id</strong>
            <p>
              Replace fixed enum mapping while keeping Pokemon/One Piece
              backward compatible.
            </p>
          </div>
          <div>
            <strong>3. Admin CRUD</strong>
            <p>
              Add create/edit/hide/reorder controls after migration is live.
            </p>
          </div>
          <div>
            <strong>4. Website frontend</strong>
            <p>The website reads the same published categories everywhere.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

export function AdminGate({
  viewer,
  children,
}: {
  viewer: YnotViewer;
  children: ReactNode;
}) {
  // Explicit dev-auth bypass. Production still enforces the real admin role
  // check, and development does too unless YNOT_ENABLE_DEV_AUTH=true.
  const effectiveAdmin = viewer.isAdmin || isDevAuthAllowed();

  if (!effectiveAdmin) {
    return (
      <YnotShell viewer={viewer}>
        <PageHeader
          eyebrow="Admin denied"
          title="Admin access is required"
          description="Your account is signed in, but it is not an active owner/admin/staff account in admin_users."
          action={
            <Link className="primary-action" href="/">
              Back home
            </Link>
          }
        />
      </YnotShell>
    );
  }
  return <>{children}</>;
}

export function AdminSummary({ data }: { data: YnotDashboardData }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Pending top-ups"
          value={String(
            data.adminTopUps.filter(
              (topUp) =>
                topUp.status === "pending_review" ||
                topUp.status === "pending_slip",
            ).length,
          )}
        />
        <Metric label="Campaigns" value={String(data.campaigns.length)} />
        <Metric
          label="Exchange requests"
          value={String(data.exchanges.length)}
        />
        <Metric
          label="Shipping requests"
          value={String(data.shipping.length)}
        />
      </div>
      <PlatformHealthPanel health={data.platformHealth} />
    </div>
  );
}

export function PlatformHealthPanel({
  health,
}: {
  health: YnotDashboardData["platformHealth"];
}) {
  const checks = health?.checks ?? [];
  const failing = checks.filter((check) => check.status === "fail").length;
  const warnings = checks.filter((check) => check.status === "warn").length;
  return (
    <section className="admin-panel admin-health-panel soft-card">
      <div className="admin-panel-head">
        <div>
          <p className="section-label">Operational health</p>
          <h3 className="title-m">Production readiness signals</h3>
          <p className="txt-s mt-1">
            {productionSafetyLabel()}. DB/provider gaps are visible here for
            admins instead of being hidden as empty storefront state.
          </p>
        </div>
        <span
          className={`status-pill ${failing ? "danger" : warnings ? "warn" : "ready"}`}
        >
          {failing
            ? `${failing} failing`
            : warnings
              ? `${warnings} warning`
              : "ready"}
        </span>
      </div>
      <div className="admin-health-grid">
        {checks.length ? (
          checks.map((check) => (
            <div key={check.key} className={`health-check-row ${check.status}`}>
              <span>
                {check.status === "pass"
                  ? "✓"
                  : check.status === "warn"
                    ? "!"
                    : "×"}
              </span>
              <div>
                <strong>{check.label}</strong>
                <p>{check.detail}</p>
              </div>
            </div>
          ))
        ) : (
          <EmptyState
            title="No health checks"
            body="Sign in as admin with Supabase configured to inspect production readiness signals."
          />
        )}
      </div>
      {health?.generatedAt && (
        <p className="txt-mono admin-generated-at">
          Generated {new Date(health.generatedAt).toLocaleString()}
        </p>
      )}
    </section>
  );
}

export function StatusBadge({ status }: { status: ReactNode }) {
  const label = typeof status === "string" ? status.replaceAll("_", " ") : status;
  return (
    <span className="status-pill px-3 py-1 text-xs">
      {label}
    </span>
  );
}

export function EmptyState({
  title,
  body,
}: {
  title: ReactNode;
  body: ReactNode;
}) {
  return (
    <div className="empty-state">
      <p className="title-s">{title}</p>
      <p className="txt-s mt-2">{body}</p>
    </div>
  );
}
