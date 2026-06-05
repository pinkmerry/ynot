"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type {
  YnotCampaign,
  YnotLastPrizePreview,
  YnotPrizePreview,
} from "../types";
import { normalizeOpenQuantityOptions } from "../open-quantity";
import { QuantityBadge } from "../QuantityBadge";
import { CoinPip, Ico, formatCoins } from "./Icons";
import { Modal, PageHead, useToast } from "./UiKit";

const SERIES_LABEL: Record<string, string> = {
  pokemon: "Pokemon",
  one_piece: "One Piece",
};

function seriesLabel(series: string): string {
  return SERIES_LABEL[series] ?? series;
}

function seriesGlyph(series: string): string {
  return series === "one_piece" ? "OP" : "PKM";
}

type TierKey = "rainbow" | "gold" | "silver" | "bronze";
const TIER_ORDER: TierKey[] = ["rainbow", "gold", "silver", "bronze"];
const TIER_TITLE: Record<TierKey, string> = {
  rainbow: "Rainbow · 1st Prize",
  gold: "Gold · 2nd Prize",
  silver: "Silver · 3rd Prize",
  bronze: "Bronze · 4th Prize",
};
const TIER_SUB: Record<TierKey, string> = {
  rainbow: "Top chase rewards for this Y-Pack",
  gold: "Premium chase cards just below Rainbow",
  silver: "Strong mid-tier pulls with consistent value",
  bronze: "Base and category cards for regular pulls",
};
const TIER_GLYPH: Record<TierKey, string> = {
  rainbow: "R",
  gold: "G",
  silver: "S",
  bronze: "B",
};

function prizeDisplayTier(prize: YnotPrizePreview): TierKey {
  const dt = (prize.displayTier ?? "").toLowerCase();
  if (dt === "rainbow" || dt === "gold" || dt === "silver" || dt === "bronze") {
    return dt;
  }
  if (prize.tier === "high" && (prize.rank ?? 99) <= 3) return "rainbow";
  if (prize.tier === "high") return "gold";
  if (prize.tier === "normal" && (prize.rank ?? 99) <= 6) return "silver";
  return "bronze";
}

