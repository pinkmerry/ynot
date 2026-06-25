"use client";

import type { YnotCampaign, YnotPrizePoolItem, PrizeWinner } from "@/features/ynot/types";
import { fmtInt } from "./catalog-format";

/**
 * Campaign prizes section rendered in the LedgerRow expanded detail
 * for NON-box cards. READ-ONLY display of which campaigns this card is
 * assigned to as a prize, the winnable banner, and per-campaign counts.
 *
 * Assignment and removal live in the campaign builder, not here.
 * Winner names are admin-only (sourced from the admin-gated prize pool).
 */

type CampaignPrizesSectionProps = {
  prizes: YnotPrizePoolItem[];
  campaigns: YnotCampaign[];
};

function campaignStatus(
  campaignId: string,
  campaigns: YnotCampaign[],
): YnotCampaign["status"] | "unknown" {
  const campaign = campaigns.find((c) => c.id === campaignId);
  return campaign?.status ?? "unknown";
}

function statusPillClass(status: YnotCampaign["status"] | "unknown"): string {
  switch (status) {
    case "live":
      return "pcx-pill pcx-pill-live";
    case "draft":
      return "pcx-pill pcx-pill-draft";
    case "closed":
      return "pcx-pill pcx-pill-closed";
    case "archived":
      return "pcx-pill pcx-pill-archived";
    default:
      return "pcx-pill pcx-pill-unknown";
  }
}

function tierPillClass(displayTier: string | undefined): string {
  switch (displayTier) {
    case "rainbow":
      return "pcx-pill pcx-pill-rainbow";
    case "gold":
      return "pcx-pill pcx-pill-gold";
    case "bronze":
      return "pcx-pill pcx-pill-bronze";
    default:
      return "pcx-pill pcx-pill-unknown";
  }
}

function AwardedCell({ count, winners }: { count: number; winners: PrizeWinner[] }) {
  if (count <= 0) return <td className="num">0</td>;
  const names = winners.map((w) => w.name);
  const shown = names.slice(0, 3);
  const extra = names.length - shown.length;
  return (
    <td className="num pcx-awarded-cell" title={names.join(", ") || undefined}>
      <span className="pcx-awarded-count">{fmtInt(count)}</span>
      {names.length > 0 && (
        <span className="pcx-winner-list">
          {shown.join(", ")}
          {extra > 0 ? ` +${extra} more` : ""}
        </span>
      )}
    </td>
  );
}

export function CampaignPrizesSection({
  prizes,
  campaigns,
}: CampaignPrizesSectionProps) {
  const isWinnableNow = prizes.some(
    (p) => campaignStatus(p.campaignId, campaigns) === "live",
  );

  return (
    <div className="pcx-detail-sec pcx-campaign-sec">
      <div className="pcx-sec-head">
        <h5>Campaign assignments</h5>
        <span className="pcx-sh-meta">
          {prizes.length} prize{prizes.length === 1 ? "" : "s"} assigned
        </span>
      </div>

      {prizes.length > 0 && (
        <div
          className={
            isWinnableNow
              ? "pcx-winnable-banner pcx-winnable-live"
              : "pcx-winnable-banner pcx-winnable-pending"
          }
        >
          {isWinnableNow
            ? "Winnable now"
            : "Not winnable yet — assign to a live campaign"}
        </div>
      )}

      {prizes.length > 0 && (
        <table className="pcx-vtable">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Status</th>
              <th>Variant</th>
              <th>Tier</th>
              <th className="num">Total</th>
              <th className="num">In pool</th>
              <th className="num">Awarded</th>
            </tr>
          </thead>
          <tbody>
            {prizes.map((prize) => {
              const status = campaignStatus(prize.campaignId, campaigns);
              return (
                <tr key={prize.id}>
                  <td className="pcx-pt-campaign">
                    {prize.campaignTitle || prize.campaignSlug}
                  </td>
                  <td>
                    <span className={statusPillClass(status)}>{status}</span>
                  </td>
                  <td className="pcx-pt-variant">
                    {prize.intendedStockLabel ?? prize.intendedStockSku ?? "—"}
                  </td>
                  <td>
                    <span className={tierPillClass(prize.displayTier)}>
                      {prize.displayTierLabel ?? prize.tier}
                    </span>
                  </td>
                  <td className="num">{fmtInt(prize.totalUnits)}</td>
                  <td className="num">{fmtInt(prize.availableUnits)}</td>
                  <AwardedCell count={prize.awardedUnits} winners={prize.awardedTo} />
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
