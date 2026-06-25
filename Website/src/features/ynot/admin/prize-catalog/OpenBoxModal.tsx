"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CardCatalogItem } from "@/lib/lucky-draw/types";
import { openStockContainer, upsertStockSku } from "./catalog-api";
import { fmtInt } from "./catalog-format";

type StockSkuGroupElement = NonNullable<CardCatalogItem["stockSkuGroups"]>[number];

/** Friendly error messages from the open-container route. */
const FRIENDLY_ERRORS: Record<string, string> = {
  conversion_rule_required:
    "Set which pack this box contains before opening it.",
  not_enough_available_container_stock:
    "Not enough sealed boxes available to open that many.",
  conversion_cross_card_not_allowed:
    "The pack must belong to the same product as the box.",
  invalid_conversion_rule_unit_kind:
    "The linked Sub-SKU must be a sealed-pack type.",
  invalid_open_quantity: "Enter a valid number of boxes to open.",
};

export type OpenBoxTarget = {
  cardId: string;
  cardName: string;
  boxGroup: StockSkuGroupElement;
  /** All Sub-SKU groups on the same card — needed for the conversion-rule setter. */
  allGroups: StockSkuGroupElement[];
};

/**
 * Open sealed boxes into packs.
 *
 * When the box group already has a conversion rule (`childStockSkuId` + `childQuantity`),
 * the modal shows a quantity stepper with live preview and calls `openStockContainer`.
 *
 * When no conversion rule exists, the modal shows an inline setter: pick a pack Sub-SKU
 * from the same card + enter "packs per box", then calls `upsertStockSku` to set the rule.
 * After saving the rule, the user can open boxes in the same modal.
 */
