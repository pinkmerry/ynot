"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CardCatalogItem } from "@/lib/lucky-draw/types";
import type { YnotPrizePoolItem } from "@/features/ynot/types";
import { adjustCardStock } from "./catalog-api";
import { fmtInt } from "./catalog-format";

type StockSkuGroupElement = NonNullable<CardCatalogItem["stockSkuGroups"]>[number];

export type EditVariantTarget = {
  cardId: string;
  cardName: string;
  group: StockSkuGroupElement;
  prizes: YnotPrizePoolItem[];
};

/**
 * Check whether a variant is referenced ("loaded") by any campaign prize.
 * A variant is loaded if any prize's `intendedStockSku`, `intendedStockUnitKey`,
 * or `stockUnitUsages[].sku` matches the group's sku or stockSkuId.
 */
function isVariantLoadedInCampaign(
  group: StockSkuGroupElement,
  prizes: YnotPrizePoolItem[],
): boolean {
  if (prizes.length === 0) return false;
  const groupSku = group.sku;
  const groupSkuId = group.stockSkuId ?? null;
  const groupKey = group.key;

  return prizes.some((prize) => {
    // Check intendedStockSku (sku string match)
    if (prize.intendedStockSku && prize.intendedStockSku === groupSku) return true;
    // Check intendedStockUnitKey (group key match)
    if (prize.intendedStockUnitKey && prize.intendedStockUnitKey === groupKey) return true;
    // Check stockUnitUsages array for sku or actualStockSkuId
    if (prize.stockUnitUsages) {
      return prize.stockUnitUsages.some(
        (usage) =>
          usage.sku === groupSku ||
          (groupSkuId && usage.actualStockSkuId === groupSkuId),
      );
    }
    return false;
  });
}

/**
 * Edit / remove stock for one Sub-SKU/variant.
 * Ported from prototype `openEditVariant`/`saveVariant`/`deleteVariant`.
 *
 * - Shows the 4 bucket counts for a variant (Available, In packs, In bags, Removed).
 * - Admin edits Available and Removed counts; on save computes delta and calls `adjustCardStock`.
 * - "Delete variant" = archive all available units (negative delta equal to current available).
 * - Guard: disables remove/delete when the variant is loaded into a campaign (detected via `row.prizes`).
 *
 * Remove maps to archiving: "removing" stock = sending a negative `quantityDelta` to `adjustCardStock`.
 * The route moves Available units to archived/Removed status. There is no hard "delete unit" endpoint.
 *
 * Prefer `stockSkuId` when available (routes to `adjust_stock_sku_units`).
 * Fall back to `stockUnitGroupKey: group.key` only when `stockSkuId` is null.
 */
