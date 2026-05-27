"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { YnotCampaign } from "../types";
import { normalizeOpenQuantityOptions } from "../open-quantity";
import { CoinPip, Ico, formatCoins } from "./Icons";
import { Modal, PageHead, useToast } from "./UiKit";

const SERIES_LABEL: Record<string, string> = {
  pokemon: "Pokemon",
  one_piece: "One Piece",
  football: "Football",
  basketball: "Basketball",
  soccer: "Soccer",
  baseball: "Baseball",
  magical: "Magical",
  super: "Super",
  multi_sport: "Multi-Sport",
};

function seriesLabel(series: string): string {
  return SERIES_LABEL[series] ?? series;
}

function seriesGlyph(series: string): string {
  switch (series) {
    case "pokemon":
      return "PKM";
    case "one_piece":
      return "OP";
    case "football":
      return "FB";
    case "basketball":
      return "BB";
    case "soccer":
      return "SC";
    case "baseball":
      return "BSB";
    case "magical":
      return "MAG";
    case "super":
      return "SUP";
    case "multi_sport":
      return "MS";
    default:
      return "Y";
  }
}

function stockPercent(campaign: YnotCampaign): number {
  const remaining = campaign.remainingSlots ?? campaign.totalSlots;
  if (campaign.totalSlots <= 0) return 0;
  return Math.max(
    0,
    Math.min(100, Math.round((remaining / campaign.totalSlots) * 100)),
  );
}

function isSoldOut(campaign: YnotCampaign): boolean {
  if (campaign.soldOut) return true;
  const remaining = campaign.remainingSlots ?? campaign.totalSlots;
  return remaining <= 0;
}

function isLowStock(campaign: YnotCampaign): boolean {
  if (isSoldOut(campaign)) return false;
  return stockPercent(campaign) < 20;
}

function openUnavailableReason(campaign: YnotCampaign): string {
  if (campaign.openable) return "";
  if (campaign.readinessBlockers?.[0]) return campaign.readinessBlockers[0];
  if (campaign.status !== "live") return "This pack is not live yet.";
  if (campaign.visibility !== "public") return "This pack is not public yet.";
  if (campaign.approvalStatus !== "approved") return "Owner approval is required.";
  if ((campaign.availablePrizeUnits ?? 0) <= 0) return "Prize inventory is not ready.";
  return "This pack is not ready to open yet.";
}

type SortKey = "recommended" | "price-asc" | "price-desc" | "almost-out";

export type YPackExperienceProps = {
  campaigns: YnotCampaign[];
  balanceCoins: number;
  initialSeries?: string;
};

