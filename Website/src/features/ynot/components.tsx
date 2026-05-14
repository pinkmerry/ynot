import { cookies } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
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
import { normalizeOpenQuantityOptions } from "./open-quantity";
import {
  StoreSettingsMenu,
  StoreSortSelect,
} from "./StorePreferences";
import { OwnerApprovalQueue } from "./client";
import {
  prizeDisplayTierLabel,
  prizeDisplayTierOptions,
  prizeDisplayTierValue,
} from "./prize-tier";

const homeCategories = [
  { label: "Pokemon", series: "pokemon" },
  { label: "One Piece", series: "one_piece" },
] as const;

const filterTags = ["All", "New", "PSA10"] as const;

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
  { href: "/admin/rankings", label: "Rankings", kicker: "Leaderboard" },
  { href: "/admin/shipping", label: "Shipping", kicker: "Fulfill" },
  { href: "/admin/exchange", label: "Exchange", kicker: "Review" },
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

export function normalizeHomeSeries(
  value: string | string[] | undefined,
): HomeSeriesFilter {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return rawValue === "pokemon" || rawValue === "one_piece" ? rawValue : "all";
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

function seriesLabel(series: YnotCampaign["series"]) {
  return series === "pokemon" ? "Pokemon" : "One Piece";
}

function homeFilterHref(nextFilter: Partial<HomeFilterState>) {
  const filter = { ...defaultHomeFilter, ...nextFilter };
  const params = new URLSearchParams();
  if (filter.series !== "all") params.set("series", filter.series);
  if (filter.tag !== "all") params.set("tag", filter.tag);
  if (filter.sort !== "recommended") params.set("sort", filter.sort);
  const query = params.toString();
  return query ? `/?${query}` : "/";
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
  if (sort === "recommended") return campaigns;
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

function filteredCampaigns(campaigns: YnotCampaign[], filter: HomeFilterState) {
  const filtered = displayCampaigns(campaigns).filter((campaign) => {
    const matchesSeries =
      filter.series === "all" || campaign.series === filter.series;
    return matchesSeries && campaignMatchesTag(campaign, filter.tag);
  });
  return sortedCampaigns(filtered, filter.sort);
}

function homeFilterHeading(filter: HomeFilterState) {
  if (filter.series === "pokemon") return "Pokemon";
  if (filter.series === "one_piece") return "One Piece";
  return "All Categories";
}

function remaining(campaign: YnotCampaign) {
  const remainingSlots = campaign.remainingSlots;
  if (typeof remainingSlots !== "number" || !Number.isFinite(remainingSlots))
    return null;
  return Math.max(0, remainingSlots);
}

function remainingPercent(campaign: YnotCampaign) {
  const remainingSlots = remaining(campaign);
  if (remainingSlots === null) return null;
  return Math.max(
    3,
    Math.min(100, (remainingSlots / Math.max(campaign.totalSlots, 1)) * 100),
  );
}

function remainingStatusText(campaign: YnotCampaign) {
  const remainingSlots = remaining(campaign);
  if (remainingSlots === null) return "Stock tracked by server";
  return `${remainingSlots.toLocaleString()} left`;
}

function remainingRatioText(campaign: YnotCampaign) {
  const remainingSlots = remaining(campaign);
  if (remainingSlots === null) return "Server-tracked stock";
  return `${remainingSlots.toLocaleString()}/${campaign.totalSlots.toLocaleString()}`;
}

function ProgressTrack({ campaign }: { campaign: YnotCampaign }) {
  const percent = remainingPercent(campaign);
  if (percent === null)
    return (
      <div
        className="progress-track stock-untracked"
        aria-label="Stock is tracked server-side"
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
  homeFilter = defaultHomeFilter,
  walletBalance,
}: {
  viewer: YnotViewer;
  children: ReactNode;
  homeFilter?: HomeFilterState;
  walletBalance?: number;
}) {
  let renderViewer = viewer;
  let renderBalance = walletBalance;
  if (process.env.NODE_ENV !== "production") {
    const cookieStore = await cookies();
    if (cookieStore.get("ynot-preview-auth")?.value === "1") {
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
  }
  return (
    <main className="app-shell store-shell mobile-safe space-y-7">
      <header className="storefront-header sticky top-0 z-50">
        <div className="store-topbar">
          <div className="store-topbar-left">
            {renderViewer.authenticated ? (
              <StoreSettingsMenu
                authenticated
                isAdmin={renderViewer.isAdmin}
              />
            ) : (
              <StoreSettingsMenu />
            )}
          </div>
          <Link href="/" className="brand-lockup" aria-label="YNOT home">
            <Image
              src="/ynot-logo.png"
              alt="YNOT"
              width={620}
              height={200}
              priority
              className="brand-logo"
            />
          </Link>
          <div className="store-topbar-right">
            {renderViewer.authenticated && (
              <Link
                href="/wallet"
                className="header-coin-pill"
                aria-label={`Coin balance ${typeof renderBalance === "number" ? formatCoins(renderBalance) : "0"} · Tap to top up`}
              >
                <TopUpCoinIcon />
                <span className="header-coin-amount">
                  {typeof renderBalance === "number"
                    ? formatCoins(renderBalance)
                    : "—"}
                </span>
              </Link>
            )}
          </div>
        </div>
        <StoreFilterStrip homeFilter={homeFilter} />
      </header>
      {children}
    </main>
  );
}

function TopUpCoinIcon() {
  return (
    <span aria-hidden className="header-coin-mark">
      <svg viewBox="0 0 24 24" width="1em" height="1em" focusable="false">
        <defs>
          <radialGradient id="coinFace" cx="50%" cy="38%" r="65%">
            <stop offset="0%" stopColor="#ffd089" />
            <stop offset="55%" stopColor="#ff8a1f" />
            <stop offset="100%" stopColor="#b94e00" />
          </radialGradient>
          <linearGradient id="coinRim" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="#ffe6c2" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#7a3000" stopOpacity="0.85" />
          </linearGradient>
          <radialGradient id="coinShine" cx="36%" cy="28%" r="32%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="12" cy="12" r="10.5" fill="url(#coinFace)" />
        <circle
          cx="12"
          cy="12"
          r="10.5"
          fill="none"
          stroke="url(#coinRim)"
          strokeWidth="1"
        />
        <circle
          cx="12"
          cy="12"
          r="8.6"
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.18"
          strokeWidth="0.6"
        />
        <ellipse
          cx="9.5"
          cy="8.2"
          rx="5"
          ry="2.6"
          fill="url(#coinShine)"
        />
        <path
          d="M12 7.6 V16.4 M7.6 12 H16.4"
          stroke="#1a0d00"
          strokeOpacity="0.92"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
        <path
          d="M12 7.6 V16.4 M7.6 12 H16.4"
          stroke="#fff1d6"
          strokeOpacity="0.35"
          strokeWidth="0.6"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

function StoreFilterStrip({ homeFilter }: { homeFilter: HomeFilterState }) {
  return (
    <div className="store-filter-strip" aria-label="Mystery pack filters">
      <div className="store-filter-scroll">
        {filterTags.map((tag) => {
          const tagKey: HomeTagFilter =
            tag === "All" ? "all" : tag === "New" ? "new" : "psa10";
          return (
            <Link
              key={tag}
              aria-current={homeFilter.tag === tagKey ? "page" : undefined}
              className={`filter-chip ${homeFilter.tag === tagKey ? "active" : ""}`}
              href={homeFilterHref({
                series: homeFilter.series,
                tag: tagKey,
                sort: homeFilter.sort,
              })}
            >
              {tag}
            </Link>
          );
        })}
      </div>
      <StoreSortSelect homeFilter={homeFilter} />
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
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
  title: string;
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

  return (
    <>
      <MobileTorecaHero campaign={campaigns[0]} />
      <div className="store-home-grid">
        <aside className="store-left-rail" aria-label="Store sections">
          <RailLink icon="◆" label="Mystery Packs" href="/" active />
          <RailLink icon="♕" label="Ranking" href="/ranking" />
          <RailLink icon="⇄" label="Exchange" href="/exchange" />
        </aside>

        <div className="store-main-stack">
          <div className="catalog-toolbar">
            <h1>List of Mystery Packs for {homeFilterHeading(homeFilter)}</h1>
            <Link className="mini-link" href="/exchange">
              See all →
            </Link>
          </div>
          <section className="home-pack-board product-section">
            <PhoneTopBar
              title="YNOT."
              coin={data.wallet.balanceCoins}
              action={<span className="template-icon-button">♧</span>}
            />
            <PhoneRule />
            <CategoryStrip homeFilter={homeFilter} />
            <section className="template-promo">
              {campaigns[0] ? (
                <>
                  <span>
                    {seriesLabel(campaigns[0].series)} · {campaigns[0].status}
                  </span>
                  <strong>
                    {campaigns[0].titleTh || campaigns[0].titleEn}
                  </strong>
                  <p>
                    {campaigns[0].heroLabel ?? "Admin-published mystery pack"}
                  </p>
                  <Link href={`/gacha/${campaigns[0].slug}`}>
                    VIEW DETAILS →
                  </Link>
                </>
              ) : (
                <>
                  <span>Store setup</span>
                  <strong>No live packs yet</strong>
                  <p>
                    Admin must publish real packs before customers can open.
                  </p>
                  <Link href="/local-readiness">VIEW READINESS →</Link>
                </>
              )}
            </section>
            <div className="section-heading-row template-section-heading">
              <h3 className="title-m">Featured Today</h3>
              <Link className="mini-link" href="/exchange">
                See all →
              </Link>
            </div>
            <CampaignGrid
              campaigns={campaigns}
              emptyTitle="No packs match this filter"
              emptyBody="Try All, switch category, or ask admin to add matching pack labels."
            />
            <section className="live-now-strip">
              <div className="section-heading-row">
                <h3 className="title-m">Store status</h3>
                <span className="orange-chip">
                  <CoinIcon /> {campaigns.length} visible packs
                </span>
              </div>
              {campaigns.length ? (
                campaigns.slice(0, 2).map((campaign) => (
                  <div
                    className="live-now-row"
                    key={`store-status-${campaign.id}`}
                  >
                    <span>{seriesLabel(campaign.series)}</span>
                    <p>
                      {campaign.titleTh || campaign.titleEn} ·{" "}
                      {remainingStatusText(campaign)}
                    </p>
                    <strong>›</strong>
                  </div>
                ))
              ) : (
                <div className="live-now-row">
                  <span>Admin</span>
                  <p>No real live packs are published yet.</p>
                  <strong>!</strong>
                </div>
              )}
            </section>
          </section>
        </div>

        <aside className="store-right-rail">
          <PromoCard />
          <LiveActivity campaigns={campaigns} />
        </aside>
      </div>
    </>
  );
}

function MobileTorecaHero({ campaign }: { campaign?: YnotCampaign }) {
  const openHref = campaign
    ? `/gacha/${campaign.slug}/open`
    : "/local-readiness";
  return (
    <section className="toreca-mobile-hero" aria-label="YNot mobile hero">
      <div className="hero-card-fan" aria-hidden>
        {Array.from({ length: 8 }).map((_, index) => (
          <span key={index} />
        ))}
      </div>
      <div className="hero-copy">
        <h1>
          RIP PACKS
          <br />
          SHIP CARDS
          <br />
          COLLECT AND
          <br />
          REPEAT
        </h1>
        <p>
          {campaign
            ? "OPEN LIVE ADMIN-PUBLISHED PACKS"
            : "AWAITING FIRST LIVE PACK"}
        </p>
        <Link className="hero-rip-button" href={openHref}>
          {campaign ? "Rip Mystery Pack" : "View Readiness"}
        </Link>
      </div>
      <Link
        className="hero-see-more"
        href={homeFilterHref({ series: "pokemon" })}
      >
        ⌄ See more packs ⌄
      </Link>
    </section>
  );
}

function RailLink({
  icon,
  label,
  href,
  active,
}: {
  icon: string;
  label: string;
  href: string;
  active?: boolean;
}) {
  return (
    <Link className={`rail-link ${active ? "active" : ""}`} href={href}>
      <span>{icon}</span>
      {label}
      <span aria-hidden>›</span>
    </Link>
  );
}

function CategoryStrip({ homeFilter }: { homeFilter: HomeFilterState }) {
  return (
    <section className="category-strip" aria-label="Categories">
      {homeCategories.map((category) => (
        <Link
          key={category.series}
          aria-current={
            homeFilter.series === category.series ? "page" : undefined
          }
          className={`category-tab ${homeFilter.series === category.series ? "active" : ""}`}
          href={homeFilterHref({
            series: category.series,
            tag: homeFilter.tag,
            sort: homeFilter.sort,
          })}
        >
          {category.label}
        </Link>
      ))}
    </section>
  );
}

function PromoCard() {
  return (
    <section className="app-promo-card">
      <p className="section-label">YNot Trading Card Center</p>
      <h3>Now available as a web + LINE experience!</h3>
      <p>
        Top up by bank transfer or QR, open packs, exchange cards, and request
        shipping from one account.
      </p>
      <div className="promo-qr" aria-label="Wallet QR configured by admin">
        QR
      </div>
      <Link className="primary-action w-full justify-center" href="/wallet">
        Top up wallet
      </Link>
    </section>
  );
}

function LiveActivity({ campaigns }: { campaigns: YnotCampaign[] }) {
  return (
    <section className="live-panel">
      <div className="section-heading-row">
        <div>
          <p className="section-label">Store activity</p>
          <h3 className="title-m">Published packs</h3>
        </div>
        <span className="live-dot" />
      </div>
      <div className="live-list">
        {campaigns.length ? (
          campaigns.slice(0, 4).map((campaign) => (
            <p key={`activity-${campaign.id}`}>
              {campaign.titleTh || campaign.titleEn}
              <span>{campaign.status}</span>
            </p>
          ))
        ) : (
          <p>
            No public pack activity yet<span>setup</span>
          </p>
        )}
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
  emptyTitle = "No campaigns yet",
  emptyBody = "Admin can publish campaigns after the platform migration is applied.",
}: {
  campaigns: YnotCampaign[];
  fallbackToFeatured?: boolean;
  emptyTitle?: string;
  emptyBody?: string;
}) {
  const items = fallbackToFeatured ? displayCampaigns(campaigns) : campaigns;
  if (!items.length) return <EmptyState title={emptyTitle} body={emptyBody} />;
  return (
    <div className="campaign-grid">
      {items.map((campaign) => (
        <CampaignCard key={campaign.id} campaign={campaign} />
      ))}
    </div>
  );
}

export function CampaignCard({ campaign }: { campaign: YnotCampaign }) {
  const title = campaign.titleTh || campaign.titleEn;
  const displayTags = campaignDisplayTags(campaign);
  const remainingSlots = remaining(campaign);
  const remainingLabel =
    remainingSlots === null
      ? "Server-tracked stock"
      : `Remaining ${remainingSlots.toLocaleString()}/${campaign.totalSlots.toLocaleString()}`;
  return (
    <article className="product-card clean-pack-card">
      <div className="pack-card-top">
        <div
          className="product-tags pack-info-tags"
          aria-label="Pack status and admin tags"
        >
          <span className="status-pill">{campaign.status}</span>
          {displayTags.map((tag, index) => (
            <span
              key={`${campaign.id}-tag-${index}-${tag}`}
              className="soft-pill campaign-label-pill"
            >
              {tag}
            </span>
          ))}
        </div>
        <h3 className="title-m pack-card-title">{title}</h3>
      </div>
      <Link
        className="pack-image-link"
        href={`/gacha/${campaign.slug}`}
        aria-label={`View ${title}`}
      >
        <CampaignArtwork campaign={campaign} clean />
      </Link>
      <div
        className="pack-card-bottom"
        aria-label="Pack price and stock status"
      >
        <span
          className="pack-price-line"
          aria-label={`${formatCoins(campaign.costCoins)} coins per pack`}
        >
          <CoinIcon /> {formatCoins(campaign.costCoins)}/pack
        </span>
        <span className="pack-remaining-line" aria-label={remainingLabel}>
          {remainingLabel}
        </span>
      </div>
      <ProgressTrack campaign={campaign} />
      <div className="product-actions">
        <Link className="secondary-action" href={`/gacha/${campaign.slug}`}>
          Details
        </Link>
        <Link className="primary-action" href={`/gacha/${campaign.slug}/open`}>
          Open
        </Link>
      </div>
    </article>
  );
}

export function CampaignDetailPanel({ campaign }: { campaign: YnotCampaign }) {
  const detailOpenOptions = normalizeOpenQuantityOptions(
    campaign.openQuantityOptions,
  );

  return (
    <section className="product-detail-grid detail-layout">
      <PhoneTopBar
        title={campaign.titleEn}
        action={
          <>
            <Link className="template-icon-button" href="/">
              ‹
            </Link>
            <Link className="template-icon-button" href="/collection">
              ♡
            </Link>
          </>
        }
      />
      <PhoneRule />
      <CampaignArtwork campaign={campaign} large quiet />
      <section className="detail-info-card">
        <p className="section-label">
          {campaign.categoryLabel ?? seriesLabel(campaign.series)} mystery pack
        </p>
        <h3 className="page-title">{campaign.titleTh || campaign.titleEn}</h3>
        <p className="page-description">
          {campaign.heroLabel ??
            "High-value chase cards, exchangeable collection rewards, and real shipping support."}
        </p>
        <div className="filter-chip-row">
          <span className="filter-chip active">PSA10</span>
          <span className="filter-chip">High value</span>
          <span className="filter-chip">Exchange available</span>
          <span className="filter-chip">Shipping ready</span>
        </div>
        <div className="detail-stat-grid">
          <div className="detail-stat-card detail-stat-card-price">
            <span>Price per pull</span>
            <strong>
              <span className="detail-stat-number">
                <CoinIcon /> {formatCoins(campaign.costCoins)}
              </span>
              <small>coins</small>
            </strong>
            <em>Every pack open</em>
          </div>
          <div className="detail-stat-card detail-stat-card-stock">
            <span>Stock</span>
            <strong>{remainingRatioText(campaign)}</strong>
            <em>Remaining</em>
          </div>
        </div>
        <ProgressTrack campaign={campaign} />
        <div className="detail-actions">
          {campaign.demo || campaign.openable ? (
            <>
              {detailOpenOptions.map((option, index) => (
                <Link
                  className={index === 0 ? "primary-action" : "orange-action"}
                  href={`/gacha/${campaign.slug}/open?qty=${option}`}
                  key={option}
                >
                  Pull × {option}
                </Link>
              ))}
            </>
          ) : (
            <p className="admin-form-message">
              This pack is not openable because prize inventory is missing,
              sold out, or awaiting owner approval.
            </p>
          )}
          <Link className="secondary-action" href="/wallet">
            Top up wallet
          </Link>
        </div>
        <div className="reward-section">
          <div className="section-heading-row">
            <div>
              <p className="section-label">Rewards</p>
              <h4 className="title-m">Prize lineup</h4>
            </div>
            <span className="status-pill">{campaign.status}</span>
          </div>
          {campaign.prizeLineup?.length ? (
            <PrizeLineup prizes={campaign.prizeLineup} />
          ) : campaign.demo && allowDemoStorefront() ? (
            <RewardTierList />
          ) : (
            <EmptyState
              title="Real prize pool required"
              body="Unlocked public rewards will appear here after the prize pool is ready."
            />
          )}
        </div>
      </section>
      <div className="transparent-note">
        <strong>🔒 100% Transparent</strong>
        <span>
          Production pulls are tracked by database rows after migrations are
          applied
        </span>
      </div>
    </section>
  );
}

export function RewardTierList({ compact = false }: { compact?: boolean }) {
  return (
    <div className="reward-tier-list">
      {rewardTiers.map((tier, index) => (
        <div key={tier.rank} className="reward-tier-card">
          <div className="tier-heading">
            <div>
              <span className={`tier-rank tier-${tier.rank.toLowerCase()}`}>
                {tier.rank}
              </span>
              <strong>{tier.name}</strong>
            </div>
            <span>{tier.remain} left</span>
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
          <p className="txt-s">{tier.note}</p>
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
    <div className="reward-prize-image" aria-hidden="true">
      {prize.cardImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- Catalog prize URLs are Supabase/storage assets already managed outside Next image config.
        <img src={prize.cardImageUrl} alt="" loading="lazy" />
      ) : (
        <span>{fallbackLabel}</span>
      )}
    </div>
  );
}

function PrizeLineup({ prizes }: { prizes: YnotPrizePreview[] }) {
  const sections = prizeDisplayTierOptions
    .map((option) => ({
      key: option.value,
      label: `${option.label} rewards`,
      description:
        option.value === "bronze"
          ? "Base rewards and category prizes that cover regular pulls."
          : `${option.label} chase prizes shown above lower tiers.`,
      prizes: prizes
        .filter((prize) => prizeLineupTier(prize) === option.value)
        .sort(
          (left, right) =>
            (left.tierRank ?? left.rank) - (right.tierRank ?? right.rank),
        ),
    }))
    .filter((section) => section.prizes.length > 0);

  return (
    <div className="reward-lineup-groups">
      {sections.map((section) => (
        <section className="reward-lineup-section" key={section.key}>
          <div className="reward-lineup-section-head">
            <div>
              <strong>{section.label}</strong>
              <span>{section.description}</span>
            </div>
            <em>{section.prizes.length} item{section.prizes.length === 1 ? "" : "s"}</em>
          </div>
          <div className="reward-tier-list reward-tier-list-structured">
            {section.prizes.map((prize) => (
              <div className="reward-tier-card" key={prize.id}>
                <PrizeLineupImage prize={prize} />
                <div className="tier-heading">
                  <div>
                    <span className={`tier-rank tier-${section.key}`}>
                      {prizeDisplayTierLabel(section.key)} #
                      {prize.tierRank ?? prize.rank}
                    </span>
                    <strong>{prize.cardName}</strong>
                  </div>
                  <span>
                    {prize.prizeCategoryLabel ??
                      (prize.tier === "high" ? "High tier" : "Normal")}
                  </span>
                </div>
                <p className="reward-prize-meta">
                  {prize.availableUnits !== undefined && prize.totalUnits !== undefined
                    ? `${prize.availableUnits}/${prize.totalUnits} left`
                    : "Inventory preview"}
                  {prize.cardCode ? ` · ${prize.cardCode}` : ""}
                  {prize.cardGrade ? ` · ${prize.cardGrade}` : ""}
                  {Number(prize.unlockAtSoldPct ?? 0) > 0
                    ? " · preview reward"
                    : ""}
                </p>
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
  const hasPackAsset = Boolean(
    campaign.demo &&
    allowDemoStorefront() &&
    campaign.slug === "pokemon-gold-07",
  );
  return (
    <div
      className={`campaign-art ${campaign.series === "pokemon" ? "pokemon" : "one-piece"} ${hasPackAsset ? "has-asset" : ""} ${large ? "large" : ""} ${clean ? "clean-art" : ""} ${quiet ? "quiet-art" : ""}`}
    >
      <span className="art-glow" aria-hidden />
      {clean && !quiet && !hasPackAsset && (
        <span className="clean-pack-cover" aria-hidden>
          <span className="clean-cover-kicker">
            {campaign.categoryLabel ?? seriesLabel(campaign.series)}
          </span>
          <span className="clean-cover-title">{campaign.titleEn}</span>
          <span className="clean-cover-footer">Mystery Pack</span>
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
          <strong>{campaign.titleEn}</strong>
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
      <svg
        viewBox="0 0 24 24"
        width="1em"
        height="1em"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6.5" strokeOpacity="0.65" />
        <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
        <path d="M2.5 12 H5 M19 12 H21.5 M12 2.5 V5 M12 19 V21.5" strokeOpacity="0.55" />
        <path d="M7.4 7.4 L9 9 M15 9 L16.6 7.4 M7.4 16.6 L9 15 M15 15 L16.6 16.6" strokeOpacity="0.35" />
      </svg>
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
        <span className="vip-bonus">⭐ VIP · BONUS +7%</span>
      </section>
      <section className="soft-card wallet-method-card">
        <h3 className="title-m">Manual transfer / QR methods</h3>
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
                  {method.bankName ?? "PromptPay"} ·{" "}
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

export function TopUpTable({
  topUps,
  admin,
}: {
  topUps: YnotTopUp[];
  admin?: boolean;
}) {
  if (!topUps.length)
    return (
      <EmptyState
        title="No top-up requests"
        body="Upload a transfer slip to create the first manual review request."
      />
    );
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="section-label">
          <tr>
            <th className="py-2">Code</th>
            <th>Coins</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Created</th>
            {admin && <th>Profile</th>}
          </tr>
        </thead>
        <tbody>
          {topUps.map((topUp) => (
            <tr key={topUp.id} className="border-t border-[var(--border)]">
              <td className="py-3 font-mono font-bold">{topUp.publicCode}</td>
              <td>{topUp.coinAmount.toLocaleString()}</td>
              <td>฿{topUp.amountThb.toLocaleString()}</td>
              <td>
                <StatusBadge status={topUp.status} />
              </td>
              <td>{new Date(topUp.createdAt).toLocaleString()}</td>
              {admin && (
                <td className="font-mono text-xs">
                  {topUp.profileId.slice(0, 8)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
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
        title="No real collection cards yet"
        body="Open a live pack first. Demo sample cards are not shown as customer inventory in production-safe mode."
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
  return (
    <article className="collection-card vertical">
      <div className="collection-art large">
        <span>
          {item.imageUrl ? "Card image" : (item.cardCode ?? "YNot Card")}
        </span>
      </div>
      <h3 className="title-s mt-4">{item.cardName}</h3>
      <p className="txt-mono mt-1 text-xs">
        {item.serialNo ?? item.id.slice(0, 8)} · {item.status}
      </p>
    </article>
  );
}

export function RankingTable({ rankings }: { rankings: YnotRankingRow[] }) {
  const [top, ...rest] = rankings;
  return (
    <section className="soft-card ranking-phone phone-surface">
      <PhoneTopBar
        title="Ranking"
        action={<span className="orange-chip">🏆 Reward</span>}
      />
      <div className="ranking-tabs">
        <span className="active">Yesterday</span>
        <span>Week</span>
        <span>Month</span>
        <span>All-time</span>
      </div>
      {top && (
        <div className="ranking-hero">
          <span className="crown">👑</span>
          <div className="ranking-avatar">🐺</div>
          <h3>{top.displayName}</h3>
          <p>{top.value.toLocaleString()} coin</p>
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
          title="No ranking data yet"
          body="Ranking rows will appear after real customer activity is recorded."
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
      <PhoneTopBar title="Exchange" coin={wallet.balanceCoins} />
      <PhoneRule />
      <div
        className="category-strip market-categories"
        aria-label="Exchange status"
      >
        <span className="category-tab active">Owned {collectionCount}</span>
        <span className="category-tab">Requests {requestCount}</span>
        <span className="category-tab">Admin review</span>
      </div>
      <div className="exchange-bonus-strip">
        <strong>Real exchange requests only</strong> · Select owned collection
        cards below; admin review records approved coin value.
      </div>
      <EmptyState
        title="No public exchange catalog yet"
        body="Production exchange value comes from admin-reviewed collection requests until an admin-managed exchange catalog is added."
      />
    </section>
  );
}

export function OrderList({
  title,
  orders,
}: {
  title: string;
  orders: Array<YnotExchangeOrder | YnotShippingRequest>;
}) {
  return (
    <section className="soft-card order-history-card rounded-[28px] p-5">
      <h3 className="title-m">{title}</h3>
      {!orders.length ? (
        <EmptyState
          title="No requests"
          body="Submit a collection request to create one."
        />
      ) : (
        <div className="mt-4 grid gap-3">
          {orders.map((order) => (
            <div key={order.id} className="request-card">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono font-bold">{order.publicCode}</p>
                <StatusBadge status={order.status} />
              </div>
              <p className="txt-mono mt-2 text-xs">
                Created {new Date(order.createdAt).toLocaleString()}
              </p>
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
          <AdminNav activeHref={activeHref} />
          <section className="admin-workspace-main">{children}</section>
        </div>
      </YnotShell>
    </AdminGate>
  );
}

export function AdminNav({ activeHref }: { activeHref: string }) {
  const activeItem =
    adminNavItems.find((item) => item.href === activeHref) ?? adminNavItems[0];

  return (
    <aside className="admin-side-nav soft-card" aria-label="Admin sections">
      <div className="admin-side-nav-head">
        <p className="admin-kicker">Admin menu</p>
        <strong>Control Panel</strong>
        <span>{activeItem.label}</span>
      </div>
      <div className="admin-side-nav-links">
        {adminNavItems.map((item) => (
          <Link
            key={item.href}
            className={`admin-side-nav-link ${activeHref === item.href ? "active" : ""}`}
            href={item.href}
          >
            <span>{item.label}</span>
            <em>{item.kicker}</em>
          </Link>
        ))}
      </div>
      <Link className="admin-storefront-link" href="/">
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
  const pendingExchange = data.exchanges.filter(
    (order) => order.status === "submitted",
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
      body: "Approve or reject bank transfer and PromptPay slip requests before coins are credited.",
      meta: `${pendingTopUps} pending`,
    },
    {
      href: "/admin/shipping",
      title: "Shipping",
      body: "Move submitted card-shipping requests through packing, shipped, delivered, or cancelled states.",
      meta: `${pendingShipping} open`,
    },
    {
      href: "/admin/exchange",
      title: "Exchange",
      body: "Review card exchange requests and record notes so the customer history stays auditable.",
      meta: `${pendingExchange} submitted`,
    },
    {
      href: "/admin/settings",
      title: "Payment Settings",
      body: "Configure bank transfer and PromptPay methods used by customer wallet top-ups.",
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

      {data.viewer.adminRole === "owner" && (
        <OwnerApprovalQueue
          requests={data.ownerApprovalRequests}
          viewerRole={data.viewer.adminRole}
        />
      )}

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
            <Link
              key={`${action.href}-${action.label}`}
              className="admin-quick-action soft-card"
              href={action.href}
            >
              <strong>{action.label}</strong>
              <p>{action.detail}</p>
            </Link>
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
            <Link
              key={tool.href}
              className="admin-tool-row soft-card"
              href={tool.href}
            >
              <div>
                <h3>{tool.title}</h3>
                <p>{tool.body}</p>
              </div>
              <strong>{tool.meta}</strong>
            </Link>
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
        <Link className={`status-pill ${healthTone}`} href="/admin/health">
          Open health
        </Link>
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
      body: "Add only after the shared categories table exists for website and LIFF.",
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
                <Link
                  className="secondary-action compact"
                  href={
                    category.legacySeries
                      ? `/?series=${category.legacySeries}`
                      : `/?category=${category.slug}`
                  }
                >
                  Preview storefront
                </Link>
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
            <strong>4. Shared frontend</strong>
            <p>Website and LIFF read the same published categories.</p>
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
  if (!viewer.isAdmin) {
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

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className="status-pill px-3 py-1 text-xs">
      {status.replaceAll("_", " ")}
    </span>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <p className="title-s">{title}</p>
      <p className="txt-s mt-2">{body}</p>
    </div>
  );
}
