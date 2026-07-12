"use client";

import { useMemo, useState } from "react";
import { MpIcon } from "../shared/MpIcon";
import { formatThb } from "../shared/money";
import type { MarketplaceProductMarketPriceHistoryPoint } from "@/lib/marketplace/product-market";

/**
 * Price history panel — ports MPPriceChart + MPSalesTable from the design
 * prototype (/Users/pinkmerry/Downloads/ynott/project/marketplace-pages-4.jsx,
 * ~lines 72-116): an SVG line chart of sale prices over time plus a table of
 * the most recent sales with an up/down arrow versus the previous sale.
 *
 * Unlike the prototype (static illustrative points), this recomputes both
 * the chart and the table from the real
 * MarketplaceProductMarketPriceHistoryPoint[] rows passed in by
 * ProductDetail — no invented mock series.
 *
 * Client component: the 3M/6M/1Y range chips filter rows by `sold_at`
 * without a round trip, and the SVG viewBox stays fixed (600x190) regardless
 * of how many points are plotted, so switching ranges never shifts layout
 * (CLS).
 */

export interface PriceHistoryPanelProps {
  priceHistory: MarketplaceProductMarketPriceHistoryPoint[];
  selectedGradeLabel: string;
}

type RangeOption = "3M" | "6M" | "1Y";

const RANGE_DAYS: Record<RangeOption, number> = {
  "3M": 90,
  "6M": 180,
  "1Y": 365,
};

const CHART_WIDTH = 600;
const CHART_HEIGHT = 190;
const CHART_PAD_LEFT = 40;
const CHART_PAD_TOP = 10;
const CHART_PAD_BOTTOM = 20;
const CHART_PLOT_WIDTH = CHART_WIDTH - CHART_PAD_LEFT - 4;
const CHART_PLOT_HEIGHT = CHART_HEIGHT - CHART_PAD_TOP - CHART_PAD_BOTTOM;
const GRIDLINE_ROWS = 4;

function withinRange(sortedAtMs: number, days: number) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return sortedAtMs >= cutoff;
}

function chartPoints(rows: MarketplaceProductMarketPriceHistoryPoint[]) {
  // Chart reads oldest-to-newest left-to-right, so reverse the
  // newest-first order the rows arrive in.
  const oldestFirst = [...rows].reverse();
  const prices = oldestFirst.map((row) => row.item_price_satang);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const span = maxPrice - minPrice || 1;

  return oldestFirst.map((row, index) => {
    const x =
      oldestFirst.length > 1
        ? CHART_PAD_LEFT + (index / (oldestFirst.length - 1)) * CHART_PLOT_WIDTH
        : CHART_PAD_LEFT + CHART_PLOT_WIDTH / 2;
    const y =
      CHART_PAD_TOP + CHART_PLOT_HEIGHT - ((row.item_price_satang - minPrice) / span) * CHART_PLOT_HEIGHT;
    return { x, y, row };
  });
}

function axisLabels(rows: MarketplaceProductMarketPriceHistoryPoint[]) {
  const prices = rows.map((row) => row.item_price_satang);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const span = maxPrice - minPrice || 1;
  return Array.from({ length: GRIDLINE_ROWS }, (_, i) => {
    const fraction = i / (GRIDLINE_ROWS - 1);
    const y = CHART_PAD_TOP + fraction * CHART_PLOT_HEIGHT;
    const value = maxPrice - fraction * span;
    return { y, label: formatThb(value) };
  });
}

function dateAxisTicks(rows: MarketplaceProductMarketPriceHistoryPoint[]) {
  const oldestFirst = [...rows].reverse();
  const tickCount = Math.min(6, oldestFirst.length);
  if (tickCount <= 1) return oldestFirst.map((row) => ({ x: CHART_PAD_LEFT + CHART_PLOT_WIDTH / 2, row }));
  return Array.from({ length: tickCount }, (_, i) => {
    const index = Math.round((i / (tickCount - 1)) * (oldestFirst.length - 1));
    const x = CHART_PAD_LEFT + (index / (oldestFirst.length - 1)) * CHART_PLOT_WIDTH;
    return { x, row: oldestFirst[index] };
  });
}

