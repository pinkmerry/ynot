"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import type {
  YnotCollectionItem,
  YnotGachaOpenHistory,
} from "../types";
import { QuantityBadge } from "../QuantityBadge";
import { CoinPip, Ico, formatCoins } from "./Icons";
import { PageHead } from "./UiKit";

type Tier = "rainbow" | "gold" | "silver" | "bronze";
const TIER_ORDER: Tier[] = ["rainbow", "gold", "silver", "bronze"];

type StatusKey = "owned" | "shipped" | "converted";

function statusFromCollection(
  status: YnotCollectionItem["status"],
): StatusKey {
  if (status === "shipped" || status === "shipping_requested") return "shipped";
  if (status === "exchanged" || status === "exchange_requested")
    return "converted";
  return "owned";
}

function tierFromCollection(item: YnotCollectionItem): Tier {
  const sourceTier = item.sourcePrizeTier;
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
  if (t === "rainbow") return "rainbow";
  if (t === "gold") return "gold";
  if (t === "silver") return "silver";
  return "bronze";
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

function statusLabel(status: StatusKey): string {
  if (status === "owned") return "owned";
  if (status === "shipped") return "shipped";
  return "converted";
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
      when: new Date(c.acquiredAt).toLocaleString(),
      whenIso: c.acquiredAt,
      valueCoins: c.convertCoinValue ?? 0,
    }));
  }, [collection]);

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
          when: new Date(open.openedAt).toLocaleString(),
          whenIso: open.openedAt,
          valueCoins: reward.valueThb ?? 0,
        })),
    );
  }, [collectionRows, gachaOpens]);

  const allPulls = useMemo<PullRow[]>(
    () => [...collectionRows, ...openRows],
    [collectionRows, openRows],
  );

  const counts = useMemo(() => {
    const result: Record<Tier, number> = {
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
        eyebrow="Reward history"
        title="All pulls"
        lead={`Every card you've pulled from a pack — ${allPulls.length} total. Filter and search to find a specific one.`}
        back={{ href: "/collection", label: "Card history" }}
      />

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
                color:
                  t === "rainbow"
                    ? "#9a3d6b"
                    : t === "gold"
                      ? "var(--cr-coin-ink)"
                      : t === "silver"
                        ? "var(--cr-ink-2)"
                        : "#5a3a1a",
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
                  background:
                    t === "rainbow"
                      ? "linear-gradient(135deg, #ff80b5, #ffc480, #80ff9b, #80c0ff)"
                      : t === "gold"
                        ? "#d9a022"
                        : t === "silver"
                          ? "#9aa1a8"
                          : "#c98e5c",
                }}
              />
              {t}
            </span>
            <span className="value cr-tnum">{counts[t]}</span>
            <small className="cr-mute" style={{ fontSize: 11 }}>
              {tier === t ? "Filtering" : "click to filter"}
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
            All series
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
              { id: "all", label: "Any status" },
              { id: "owned", label: "Owned" },
              { id: "shipped", label: "Shipped" },
              { id: "converted", label: "Converted" },
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
            placeholder="Search card name…"
            aria-label="Search pulls"
          />
        </div>
        <select
          className="cr-select"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Sort pulls"
        >
          <option value="newest">Sort: Newest</option>
          <option value="oldest">Sort: Oldest</option>
          <option value="tier-desc">Sort: Tier desc</option>
          <option value="name">Sort: Name A→Z</option>
        </select>
      </div>

      {hasActiveFilters && (
        <div
          className="cr-row"
          style={{ gap: 8, padding: "0 4px", flexWrap: "wrap" }}
        >
          <small className="cr-mute">
            Showing {filtered.length} of {allPulls.length} pulls
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
            Clear all filters
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
            No pulls match your filter
          </strong>
          <small className="cr-mute">
            Try clearing filters or open more packs first.
          </small>
          <Link
            className="cr-btn cr-btn-primary"
            href="/packs"
            style={{ marginTop: 14, display: "inline-flex" }}
          >
            <Ico name="sparkle" size={14} /> Open a pack
          </Link>
        </div>
      ) : (
        <div className="cr-section" style={{ overflow: "hidden" }}>
          <div className="cr-pulls-thead">
            <span />
            <span>Card</span>
            <span>Tier</span>
            <span>From pack</span>
            <span>Pulled</span>
            <span>Status</span>
            <span style={{ textAlign: "right" }}>Value</span>
          </div>
          {filtered.map((row) => (
            <div key={row.id} className="cr-pulls-row">
              <div
                className={`cr-coll-art ${row.tier}`}
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
                  background:
                    row.tier === "rainbow"
                      ? "linear-gradient(135deg, #ffd6e3, #ffe9b3, #c8efc8, #b3d6ff, #d6c8ff)"
                      : row.tier === "gold"
                        ? "var(--cr-gold-tint)"
                        : row.tier === "silver"
                          ? "#eef0f2"
                          : "#f0e2d0",
                  color: "var(--cr-ink)",
                  borderColor: "var(--cr-line)",
                }}
              >
                {row.tier}
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
                {statusLabel(row.status)}
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
              Showing {filtered.length} pull{filtered.length === 1 ? "" : "s"}
            </small>
            <Link href="/collection" className="cr-btn cr-btn-sm">
              <Ico name="chev-l" size={12} /> Back to card history
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
