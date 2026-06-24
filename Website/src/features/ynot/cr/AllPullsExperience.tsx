"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import type {
  YnotCollectionItem,
  YnotGachaOpenHistory,
  YnotPublicPrizeDisplayTier,
} from "../types";
import { QuantityBadge } from "../QuantityBadge";
import { BulkOpenBagStatus } from "./BulkOpenBagStatus";
import { CoinPip, Ico, formatCoins } from "./Icons";
import { useStoreLanguage } from "../StorePreferences";
import { I18nText, localized, type Language } from "../i18n";
import { PageHead } from "./UiKit";

type Tier = YnotPublicPrizeDisplayTier;
const TIER_ORDER: Tier[] = [
  "last_prize",
  "rainbow",
  "gold",
  "silver",
  "bronze",
];

type StatusKey = "owned" | "shipped" | "converted";

function statusFromCollection(
  status: YnotCollectionItem["status"],
): StatusKey {
  if (
    status === "shipped" ||
    status === "shipping_requested" ||
    status === "shipping_preparing"
  ) return "shipped";
  if (status === "exchanged" || status === "exchange_requested")
    return "converted";
  return "owned";
}

function tierFromCollection(item: YnotCollectionItem): Tier {
  const sourceTier = item.sourcePrizeTier;
  if (item.sourceIsLastPrize || sourceTier === "last_prize") {
    return "last_prize";
  }
  if (
    sourceTier === "rainbow" ||
    sourceTier === "gold" ||
    sourceTier === "silver" ||
    sourceTier === "bronze"
  ) {
    return sourceTier;
  }
  const grade = (item.cardGrade ?? "").toLowerCase();
  const category = (item.cardPrizeCategory ?? "").toLowerCase();
  if (grade.includes("rainbow") || category.includes("rainbow")) return "rainbow";
  if (grade.includes("gold") || category.includes("gold")) return "gold";
  if (grade.includes("silver") || category.includes("silver")) return "silver";
  return "bronze";
}

function tierFromReward(tier: string | null | undefined): Tier {
  const t = (tier ?? "").toLowerCase();
  if (t === "last_prize") return "last_prize";
  if (t === "rainbow") return "rainbow";
  if (t === "gold") return "gold";
  if (t === "silver") return "silver";
  return "bronze";
}

function tierClassName(tier: Tier): string {
  return tier === "last_prize" ? "last-prize" : tier;
}

function tierLabel(tier: Tier, language: Language): string {
  if (tier === "last_prize") return language === "th" ? "รางวัลสุดท้าย" : "Last Prize";
  if (language === "th") {
    if (tier === "rainbow") return "เรนโบว์";
    if (tier === "gold") return "โกลด์";
    if (tier === "silver") return "ซิลเวอร์";
    return "บรอนซ์";
  }
  return tier;
}

function tierDotBackground(tier: Tier): string {
  if (tier === "last_prize") return "linear-gradient(135deg, #fff0a8, #e0a316)";
  if (tier === "rainbow") {
    return "linear-gradient(135deg, #ff80b5, #ffc480, #80ff9b, #80c0ff)";
  }
  if (tier === "gold") return "#d9a022";
  if (tier === "silver") return "#9aa1a8";
  return "#c98e5c";
}

function tierColor(tier: Tier): string {
  if (tier === "last_prize" || tier === "gold") return "var(--cr-coin-ink)";
  if (tier === "rainbow") return "#9a3d6b";
  if (tier === "silver") return "var(--cr-ink-2)";
  return "#5a3a1a";
}

function tierPillBackground(tier: Tier): string {
  if (tier === "last_prize") return "linear-gradient(135deg, #fff4c7, #f2c45a)";
  if (tier === "rainbow") {
    return "linear-gradient(135deg, #ffd6e3, #ffe9b3, #c8efc8, #b3d6ff, #d6c8ff)";
  }
  if (tier === "gold") return "var(--cr-gold-tint)";
  if (tier === "silver") return "#eef0f2";
  return "#f0e2d0";
}

type PullRow = {
  id: string;
  cardName: string;
  cardCode: string;
  imageUrl?: string | null;
  bundleQuantity?: number;
  tier: Tier;
  status: StatusKey;
  series: string;
  fromPack: string;
  when: string;
  whenIso: string;
  valueCoins: number;
};

function detectSeries(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("one piece") || lower.includes("one_piece")) {
    return "one_piece";
  }
  if (lower.includes("pokemon") || lower.includes("psa10")) return "pokemon";
  return "unknown";
}

