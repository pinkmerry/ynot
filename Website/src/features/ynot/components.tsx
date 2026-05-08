import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/features/auth/actions";
import type { YnotCampaign, YnotCollectionItem, YnotDashboardData, YnotExchangeOrder, YnotPaymentMethod, YnotRankingRow, YnotShippingRequest, YnotTopUp, YnotViewer, YnotWallet } from "./types";
import { exchangeCatalog, exchangeCategories, featuredCampaigns, rewardTiers, sampleCollectionCards } from "./storefront-content";
import { StoreHeaderNav, StoreSettingsMenu } from "./StorePreferences";

const homeCategories = [
  { label: "Pokemon", series: "pokemon" },
  { label: "One Piece", series: "one_piece" },
] as const;

const filterTags = ["All", "New", "PSA10"] as const;

export type HomeSeriesFilter = "all" | YnotCampaign["series"];
export type HomeTagFilter = "all" | "new" | "psa10";
export type HomeFilterState = {
  series: HomeSeriesFilter;
  tag: HomeTagFilter;
};

const defaultHomeFilter: HomeFilterState = { series: "all", tag: "all" };

export function normalizeHomeSeries(value: string | string[] | undefined): HomeSeriesFilter {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return rawValue === "pokemon" || rawValue === "one_piece" ? rawValue : "all";
}

export function normalizeHomeTag(value: string | string[] | undefined): HomeTagFilter {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return rawValue === "new" || rawValue === "psa10" ? rawValue : "all";
}

function displayCampaigns(campaigns: YnotCampaign[]) {
  return campaigns.length ? campaigns : featuredCampaigns;
}

function seriesLabel(series: YnotCampaign["series"]) {
  return series === "pokemon" ? "Pokemon" : "One Piece";
}