export function EditVariantModal({
  target,
  onClose,
  onDone,
}: {
  target: EditVariantTarget;
  onClose: () => void;
  onDone: (msg: string, isError?: boolean) => void;
}) {
  const { cardId, cardName, group, prizes } = target;
  const modalRef = useRef<HTMLDivElement>(null);

  const currentAvailable = group.availableUnits;
  const currentPacks = group.reservedUnits;
  const currentBags = group.allocatedUnits;
  const currentArchived = group.archivedUnits ?? 0;

  const [newAvailable, setNewAvailable] = useState(currentAvailable);
  const [newArchived, setNewArchived] = useState(currentArchived);
  const [saving, setSaving] = useState(false);

  const loadedInCampaign = isVariantLoadedInCampaign(group, prizes);

  // a11y: Escape closes, focus trap on open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    modalRef.current
      ?.querySelector<HTMLElement>("input, button")
      ?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  /**
   * Compute the delta needed: newAvailable - currentAvailable.
   * Negative delta archives units; positive delta would add units.
   * When newArchived increases, that represents removing from available.
   */
  const computeDelta = useCallback(() => {
    return newAvailable - currentAvailable;
  }, [newAvailable, currentAvailable]);

  const handleSave = useCallback(async () => {
    const delta = computeDelta();
    if (delta === 0) {
      onClose();
      return;
    }

    // When the variant is loaded into a campaign, only allow ADDING (positive delta)
    if (loadedInCampaign && delta < 0) {
      onDone(
        "This variant is loaded into a campaign — you can only add stock, not remove.",
        true,
      );
      return;
    }

    setSaving(true);

    // Prefer stockSkuId when the group has one; fall back to stockUnitGroupKey.
    const identifiers: {
      stockSkuId?: string;
      stockUnitGroupKey?: string;
    } = group.stockSkuId
      ? { stockSkuId: group.stockSkuId }
      : { stockUnitGroupKey: group.key };

    const res = await adjustCardStock({
      cardId,
      quantityDelta: delta,
      ...identifiers,
    });

    setSaving(false);
    if (!res.ok) {
      onDone(res.error, true);
      return;
    }
    onDone(
      delta > 0
        ? `Added ${fmtInt(delta)} unit${delta === 1 ? "" : "s"} to ${group.label}.`
        : `Archived ${fmtInt(Math.abs(delta))} unit${Math.abs(delta) === 1 ? "" : "s"} from ${group.label}.`,
    );
  }, [computeDelta, loadedInCampaign, group, cardId, onDone, onClose]);

  const handleDelete = useCallback(async () => {
    if (loadedInCampaign) return;
    if (currentAvailable <= 0) {
      onDone("No available units to archive.", true);
      return;
    }
    if (
      !window.confirm(
        `Archive all ${fmtInt(currentAvailable)} available unit${currentAvailable === 1 ? "" : "s"} of ${group.label} from ${cardName}?`,
      )
    ) {
      return;
    }

    setSaving(true);

    // "Delete variant" = archive all available units via negative delta
    const identifiers: {
      stockSkuId?: string;
      stockUnitGroupKey?: string;
    } = group.stockSkuId
      ? { stockSkuId: group.stockSkuId }
      : { stockUnitGroupKey: group.key };

    const res = await adjustCardStock({
      cardId,
      quantityDelta: -currentAvailable,
      ...identifiers,
    });

    setSaving(false);
    if (!res.ok) {
      onDone(res.error, true);
      return;
    }
    onDone(`Archived all available stock from ${group.label}.`);
  }, [loadedInCampaign, currentAvailable, group, cardId, cardName, onDone]);

  const delta = computeDelta();
  const hasChanges = delta !== 0;

  return (
    <div
      className="pcx-modal-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="pcx-modal pcx-edit-variant" role="document" ref={modalRef}>
        <header className="pcx-modal-head">
          <div>
            <h2 className="pcx-modal-title">Edit stock</h2>
            <p className="pcx-modal-subtitle">
              {cardName} &middot; {group.label}
            </p>
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
        <div className="pcx-modal-body">
          <div className="pcx-ev-grid">
            <div className="pcx-ev-field">
              <label htmlFor="ev-available">Available</label>
              <input
                id="ev-available"
                type="number"
                min={0}
                value={newAvailable}
                onChange={(e) =>
                  setNewAvailable(Math.max(0, Number(e.target.value) || 0))
                }
                disabled={saving}
              />
            </div>
            <div className="pcx-ev-field">
              <label>In packs</label>
              <input
                type="number"
                value={currentPacks}
                disabled
                className="pcx-ev-readonly"
              />
            </div>
            <div className="pcx-ev-field">
              <label>In bags</label>
              <input
                type="number"
                value={currentBags}
                disabled
                className="pcx-ev-readonly"
              />
            </div>
            <div className="pcx-ev-field">
              <label htmlFor="ev-removed">Removed</label>
              <input
                id="ev-removed"
                type="number"
                min={0}
                value={newArchived}
                disabled
                className="pcx-ev-readonly"
                onChange={(e) =>
                  setNewArchived(Math.max(0, Number(e.target.value) || 0))
                }
              />
            </div>
          </div>
          {hasChanges && (
            <div className="pcx-ev-delta">
              {delta > 0
                ? `Will add ${fmtInt(delta)} unit${delta === 1 ? "" : "s"}`
                : `Will archive ${fmtInt(Math.abs(delta))} unit${Math.abs(delta) === 1 ? "" : "s"}`}
            </div>
          )}
          {loadedInCampaign && (
            <div className="pcx-ev-warn">
              This variant is loaded into a campaign &mdash; remove it there
              before you can delete or reduce stock.
            </div>
          )}
        </div>
        <footer className="pcx-modal-foot">
          <button
            type="button"
            className="pcx-btn pcx-btn-ghost pcx-btn-danger"
            disabled={loadedInCampaign || saving || currentAvailable <= 0}
            onClick={handleDelete}
          >
            Delete variant
          </button>
          <button
            type="button"
            className="pcx-btn pcx-btn-primary"
            disabled={saving || !hasChanges}
            onClick={handleSave}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </footer>
      </div>
    </div>
  );
}
