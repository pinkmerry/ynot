"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { YnotCampaign, YnotPrizePoolItem } from "@/features/ynot/types";
import { removePrize } from "./catalog-api";
import { fmtInt } from "./catalog-format";

/**
 * Campaign prizes section rendered in the LedgerRow expanded detail
 * for NON-box cards. Shows which campaigns this card is assigned to
 * as a prize, a winnable banner, and an "Assign to a campaign" button.
 *
 * Task 3.2: CampaignPrizesSection
 * Task 3.4: Remove prize (confirm → removePrize → toast)
 */

type CampaignPrizesSectionProps = {
  prizes: YnotPrizePoolItem[];
  campaigns: YnotCampaign[];
  isOwner: boolean;
  onAssign: () => void;
  onToast: (msg: string, isError?: boolean) => void;
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
  onAssign,
  onToast,
}: CampaignPrizesSectionProps) {
  const router = useRouter();
  const [removing, setRemoving] = useState<string | null>(null);

  const isWinnableNow = prizes.some(
    (p) => campaignStatus(p.campaignId, campaigns) === "live",
  );

  const handleRemove = useCallback(
    async (prize: YnotPrizePoolItem) => {
      const label = prize.campaignTitle || prize.campaignSlug || "this campaign";
      if (
        !window.confirm(
          `Remove this prize from "${label}"? Owner review will be required before publish.`,
        )
      ) {
        return;
      }

      setRemoving(prize.id);
      const res = await removePrize(prize.id);
      setRemoving(null);

      if (!res.ok) {
        onToast(res.error, true);
        return;
      }
      onToast("Removed — owner review required before publish.");
      router.refresh();
    },
    [router, onToast],
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

      {/* Prize table */}
      {prizes.length > 0 && (
        <div className="pcx-prize-table-wrap">
          <table className="pcx-prize-table">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Status</th>
                <th>Variant</th>
                <th>Tier</th>
                <th>Rank</th>
                {isOwner && <th>Value (THB)</th>}
                <th>Awarded</th>
                <th></th>
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
                    <td>
                      <button
                        type="button"
                        className="pcx-btn pcx-btn-icon pcx-btn-danger"
                        onClick={() => handleRemove(prize)}
                        disabled={removing === prize.id}
                        aria-label={`Remove prize from ${prize.campaignTitle || prize.campaignSlug}`}
                        title="Remove from campaign"
                      >
                        {removing === prize.id ? "…" : "×"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Assign button */}
      <button
        type="button"
        className="pcx-btn pcx-btn-primary pcx-btn-sm"
        onClick={onAssign}
      >
        Assign to a campaign
      </button>
    </div>
  );
}
