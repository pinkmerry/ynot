import Link from "next/link";
import type { ReactNode } from "react";
import type { MarketplaceAdminOrderRow, MarketplaceDailyGmvRow } from "@/lib/marketplace/admin-orders";
import type { MarketplaceQueueSummary } from "@/lib/marketplace/ops-hardening";
import { MpBadge, type MpBadgeKind } from "../shared/MpPrimitives";
import { MpIcon } from "../shared/MpIcon";
import { formatThb } from "../shared/money";

/**
 * Marketplace admin console overview -- KPI strip, GMV mini-chart, queue
 * summary, and recent orders. Ported (data-driven, not 1:1 markup) from
 * marketplace-admin-1.jsx's AdminOverview (prototype:
 * /Users/pinkmerry/Downloads/ynott/project/marketplace-admin-1.jsx:88-197).
 * The prototype's "health strip" (verification pass rate, dispute rate,
 * etc.), top-sellers panel, and 24h activity log have no real data source
 * wired up yet, so they're left out here rather than shown with mock
 * numbers.
 *
 * Pure presentational server component: the page (page.tsx) loads all of
 * this up front -- dailyGmv via getAdminDailyGmv, recentOrders via
 * listAdminMarketplaceOrders, openListingReportsCount via
 * countOpenListingReports, activeProductAlertsCount via
 * countActiveProductAlerts, and queueSummary/sellerSubmissionReviewCount
 * off buildMarketplaceOpsSnapshot -- and passes it down as props; this
 * file only renders it. moneyPolicyPanel is a slot: page.tsx instantiates
 * the existing <MarketplaceMoneyPolicyControls> client island itself (it
 * needs the real MarketplaceMoneyPolicy value from the snapshot) and this
 * screen just places it inside a "Fees & shipping" panel.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const CHART_WIDTH = 640;
const CHART_HEIGHT = 120;
const CHART_BAR_GAP = 3;

export interface OverviewScreenProps {
  dailyGmv: MarketplaceDailyGmvRow[];
  recentOrders: MarketplaceAdminOrderRow[];
  openListingReportsCount: number;
  activeProductAlertsCount: number;
  queueSummary: MarketplaceQueueSummary;
  sellerSubmissionReviewCount: number;
  moneyPolicyPanel: ReactNode;
}

function dayKey(value: string): string {
  return value.slice(0, 10);
}

function formatChartDay(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
  return parsed.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

function computeGmvTotals(rows: MarketplaceDailyGmvRow[]): {
  todaySatang: number;
  sevenDaySatang: number;
} {
  const now = Date.now();
  const todayKey = new Date(now).toISOString().slice(0, 10);
  return rows.reduce(
    (totals, row) => {
      const satang = Number(row.gmv_satang ?? 0);
      const rowTime = new Date(row.day).getTime();
      const isToday = dayKey(row.day) === todayKey;
      const isLast7Days = Number.isFinite(rowTime) && now - rowTime < 7 * DAY_MS;
      return {
        todaySatang: totals.todaySatang + (isToday ? satang : 0),
        sevenDaySatang: totals.sevenDaySatang + (isLast7Days ? satang : 0),
      };
    },
    { todaySatang: 0, sevenDaySatang: 0 },
  );
}

function paymentStateBadge(state: string): { kind: MpBadgeKind; label: string } {
  switch (state) {
    case "paid":
      return { kind: "official", label: "Paid" };
    case "payment_submitted":
      return { kind: "graded", label: "Payment review" };
    case "pending_payment":
      return { kind: "raw", label: "Pending" };
    case "refunded":
      return { kind: "community", label: "Refunded" };
    case "failed":
      return { kind: "sold", label: "Failed" };
    default:
      return { kind: "raw", label: state.replace(/_/g, " ") };
  }
}

function GmvChart({ rows }: { rows: MarketplaceDailyGmvRow[] }) {
  const viewBox = `0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`;
  if (rows.length === 0) {
    return (
      <svg viewBox={viewBox} role="img" aria-label="No paid orders in the last 30 days yet">
        <line
          x1={0}
          y1={CHART_HEIGHT - 1}
          x2={CHART_WIDTH}
          y2={CHART_HEIGHT - 1}
          style={{ stroke: "var(--mp-line-strong)" }}
          strokeWidth={1}
        />
      </svg>
    );
  }

  const sorted = [...rows].sort((a, b) => a.day.localeCompare(b.day));
  const maxGmvSatang = Math.max(1, ...sorted.map((row) => Number(row.gmv_satang ?? 0)));
  const barWidth = (CHART_WIDTH - CHART_BAR_GAP * (sorted.length - 1)) / sorted.length;

  return (
    <svg viewBox={viewBox} role="img" aria-label="Daily GMV for the last 30 days, most recent day highlighted">
      {sorted.map((row, index) => {
        const valueSatang = Number(row.gmv_satang ?? 0);
        const barHeight = Math.max(2, (valueSatang / maxGmvSatang) * CHART_HEIGHT);
        const isLast = index === sorted.length - 1;
        return (
          <rect
            key={row.day}
            x={index * (barWidth + CHART_BAR_GAP)}
            y={CHART_HEIGHT - barHeight}
            width={barWidth}
            height={barHeight}
            rx={2}
            style={{ fill: isLast ? "var(--mp-gold)" : "var(--mp-green)" }}
            opacity={isLast ? 1 : 0.28 + (index / sorted.length) * 0.6}
          >
            <title>{`${formatChartDay(row.day)} · ${formatThb(valueSatang)}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

export function OverviewScreen({
  dailyGmv,
  recentOrders,
  openListingReportsCount,
  activeProductAlertsCount,
  queueSummary,
  sellerSubmissionReviewCount,
  moneyPolicyPanel,
}: OverviewScreenProps) {
  const { todaySatang, sevenDaySatang } = computeGmvTotals(dailyGmv);
  const openQueueItems =
    queueSummary.paymentReviewCount +
    queueSummary.refundOpenCount +
    queueSummary.reconciliationOpenCount +
    queueSummary.payoutBlockedCount +
    queueSummary.providerEventOpenCount;

  const sortedGmv = [...dailyGmv].sort((a, b) => a.day.localeCompare(b.day));
  const oldestLabel = sortedGmv.length > 0 ? formatChartDay(sortedGmv[0].day) : "—";
  const newestLabel = sortedGmv.length > 0 ? formatChartDay(sortedGmv[sortedGmv.length - 1].day) : "—";

  const queueRows: { label: string; count: number; href: string }[] = [
    { label: "Payment review", count: queueSummary.paymentReviewCount, href: "/admin/marketplace/orders" },
    { label: "Refunds open", count: queueSummary.refundOpenCount, href: "/admin/marketplace/orders" },
    { label: "Reconciliation open", count: queueSummary.reconciliationOpenCount, href: "/admin/marketplace/orders" },
    { label: "Payouts blocked", count: queueSummary.payoutBlockedCount, href: "/admin/marketplace/payouts" },
    { label: "Provider events open", count: queueSummary.providerEventOpenCount, href: "/admin/marketplace/orders" },
    {
      label: "Seller submissions to review",
      count: sellerSubmissionReviewCount,
      href: "/admin/marketplace/seller-submissions",
    },
  ];

  return (
    <>
      <div className="mp-row" style={{ alignItems: "flex-end", marginBottom: 22 }}>
        <div className="mp-stack" style={{ gap: 5 }}>
          <span className="mp-eyebrow">Marketplace</span>
          <h1 className="mp-h1" style={{ fontSize: 26 }}>
            Overview
          </h1>
          <p className="mp-lead" style={{ fontSize: 13 }}>
            Community trading + official shop, at a glance.
          </p>
        </div>
      </div>

      <div className="mpa-kpis" style={{ marginBottom: 20 }}>
        <div>
          <div className="k">GMV · today</div>
          <div className="v">{formatThb(todaySatang)}</div>
        </div>
        <div>
          <div className="k">GMV · 7 days</div>
          <div className="v">{formatThb(sevenDaySatang)}</div>
        </div>
        <div>
          <div className="k">Open listing reports</div>
          <div className="v">{openListingReportsCount.toLocaleString()}</div>
        </div>
        <div>
          <div className="k">Active product alerts</div>
          <div className="v">{activeProductAlertsCount.toLocaleString()}</div>
        </div>
        <div>
          <div className="k">Open queue items</div>
          <div className="v">{openQueueItems.toLocaleString()}</div>
        </div>
      </div>

      <div className="mpa-overview-row" style={{ marginBottom: 20 }}>
        <div className="mp-panel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="mp-row">
            <h2 className="mp-h2" style={{ fontSize: 15 }}>
              GMV · daily
            </h2>
            <span className="mp-spacer" />
            <span className="mp-range">
              <span className="on">30D</span>
            </span>
          </div>
          <div className="mp-chart">
            <GmvChart rows={dailyGmv} />
            <div className="mp-row mp-small mp-mute mp-mono" style={{ justifyContent: "space-between" }}>
              <span>{oldestLabel}</span>
              <span>
                {newestLabel} · {formatThb(todaySatang)} today
              </span>
            </div>
          </div>
        </div>
        <div className="mp-panel" style={{ display: "flex", flexDirection: "column" }}>
          <h2 className="mp-h2" style={{ fontSize: 15, marginBottom: 10 }}>
            Queues
          </h2>
          <div className="mpa-queue-list">
            {queueRows.map((row) => (
              <Link key={row.label} href={row.href} prefetch={false} className="mpa-queue-row">
                <span>{row.label}</span>
                <span className="cnt">{row.count.toLocaleString()}</span>
                <MpIcon name="chev-r" size={13} />
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="mp-panel" style={{ marginBottom: 20 }}>
        <div className="mp-row" style={{ marginBottom: 14 }}>
          <div className="mp-stack" style={{ gap: 2 }}>
            <span className="mp-eyebrow">Money policy</span>
            <h2 className="mp-h2" style={{ fontSize: 16 }}>
              Fees &amp; shipping
            </h2>
          </div>
        </div>
        {moneyPolicyPanel}
      </div>

      <div className="mp-panel">
        <div className="mp-row" style={{ marginBottom: 14 }}>
          <h2 className="mp-h2" style={{ fontSize: 16 }}>
            Recent orders
          </h2>
          <span className="mp-spacer" />
          <Link href="/admin/marketplace/orders" prefetch={false} className="mp-small">
            View all
          </Link>
        </div>
        <div className="mpa-table-wrap">
          <table className="mpa-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Source</th>
                <th>Payment</th>
                <th>Fulfilment</th>
                <th style={{ textAlign: "right" }}>Total</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="mp-mute" style={{ padding: 24, textAlign: "center" }}>
                    No orders yet.
                  </td>
                </tr>
              ) : (
                recentOrders.map((order) => {
                  const payment = paymentStateBadge(order.payment_state);
                  return (
                    <tr key={order.order_id}>
                      <td>
                        <Link
                          href={`/admin/marketplace/orders/${order.order_id}`}
                          prefetch={false}
                          className="mp-mono"
                        >
                          {order.order_id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="mp-small mp-mute">
                        {order.source === "official_shop" ? "Official" : "Community"}
                      </td>
                      <td>
                        <MpBadge kind={payment.kind}>{payment.label}</MpBadge>
                      </td>
                      <td className="mp-small mp-mute">{order.fulfilment_state.replace(/_/g, " ")}</td>
                      <td className="num" style={{ textAlign: "right" }}>
                        {formatThb(order.buyer_total_satang)}
                      </td>
                      <td className="mp-small mp-mute mp-mono">
                        {order.created_at ? new Date(order.created_at).toLocaleString() : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
