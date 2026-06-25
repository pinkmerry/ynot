"use client";

import type { CardCatalogItem } from "@/lib/lucky-draw/types";
import {
  stockUnitKindLabel,
  stockUnitKindType,
} from "@/features/ynot/stock-sku-presentation";
import { fmtInt } from "./catalog-format";
import { languageLabel } from "./format";

type StockSkuGroupElement = NonNullable<CardCatalogItem["stockSkuGroups"]>[number];

export type VariantAction = {
  onUploadImage?: (group: StockSkuGroupElement) => void;
  onQuickRemove?: (group: StockSkuGroupElement) => void;
  /** Return a disabled-title string when the quick-remove button should be blocked; null/undefined when enabled. */
  quickRemoveDisabledTitle?: (group: StockSkuGroupElement) => string | undefined;
  onEdit?: (group: StockSkuGroupElement) => void;
};

function gradeChipClass(group: StockSkuGroupElement): string {
  const unit = group.units[0];
  if (!unit) return "pcx-grade-chip raw";
  if (unit.condition === "graded") {
    const grade = unit.grade ?? "";
    if (grade === "10") return "pcx-grade-chip g10";
    if (/^9/.test(grade)) return "pcx-grade-chip g9";
    return "pcx-grade-chip graded";
  }
  const kind = stockUnitKindType(group.unitKind);
  if (kind === "box" || kind === "pack") return "pcx-grade-chip sealed";
  return "pcx-grade-chip raw";
}

function gradeChipLabel(group: StockSkuGroupElement): string {
  const unit = group.units[0];
  if (!unit) return "RAW";
  if (unit.condition === "graded") {
    const service = unit.gradingService
      ? unit.gradingService.toUpperCase()
      : "Graded";
    return `${service} ${unit.grade ?? ""}`.trim();
  }
  const kind = stockUnitKindType(group.unitKind);
  if (kind === "box") return "SEALED BOX";
  if (kind === "pack") return "SEALED PACK";
  return "RAW";
}

function certDisplay(group: StockSkuGroupElement): string | null {
  const unit = group.units[0];
  if (!unit || unit.condition !== "graded" || !unit.certNumber) return null;
  return `#${unit.certNumber}`;
}

/**
 * Per-Sub-SKU variant table inside the expanded LedgerRow body.
 * Wired with per-row action buttons: image upload, quick-remove, and edit.
 */
export function VariantTable({
  stockSkuGroups,
  category,
  actions,
}: {
  stockSkuGroups: StockSkuGroupElement[];
  category: string;
  actions?: VariantAction;
}) {
  if (stockSkuGroups.length === 0) {
    return (
      <div className="pcx-empty-note">
        No stock yet &mdash; this card is registered but empty.
      </div>
    );
  }

  const variantNoun = category === "Single Cards" ? "Variant" : "Item";
  const hasActions = actions && (actions.onUploadImage || actions.onQuickRemove || actions.onEdit);

  return (
    <table className="pcx-vtable">
      <thead>
        <tr>
          <th>{variantNoun}</th>
          <th className="num">Available</th>
          <th className="num">In packs</th>
          <th className="num" title="Loaded into live campaigns (incl. units already won)">In bags</th>
          <th className="num">Removed</th>
          <th className="num">Total</th>
          {hasActions && <th className="pcx-va-head">Actions</th>}
        </tr>
      </thead>
      <tbody>
        {stockSkuGroups.map((group) => (
          <VariantRow key={group.key} group={group} actions={actions} hasActions={!!hasActions} />
        ))}
      </tbody>
    </table>
  );
}

function VariantRow({
  group,
  actions,
  hasActions,
}: {
  group: StockSkuGroupElement;
  actions?: VariantAction;
  hasActions: boolean;
}) {
  const available = group.availableUnits;
  const packs = group.reservedUnits;
  const bags = group.allocatedUnits;
  const archived = group.archivedUnits ?? 0;
  const total = available + packs + bags + archived;

  const cert = certDisplay(group);
  const kindType = stockUnitKindType(group.unitKind);
  const kindLabel = stockUnitKindLabel(group.unitKind);
  const groupLanguage = group.units.find((u) => u.language)?.language ?? null;

  return (
    <tr>
      <td>
        <div className="pcx-vname">
          {group.imageUrl && (
            <img className="pcx-v-thumb" src={group.imageUrl} alt="" width={36} height={36} loading="lazy" />
          )}
          <span className={gradeChipClass(group)}>{gradeChipLabel(group)}</span>
          <div className="pcx-vsub">
            <strong>{group.label}</strong>
            {groupLanguage && (
              <span className="pcx-lang-chip" title="Card language">{languageLabel(groupLanguage)}</span>
            )}
            {cert && (
              <span className="pcx-cert">
                <span className="pcx-cert-num">{cert}</span>
              </span>
            )}
            {kindType !== "card" && (
              <span className="pcx-vkind">{kindLabel}</span>
            )}
          </div>
        </div>
      </td>
      <NumCell value={available} state="available" />
      <NumCell value={packs} state="packs" />
      <NumCell value={bags} state="bags" />
      <NumCell value={archived} state="removed" />
      <td className="num">{fmtInt(total)}</td>
      {hasActions && (
        <td className="pcx-va-cell">
          <VariantActions group={group} actions={actions} />
        </td>
      )}
    </tr>
  );
}

function VariantActions({
  group,
  actions,
}: {
  group: StockSkuGroupElement;
  actions?: VariantAction;
}) {
  return (
    <div className="pcx-vactions">
      {actions?.onUploadImage && (
        <button
          type="button"
          className="pcx-icon-btn"
          title={group.imageUrl ? "Replace photo" : "Add photo"}
          onClick={() => actions.onUploadImage?.(group)}
          aria-label={group.imageUrl ? "Replace variant photo" : "Add variant photo"}
        >
          &#x1F4F7;
        </button>
      )}
      {actions?.onQuickRemove && (
        <button
          type="button"
          className="pcx-icon-btn"
          title={actions.quickRemoveDisabledTitle?.(group) ?? "Move 1 to Removed"}
          onClick={() => actions.onQuickRemove?.(group)}
          disabled={group.availableUnits <= 0 || !!actions.quickRemoveDisabledTitle?.(group)}
          aria-label="Quick remove 1 unit"
        >
          &minus;
        </button>
      )}
      {actions?.onEdit && (
        <button
          type="button"
          className="pcx-icon-btn"
          title="Edit stock"
          onClick={() => actions.onEdit?.(group)}
          aria-label="Edit variant stock"
        >
          &#x270E;
        </button>
      )}
    </div>
  );
}

function NumCell({
  value,
  state,
}: {
  value: number;
  state: "available" | "packs" | "bags" | "removed";
}) {
  const cls = value > 0 ? `num ${state}` : "num muted0";
  return <td className={cls}>{fmtInt(value)}</td>;
}
