"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useMemo, useState } from "react";
import type { YnotCampaign } from "../types";
import {
  isOpenQuantityAvailable,
  normalizeOpenQuantityOptions,
  openQuantityLimit,
} from "../open-quantity";
import { createOpenIntentId } from "../open-intent";
import { CoinPip, Ico, formatCoins } from "./Icons";
import { PullAllConfirmModal } from "./PullAllConfirmModal";
import { Modal, PageHead, useToast } from "./UiKit";
import { useStoreLanguage } from "../StorePreferences";
import { I18nText, type Language } from "../i18n";

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

const SERIES_LABEL_TH: Record<string, string> = {
  pokemon: "Pokemon",
  one_piece: "One Piece",
  football: "ฟุตบอลอเมริกัน",
  basketball: "บาสเกตบอล",
  soccer: "ฟุตบอล",
  baseball: "เบสบอล",
  magical: "เวทมนตร์",
  super: "ซูเปอร์",
  multi_sport: "กีฬารวม",
};

function seriesLabel(series: string): string {
  return SERIES_LABEL[series] ?? series;
}

function seriesLabelFor(series: string, language: Language): string {
  if (language === "th") return SERIES_LABEL_TH[series] ?? seriesLabel(series);
  return seriesLabel(series);
}

function bilingualSeriesLabel(series: string) {
  return (
    <I18nText
      en={seriesLabel(series)}
      th={SERIES_LABEL_TH[series] ?? seriesLabel(series)}
    />
  );
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

function openUnavailableReason(campaign: YnotCampaign, language: Language = "en"): string {
  if (campaign.openable) return "";
  return language === "th"
    ? "แพ็กนี้ยังไม่พร้อมเปิด"
    : "This pack is not ready to open yet.";
}

type SortKey = "recommended" | "price-asc" | "price-desc" | "almost-out";

function normalizedTagText(value: string): string {
  return value.toLowerCase().replace(/[\s_-]+/g, "");
}

/** Customer-facing card tags an admin attached to a pack at creation time
 *  (draw_rounds.display_tags), trimmed and emptied of blanks. */
function campaignTags(campaign: YnotCampaign): string[] {
  return (campaign.displayTags ?? []).map((tag) => tag.trim()).filter(Boolean);
}

/** True when a pack carries the given customer card tag (case/spacing
 *  insensitive). An empty tag means "no tag filter", so it matches all. */
function campaignHasTag(campaign: YnotCampaign, tag: string): boolean {
  const target = normalizedTagText(tag);
  if (!target) return true;
  return campaignTags(campaign).some(
    (item) => normalizedTagText(item) === target,
  );
}

/** Distinct customer card tags across every pack, de-duplicated
 *  case-insensitively while preserving the first spelling/order seen. Drives
 *  the filter chips so the strip always mirrors what admins tagged in
 *  "create packs" — no hardcoded tag list. */
function collectCampaignTags(campaigns: YnotCampaign[]): string[] {
  const seen = new Map<string, string>();
  for (const campaign of campaigns) {
    for (const tag of campaignTags(campaign)) {
      const key = normalizedTagText(tag);
      if (key && !seen.has(key)) seen.set(key, tag);
    }
  }
  return Array.from(seen.values());
}

/** Resolve an incoming ?tag= value (e.g. "psa10") to the actual tag spelling
 *  present in the data ("PSA10"); returns "" when it matches nothing. */
function resolveInitialTag(initialTag: string, tags: string[]): string {
  const target = normalizedTagText(initialTag);
  if (!target || target === "all") return "";
  return tags.find((tag) => normalizedTagText(tag) === target) ?? "";
}

export type YPackExperienceProps = {
  campaigns: YnotCampaign[];
  balanceCoins: number;
  catalogHeading?: ReactNode;
  initialSeries?: string;
  initialTag?: string;
  pageLead?: ReactNode;
  pageTitle?: ReactNode;
};

export function YPackExperience({
  campaigns,
  balanceCoins,
  catalogHeading,
  initialSeries = "all",
  initialTag = "",
  pageLead,
  pageTitle,
}: YPackExperienceProps) {
  const router = useRouter();
  const language = useStoreLanguage();
  const [category, setCategory] = useState<string>(initialSeries);
  const [tag, setTag] = useState<string>(() =>
    resolveInitialTag(initialTag, collectCampaignTags(campaigns)),
  );
  const [sort, setSort] = useState<SortKey>("recommended");
  const [search, setSearch] = useState("");
  const [openState, setOpenState] = useState<{
    campaign: YnotCampaign;
    qty: number;
  } | null>(null);
  const [pullAllState, setPullAllState] = useState<YnotCampaign | null>(null);

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

  // Customer card tags present across the packs, plus how many packs carry
  // each — both derived from the data so the chips track "create packs".
  const availableTags = useMemo(() => collectCampaignTags(campaigns), [campaigns]);

  const tagCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const campaign of campaigns) {
      const unique = new Set(
        campaignTags(campaign).map((item) => normalizedTagText(item)),
      );
      for (const key of unique) map[key] = (map[key] ?? 0) + 1;
    }
    return map;
  }, [campaigns]);

  const filtered = useMemo(() => {
    let list = campaigns.filter(
      (c) =>
        (category === "all" || c.series === category) &&
        campaignHasTag(c, tag),
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
  }, [campaigns, category, search, sort, tag]);

  return (
    <div className="cr-page cr-page--packs">
      <PageHead
        lead={pageLead}
        title={pageTitle ?? <I18nText en="Y-PACKS" th="Y-PACKS" />}
      />

      <section
        aria-labelledby="pack-catalog-heading"
        className="cr-stack"
        style={{ gap: 4 }}
      >
        <span className="cr-eyebrow">
          <I18nText en="Public catalog" th="แคตตาล็อกสาธารณะ" />
        </span>
        <h2 className="cr-h2" id="pack-catalog-heading">
          {catalogHeading ?? (
            <I18nText
              en="Current public Y-Packs"
              th="Y-Packs สาธารณะตอนนี้"
            />
          )}
        </h2>
      </section>

      <div
        className="cr-cat-strip"
        role="tablist"
        aria-label="Filter by series / ตัวกรองซีรีส์"
      >
        <button
          type="button"
          className={category === "all" ? "active" : ""}
          onClick={() => setCategory("all")}
        >
          <I18nText en="All" th="ทั้งหมด" />{" "}
          <span className="count">{counts.all ?? 0}</span>
        </button>
        {availableSeries.map((series) => (
          <button
            key={series}
            type="button"
            className={category === series ? "active" : ""}
            onClick={() => setCategory(series)}
          >
            {bilingualSeriesLabel(series)}{" "}
            <span className="count">{counts[series] ?? 0}</span>
          </button>
        ))}
        {availableTags.map((label) => {
          const active = normalizedTagText(tag) === normalizedTagText(label);
          return (
            <button
              key={label}
              type="button"
              className={active ? "active" : ""}
              onClick={() =>
                setTag((current) =>
                  normalizedTagText(current) === normalizedTagText(label)
                    ? ""
                    : label,
                )
              }
            >
              {label}{" "}
              <span className="count">
                {tagCounts[normalizedTagText(label)] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      <div className="cr-toolbar">
        <div className="cr-search">
          <Ico name="search" size={14} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={language === "th" ? "ค้นหาชื่อแพ็ก..." : "Search a pack name..."}
            aria-label={language === "th" ? "ค้นหาแพ็ก" : "Search packs"}
          />
          {search && (
            <button
              type="button"
              className="cr-btn cr-btn-ghost cr-btn-icon cr-btn-sm"
              onClick={() => setSearch("")}
              aria-label={language === "th" ? "ล้างคำค้นหา" : "Clear search"}
            >
              <Ico name="x" size={12} />
            </button>
          )}
        </div>
        <span className="cr-mute" style={{ fontSize: 12 }}>
          <I18nText
            en={`${filtered.length} pack${filtered.length === 1 ? "" : "s"}`}
            th={`${filtered.length} แพ็ก`}
          />
        </span>
        <span style={{ flex: 1 }} />
        <div className="cr-row" style={{ gap: 6 }}>
          <span className="cr-mute" style={{ fontSize: 12, marginRight: 4 }}>
            <I18nText en="Sort" th="เรียง" />
          </span>
          <select
            className="cr-select"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="recommended">
              {language === "th" ? "แนะนำ" : "Recommended"}
            </option>
            <option value="price-asc">
              {language === "th" ? "ราคา: ต่ำไปสูง" : "Price: low to high"}
            </option>
            <option value="price-desc">
              {language === "th" ? "ราคา: สูงไปต่ำ" : "Price: high to low"}
            </option>
            <option value="almost-out">
              {language === "th" ? "ใกล้หมด" : "Almost sold out"}
            </option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div
          className="cr-section"
          style={{ padding: 60, textAlign: "center" }}
        >
          <strong style={{ display: "block", fontSize: 14, marginBottom: 6 }}>
            <I18nText en="No packs match your filter" th="ไม่มีแพ็กตรงกับตัวกรอง" />
          </strong>
          <small className="cr-mute">
            <I18nText
              en="Try clearing search or switching category."
              th="ลองล้างคำค้นหาหรือเปลี่ยนหมวดหมู่"
            />
          </small>
        </div>
      ) : (
        <div className="cr-pack-grid">
          {filtered.map((campaign) => (
            <PackCard
              key={campaign.id}
              campaign={campaign}
              balanceCoins={balanceCoins}
              language={language}
              onOpen={() =>
                setOpenState({
                  campaign,
                  qty:
                    normalizeOpenQuantityOptions(
                      campaign.openQuantityOptions,
                    )[0] ?? 1,
                })
              }
              onPullAll={() => setPullAllState(campaign)}
            />
          ))}
        </div>
      )}

      <OpenPackModal
        state={openState}
        balanceCoins={balanceCoins}
        onClose={() => setOpenState(null)}
        onPullAll={(campaign) => {
          setOpenState(null);
          setPullAllState(campaign);
        }}
        onQtyChange={(qty) =>
          setOpenState((current) => (current ? { ...current, qty } : current))
        }
      />
      <PullAllConfirmModal
        open={Boolean(pullAllState)}
        campaign={pullAllState}
        balanceCoins={balanceCoins}
        onClose={() => setPullAllState(null)}
        onStarted={() => {
          if (!pullAllState) return;
          setPullAllState(null);
          router.push(`/gacha/${pullAllState.slug}/open?pullAll=1`);
        }}
      />
    </div>
  );
}

function PackCard({
  campaign,
  balanceCoins,
  language,
  onOpen,
  onPullAll,
}: {
  campaign: YnotCampaign;
  balanceCoins: number;
  language: Language;
  onOpen: () => void;
  onPullAll: () => void;
}) {
  const remaining = campaign.remainingSlots ?? campaign.totalSlots;
  const pct = stockPercent(campaign);
  const stockClass = pct < 20 ? "crit" : pct < 50 ? "warn" : "";
  const soldOut = isSoldOut(campaign);
  const openable = Boolean(campaign.openable);
  const unavailableReason = openUnavailableReason(campaign, language);
  const lowStock = isLowStock(campaign);
  const cantAfford = !soldOut && openable && balanceCoins < campaign.costCoins;
  const detailHref = `/packs/${campaign.slug}`;
  const isHot = (campaign.displayTags ?? []).some((tag) =>
    tag.toLowerCase().includes("hot"),
  );
  const bannerImageUrl = campaign.bannerImageUrl?.trim() ?? "";
  const hasBannerImage = Boolean(bannerImageUrl);
  const pullAllAvailable = campaign.pullAllAvailable === true && openable && !soldOut;

  return (
    <div className="cr-pack-card" data-disabled={soldOut}>
      <Link
        href={detailHref}
        className={`cr-pack-art ${campaign.series}${hasBannerImage ? " has-banner-image" : ""}`}
        aria-label={`View ${campaign.titleEn || campaign.titleTh} details`}
        style={{ display: "flex", textDecoration: "none" }}
      >
        {hasBannerImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- Pack banners are user-managed Supabase assets.
          <img
            alt=""
            aria-hidden="true"
            className="cr-pack-art-image"
            loading="lazy"
            src={bannerImageUrl}
          />
        ) : null}
        {isHot && (
          <span className="cr-pack-art-sticker">
            <I18nText en="Hot" th="ฮอต" />
          </span>
        )}
        {soldOut && (
          <span
            className="cr-pack-art-sticker"
            style={{ background: "var(--cr-ink)", color: "#fff" }}
          >
            <I18nText en="Sold out" th="หมดแล้ว" />
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
            <I18nText en="Low" th="เหลือน้อย" />
          </span>
        )}
        {!soldOut && (
          <span className="cr-pack-art-stock">
            {remaining}/{campaign.totalSlots}
          </span>
        )}
        {!hasBannerImage && (
          <div className="cr-pack-art-fallback">
            <div className="cr-pack-art-eyebrow">
              {seriesLabelFor(campaign.series, language).toUpperCase()}
            </div>
            <div className="cr-pack-art-glyph">
              {seriesGlyph(campaign.series)}
            </div>
          </div>
        )}
      </Link>
      <div className="cr-pack-card-body">
        <div>
          <div className="cr-pack-series">{bilingualSeriesLabel(campaign.series)}</div>
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
              <I18nText en="/pack" th="/แพ็ก" />
            </small>
          </span>
          <div className="cr-pack-card-actions">
            <Link
              className="cr-pack-card-cta cr-pack-card-cta-ghost"
              href={detailHref}
            >
              <I18nText en="Detail" th="รายละเอียด" />
            </Link>
            {pullAllAvailable && !cantAfford ? (
              <button
                type="button"
                className="cr-pack-card-cta cr-pack-card-cta-pull-all cr-pull-all-action"
                onClick={onPullAll}
              >
                <I18nText en="Pull All" th="เปิดทั้งหมด" />
              </button>
            ) : null}
            {soldOut ? (
              <button
                type="button"
                className="cr-pack-card-cta"
                aria-disabled="true"
                disabled
              >
                <I18nText en="Sold out" th="หมดแล้ว" />
              </button>
            ) : !openable ? (
              <button
                type="button"
                className="cr-pack-card-cta"
                aria-disabled="true"
                disabled
                title={unavailableReason}
              >
                <I18nText en="Not ready" th="ยังไม่พร้อม" />
              </button>
            ) : cantAfford ? (
              <Link href="/wallet" className="cr-pack-card-cta">
                <I18nText en="Top up" th="เติมเหรียญ" />
              </Link>
            ) : (
              <button
                type="button"
                className="cr-pack-card-cta"
                onClick={onOpen}
              >
                <I18nText en="Open" th="เปิด" />
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
  onPullAll,
  onQtyChange,
}: {
  state: { campaign: YnotCampaign; qty: number } | null;
  balanceCoins: number;
  onClose: () => void;
  onPullAll: (campaign: YnotCampaign) => void;
  onQtyChange: (qty: number) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const language = useStoreLanguage();
  const [submitting, setSubmitting] = useState(false);

  if (!state) return null;
  const { campaign, qty } = state;
  const remaining = campaign.remainingSlots ?? campaign.totalSlots;
  const openableQuantityLimit = openQuantityLimit({
    remainingSlots: remaining,
    eligiblePrizeUnits: campaign.eligiblePrizeUnits,
    availablePrizeUnits: campaign.availablePrizeUnits,
  });
  const totalCost = campaign.costCoins * qty;
  const openQty = normalizeOpenQuantityOptions(campaign.openQuantityOptions);
  const enoughCoins = balanceCoins >= totalCost;
  const enoughStock = qty <= openableQuantityLimit;
  const openable = Boolean(campaign.openable);
  const unavailableReason = openUnavailableReason(campaign, language);
  const pullAllAvailable = campaign.pullAllAvailable === true && openable;

  function handleConfirm() {
    if (!openable) {
      toast("error", unavailableReason);
      return;
    }
    if (!enoughCoins) {
      toast(
        "error",
        language === "th"
          ? `ต้องการอีก ${formatCoins(totalCost - balanceCoins)} เหรียญ`
          : `Need ${formatCoins(totalCost - balanceCoins)} more coins`,
      );
      return;
    }
    if (!enoughStock) {
      toast(
        "error",
        language === "th"
          ? `เหลือแพ็กที่เปิดได้เพียง ${openableQuantityLimit} แพ็ก`
          : `Only ${openableQuantityLimit} openable packs left.`,
      );
      return;
    }
    setSubmitting(true);
    const intent = createOpenIntentId();
    const query = new URLSearchParams({
      qty: String(qty),
      auto: "1",
      intent,
    });
    // The cinematic open page handles the actual reveal animation + collection
    // update. We route there with the chosen quantity and auto=1 so the open
    // fires immediately on arrival (no second "START PULL" screen) and the
    // animation plays right after this modal confirms.
    router.push(`/gacha/${campaign.slug}/open?${query.toString()}`);
  }

  return (
    <Modal
      open
      onClose={onClose}
      eyebrow={<I18nText en="Confirm" th="ยืนยัน" />}
      title={
        <>
          <I18nText en="Open" th="เปิด" /> {campaign.titleEn || campaign.titleTh}
        </>
      }
      size="md"
      footer={
        <>
          <button
            type="button"
            className="cr-btn"
            onClick={onClose}
            disabled={submitting}
          >
            <I18nText en="Cancel" th="ยกเลิก" />
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
              ? <I18nText en="Not ready" th="ยังไม่พร้อม" />
              : enoughCoins
                ? (
                    <I18nText
                      en={`Spend ${formatCoins(totalCost)} coins`}
                      th={`ใช้ ${formatCoins(totalCost)} เหรียญ`}
                    />
                  )
                : (
                    <I18nText
                      en={`Need ${formatCoins(totalCost - balanceCoins)} more coins`}
                      th={`ต้องการอีก ${formatCoins(totalCost - balanceCoins)} เหรียญ`}
                    />
                  )}
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
            <small className="cr-eyebrow">{bilingualSeriesLabel(campaign.series)}</small>
            <strong style={{ fontSize: 15 }}>
              {campaign.titleEn || campaign.titleTh}
            </strong>
            <small className="cr-mute">
              <I18nText
                en={`${remaining} of ${campaign.totalSlots} packs left`}
                th={`เหลือ ${remaining} จาก ${campaign.totalSlots} แพ็ก`}
              />{" "}
              · <CoinPip size={11} /> {formatCoins(campaign.costCoins)}
              <I18nText en="/pack" th="/แพ็ก" />
            </small>
          </div>
        </div>

        <div>
          <span
            className="cr-eyebrow"
            style={{ display: "block", marginBottom: 8, textAlign: "center" }}
          >
            <I18nText en="How many?" th="เปิดกี่แพ็ก?" />
          </span>
          <div
            className="cr-dock-qty"
            style={{ margin: "0 auto", width: "fit-content" }}
          >
            {openQty.map((q) => {
              const quantityAvailable = isOpenQuantityAvailable(q, {
                remainingSlots: remaining,
                eligiblePrizeUnits: campaign.eligiblePrizeUnits,
                availablePrizeUnits: campaign.availablePrizeUnits,
              });
              return (
                <button
                  key={q}
                  type="button"
                  className={`cr-dock-qty-btn ${qty === q ? "active" : ""}`}
                  onClick={() => onQtyChange(q)}
                  disabled={!quantityAvailable}
                  title={
                    !quantityAvailable
                      ? language === "th"
                        ? `เหลือแพ็กที่เปิดได้เพียง ${openableQuantityLimit} แพ็ก`
                        : `Only ${openableQuantityLimit} openable packs left`
                      : ""
                  }
                >
                  ×{q}
                </button>
              );
            })}
            {pullAllAvailable && (
              <button
                type="button"
                className="cr-dock-qty-btn cr-dock-qty-btn-all cr-pull-all-action"
                onClick={() => onPullAll(campaign)}
                title={
                  language === "th"
                    ? "เปิดแพ็กที่เหลือทั้งหมดด้วยราคาที่ระบบคำนวณ"
                    : "Pull all remaining packs with a server quote"
                }
              >
                <I18nText en="Pull All" th="เปิดทั้งหมด" />
              </button>
            )}
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
              <I18nText en="Total cost" th="ยอดรวม" />
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
              <I18nText en="Your balance" th="ยอดคงเหลือ" />
            </span>
            <strong className="cr-tnum">{formatCoins(balanceCoins)}c</strong>
          </div>
          <div
            className="cr-row"
            style={{ justifyContent: "space-between", padding: "3px 0" }}
          >
            <span className="cr-mute" style={{ fontSize: 12.5 }}>
              <I18nText en="Balance after open" th="ยอดหลังเปิด" />
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