export function OpenBoxModal({
  target,
  onClose,
  onDone,
}: {
  target: OpenBoxTarget;
  onClose: () => void;
  onDone: (msg: string, isError?: boolean) => void;
}) {
  const { cardName, boxGroup, allGroups } = target;
  const modalRef = useRef<HTMLDivElement>(null);

  // Conversion rule state: may be set already or need inline config.
  const [childSkuId, setChildSkuId] = useState<string | null>(
    boxGroup.childStockSkuId ?? null,
  );
  const [packsPerBox, setPacksPerBox] = useState<number>(
    boxGroup.childQuantity ?? 1,
  );
  const hasConversionRule = childSkuId !== null && packsPerBox > 0;

  // Quantity stepper (for opening boxes)
  const availableBoxes = boxGroup.availableUnits;
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");

  // Saving states
  const [savingRule, setSavingRule] = useState(false);
  const [savingOpen, setSavingOpen] = useState(false);

  const saving = savingRule || savingOpen;

  // Pack groups available on the same card (for conversion-rule picker)
  const packGroups = allGroups.filter(
    (g) => (g.unitKind ?? "").toLowerCase() === "pack",
  );

  // Linked pack group (for display)
  const linkedPackGroup = hasConversionRule
    ? allGroups.find((g) => g.stockSkuId === childSkuId) ?? null
    : null;

  const loosePacks = linkedPackGroup?.availableUnits ?? 0;

  // Derive a clamped value at render time instead of setState-in-effect.
  // The stepper handlers already clamp on write; this guards display/payload
  // when availableBoxes shrinks between renders.
  const safeQty = Math.max(1, Math.min(quantity, Math.max(1, availableBoxes)));

  // Preview math (uses safeQty so display stays consistent with clamped bounds)
  const packsGained = safeQty * packsPerBox;
  const potentialPacks =
    hasConversionRule ? availableBoxes * packsPerBox + loosePacks : 0;

  // a11y: Escape closes, focus-in on open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    modalRef.current
      ?.querySelector<HTMLElement>("input, select, button")
      ?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ---- Save conversion rule ----
  const handleSaveRule = useCallback(async () => {
    if (!childSkuId || packsPerBox < 1) return;

    setSavingRule(true);
    const res = await upsertStockSku({
      stockSkuId: boxGroup.stockSkuId ?? undefined,
      cardId: target.cardId,
      sku: boxGroup.sku,
      label: boxGroup.label,
      unitKind: "box",
      childStockSkuId: childSkuId,
      childQuantity: packsPerBox,
    });
    setSavingRule(false);

    if (!res.ok) {
      onDone(res.error, true);
      return;
    }
    onDone("Conversion rule saved. You can now open boxes.");
  }, [childSkuId, packsPerBox, boxGroup, target.cardId, onDone]);

  // ---- Open boxes ----
  const handleOpen = useCallback(async () => {
    if (!hasConversionRule || safeQty < 1 || safeQty > availableBoxes) return;
    if (!boxGroup.stockSkuId) {
      onDone("This box has no stock SKU id.", true);
      return;
    }

    setSavingOpen(true);
    const res = await openStockContainer({
      parentStockSkuId: boxGroup.stockSkuId,
      quantity: safeQty,
      note: note.trim() || undefined,
    });
    setSavingOpen(false);

    if (!res.ok) {
      const friendly = res.code ? FRIENDLY_ERRORS[res.code] : undefined;
      onDone(friendly ?? res.error, true);
      return;
    }
    onDone(
      `Opened ${fmtInt(safeQty)} box${safeQty === 1 ? "" : "es"} into ${fmtInt(packsGained)} pack${packsGained === 1 ? "" : "s"}.`,
    );
  }, [
    hasConversionRule,
    safeQty,
    availableBoxes,
    boxGroup.stockSkuId,
    note,
    packsGained,
    onDone,
  ]);

  return (
    <div
      className="pcx-modal-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="pcx-modal pcx-open-box" role="document" ref={modalRef}>
        <header className="pcx-modal-head">
          <div>
            <h2 className="pcx-modal-title">Open boxes &rarr; packs</h2>
            <p className="pcx-modal-subtitle">
              {cardName} &middot; {boxGroup.label}
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
          {/* Current stock summary */}
          <div className="pcx-ob-summary">
            <div className="pcx-ob-stat">
              <span className="pcx-ob-stat-v">{fmtInt(availableBoxes)}</span>
              <span className="pcx-ob-stat-l">sealed boxes</span>
            </div>
            {hasConversionRule && (
              <>
                <div className="pcx-ob-stat">
                  <span className="pcx-ob-stat-v">{fmtInt(loosePacks)}</span>
                  <span className="pcx-ob-stat-l">
                    packs in stock
                    {linkedPackGroup ? ` (${linkedPackGroup.label})` : ""}
                  </span>
                </div>
                <div className="pcx-ob-stat pcx-ob-stat-potential">
                  <span className="pcx-ob-stat-v">
                    {fmtInt(potentialPacks)}
                  </span>
                  <span className="pcx-ob-stat-l">
                    potential packs if all opened
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Conversion rule setter (shown when no rule exists) */}
          {!hasConversionRule && (
            <div className="pcx-ob-rule-setter">
              <h4 className="pcx-ob-rule-head">
                Set conversion rule
              </h4>
              <p className="pcx-ob-rule-desc">
                Tell us which pack this box contains and how many packs per box.
              </p>
              {packGroups.length === 0 ? (
                <p className="pcx-ob-no-packs">
                  Add a sealed-pack Sub-SKU to this product first.
                </p>
              ) : (
                <div className="pcx-ob-rule-form">
                  <label htmlFor="ob-pack-select">Pack Sub-SKU</label>
                  <select
                    id="ob-pack-select"
                    value={childSkuId ?? ""}
                    onChange={(e) => setChildSkuId(e.target.value || null)}
                    disabled={saving}
                  >
                    <option value="">Select a pack&hellip;</option>
                    {packGroups.map((pg) => (
                      <option key={pg.key} value={pg.stockSkuId ?? ""}>
                        {pg.label} ({fmtInt(pg.availableUnits)} available)
                      </option>
                    ))}
                  </select>

                  <label htmlFor="ob-packs-per-box">Packs per box</label>
                  <input
                    id="ob-packs-per-box"
                    type="number"
                    min={1}
                    value={packsPerBox}
                    onChange={(e) =>
                      setPacksPerBox(Math.max(1, Number(e.target.value) || 1))
                    }
                    disabled={saving}
                  />

                  <button
                    type="button"
                    className="pcx-btn pcx-btn-primary pcx-btn-sm"
                    disabled={saving || !childSkuId || packsPerBox < 1}
                    onClick={handleSaveRule}
                  >
                    {savingRule ? "Saving…" : "Save rule"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Quantity stepper + preview (only when conversion rule exists) */}
          {hasConversionRule && (
            <div className="pcx-ob-stepper">
              <div className="pcx-ob-field">
                <label htmlFor="ob-quantity">Boxes to open</label>
                <div className="pcx-ob-stepper-row">
                  <button
                    type="button"
                    className="pcx-ob-step-btn"
                    disabled={saving || safeQty <= 1}
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    aria-label="Decrease quantity"
                  >
                    &minus;
                  </button>
                  <input
                    id="ob-quantity"
                    type="number"
                    min={1}
                    max={availableBoxes}
                    value={safeQty}
                    onChange={(e) => {
                      const v = Number(e.target.value) || 1;
                      setQuantity(Math.max(1, Math.min(v, availableBoxes)));
                    }}
                    disabled={saving}
                  />
                  <button
                    type="button"
                    className="pcx-ob-step-btn"
                    disabled={saving || safeQty >= availableBoxes}
                    onClick={() =>
                      setQuantity((q) => Math.min(availableBoxes, q + 1))
                    }
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="pcx-ob-preview">
                <div className="pcx-ob-pv-line">
                  Boxes: {fmtInt(availableBoxes)} &rarr;{" "}
                  <strong>{fmtInt(availableBoxes - safeQty)}</strong>
                </div>
                <div className="pcx-ob-pv-line">
                  Packs: {fmtInt(loosePacks)} &rarr;{" "}
                  <strong>{fmtInt(loosePacks + packsGained)}</strong>
                  <span className="pcx-ob-pv-delta">
                    {" "}
                    (+{fmtInt(packsGained)})
                  </span>
                </div>
              </div>

              <div className="pcx-ob-field">
                <label htmlFor="ob-note">Note (optional)</label>
                <input
                  id="ob-note"
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Opened for restock"
                  disabled={saving}
                />
              </div>
            </div>
          )}
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
          {hasConversionRule && (
            <button
              type="button"
              className="pcx-btn pcx-btn-primary"
              disabled={
                saving || safeQty < 1 || safeQty > availableBoxes
              }
              onClick={handleOpen}
            >
              {savingOpen
                ? "Opening…"
                : `Open ${fmtInt(safeQty)} box${safeQty === 1 ? "" : "es"}`}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
