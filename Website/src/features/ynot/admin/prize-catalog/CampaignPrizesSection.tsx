"use client";

import type { YnotCampaign, YnotPrizePoolItem } from "@/features/ynot/types";
import { fmtInt } from "./catalog-format";

/**
 * Campaign prizes section rendered in the LedgerRow expanded detail
 * for NON-box cards. READ-ONLY display of which campaigns this card
 * is assigned to as a prize, plus a winnable banner.
 *
 * Assignment and removal live in the campaign builder, not here.
 */

type CampaignPrizesSectionProps = {
  prizes: YnotPrizePoolItem[];
  campaigns: YnotCampaign[];
  isOwner: boolean;
};

function campaignStatus(
  campaignId: string,
  campaigns: YnotCampaign[],
): YnotCampaign["status"] | "unknown" {
  const campaign = campaigns.find((c) => c.id === campaignId);
  return campaign?.status ?? "unknown";
}

function statusPillClass(
  status: YnotCampaign["status"] | "unknown",
): string {
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

function tierPillClass(tier: "normal" | "high"): string {
  return tier === "high" ? "pcx-pill pcx-pill-high" : "pcx-pill pcx-pill-normal";
}

export function CampaignPrizesSection({
  prizes,
  campaigns,
  isOwner,
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

      {/* Winnable banner */}
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

      {/* Prize table (read-only) */}
      {prizes.length > 0 && (
        <table className="pcx-vtable">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Status</th>
              <th>Variant</th>
              <th>Tier</th>
              <th>Rank</th>
              {isOwner && <th>Value (THB)</th>}
              <th>Awarded</th>
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
                    <span className={tierPillClass(prize.tier)}>
                      {prize.tier}
                    </span>
                  </td>
                  <td>{prize.rank}</td>
                  {isOwner && (
                    <td>
                      {prize.valueThb != null
                        ? fmtInt(prize.valueThb)
                        : "—"}
                    </td>
                  )}
                  <td>{fmtInt(prize.awardedUnits)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