function seriesLabel(series: string): string {
  if (series === "pokemon") return "Pokemon";
  if (series === "one_piece") return "One Piece";
  return series.replace(/_/g, " ");
}

function statusLabel(status: StatusKey, language: Language): string {
  if (status === "owned") return language === "th" ? "ถืออยู่" : "owned";
  if (status === "shipped") return language === "th" ? "จัดส่งแล้ว" : "shipped";
  return language === "th" ? "แลกแล้ว" : "converted";
}

type SortKey = "newest" | "oldest" | "tier-desc" | "name";

export type AllPullsExperienceProps = {
  collection: YnotCollectionItem[];
  gachaOpens: YnotGachaOpenHistory[];
};

export function AllPullsExperience({
  collection,
  gachaOpens,
}: AllPullsExperienceProps) {
  const language = useStoreLanguage();
  const [series, setSeries] = useState<string>("all");
  const [tier, setTier] = useState<Tier | "all">("all");
  const [status, setStatus] = useState<StatusKey | "all">("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");

  const collectionRows = useMemo<PullRow[]>(() => {
    return collection.map((c) => ({
      id: c.id,
      cardName: c.cardName,
      cardCode: c.cardCode ?? "—",
      imageUrl: c.imageUrl ?? null,
      bundleQuantity: c.bundleQuantity,
      tier: tierFromCollection(c),
      status: statusFromCollection(c.status),
      series: detectSeries(
        `${c.cardSeries ?? ""} ${c.sourceCampaignTitle ?? ""}`,
      ),
      fromPack: c.sourceCampaignTitle ?? "—",
      when: new Date(c.acquiredAt).toLocaleString(language === "th" ? "th-TH" : "en-US"),
      whenIso: c.acquiredAt,
      valueCoins: c.convertCoinValue ?? 0,
    }));
  }, [collection, language]);

  const openRows = useMemo<PullRow[]>(() => {
    const known = new Set(collectionRows.map((r) => r.id));
    return gachaOpens.flatMap((open) =>
      open.rewards
        .filter((reward) => !known.has(reward.id))
        .map((reward) => ({
          id: reward.id,
          cardName: reward.cardName,
          cardCode: reward.cardCode ?? "—",
          imageUrl: reward.imageUrl ?? null,
          bundleQuantity: reward.bundleQuantity,
          tier: tierFromReward(reward.displayTier),
          status: "owned" as StatusKey,
          series: detectSeries(open.campaignTitle),
          fromPack: open.campaignTitle,
          when: new Date(open.openedAt).toLocaleString(language === "th" ? "th-TH" : "en-US"),
          whenIso: open.openedAt,
          valueCoins: reward.valueThb ?? 0,
        })),
    );
  }, [collectionRows, gachaOpens, language]);

  const allPulls = useMemo<PullRow[]>(
    () => [...collectionRows, ...openRows],
    [collectionRows, openRows],
  );

  const counts = useMemo(() => {
    const result: Record<Tier, number> = {
      last_prize: 0,
      rainbow: 0,
      gold: 0,
      silver: 0,
      bronze: 0,
    };
    for (const row of allPulls) result[row.tier] += 1;
    return result;
  }, [allPulls]);

  const seriesOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of allPulls) {
      if (row.series && row.series !== "unknown") set.add(row.series);
    }
    return Array.from(set).sort();
  }, [allPulls]);

  const filtered = useMemo(() => {
    let list = allPulls
      .filter((r) => series === "all" || r.series === series)
      .filter((r) => tier === "all" || r.tier === tier)
      .filter((r) => status === "all" || r.status === status);
    if (search.trim()) {
      const needle = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.cardName.toLowerCase().includes(needle) ||
          r.cardCode.toLowerCase().includes(needle),
      );
    }
    list = [...list];
    if (sort === "newest") {
      list.sort((a, b) => b.whenIso.localeCompare(a.whenIso));
    } else if (sort === "oldest") {
      list.sort((a, b) => a.whenIso.localeCompare(b.whenIso));
    } else if (sort === "tier-desc") {
      const rank: Record<Tier, number> = {
        last_prize: 5,
        rainbow: 4,
        gold: 3,
        silver: 2,
        bronze: 1,
      };
      list.sort((a, b) => rank[b.tier] - rank[a.tier]);
    } else {
      list.sort((a, b) => a.cardName.localeCompare(b.cardName));
    }
    return list;
  }, [allPulls, series, tier, status, search, sort]);

  const hasActiveFilters =
    series !== "all" || tier !== "all" || status !== "all" || !!search.trim();

  return (
    <div className="cr-page">
      <PageHead
        eyebrow={<I18nText en="Reward history" th="ประวัติรางวัล" />}
        title={<I18nText en="All pulls" th="การเปิดทั้งหมด" />}
        lead={
          language === "th"
            ? `การ์ดทุกใบที่คุณเปิดได้จากแพ็ก รวม ${allPulls.length} รายการ ใช้ตัวกรองหรือค้นหาเพื่อหาใบที่ต้องการ`
            : `Every card you've pulled from a pack — ${allPulls.length} total. Filter and search to find a specific one.`
        }
        back={{ href: "/collection", label: <I18nText en="Card history" th="ประวัติการ์ด" /> }}
      />

      <BulkOpenBagStatus />

      <div className="cr-kpi-row cr-pulls-kpi-row">
        {TIER_ORDER.map((t) => (
          <button
            key={t}
            type="button"
            className="cr-kpi"
            onClick={() => setTier(tier === t ? "all" : t)}
            style={{
              textAlign: "left",
              border:
                tier === t
                  ? "2px solid var(--cr-ink)"
                  : "1px solid var(--cr-line)",
              cursor: "pointer",
              padding: "14px 16px",
              fontFamily: "inherit",
              background: "var(--cr-paper)",
            }}
          >
            <span
              className="label"
              style={{
                color: tierColor(t),
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: tierDotBackground(t),
                }}
              />
              {tierLabel(t, language)}
            </span>
            <span className="value cr-tnum">{counts[t]}</span>
            <small className="cr-mute" style={{ fontSize: 11 }}>
              {tier === t
                ? localized({ en: "Filtering", th: "กำลังกรอง" }, language)
                : localized({ en: "click to filter", th: "กดเพื่อกรอง" }, language)}
            </small>
          </button>
        ))}
      </div>

      <div className="cr-toolbar" style={{ gap: 10, flexWrap: "wrap" }}>
        <div className="cr-row" style={{ gap: 4 }}>
          <button
            type="button"
            className={`cr-btn cr-btn-sm ${
              series === "all" ? "cr-btn-primary" : "cr-btn-ghost"
            }`}
            onClick={() => setSeries("all")}
          >
            <I18nText en="All series" th="ทุกซีรีส์" />
          </button>
          {seriesOptions.map((s) => (
            <button
              key={s}
              type="button"
              className={`cr-btn cr-btn-sm ${
                series === s ? "cr-btn-primary" : "cr-btn-ghost"
              }`}
              onClick={() => setSeries(s)}
            >
              {seriesLabel(s)}
            </button>
          ))}
        </div>
        <span
          style={{ width: 1, height: 22, background: "var(--cr-line)" }}
        />
        <div className="cr-row" style={{ gap: 4 }}>
          {(
            [
              { id: "all", label: language === "th" ? "ทุกสถานะ" : "Any status" },
              { id: "owned", label: language === "th" ? "ถืออยู่" : "Owned" },
              { id: "shipped", label: language === "th" ? "จัดส่งแล้ว" : "Shipped" },
              { id: "converted", label: language === "th" ? "แลกแล้ว" : "Converted" },
            ] as { id: StatusKey | "all"; label: string }[]
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              className={`cr-btn cr-btn-sm ${
                status === f.id ? "cr-btn-primary" : "cr-btn-ghost"
              }`}
              onClick={() => setStatus(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <div className="cr-search" style={{ maxWidth: 220 }}>
          <Ico name="search" size={14} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={language === "th" ? "ค้นหาชื่อการ์ด..." : "Search card name..."}
            aria-label={language === "th" ? "ค้นหาการเปิด" : "Search pulls"}
          />
        </div>
        <select
          className="cr-select"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label={language === "th" ? "เรียงการเปิด" : "Sort pulls"}
        >
          <option value="newest">{language === "th" ? "เรียง: ใหม่ล่าสุด" : "Sort: Newest"}</option>
          <option value="oldest">{language === "th" ? "เรียง: เก่าสุด" : "Sort: Oldest"}</option>
          <option value="tier-desc">{language === "th" ? "เรียง: ระดับสูงก่อน" : "Sort: Tier desc"}</option>
          <option value="name">{language === "th" ? "เรียง: ชื่อ A-Z" : "Sort: Name A-Z"}</option>
        </select>
      </div>

      {hasActiveFilters && (
        <div
          className="cr-row"
          style={{ gap: 8, padding: "0 4px", flexWrap: "wrap" }}
        >
          <small className="cr-mute">
            {language === "th"
              ? `แสดง ${filtered.length} จาก ${allPulls.length} รายการ`
              : `Showing ${filtered.length} of ${allPulls.length} pulls`}
          </small>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="cr-btn cr-btn-sm cr-btn-ghost"
            onClick={() => {
              setSeries("all");
              setTier("all");
              setStatus("all");
              setSearch("");
            }}
          >
            <I18nText en="Clear all filters" th="ล้างตัวกรองทั้งหมด" />
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div
          className="cr-section"
          style={{ padding: 60, textAlign: "center" }}
        >
          <strong
            style={{ display: "block", fontSize: 14, marginBottom: 6 }}
          >
            <I18nText en="No pulls match your filter" th="ไม่มีรายการเปิดตรงกับตัวกรอง" />
          </strong>
          <small className="cr-mute">
            <I18nText
              en="Try clearing filters or open more packs first."
              th="ลองล้างตัวกรองหรือเปิดแพ็กเพิ่มก่อน"
            />
          </small>
          <Link
            className="cr-btn cr-btn-primary"
            href="/packs"
            style={{ marginTop: 14, display: "inline-flex" }}
          >
            <Ico name="sparkle" size={14} /> <I18nText en="Open a pack" th="เปิดแพ็ก" />
          </Link>
        </div>
      ) : (
        <div className="cr-section" style={{ overflow: "hidden" }}>
          <div className="cr-pulls-thead">
            <span />
            <span><I18nText en="Card" th="การ์ด" /></span>
            <span><I18nText en="Tier" th="ระดับ" /></span>
            <span><I18nText en="From pack" th="จากแพ็ก" /></span>
            <span><I18nText en="Pulled" th="เปิดเมื่อ" /></span>
            <span><I18nText en="Status" th="สถานะ" /></span>
            <span style={{ textAlign: "right" }}><I18nText en="Value" th="มูลค่า" /></span>
          </div>
          {filtered.map((row) => (
            <div key={row.id} className="cr-pulls-row">
              <div
                className={`cr-coll-art ${tierClassName(row.tier)}`}
                style={{
                  aspectRatio: "3 / 4",
                  borderRadius: 6,
                  borderBottom: 0,
                  width: 44,
                }}
              >
                {row.imageUrl ? (
                  <Image
                    className="cr-coll-art-img"
                    src={row.imageUrl}
                    alt={row.cardName}
                    fill
                    sizes="44px"
                    unoptimized
                  />
                ) : (
                  <span style={{ fontSize: 8, opacity: 0.6 }}>
                    {row.cardCode}
                  </span>
                )}
                <QuantityBadge quantity={row.bundleQuantity} />
              </div>
              <div
                className="cr-stack"
                style={{ gap: 2, minWidth: 0 }}
              >
                <strong style={{ fontSize: 13 }}>{row.cardName}</strong>
                <small className="cr-mute" style={{ fontSize: 11 }}>
                  {row.cardCode} ·{" "}
                  {row.series === "unknown" ? "—" : seriesLabel(row.series)}
                </small>
              </div>
              <span
                className="cr-pill"
                style={{
                  background: tierPillBackground(row.tier),
                  color: "var(--cr-ink)",
                  borderColor: "var(--cr-line)",
                }}
              >
                {tierLabel(row.tier, language)}
              </span>
              <span style={{ fontSize: 12, color: "var(--cr-mute)" }}>
                {row.fromPack}
              </span>
              <span
                className="cr-mono"
                style={{ fontSize: 11, color: "var(--cr-mute)" }}
              >
                {row.when}
              </span>
              <span
                className={`cr-pill ${
                  row.status === "owned"
                    ? ""
                    : row.status === "shipped"
                      ? "cr-pill-blue"
                      : "cr-pill-gold"
                }`}
              >
                {statusLabel(row.status, language)}
              </span>
              <span
                className="cr-tnum"
                style={{
                  textAlign: "right",
                  fontWeight: 700,
                  color: "var(--cr-coin-ink)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  justifyContent: "flex-end",
                }}
              >
                <CoinPip size={11} /> {formatCoins(row.valueCoins)}
              </span>
            </div>
          ))}
          <div
            style={{
              padding: "12px 22px",
              borderTop: "1px solid var(--cr-line-soft)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <small className="cr-mute">
              {language === "th"
                ? `แสดง ${filtered.length} รายการ`
                : `Showing ${filtered.length} pull${filtered.length === 1 ? "" : "s"}`}
            </small>
            <Link href="/collection" className="cr-btn cr-btn-sm">
              <Ico name="chev-l" size={12} />{" "}
              <I18nText en="Back to card history" th="กลับไปประวัติการ์ด" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
