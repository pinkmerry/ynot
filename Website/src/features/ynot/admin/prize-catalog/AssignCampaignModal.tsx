"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CardCatalogItem } from "@/lib/lucky-draw/types";
import type { YnotCampaign, YnotPrizePoolItem } from "@/features/ynot/types";
import { assignPrize } from "./catalog-api";

type StockSkuGroupElement = NonNullable<CardCatalogItem["stockSkuGroups"]>[number];

/**
 * Assign a card variant to a campaign as a prize.
 *
 * Task 3.3: AssignCampaignModal
 *
 * SECURITY: Value (THB) input is rendered ONLY when `isOwner` is true,
 * and `valueThb` is sent ONLY for owners. weight and unlock fields are
 * never rendered or sent — they are owner-only server-side odds data
 * that are managed elsewhere.
 */

export type AssignCampaignTarget = {
  cardId: string;
  cardName: string;
  catalogCategory: string;
  prizeCategory: string;
  stockSkuGroups: StockSkuGroupElement[];
  prizes: YnotPrizePoolItem[];
};

export function AssignCampaignModal({
  target,
  campaigns,
  isOwner,
  onClose,
  onDone,
}: {
  target: AssignCampaignTarget;
  campaigns: YnotCampaign[];
  isOwner: boolean;
  onClose: () => void;
  onDone: (msg: string, isError?: boolean) => void;
}) {
  const {
    cardId,
    cardName,
    catalogCategory,
    prizeCategory,
    stockSkuGroups,
    prizes,
  } = target;
  const modalRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const [selectedGroupKey, setSelectedGroupKey] = useState<string>(
    stockSkuGroups.length > 0 ? stockSkuGroups[0].key : "",
  );
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(
    campaigns.length > 0 ? campaigns[0].id : "",
  );
  const [tier, setTier] = useState<"normal" | "high">("normal");
  const [rank, setRank] = useState<number>(1);
  const [valueThb, setValueThb] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resolve the selected variant group
  const selectedGroup = stockSkuGroups.find((g) => g.key === selectedGroupKey) ?? null;

  // Dedupe check: block if the same campaign+variant is already a prize
  const isDuplicate =
    selectedGroup !== null &&
    selectedCampaignId !== "" &&
    prizes.some(
      (p) =>
        p.campaignId === selectedCampaignId &&
        (p.intendedStockSku === selectedGroup.sku ||
          p.intendedStockUnitKey === selectedGroup.key),
    );

  // a11y: Escape closes, focus on open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    modalRef.current
      ?.querySelector<HTMLElement>("select, input, button")
      ?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (!selectedGroup) {
        setError("Select a variant.");
        return;
      }
      if (!selectedCampaignId) {
        setError("Select a campaign.");
        return;
      }
      if (isDuplicate) {
        setError("This variant is already assigned to that campaign.");
        return;
      }
      if (rank < 1 || rank > 999) {
        setError("Rank must be between 1 and 999.");
        return;
      }

      setSaving(true);

      const parsedValue = valueThb.trim() !== "" ? Number(valueThb) : undefined;
      const ownerValue =
        isOwner && parsedValue !== undefined && Number.isFinite(parsedValue)
          ? parsedValue
          : undefined;

      const res = await assignPrize({
        campaignId: selectedCampaignId,
        cardId,
        tier,
        rank,
        valueThb: isOwner ? ownerValue : undefined,
        metadata: {
          intendedStockSku: selectedGroup.sku,
          intendedStockUnitKey: selectedGroup.key,
          intendedStockLabel: selectedGroup.label,
          catalogCategory,
          prizeCategory,
          tierRank: rank,
        },
      });

      setSaving(false);

      if (!res.ok) {
        setError(res.error);
        return;
      }

      onDone("Added — owner review required before publish.");
      router.refresh();
    },
    [
      selectedGroup,
      selectedCampaignId,
      isDuplicate,
      rank,
      valueThb,
      isOwner,
      cardId,
      tier,
      catalogCategory,
      prizeCategory,
      onDone,
      router,
    ],
  );

  return (
    <div
      className="pcx-modal-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="pcx-modal pcx-assign-modal" role="document" ref={modalRef}>
        <header className="pcx-modal-head">
          <div>
            <h2 className="pcx-modal-title">Assign to a campaign</h2>
            <p className="pcx-modal-subtitle">{cardName}</p>
          </div>
          <button
            type="button"
            className="pcx-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="pcx-modal-body">
            {/* Variant select */}
            <div className="pcx-field">
              <label htmlFor="assign-variant">Variant</label>
              <select
                id="assign-variant"
                value={selectedGroupKey}
                onChange={(e) => setSelectedGroupKey(e.target.value)}
                disabled={saving}
              >
                {stockSkuGroups.length === 0 && (
                  <option value="">No variants available</option>
                )}
                {stockSkuGroups.map((g) => (
                  <option key={g.key} value={g.key}>
                    {g.label} ({g.sku})
                  </option>
                ))}
              </select>
            </div>

            {/* Campaign select */}
            <div className="pcx-field">
              <label htmlFor="assign-campaign">Campaign</label>
              <select
                id="assign-campaign"
                value={selectedCampaignId}
                onChange={(e) => setSelectedCampaignId(e.target.value)}
                disabled={saving}
              >
                {campaigns.length === 0 && (
                  <option value="">No campaigns available</option>
                )}
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.titleEn || c.titleTh} &middot; {c.status}
                  </option>
                ))}
              </select>
            </div>

            {isDuplicate && (
              <div className="pcx-ev-warn">
                This variant is already assigned to that campaign.
              </div>
            )}

            {/* Tier pills */}
            <div className="pcx-field">
              <span className="pcx-field-label">Tier</span>
              <div className="pcx-tier-pills">
                <button
                  type="button"
                  className={`pcx-tier-pill${tier === "normal" ? " active" : ""}`}
                  onClick={() => setTier("normal")}
                  disabled={saving}
                >
                  Normal
                </button>
                <button
                  type="button"
                  className={`pcx-tier-pill${tier === "high" ? " active" : ""}`}
                  onClick={() => setTier("high")}
                  disabled={saving}
                >
                  High
                </button>
              </div>
            </div>

            {/* Rank */}
            <div className="pcx-field">
              <label htmlFor="assign-rank">Rank</label>
              <input
                id="assign-rank"
                type="number"
                min={1}
                max={999}
                value={rank}
                onChange={(e) =>
                  setRank(Math.max(1, Math.min(999, Number(e.target.value) || 1)))
                }
                disabled={saving}
              />
            </div>

            {/* Value (THB) — OWNER ONLY */}
            {isOwner && (
              <div className="pcx-field">
                <label htmlFor="assign-value">Value (THB)</label>
                <input
                  id="assign-value"
                  type="number"
                  min={0}
                  step={1}
                  placeholder="Optional"
                  value={valueThb}
                  onChange={(e) => setValueThb(e.target.value)}
                  disabled={saving}
                />
              </div>
            )}

            {error && <div className="pcx-ev-warn">{error}</div>}
          </div>

          <footer className="pcx-modal-foot">
            <button
              type="button"
              className="pcx-btn pcx-btn-ghost"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="pcx-btn pcx-btn-primary"
              disabled={
                saving ||
                isDuplicate ||
                !selectedGroup ||
                !selectedCampaignId
              }
            >
              {saving ? "Assigning…" : "Assign prize"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