function groupPrizesByTier(
  prizes: YnotPrizePreview[],
): Record<TierKey, YnotPrizePreview[]> {
  const grouped: Record<TierKey, YnotPrizePreview[]> = {
    rainbow: [],
    gold: [],
    silver: [],
    bronze: [],
  };
  for (const prize of prizes) {
    grouped[prizeDisplayTier(prize)].push(prize);
  }
  return grouped;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function openUnavailableReason(campaign: YnotCampaign): string {
  if (campaign.openable) return "";
  return "This pack is not ready to open yet.";
}

export type PackDetailExperienceProps = {
  campaign: YnotCampaign;
  balanceCoins: number;
};

export function PackDetailExperience({
  campaign,
  balanceCoins,
}: PackDetailExperienceProps) {
  const router = useRouter();
  const { toast } = useToast();
  const openQty = normalizeOpenQuantityOptions(campaign.openQuantityOptions);
  const [rawQty, setQty] = useState<number>(openQty[0] ?? 1);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fetchedLastPrize, setFetchedLastPrize] =
    useState<YnotLastPrizePreview | null>(null);

  // The last-prize card+image lookup is starved by the detail page's server
  // subrequest budget, so fetch it client-side (fresh budget) when the server
  // projection didn't already include it.
  useEffect(() => {
    if (campaign.lastPrizePreview || !campaign.lastPrizeCardId) return;
    let active = true;
    fetch(`/api/ynot/packs/${encodeURIComponent(campaign.slug)}/last-prize`, {
      cache: "no-store",
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: unknown) => {
        if (!active) return;
        const preview =
          payload && typeof payload === "object" && "lastPrizePreview" in payload
            ? (payload as { lastPrizePreview: YnotLastPrizePreview | null })
                .lastPrizePreview
            : null;
        if (preview) setFetchedLastPrize(preview);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [campaign.lastPrizePreview, campaign.lastPrizeCardId, campaign.slug]);

  const lastPrize = campaign.lastPrizePreview ?? fetchedLastPrize;

  // Keep qty bounded to whichever options are actually available right now.
  const qty = openQty.includes(rawQty) ? rawQty : (openQty[0] ?? 1);

  const remaining = campaign.remainingSlots ?? campaign.totalSlots;
  const totalCost = campaign.costCoins * qty;
  const soldOut = campaign.soldOut || remaining <= 0;
  const lowStock = !soldOut && remaining > 0 && remaining / Math.max(1, campaign.totalSlots) < 0.2;
  const enoughCoins = balanceCoins >= totalCost;
  const enoughStock = remaining >= qty;
  const openable = Boolean(campaign.openable);
  const unavailableReason = openUnavailableReason(campaign);
  const stockPct = Math.max(
    0,
    Math.min(100, Math.round((remaining / Math.max(1, campaign.totalSlots)) * 100)),
  );
  const stockClass = stockPct < 20 ? "crit" : stockPct < 50 ? "warn" : "";

  const groupedPrizes = groupPrizesByTier(campaign.prizeLineup ?? []);
  const presentTiers = TIER_ORDER.filter((t) => groupedPrizes[t].length > 0);
  const totalPrizeCards = (campaign.prizeLineup ?? []).length;
  const containsRainbow = presentTiers.includes("rainbow");

  function tryOpen() {
    if (!openable) {
      toast("error", unavailableReason);
      return;
    }
    if (!enoughStock) {
      toast("error", `Only ${remaining} packs left.`);
      return;
    }
    if (!enoughCoins) {
      toast("error", "Top up to open this many.");
      return;
    }
    setConfirmOpen(true);
  }
  function confirmAndOpen() {
    setSubmitting(true);
    // auto=1 fires the open immediately on arrival so the reveal animation
    // plays without a second confirm screen. See GachaOpenPanel autoStart.
    router.push(`/gacha/${campaign.slug}/open?qty=${qty}&auto=1`);
  }

  return (
    <div className="cr-page has-dock cr-detail-centered">
      <PageHead
        eyebrow={seriesLabel(campaign.series)}
        title={campaign.titleEn || campaign.titleTh}
        back={{ href: "/packs" }}
      />

      <div className="cr-detail-hero-wrap">
        <div className={`cr-detail-hero-art ${campaign.series}`}>
          <span className="cr-hero-glow" aria-hidden />
          {(campaign.displayTags ?? []).some((tag) =>
            tag.toLowerCase().includes("hot"),
          ) && <span className="cr-pack-art-sticker">Hot</span>}
          {lowStock && (
            <span
              className="cr-pack-art-sticker"
              style={{
                background: "var(--cr-rose-soft)",
                color: "var(--cr-rose)",
              }}
            >
              Low stock
            </span>
          )}
          {soldOut && (
            <span
              className="cr-pack-art-sticker"
              style={{ background: "var(--cr-ink)", color: "#fff" }}
            >
              Sold out
            </span>
          )}
          {!soldOut && (
            <span className="cr-hero-stock">
              {remaining}/{campaign.totalSlots}
            </span>
          )}
          <span className="cr-hero-eyebrow">
            {seriesLabel(campaign.series).toUpperCase()}
          </span>
          <HeroFan campaign={campaign} />
          <span className="cr-hero-footer">
            {(campaign.titleEn || campaign.titleTh).toUpperCase()}
          </span>
        </div>
      </div>

      <div className="cr-detail-info-card">
        <div className="cr-detail-tag-row">
          <span className="cr-pill cr-pill-ink">
            {seriesLabel(campaign.series)}
          </span>
          {(campaign.displayTags ?? []).slice(0, 4).map((tag) => (
            <span key={tag} className="cr-pill">
              {tag}
            </span>
          ))}
          {containsRainbow && (
            <span
              className="cr-pill"
              style={{
                background:
                  "linear-gradient(135deg, #ffd6e3, #ffe9b3, #c8efc8, #b3d6ff, #d6c8ff)",
                color: "#4a2a3a",
                borderColor: "transparent",
              }}
            >
              Rainbow inside
            </span>
          )}
          <span className="cr-pill cr-pill-mint">Convert ready</span>
          <span className="cr-pill cr-pill-blue">Shipping ready</span>
        </div>

        {campaign.heroLabel && (
          <p className="cr-detail-desc">{campaign.heroLabel}</p>
        )}

        <div className="cr-detail-stats">
          <div className="stat">
            <span className="cr-eyebrow">Price / pack</span>
            <strong>
              <CoinPip size={18} /> {formatCoins(campaign.costCoins)}
            </strong>
            <small className="cr-mute">coins per open</small>
          </div>
          <div className="stat">
            <span className="cr-eyebrow">Stock left</span>
            <strong className="cr-tnum">
              {remaining}
              <span
                style={{
                  color: "var(--cr-mute)",
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                &nbsp;/ {campaign.totalSlots}
              </span>
            </strong>
            <div
              className={`cr-progress ${stockClass}`}
              style={{ width: 96, marginTop: 2 }}
            >
              <span style={{ width: `${stockPct}%` }} />
            </div>
          </div>
          <div className="stat">
            <span className="cr-eyebrow">Cards in pool</span>
            <strong className="cr-tnum">{totalPrizeCards}</strong>
            <small className="cr-mute">unique chase cards</small>
          </div>
          <div className="stat">
            <span className="cr-eyebrow">Open options</span>
            <strong>
              {openQty.length
                ? openQty.map((q) => `×${q}`).join(" · ")
                : "—"}
            </strong>
            <small className="cr-mute">per session</small>
          </div>
        </div>
      </div>

      <div className="cr-stack" style={{ gap: 18 }}>
        <div className="cr-section">
          <div className="cr-section-head">
            <div className="cr-stack" style={{ gap: 2 }}>
              <span className="cr-eyebrow">Prize lineup</span>
              <h3>What you might pull</h3>
            </div>
            <small className="cr-mute">
              {totalPrizeCards} possible card{totalPrizeCards === 1 ? "" : "s"}
            </small>
          </div>
          <div className="cr-section-body cr-stack" style={{ gap: 22 }}>
            {presentTiers.length === 0 ? (
              <p className="cr-mute" style={{ textAlign: "center", margin: 0 }}>
                Prize lineup will appear once admins assign cards to this pack.
              </p>
            ) : (
              presentTiers.map((tier) => (
                <div key={tier}>
                  <div className={`cr-tier-banner ${tier}`}>
                    <span
                      className={`cr-tier-swatch ${tier}`}
                      aria-hidden
                    >
                      {TIER_GLYPH[tier]}
                    </span>
                    <span className="cr-tier-text">
                      <strong className="cr-tier-title">
                        {TIER_TITLE[tier]}
                      </strong>
                      <span className="cr-tier-sub">{TIER_SUB[tier]}</span>
                    </span>
                    <span className="cr-tier-count">
                      {groupedPrizes[tier].length} prize
                      {groupedPrizes[tier].length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="cr-prize-grid">
                    {groupedPrizes[tier].map((prize, i) => (
                      <div
                        key={`${prize.id}-${i}`}
                        className="cr-prize-card"
                      >
                        <div className={`cr-prize-card-art cr-coll-art ${tier}`}>
                          {prize.cardImageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={prize.cardImageUrl}
                              alt={prize.cardName}
                            />
                          ) : (
                            <span className="cr-prize-card-art-placeholder">
                              {initials(prize.cardName)}
                            </span>
                          )}
                          <QuantityBadge quantity={prize.bundleQuantity} />
                        </div>
                        <div className="cr-prize-card-name">
                          {prize.cardName}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
            {lastPrize ? (
              <div>
                <div className="cr-tier-banner last-prize">
                  <span className="cr-tier-swatch last-prize" aria-hidden>
                    ★
                  </span>
                  <span className="cr-tier-text">
                    <strong className="cr-tier-title">Last One Prize</strong>
                    <span className="cr-tier-sub">
                      Bonus for whoever opens the final pack — on top of the
                      normal pull
                    </span>
                  </span>
                  <span className="cr-tier-count">Bonus</span>
                </div>
                <div className="cr-prize-grid">
                  <div className="cr-prize-card">
                    <div className="cr-prize-card-art cr-coll-art last-prize">
                      {lastPrize.cardImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={lastPrize.cardImageUrl}
                          alt={lastPrize.cardName}
                        />
                      ) : (
                        <span className="cr-prize-card-art-placeholder">
                          {initials(lastPrize.cardName)}
                        </span>
                      )}
                    </div>
                    <div className="cr-prize-card-name">
                      {lastPrize.cardName}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="cr-section">
          <div className="cr-section-head">
            <div className="cr-stack" style={{ gap: 2 }}>
              <span className="cr-eyebrow">Pack notes</span>
              <h3>Before you open</h3>
            </div>
            <span className="cr-pill">
              Ref · {(campaign.slug || campaign.id).toUpperCase()}
            </span>
          </div>
          <div
            className="cr-section-body"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 18,
            }}
          >
            <div className="cr-stack" style={{ gap: 4 }}>
              <strong style={{ fontSize: 13 }}>Pull results are final</strong>
              <p
                className="cr-mute"
                style={{ fontSize: 12.5, margin: 0 }}
              >
                Every open is recorded by YNOTT before cards land in your
                collection. Disputes need order reference + unboxing video.
              </p>
            </div>
            <div className="cr-stack" style={{ gap: 4 }}>
              <strong style={{ fontSize: 13 }}>Enjoy the lineup</strong>
              <p
                className="cr-mute"
                style={{ fontSize: 12.5, margin: 0 }}
              >
                Browse the featured collectibles before opening. Each pull is
                random, and shown rewards are examples from this Y-Pack.
              </p>
            </div>
            <div className="cr-stack" style={{ gap: 4 }}>
              <strong style={{ fontSize: 13 }}>Convert any time</strong>
              <p
                className="cr-mute"
                style={{ fontSize: 12.5, margin: 0 }}
              >
                Owned cards can be sold back to coins from the Card history page
                at any time.
              </p>
            </div>
            <div className="cr-stack" style={{ gap: 4 }}>
              <strong style={{ fontSize: 13 }}>Ship to your door</strong>
              <p
                className="cr-mute"
                style={{ fontSize: 12.5, margin: 0 }}
              >
                Request physical shipping from owned cards. Flat fee per request
                inside Thailand.
              </p>
            </div>
          </div>
        </div>
      </div>

      {openQty.length > 0 && !soldOut && (
        <div className="cr-dock" role="region" aria-label="Open this pack">
          <div className="cr-dock-pack">
            <div
              className={`cr-pack-art ${campaign.series}`}
              style={{
                width: 44,
                aspectRatio: "3 / 4",
                borderRadius: 8,
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontWeight: 900,
                  fontSize: 13,
                  letterSpacing: "0.14em",
                }}
              >
                {seriesGlyph(campaign.series)}
              </span>
            </div>
            <div className="cr-stack" style={{ gap: 2, minWidth: 0 }}>
              <small className="cr-eyebrow" style={{ fontSize: 9.5 }}>
                Open this pack
              </small>
              <strong
                style={{
                  fontSize: 13.5,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {campaign.titleEn || campaign.titleTh}
              </strong>
              <small
                className="cr-mute"
                style={{
                  fontSize: 11,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <CoinPip size={10} /> {formatCoins(campaign.costCoins)} /pack ·{" "}
                {remaining} left
              </small>
            </div>
          </div>

          <div className="cr-dock-qty">
            {openQty.map((q) => (
              <button
                key={q}
                type="button"
                className={`cr-dock-qty-btn ${qty === q ? "active" : ""}`}
                onClick={() => setQty(q)}
                disabled={remaining < q}
                title={
                  remaining < q
                    ? `Only ${remaining} packs left`
                    : `Open ${q} pack${q === 1 ? "" : "s"}`
                }
              >
                ×{q}
              </button>
            ))}
          </div>

          <div className="cr-dock-cta">
            <div className="cr-dock-total">
              <small>Total</small>
              <strong className="cr-tnum">
                <CoinPip size={13} /> {formatCoins(totalCost)}
              </strong>
            </div>
            {!openable ? (
              <button
                type="button"
                className="cr-btn cr-btn-lg"
                disabled
                title={unavailableReason}
              >
                <Ico name="bell" size={14} /> Not ready
              </button>
            ) : !enoughCoins ? (
              <a className="cr-btn cr-btn-gold cr-btn-lg" href="/wallet">
                <Ico name="plus" size={14} /> Top up
              </a>
            ) : (
              <button
                type="button"
                className="cr-btn cr-btn-primary cr-btn-lg"
                onClick={tryOpen}
                disabled={submitting}
              >
                <Ico name="sparkle" size={14} /> Open {qty} pack
                {qty === 1 ? "" : "s"}
              </button>
            )}
          </div>
        </div>
      )}

      {soldOut && (
        <div
          className="cr-dock"
          role="region"
          aria-label="Pack sold out"
          style={{
            borderColor: "var(--cr-line-strong)",
            background: "var(--cr-paper-2)",
          }}
        >
          <div className="cr-dock-pack">
            <div
              className={`cr-pack-art ${campaign.series}`}
              style={{
                width: 44,
                aspectRatio: "3 / 4",
                borderRadius: 8,
                flexShrink: 0,
                opacity: 0.55,
              }}
            >
              <span
                style={{
                  fontWeight: 900,
                  fontSize: 13,
                  letterSpacing: "0.14em",
                }}
              >
                {seriesGlyph(campaign.series)}
              </span>
            </div>
            <div className="cr-stack" style={{ gap: 2 }}>
              <small className="cr-eyebrow" style={{ fontSize: 9.5 }}>
                Sold out
              </small>
              <strong style={{ fontSize: 13.5 }}>
                {campaign.titleEn || campaign.titleTh}
              </strong>
              <small className="cr-mute" style={{ fontSize: 11 }}>
                We&apos;ll alert you when restocked
              </small>
            </div>
          </div>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="cr-btn cr-btn-lg"
            onClick={() =>
              toast("info", "We'll notify you when this pack restocks")
            }
          >
            <Ico name="bell" size={14} /> Notify me
          </button>
        </div>
      )}

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        eyebrow="Confirm"
        title={`Open ${campaign.titleEn || campaign.titleTh}`}
        size="md"
        footer={
          <>
            <button
              type="button"
              className="cr-btn"
              onClick={() => setConfirmOpen(false)}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="cr-btn cr-btn-primary"
              onClick={confirmAndOpen}
              disabled={submitting || !enoughCoins || !enoughStock}
            >
              <CoinPip size={14} /> Spend {formatCoins(totalCost)} coins
            </button>
          </>
        }
      >
        <div className="cr-stack" style={{ gap: 16, padding: "4px 0" }}>
          <div className="cr-row" style={{ gap: 14, alignItems: "center" }}>
            <div
              className={`cr-pack-art ${campaign.series}`}
              style={{
                width: 96,
                aspectRatio: "3 / 4",
                borderRadius: 12,
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontWeight: 900,
                  fontSize: 22,
                  letterSpacing: "0.14em",
                }}
              >
                {seriesGlyph(campaign.series)}
              </span>
            </div>
            <div className="cr-stack" style={{ gap: 4, flex: 1, minWidth: 0 }}>
              <small className="cr-eyebrow">
                {seriesLabel(campaign.series)}
              </small>
              <strong style={{ fontSize: 15 }}>
                {campaign.titleEn || campaign.titleTh}
              </strong>
              <small className="cr-mute">
                {remaining} of {campaign.totalSlots} packs left ·{" "}
                <CoinPip size={11} /> {formatCoins(campaign.costCoins)}/pack
              </small>
            </div>
          </div>

          <div>
            <span
              className="cr-eyebrow"
              style={{ display: "block", marginBottom: 8, textAlign: "center" }}
            >
              How many?
            </span>
            <div
              className="cr-dock-qty"
              style={{ margin: "0 auto", width: "fit-content" }}
            >
              {openQty.map((q) => (
                <button
                  key={q}
                  type="button"
                  className={`cr-dock-qty-btn ${qty === q ? "active" : ""}`}
                  onClick={() => setQty(q)}
                  disabled={remaining < q}
                  title={remaining < q ? `Only ${remaining} packs left` : ""}
                >
                  ×{q}
                </button>
              ))}
            </div>
          </div>

          <div
            style={{
              background: "var(--cr-bg-soft)",
              border: "1px solid var(--cr-line)",
              borderRadius: "var(--cr-r-md)",
              padding: "14px 16px",
            }}
          >
            <div
              className="cr-row"
              style={{ justifyContent: "space-between", padding: "3px 0" }}
            >
              <span className="cr-mute" style={{ fontSize: 12.5 }}>
                Total cost
              </span>
              <strong
                className="cr-tnum"
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <CoinPip size={13} /> {formatCoins(totalCost)}
              </strong>
            </div>
            <div
              className="cr-row"
              style={{ justifyContent: "space-between", padding: "3px 0" }}
            >
              <span className="cr-mute" style={{ fontSize: 12.5 }}>
                Your balance
              </span>
              <strong className="cr-tnum">{formatCoins(balanceCoins)}c</strong>
            </div>
            <div
              className="cr-row"
              style={{ justifyContent: "space-between", padding: "3px 0" }}
            >
              <span className="cr-mute" style={{ fontSize: 12.5 }}>
                Balance after open
              </span>
              <strong
                className="cr-tnum"
                style={{
                  color: enoughCoins ? "var(--cr-ink)" : "var(--cr-rose)",
                }}
              >
                {formatCoins(balanceCoins - totalCost)}c
              </strong>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function HeroFan({ campaign }: { campaign: YnotCampaign }) {
  const heroPrizes = (campaign.prizeLineup ?? [])
    .filter((prize) => Boolean(prize.cardImageUrl))
    .slice(0, 5);
  // When no images exist, show 5 placeholder cards so the silhouette is still
  // present. Otherwise the hero looks empty and inconsistent across packs.
  const fanCount = heroPrizes.length ? heroPrizes.length : 5;
  return (
    <div className="cr-hero-fan" aria-label="Featured prizes">
      {Array.from({ length: fanCount }, (_, index) => {
        const prize = heroPrizes[index];
        return (
          <span
            className={`cr-hero-card cr-hero-card-${index + 1}`}
            key={prize ? prize.id : `placeholder-${index}`}
          >
            {prize?.cardImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={prize.cardImageUrl} alt={prize.cardName} />
            ) : (
              <span className="cr-hero-card-placeholder">
                {prize ? initials(prize.cardName) : seriesGlyph(campaign.series)}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