function navSlug(label: string) {
  return label.toLowerCase().replaceAll("&", "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function homeFilterHref(nextFilter: Partial<HomeFilterState>) {
  const filter = { ...defaultHomeFilter, ...nextFilter };
  const params = new URLSearchParams();
  if (filter.series !== "all") params.set("series", filter.series);
  if (filter.tag !== "all") params.set("tag", filter.tag);
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

function filteredCampaigns(campaigns: YnotCampaign[], filter: HomeFilterState) {
  return displayCampaigns(campaigns).filter((campaign) => {
    const matchesSeries = filter.series === "all" || campaign.series === filter.series;
    return matchesSeries && campaignMatchesTag(campaign, filter.tag);
  });
}

function homeFilterHeading(filter: HomeFilterState) {
  if (filter.series === "pokemon") return "Pokemon";
  if (filter.series === "one_piece") return "One Piece";
  return "All Categories";
}

function remaining(campaign: YnotCampaign) {
  return campaign.remainingSlots ?? Math.max(0, Math.ceil(campaign.totalSlots * 0.42));
}

function remainingPercent(campaign: YnotCampaign) {
  return Math.max(3, Math.min(100, (remaining(campaign) / Math.max(campaign.totalSlots, 1)) * 100));
}

function campaignDisplayTags(campaign: YnotCampaign) {
  const fallback = campaign.series === "pokemon" ? ["PSA10"] : ["Manga"];
  const tags = campaign.displayTags?.map((tag) => tag.trim()).filter(Boolean) ?? [];
  return (tags.length ? tags : fallback).slice(0, 3);
}

function formatCoins(value: number) {
  return value.toLocaleString();
}

export function YnotShell({ viewer, children, homeFilter = defaultHomeFilter }: { viewer: YnotViewer; children: ReactNode; homeFilter?: HomeFilterState }) {
  return (
    <main className="app-shell store-shell mobile-safe space-y-7">
      <header className="storefront-header sticky top-3 z-30">
        <div className="store-topbar">
          <Link href="/" className="brand-lockup" aria-label="YNot TCG home">
            <span className="brand-mark">Y</span>
            <span className="min-w-0">
              <span className="brand-name">YNot TCG</span>
              <span className="brand-tagline">Official TCG Store</span>
            </span>
          </Link>
          <StoreHeaderNav authenticated={viewer.authenticated} />
          <div className="store-actions">
            {viewer.authenticated ? (
              <>
                <span className="account-chip">{viewer.displayName} · {viewer.authSource === "line" ? "LINE" : "Web"}</span>
                {viewer.isAdmin && <Link className="secondary-action compact" href="/admin">Admin</Link>}
                <form action={signOutAction}>
                  <button className="secondary-action compact" type="submit">Logout</button>
                </form>
              </>
            ) : (
              <>
                <Link className="secondary-action compact" href="/login">Login</Link>
                <Link className="primary-action compact" href="/signup">Sign Up</Link>
              </>
            )}
            <StoreSettingsMenu />
          </div>
        </div>
        <StoreFilterStrip homeFilter={homeFilter} />
      </header>
      {children}
    </main>
  );
}

function StoreFilterStrip({ homeFilter }: { homeFilter: HomeFilterState }) {
  return (
    <div className="store-filter-strip" aria-label="Mystery pack filters">
      <div className="store-filter-scroll">
        {filterTags.map((tag) => {
          const tagKey: HomeTagFilter = tag === "All" ? "all" : tag === "New" ? "new" : "psa10";
          return (
            <Link
              key={tag}
              aria-current={homeFilter.tag === tagKey ? "page" : undefined}
              className={`filter-chip ${homeFilter.tag === tagKey ? "active" : ""}`}
              href={homeFilterHref({ series: homeFilter.series, tag: tagKey })}
            >
              {tag}
            </Link>
          );
        })}
      </div>
      <label className="store-sort-select">
        <span>Sort</span>
        <select defaultValue="recommended" aria-label="Sort mystery packs">
          <option value="recommended">Recommended</option>
          <option value="latest">Latest</option>
          <option value="coins-desc">Coins in Descending Order</option>
          <option value="coins-asc">Lowest Coins First</option>
        </select>
      </label>
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
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

function PhoneTopBar({ title, coin, action }: { title: string; coin?: number | string; action?: ReactNode }) {
  return (
    <div className="template-top-bar">
      <h2>{title}</h2>
      <div className="template-top-actions">
        {coin !== undefined && <span className="coin-pill"><CoinIcon /> {typeof coin === "number" ? formatCoins(coin) : coin}</span>}
        {action}
      </div>
    </div>
  );
}

function PhoneRule() {
  return <div className="phone-rule" aria-hidden><span /><span /><span /></div>;
}

export function YnotHomeExperience({ data, homeFilter = defaultHomeFilter }: { data: YnotDashboardData; homeFilter?: HomeFilterState }) {
  const campaigns = filteredCampaigns(data.campaigns, homeFilter);

  return (
    <>
      <MobileTorecaHero />
      <div className="store-home-grid">
        <aside className="store-left-rail" aria-label="Store sections">
          <RailLink icon="◆" label="Mystery Packs" href="/" active />
          <RailLink icon="♕" label="Ranking" href="/ranking" />
          <RailLink icon="⇄" label="Exchange" href="/exchange" />
        </aside>

        <div className="store-main-stack">
          <div className="catalog-toolbar">
            <h1>List of Mystery Packs for {homeFilterHeading(homeFilter)}</h1>
            <Link className="mini-link" href="/exchange">See all →</Link>
          </div>
          <section className="home-pack-board product-section">
            <PhoneTopBar title="YNOT." coin={data.wallet.balanceCoins || 1250} action={<span className="template-icon-button">♧</span>} />
            <PhoneRule />
            <CategoryStrip homeFilter={homeFilter} />
            <section className="template-promo">
              <span>FLASH · 2 DAYS LEFT</span>
              <strong>SUMMER BURST</strong>
              <p>2X PULL BONUS</p>
              <Link href="/gacha/pokemon-gold-07">VIEW DETAILS →</Link>
            </section>
            <div className="section-heading-row template-section-heading">
              <h3 className="title-m">Featured Today</h3>
              <Link className="mini-link" href="/exchange">See all →</Link>
            </div>
            <CampaignGrid campaigns={campaigns} emptyTitle="No packs match this filter" emptyBody="Try All, switch category, or ask admin to add matching pack labels." />
            <section className="live-now-strip">
              <div className="section-heading-row">
                <h3 className="title-m">Live Now</h3>
                <span className="orange-chip">● 12 rooms</span>
              </div>
              <div className="live-now-row"><span>Otto J.</span><p>Just got SR Mewtwo · 2 min ago</p><strong>👏</strong></div>
              <div className="live-now-row"><span>Mint S.</span><p>Just got UR Charizard · 5 min ago</p><strong>👏</strong></div>
            </section>
          </section>
        </div>

        <aside className="store-right-rail">
          <PromoCard />
          <LiveActivity />
        </aside>
      </div>
    </>
  );
}

function MobileTorecaHero() {
  return (
    <section className="toreca-mobile-hero" aria-label="YNot mobile hero">
      <div className="hero-card-fan" aria-hidden>
        {Array.from({ length: 8 }).map((_, index) => <span key={index} />)}
      </div>
      <div className="hero-copy">
        <h1>RIP PACKS<br />SHIP CARDS<br />COLLECT AND<br />REPEAT</h1>
        <p>JOIN OVER 250,000 USERS WORLDWIDE</p>
        <Link className="hero-rip-button" href="/gacha/pokemon-gold-07/open">Rip Mystery Pack</Link>
      </div>
      <Link className="hero-see-more" href={homeFilterHref({ series: "pokemon" })}>⌄ See more packs ⌄</Link>
    </section>
  );
}

function RailLink({ icon, label, href, active }: { icon: string; label: string; href: string; active?: boolean }) {
  return <Link className={`rail-link ${active ? "active" : ""}`} href={href}><span>{icon}</span>{label}<span aria-hidden>›</span></Link>;
}

function CategoryStrip({ homeFilter }: { homeFilter: HomeFilterState }) {
  return (
    <section className="category-strip" aria-label="Categories">
      {homeCategories.map((category) => (
        <Link
          key={category.series}
          aria-current={homeFilter.series === category.series ? "page" : undefined}
          className={`category-tab ${homeFilter.series === category.series ? "active" : ""}`}
          href={homeFilterHref({ series: category.series, tag: homeFilter.tag })}
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
      <p>Top up by bank transfer or QR, open packs, exchange cards, and request shipping from one account.</p>
      <div className="promo-qr" aria-label="QR placeholder">QR</div>
      <Link className="primary-action w-full justify-center" href="/wallet">Top up wallet</Link>
    </section>
  );
}

function LiveActivity() {
  const rows = ["Mint opened Pokemon Gold", "Boo Boo exchanged PSA10", "YUYA shipped One Piece", "Admin approved top-up"];
  return (
    <section className="live-panel">
      <div className="section-heading-row">
        <div>
          <p className="section-label">Live activity</p>
          <h3 className="title-m">Store feed</h3>
        </div>
        <span className="live-dot" />
      </div>
      <div className="live-list">
        {rows.map((row) => <p key={row}>{row}<span>now</span></p>)}
      </div>
    </section>
  );
}

export function MetricGrid({ wallet, topUps, collection, campaigns }: { wallet: YnotWallet; topUps: YnotTopUp[]; collection: YnotCollectionItem[]; campaigns: YnotCampaign[] }) {
  const pendingTopUps = topUps.filter((topUp) => topUp.status === "pending_review" || topUp.status === "pending_slip").length;
  return (
    <div className="metric-grid">
      <Metric label="Coin balance" value={`${(wallet.balanceCoins || 0).toLocaleString()} coins`} />
      <Metric label="Pending top-ups" value={String(pendingTopUps)} />
      <Metric label="Owned cards" value={String(collection.filter((item) => item.status === "owned").length || sampleCollectionCards.length)} />
      <Metric label="Live campaigns" value={String(campaigns.filter((campaign) => campaign.status === "live").length)} />
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
      {items.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} />)}
    </div>
  );
}

export function CampaignCard({ campaign }: { campaign: YnotCampaign }) {
  const title = campaign.titleTh || campaign.titleEn;
  const displayTags = campaignDisplayTags(campaign);
  const remainingSlots = remaining(campaign);
  return (
    <article className="product-card clean-pack-card">
      <div className="pack-card-top">
        <div className="product-tags pack-info-tags" aria-label="Pack status and admin tags">
          <span className="status-pill">{campaign.status}</span>
          {displayTags.map((tag, index) => <span key={`${campaign.id}-tag-${index}-${tag}`} className="soft-pill campaign-label-pill">{tag}</span>)}
        </div>
        <h3 className="title-m pack-card-title">{title}</h3>
      </div>
      <Link className="pack-image-link" href={`/gacha/${campaign.slug}`} aria-label={`View ${title}`}>
        <CampaignArtwork campaign={campaign} clean />
      </Link>
      <div className="pack-card-bottom" aria-label="Pack price and remaining stock">
        <span className="pack-price-line" aria-label={`${formatCoins(campaign.costCoins)} coins per pack`}><CoinIcon /> {formatCoins(campaign.costCoins)}/pack</span>
        <span className="pack-remaining-line" aria-label={`Remaining ${remainingSlots.toLocaleString()} out of ${campaign.totalSlots.toLocaleString()}`}>Remaining {remainingSlots.toLocaleString()}/{campaign.totalSlots.toLocaleString()}</span>
      </div>
      <div className="progress-track"><span style={{ width: `${remainingPercent(campaign)}%` }} /></div>
      <div className="product-actions">
        <Link className="secondary-action" href={`/gacha/${campaign.slug}`}>Details</Link>
        <Link className="primary-action" href={`/gacha/${campaign.slug}/open`}>Open</Link>
      </div>
    </article>
  );
}

export function CampaignDetailPanel({ campaign }: { campaign: YnotCampaign }) {
  return (
    <section className="product-detail-grid detail-phone phone-surface">
      <PhoneTopBar
        title={campaign.slug === "pokemon-gold-07" ? "Gold Set #07" : campaign.titleEn}
        action={<><Link className="template-icon-button" href="/">‹</Link><Link className="template-icon-button" href="/collection">♡</Link></>}
      />
      <PhoneRule />
      <CampaignArtwork campaign={campaign} large />
      <section className="detail-info-card">
        <p className="section-label">{campaign.categoryLabel ?? seriesLabel(campaign.series)} mystery pack</p>
        <h3 className="page-title">{campaign.titleTh || campaign.titleEn}</h3>
        <p className="page-description">{campaign.heroLabel ?? "High-value chase cards, exchangeable collection rewards, and real shipping support."}</p>
        <div className="filter-chip-row">
          <span className="filter-chip active">PSA10</span>
          <span className="filter-chip">High value</span>
          <span className="filter-chip">Exchange available</span>
          <span className="filter-chip">Shipping ready</span>
        </div>
        <div className="detail-stat-grid">
          <div><span>Price/pull</span><strong><CoinIcon /> {formatCoins(campaign.costCoins)}</strong></div>
          <div><span>Remaining</span><strong>{remaining(campaign).toLocaleString()} / {campaign.totalSlots.toLocaleString()} left</strong></div>
        </div>
        <div className="progress-track"><span style={{ width: `${remainingPercent(campaign)}%` }} /></div>
        <div className="detail-actions">
          <Link className="primary-action" href={`/gacha/${campaign.slug}/open`}>Pull × 1</Link>
          <Link className="orange-action" href={`/gacha/${campaign.slug}/open`}>Pull × 10</Link>
          <Link className="secondary-action" href="/wallet">Top up wallet</Link>
        </div>
        <div className="reward-section">
          <div className="section-heading-row">
            <div>
              <p className="section-label">Rewards</p>
              <h4 className="title-m">Prize lineup</h4>
            </div>
            <span className="status-pill">Live</span>
          </div>
          <RewardTierList />
        </div>
      </section>
      <div className="transparent-note"><strong>🔒 100% Transparent</strong><span>Every pull has a verifiable hash · stock counts update real-time</span></div>
    </section>
  );
}

export function RewardTierList({ compact = false }: { compact?: boolean }) {
  return (
    <div className="reward-tier-list">
      {rewardTiers.map((tier, index) => (
        <div key={tier.rank} className="reward-tier-card">
          <div className="tier-heading">
            <div><span className={`tier-rank tier-${tier.rank.toLowerCase()}`}>{tier.rank}</span><strong>{tier.name}</strong></div>
            <span>{tier.remain} left</span>
          </div>
          <div className="tier-cards">
            {tier.cards.map((card, cardIndex) => <PrizeCard key={`${tier.rank}-${cardIndex}`} label={card} rare={index < 2} compact={compact} />)}
          </div>
          <p className="txt-s">{tier.note}</p>
        </div>
      ))}
    </div>
  );
}

function CampaignArtwork({ campaign, large = false, clean = false }: { campaign: YnotCampaign; large?: boolean; clean?: boolean }) {
  const hasPackAsset = campaign.slug === "pokemon-gold-07";
  return (
    <div className={`campaign-art ${campaign.series === "pokemon" ? "pokemon" : "one-piece"} ${hasPackAsset ? "has-asset" : ""} ${large ? "large" : ""} ${clean ? "clean-art" : ""}`}>
      <span className="art-glow" aria-hidden />
      {clean && !hasPackAsset && (
        <span className="clean-pack-cover" aria-hidden>
          <span className="clean-cover-kicker">{campaign.categoryLabel ?? seriesLabel(campaign.series)}</span>
          <span className="clean-cover-title">{campaign.titleEn}</span>
          <span className="clean-cover-footer">Mystery Pack</span>
        </span>
      )}
      {!clean && (
        <>
          <span className="art-count">{large ? "PROVABLY FAIR" : `1/${formatCoins(campaign.costCoins)}`}</span>
          <span className="art-category">{campaign.categoryLabel ?? seriesLabel(campaign.series)}</span>
          <strong>{campaign.titleEn}</strong>
          <p>{campaign.heroLabel ?? seriesLabel(campaign.series)}</p>
          <span className="art-coin"><CoinIcon /> {formatCoins(campaign.costCoins)}</span>
          <span className="art-stock">{remaining(campaign).toLocaleString()}/{campaign.totalSlots.toLocaleString()}</span>
        </>
      )}
    </div>
  );
}

function PrizeCard({ label, rare, compact }: { label: string; rare?: boolean; compact?: boolean }) {
  return <div className={`prize-card ${rare ? "rare" : ""} ${compact ? "compact" : ""}`}><span>{label}</span></div>;
}

function CoinIcon() {
  return <span aria-label="coin" className="coin-icon">●</span>;
}

export function WalletPanel({ wallet, paymentMethods, topUps }: { wallet: YnotWallet; paymentMethods: YnotPaymentMethod[]; topUps: YnotTopUp[] }) {
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
          {paymentMethods.length ? paymentMethods.map((method) => (
            <div key={method.id} className="payment-method-card">
              <span className="payment-icon">{method.type === "promptpay_qr" ? "▣" : "🏦"}</span>
              <p className="title-s text-[var(--gold)]">{method.displayName}</p>
              <p className="txt-s mt-1">{method.bankName ?? "PromptPay"} · {method.accountName ?? method.promptpayId ?? "Configured by admin"}</p>
              {method.accountNumber && <p className="txt-mono mt-1">{method.accountNumber}</p>}
              {method.instructions && <p className="txt-s mt-2">{method.instructions}</p>}
              <span className="payment-chevron">›</span>
            </div>
          )) : <EmptyState title="No payment method" body="Admin settings must add at least one active bank/QR method." />}
        </div>
      </section>
      <section className="soft-card wallet-history-card">
        <h3 className="title-m">Top-up history</h3>
        <TopUpTable topUps={topUps} />
      </section>
    </div>
  );
}

export function TopUpTable({ topUps, admin }: { topUps: YnotTopUp[]; admin?: boolean }) {
  if (!topUps.length) return <EmptyState title="No top-up requests" body="Upload a transfer slip to create the first manual review request." />;
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="section-label"><tr><th className="py-2">Code</th><th>Coins</th><th>Amount</th><th>Status</th><th>Created</th>{admin && <th>Profile</th>}</tr></thead>
        <tbody>
          {topUps.map((topUp) => <tr key={topUp.id} className="border-t border-[var(--border)]"><td className="py-3 font-mono font-bold">{topUp.publicCode}</td><td>{topUp.coinAmount.toLocaleString()}</td><td>฿{topUp.amountThb.toLocaleString()}</td><td><StatusBadge status={topUp.status} /></td><td>{new Date(topUp.createdAt).toLocaleString()}</td>{admin && <td className="font-mono text-xs">{topUp.profileId.slice(0, 8)}</td>}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

export function CollectionGrid({ collection }: { collection: YnotCollectionItem[] }) {
  if (!collection.length) {
    return <div className="collection-list">{sampleCollectionCards.map((item) => <SampleCollectionCard key={item.code} item={item} />)}</div>;
  }
  return <div className="collection-list">{collection.map((item) => <CollectionCard key={item.id} item={item} />)}</div>;
}

function SampleCollectionCard({ item }: { item: (typeof sampleCollectionCards)[number] }) {
  return (
    <article className={`collection-card ${item.selected ? "selected" : ""}`}>
      <div className="collection-art"><span>{item.type}</span></div>
      <div className="min-w-0 grow">
        <h3 className="title-s truncate">{item.name}</h3>
        <div className="collection-tags"><span>{item.selected ? "GRAND" : "3RD"}</span><span>PSA10</span></div>
        <p className="txt-mono text-xs">{item.code}</p>
        <p className="title-s text-[13px]"><CoinIcon /> {item.coin}</p>
        <p className="txt-s text-[var(--gold)]">Deadline 2026/05/10</p>
      </div>
      <span className="collection-check">{item.selected ? "✓" : ""}</span>
    </article>
  );
}

function CollectionCard({ item }: { item: YnotCollectionItem }) {
  return (
    <article className="collection-card vertical">
      <div className="collection-art large"><span>{item.imageUrl ? "Card image" : item.cardCode ?? "YNot Card"}</span></div>
      <h3 className="title-s mt-4">{item.cardName}</h3>
      <p className="txt-mono mt-1 text-xs">{item.serialNo ?? item.id.slice(0, 8)} · {item.status}</p>
    </article>
  );
}

export function RankingTable({ rankings }: { rankings: YnotRankingRow[] }) {
  const rows = rankings.length ? rankings : [
    { rank: 1, displayName: "HUSKY", metric: "yesterday", value: 283420 },
    { rank: 2, displayName: "TSUYOSHI_CFC", metric: "yesterday", value: 192780 },
    { rank: 3, displayName: "M", metric: "yesterday", value: 158210 },
    { rank: 4, displayName: "H", metric: "yesterday", value: 124500 },
    { rank: 5, displayName: "オリパ中毒", metric: "yesterday", value: 98640 },
    { rank: 6, displayName: "Nameless Collector", metric: "yesterday", value: 82430 },
    { rank: 7, displayName: "テンテン", metric: "yesterday", value: 74210 },
  ];
  const [top, ...rest] = rows;
  return (
    <section className="soft-card ranking-phone phone-surface">
      <PhoneTopBar title="Ranking" action={<span className="orange-chip">🏆 Reward</span>} />
      <div className="ranking-tabs"><span className="active">Yesterday</span><span>Week</span><span>Month</span><span>All-time</span></div>
      {top && (
        <div className="ranking-hero">
          <span className="crown">👑</span>
          <div className="ranking-avatar">🐺</div>
          <h3>{top.displayName}</h3>
          <p>{top.value.toLocaleString()} coin</p>
          <strong>★ TOP 1</strong>
        </div>
      )}
      <div className="ranking-list">
        {rest.map((row) => (
          <div className="leader-row" key={`${row.metric}-${row.rank}`}>
            <span className="leader-rank">{row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : row.rank}</span>
            <span className="leader-avatar" />
            <strong>{row.displayName}</strong>
            <em>{row.value.toLocaleString()}</em>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ExchangeCatalogPanel() {
  return (
    <section className="market-shell phone-surface">
      <PhoneTopBar title="Exchange" coin="252,433" />
      <PhoneRule />
      <div className="category-strip market-categories" aria-label="Exchange categories">
        {exchangeCategories.map((category, index) => <a id={navSlug(category)} key={category} className={`category-tab ${index === 0 ? "active" : ""}`} href={`#${navSlug(category)}`}>{category}</a>)}
      </div>
      <div className="exchange-bonus-strip">🎁 <strong>BONUS ✦ 4,614</strong> · Trade for real cards below</div>
      <div className="exchange-grid">
        {exchangeCatalog.map((card) => (
          <article key={card.name} className={`exchange-card ${card.sold ? "sold" : ""}`}>
            <div className="exchange-stock"><span>Stock</span><em>{card.tickets}</em></div>
            <div className="exchange-art"><span>{card.category}</span>{card.sold && <strong>SOLD OUT</strong>}</div>
            <h4>{card.name}</h4>
            <div className="exchange-price"><CoinIcon /> {card.coin}</div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function OrderList({ title, orders }: { title: string; orders: Array<YnotExchangeOrder | YnotShippingRequest> }) {
  return (
    <section className="soft-card rounded-[28px] p-5">
      <h3 className="title-m">{title}</h3>
      {!orders.length ? <EmptyState title="No requests" body="Submit a collection request to create one." /> : <div className="mt-4 grid gap-3">{orders.map((order) => <div key={order.id} className="request-card"><div className="flex items-center justify-between gap-3"><p className="font-mono font-bold">{order.publicCode}</p><StatusBadge status={order.status} /></div><p className="txt-mono mt-2 text-xs">Created {new Date(order.createdAt).toLocaleString()}</p></div>)}</div>}
    </section>
  );
}

export function AdminGate({ viewer, children }: { viewer: YnotViewer; children: ReactNode }) {
  if (!viewer.isAdmin) {
    return <YnotShell viewer={viewer}><PageHeader eyebrow="Admin denied" title="Admin access is required" description="Your account is signed in, but it is not an active owner/admin/staff account in admin_users." action={<Link className="primary-action" href="/">Back home</Link>} /></YnotShell>;
  }
  return <>{children}</>;
}

export function AdminSummary({ data }: { data: YnotDashboardData }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Metric label="Pending top-ups" value={String(data.adminTopUps.filter((topUp) => topUp.status === "pending_review" || topUp.status === "pending_slip").length)} />
      <Metric label="Campaigns" value={String(data.campaigns.length)} />
      <Metric label="Exchange requests" value={String(data.exchanges.length)} />
      <Metric label="Shipping requests" value={String(data.shipping.length)} />
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <span className="status-pill px-3 py-1 text-xs">{status.replaceAll("_", " ")}</span>;
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return <div className="empty-state"><p className="title-s">{title}</p><p className="txt-s mt-2">{body}</p></div>;
}