function monthDayLabel(sold_at: string) {
  return new Date(sold_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fullDateLabel(sold_at: string) {
  return new Date(sold_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function prettifyConditionBucket(condition_bucket: string) {
  return condition_bucket
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function gradeBadgeLabel(row: MarketplaceProductMarketPriceHistoryPoint) {
  if (row.grade_service && row.grade_value) return `${row.grade_service} ${row.grade_value}`;
  return prettifyConditionBucket(row.condition_bucket);
}

function isGraded(row: MarketplaceProductMarketPriceHistoryPoint) {
  return Boolean(row.grade_service && row.grade_value);
}

export function PriceHistoryPanel({ priceHistory, selectedGradeLabel }: PriceHistoryPanelProps) {
  const [range, setRange] = useState<RangeOption>("6M");

  const filteredRows = useMemo(() => {
    const days = RANGE_DAYS[range];
    return priceHistory.filter((row) => withinRange(Date.parse(row.sold_at), days));
  }, [priceHistory, range]);

  const points = useMemo(() => (filteredRows.length > 0 ? chartPoints(filteredRows) : []), [filteredRows]);
  const yAxis = useMemo(() => (filteredRows.length > 0 ? axisLabels(filteredRows) : []), [filteredRows]);
  const xAxis = useMemo(() => (filteredRows.length > 0 ? dateAxisTicks(filteredRows) : []), [filteredRows]);
  const linePoints = points.map((point) => `${point.x},${point.y}`).join(" ");
  const lastPoint = points[points.length - 1];

  return (
    <div className="mp-detail-history-grid">
      <div className="mp-panel" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="mp-row">
          <h2 className="mp-h2" style={{ fontSize: 16 }}>
            Price history
          </h2>
          <span className="mp-badge mp-badge-graded">{selectedGradeLabel}</span>
          <span className="mp-spacer" />
          <span className="mp-range">
            {(Object.keys(RANGE_DAYS) as RangeOption[]).map((option) => (
              <span
                key={option}
                className={option === range ? "on" : undefined}
                role="button"
                tabIndex={0}
                onClick={() => setRange(option)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") setRange(option);
                }}
              >
                {option}
              </span>
            ))}
          </span>
        </div>

        {filteredRows.length > 0 ? (
          <div className="mp-chart">
            <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}>
              {yAxis.map((tick) => (
                <line
                  key={tick.y}
                  x1={CHART_PAD_LEFT}
                  x2={CHART_WIDTH - 4}
                  y1={tick.y}
                  y2={tick.y}
                  stroke="var(--mp-line)"
                  strokeWidth="1"
                />
              ))}
              {yAxis.map((tick) => (
                <text key={`label-${tick.y}`} className="axis" x="0" y={tick.y + 4}>
                  {tick.label}
                </text>
              ))}
              {points.length > 1 ? (
                <polyline
                  points={linePoints}
                  fill="none"
                  stroke="var(--mp-green)"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null}
              {points.length === 1 ? (
                <circle cx={points[0].x} cy={points[0].y} r="3.5" fill="var(--mp-green)" />
              ) : null}
              {lastPoint && points.length > 1 ? (
                <circle cx={lastPoint.x} cy={lastPoint.y} r="3.5" fill="var(--mp-green)" />
              ) : null}
              {xAxis.map((tick, index) => (
                <text key={`${tick.x}-${index}`} className="axis" x={tick.x} y={CHART_HEIGHT - 4}>
                  {monthDayLabel(tick.row.sold_at)}
                </text>
              ))}
            </svg>
          </div>
        ) : (
          <div className="mp-empty">
            <span className="glyph">
              <MpIcon name="clock" size={20} />
            </span>
            <span style={{ fontSize: 15, fontWeight: 700 }}>Not enough sales yet</span>
            <span className="mp-small mp-mute">
              Sold prices will appear here once a completed order lands in this range.
            </span>
          </div>
        )}
        <span className="mp-small mp-mute">
          Sale price per completed order in THB. Pick a grade above to re-draw.
        </span>
      </div>

      <div className="mp-panel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="mp-row">
          <h2 className="mp-h2" style={{ fontSize: 16 }}>
            Latest sales
          </h2>
          <span className="mp-spacer" />
          <span className="mp-small mp-mute">{filteredRows.length} sale{filteredRows.length === 1 ? "" : "s"}</span>
        </div>
        {filteredRows.length > 0 ? (
          <table className="mp-sales">
            <thead>
              <tr>
                <th>Date</th>
                <th>Grade</th>
                <th style={{ textAlign: "right" }}>Sold for</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, index) => {
                const previous = filteredRows[index + 1];
                const direction = previous
                  ? row.item_price_satang >= previous.item_price_satang
                    ? "up"
                    : "down"
                  : null;
                return (
                  <tr key={row.id}>
                    <td className="mp-mute">{fullDateLabel(row.sold_at)}</td>
                    <td>
                      <span className={`mp-badge ${isGraded(row) ? "mp-badge-graded" : "mp-badge-raw"}`}>
                        {gradeBadgeLabel(row)}
                      </span>
                    </td>
                    <td className="num" style={{ textAlign: "right" }}>
                      <span className="mp-row" style={{ gap: 6, justifyContent: "flex-end" }}>
                        {direction ? (
                          <MpIcon
                            name={direction === "up" ? "trend-up" : "trend-down"}
                            size={12}
                            style={{ color: direction === "up" ? "var(--mp-green)" : "var(--mp-rose)" }}
                          />
                        ) : null}
                        {formatThb(row.item_price_satang)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <span className="mp-small mp-mute">Not enough sales yet in this range.</span>
        )}
      </div>
    </div>
  );
}