export function YPackExperience({
  campaigns,
  balanceCoins,
  initialSeries = "all",
}: YPackExperienceProps) {
  const [category, setCategory] = useState<string>(initialSeries);
  const [sort, setSort] = useState<SortKey>("recommended");
  const [search, setSearch] = useState("");
  const [openState, setOpenState] = useState<{
    campaign: YnotCampaign;
    qty: number;
  } | null>(null);

  // All distinct series present in the data — keeps the chip strip honest
  // when an admin adds new series in the future.
  const availableSeries = useMemo(() => {
    const set = new Set<string>();
    for (const c of campaigns) set.add(c.series);
    // Always pin Pokemon and One Piece first if present.
    return Array.from(set).sort((a, b) => {
      const order = ["pokemon", "one_piece"];
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [campaigns]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: campaigns.length };
    for (const c of campaigns) {
      map[c.series] = (map[c.series] ?? 0) + 1;
    }
    return map;
  }, [campaigns]);

  const filtered = useMemo(() => {
    let list = campaigns.filter(
      (c) => category === "all" || c.series === category,
    );
    if (search.trim()) {
      const needle = search.toLowerCase();
      list = list.filter(
        (c) =>
          (c.titleEn || "").toLowerCase().includes(needle) ||
          (c.titleTh || "").toLowerCase().includes(needle),
      );
    }
    if (sort === "price-asc") return [...list].sort((a, b) => a.costCoins - b.costCoins);
    if (sort === "price-desc") return [...list].sort((a, b) => b.costCoins - a.costCoins);
    if (sort === "almost-out")
      return [...list].sort((a, b) => stockPercent(a) - stockPercent(b));
    return list;
  }, [campaigns, category, search, sort]);

  return (
    <div className="cr-page cr-page--packs">
      <PageHead title="Y-PACKS" />

      <div className="cr-cat-strip" role="tablist" aria-label="Filter by series">
        <button
          type="button"
          className={category === "all" ? "active" : ""}
          onClick={() => setCategory("all")}
        >
          All <span className="count">{counts.all ?? 0}</span>
        </button>
        {availableSeries.map((series) => (
          <button
            key={series}
            type="button"
            className={category === series ? "active" : ""}
            onClick={() => setCategory(series)}
          >
            {seriesLabel(series)}{" "}
            <span className="count">{counts[series] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="cr-toolbar">
        <div className="cr-search">
          <Ico name="search" size={14} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search a pack name…"
            aria-label="Search packs"
          />
          {search && (
            <button
              type="button"
              className="cr-btn cr-btn-ghost cr-btn-icon cr-btn-sm"
              onClick={() => setSearch("")}
              aria-label="Clear search"
            >
              <Ico name="x" size={12} />
            </button>
          )}
        </div>
        <span className="cr-mute" style={{ fontSize: 12 }}>
          {filtered.length} pack{filtered.length === 1 ? "" : "s"}
        </span>
        <span style={{ flex: 1 }} />
        <div className="cr-row" style={{ gap: 6 }}>
          <span className="cr-mute" style={{ fontSize: 12, marginRight: 4 }}>
            Sort
          </span>
          <select
            className="cr-select"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="recommended">Recommended</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
            <option value="almost-out">Almost sold out</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div
          className="cr-section"
          style={{ padding: 60, textAlign: "center" }}
        >
          <strong style={{ display: "block", fontSize: 14, marginBottom: 6 }}>
            No packs match your filter
          </strong>
          <small className="cr-mute">
            Try clearing search or switching category.
          </small>
        </div>
      ) : (
        <div className="cr-pack-grid">
          {filtered.map((campaign) => (
            <PackCard
              key={campaign.id}
              campaign={campaign}
              balanceCoins={balanceCoins}
              onOpen={() =>
                setOpenState({
                  campaign,
                  qty:
                    normalizeOpenQuantityOptions(
                      campaign.openQuantityOptions,
                    )[0] ?? 1,
                })
              }
            />
          ))}
        </div>
      )}

      <OpenPackModal
        state={openState}
        balanceCoins={balanceCoins}
        onClose={() => setOpenState(null)}
        onQtyChange={(qty) =>
          setOpenState((current) => (current ? { ...current, qty } : current))
        }
      />
    </div>
  );
}

function PackCard({
  campaign,
  balanceCoins,
  onOpen,
}: {
  campaign: YnotCampaign;
  balanceCoins: number;
  onOpen: () => void;
}) {
  const remaining = campaign.remainingSlots ?? campaign.totalSlots;
  const pct = stockPercent(campaign);
  const stockClass = pct < 20 ? "crit" : pct < 50 ? "warn" : "";
  const soldOut = isSoldOut(campaign);
  const openable = Boolean(campaign.openable);
  const unavailableReason = openUnavailableReason(campaign);
  const lowStock = isLowStock(campaign);
  const cantAfford = !soldOut && openable && balanceCoins < campaign.costCoins;
  const detailHref = `/packs/${campaign.slug}`;
  const isHot = (campaign.displayTags ?? []).some((tag) =>
    tag.toLowerCase().includes("hot"),
  );

  return (
    <div className="cr-pack-card" data-disabled={soldOut}>
      <Link
        href={detailHref}
        className={`cr-pack-art ${campaign.series}`}
        aria-label={`View ${campaign.titleEn || campaign.titleTh} details`}
        style={{ display: "flex", textDecoration: "none" }}
      >
        {isHot && <span className="cr-pack-art-sticker">Hot</span>}
        {soldOut && (
          <span
            className="cr-pack-art-sticker"
            style={{ background: "var(--cr-ink)", color: "#fff" }}
          >
            Sold out
          </span>
        )}
        {lowStock && !soldOut && (
          <span
            className="cr-pack-art-sticker"
            style={{
              background: "var(--cr-rose-soft)",
              color: "var(--cr-rose)",
            }}
          >
            Low
          </span>
        )}
        {!soldOut && (
          <span className="cr-pack-art-stock">
            {remaining}/{campaign.totalSlots}
          </span>
        )}
        <div style={{ textAlign: "center" }}>
          <div className="cr-pack-art-eyebrow">
            {seriesLabel(campaign.series).toUpperCase()}
          </div>
          <div className="cr-pack-art-glyph">{seriesGlyph(campaign.series)}</div>
        </div>
      </Link>
      <div className="cr-pack-card-body">
        <div>
          <div className="cr-pack-series">{seriesLabel(campaign.series)}</div>
          <h4 className="cr-pack-card-title">
            {campaign.titleEn || campaign.titleTh}
          </h4>
        </div>
        <div className={`cr-progress ${stockClass}`}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <div className="cr-pack-card-foot">
          <span className="cr-pack-price">
            <CoinPip size={14} /> {formatCoins(campaign.costCoins)}
            <small
              style={{
                fontSize: 11,
                color: "var(--cr-mute)",
                fontWeight: 600,
              }}
            >
              /pack
            </small>
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <Link
              className="cr-pack-card-cta cr-pack-card-cta-ghost"
              href={detailHref}
            >
              Detail
            </Link>
            {soldOut ? (
              <button
                type="button"
                className="cr-pack-card-cta"
                aria-disabled="true"
                disabled
              >
                Sold out
              </button>
            ) : !openable ? (
              <button
                type="button"
                className="cr-pack-card-cta"
                aria-disabled="true"
                disabled
                title={unavailableReason}
              >
                Not ready
              </button>
            ) : cantAfford ? (
              <Link href="/wallet" className="cr-pack-card-cta">
                Top up
              </Link>
            ) : (
              <button
                type="button"
                className="cr-pack-card-cta"
                onClick={onOpen}
              >
                Open
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function OpenPackModal({
  state,
  balanceCoins,
  onClose,
  onQtyChange,
}: {
  state: { campaign: YnotCampaign; qty: number } | null;
  balanceCoins: number;
  onClose: () => void;
  onQtyChange: (qty: number) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  if (!state) return null;
  const { campaign, qty } = state;
  const remaining = campaign.remainingSlots ?? campaign.totalSlots;
  const totalCost = campaign.costCoins * qty;
  const openQty = normalizeOpenQuantityOptions(campaign.openQuantityOptions);
  const enoughCoins = balanceCoins >= totalCost;
  const enoughStock = remaining >= qty;
  const openable = Boolean(campaign.openable);
  const unavailableReason = openUnavailableReason(campaign);

  function handleConfirm() {
    if (!openable) {
      toast("error", unavailableReason);
      return;
    }
    if (!enoughCoins) {
      toast("error", `Need ${formatCoins(totalCost - balanceCoins)} more coins`);
      return;
    }
    if (!enoughStock) {
      toast("error", `Only ${remaining} packs left.`);
      return;
    }
    setSubmitting(true);
    // The cinematic open page handles the actual reveal animation + collection
    // update. We route there with the chosen quantity and auto=1 so the open
    // fires immediately on arrival (no second "START PULL" screen) and the
    // animation plays right after this modal confirms.
    router.push(`/gacha/${campaign.slug}/open?qty=${qty}&auto=1`);
  }

  return (
    <Modal
      open
      onClose={onClose}
      eyebrow="Confirm"
      title={`Open ${campaign.titleEn || campaign.titleTh}`}
      size="md"
      footer={
        <>
          <button
            type="button"
            className="cr-btn"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="cr-btn cr-btn-primary"
            onClick={handleConfirm}
            disabled={!openable || !enoughCoins || !enoughStock || submitting}
            title={!openable ? unavailableReason : undefined}
          >
            <CoinPip size={14} />{" "}
            {!openable
              ? "Not ready"
              : enoughCoins
                ? `Spend ${formatCoins(totalCost)} coins`
                : `Need ${formatCoins(totalCost - balanceCoins)} more coins`}
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
            <small className="cr-eyebrow">{seriesLabel(campaign.series)}</small>
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
                onClick={() => onQtyChange(q)}
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
  );
}
