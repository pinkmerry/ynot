"use client";

import type { ReactNode } from "react";
import type { CardCatalogItem } from "@/lib/lucky-draw/types";
import type { AdminCardCatalogRow } from "@/features/ynot/admin-card-catalog-helpers";
import type { YnotCampaign } from "@/features/ynot/types";
import { fmtInt, toStockBuckets, unitNoun } from "./catalog-format";
import { isVariantLoadedInCampaign } from "./variant-guards";
import { VariantTable, type VariantAction } from "./VariantTable";
import { CampaignPrizesSection } from "./CampaignPrizesSection";

type StockSkuGroupElement = NonNullable<CardCatalogItem["stockSkuGroups"]>[number];

export function LedgerRow({
  row,
  open,
  onToggle,
  onEdit,
  onDelete,
  onAddStock,
  onVariantUploadImage,
  onVariantQuickRemove,
  onVariantEdit,
  onMainImageUpload,
  onOpenBox,
  campaigns,
}: {
  row: AdminCardCatalogRow;
  open: boolean;
  onToggle: () => void;
  onEdit?: (row: AdminCardCatalogRow) => void;
  onDelete?: (row: AdminCardCatalogRow) => void;
  onAddStock?: (row: AdminCardCatalogRow) => void;
  onVariantUploadImage?: (row: AdminCardCatalogRow, group: StockSkuGroupElement) => void;
  onVariantQuickRemove?: (row: AdminCardCatalogRow, group: StockSkuGroupElement) => void;
  onVariantEdit?: (row: AdminCardCatalogRow, group: StockSkuGroupElement) => void;
  onMainImageUpload?: (row: AdminCardCatalogRow) => void;
  onOpenBox?: (row: AdminCardCatalogRow, boxGroup: StockSkuGroupElement) => void;
  campaigns: YnotCampaign[];
}) {
  function buildVariantActions(r: AdminCardCatalogRow): VariantAction | undefined {
    if (!onVariantUploadImage && !onVariantQuickRemove && !onVariantEdit) return undefined;
    return {
      onUploadImage: onVariantUploadImage
        ? (group: StockSkuGroupElement) => onVariantUploadImage(r, group)
        : undefined,
      onQuickRemove: onVariantQuickRemove
        ? (group: StockSkuGroupElement) => onVariantQuickRemove(r, group)
        : undefined,
      quickRemoveDisabledTitle: onVariantQuickRemove
        ? (group: StockSkuGroupElement) =>
            isVariantLoadedInCampaign(group, r.prizes)
              ? "Loaded in campaign — remove it there first"
              : undefined
        : undefined,
      onEdit: onVariantEdit
        ? (group: StockSkuGroupElement) => onVariantEdit(r, group)
        : undefined,
    };
  }

  const b = toStockBuckets(row);
  const cat = String(row.card.catalogCategory ?? "Single Cards");
  const catClass =
    cat === "Sealed Boxes" ? " is-box" : cat === "Sealed Packs" ? " is-pack" : "";

  const seg = (k: "available" | "packs" | "bags" | "removed") =>
    b.total > 0 ? `${(b[k] / b.total) * 100}%` : "0%";

  return (
    <div
      className={`pcx-lrow${catClass}${open ? " open" : ""}`}
      data-id={row.card.catalogCardId}
    >
      <div
        className="pcx-lhead"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        aria-expanded={open}
      >
        <Thumb
          name={row.card.name}
          code={row.card.code ?? ""}
          image={row.card.photoUrl ?? null}
          category={cat}
        />
        <div className="pcx-lid">
          <div className="pcx-name">
            {row.card.name}{" "}
            <span className={`pcx-cat-chip ${chipClass(cat)}`}>{cat}</span>
          </div>
          <div className="pcx-meta">
            <span className="pcx-code">{row.card.code ?? ""}</span>
            <span>&middot;</span>
            <span>
              {row.card.series ?? ""} &middot;{" "}
              {row.card.releaseYear ?? "—"} &middot;{" "}
              {row.card.cardSet ?? "—"}
            </span>
          </div>
          <div className="pcx-rollup">
            <span className="pcx-sbar">
              <i
                style={{
                  width: seg("available"),
                  background: "var(--pcx-available)",
                }}
              />
              <i
                style={{
                  width: seg("packs"),
                  background: "var(--pcx-packs)",
                }}
              />
              <i
                style={{
                  width: seg("bags"),
                  background: "var(--pcx-bags)",
                }}
              />
              <i
                style={{
                  width: seg("removed"),
                  background: "var(--pcx-removed)",
                }}
              />
            </span>
            <span className="pcx-rollup-nums">
              <Num
                color="var(--pcx-available)"
                v={b.available}
                label="available"
              />
              <Num
                color="var(--pcx-packs)"
                v={b.packs}
                label="in packs"
              />
              <Num
                color="var(--pcx-bags)"
                v={b.bags}
                label="in bags"
              />
              {b.removed > 0 && (
                <Num
                  color="var(--pcx-removed)"
                  v={b.removed}
                  label="removed"
                />
              )}
            </span>
          </div>
        </div>
        <div className="pcx-lhead-right">
          <div className="pcx-total">
            <div className="pcx-total-v">{fmtInt(b.available)}</div>
            <div className="pcx-total-l">{unitNoun(cat)} free</div>
          </div>
          <div className="pcx-row-actions">
            {onAddStock && (
              <button
                type="button"
                className="pcx-row-btn pcx-row-btn-add"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddStock(row);
                }}
                aria-label={`Add stock to ${row.card.name}`}
              >
                + Add stock
              </button>
            )}
            {onEdit && (
              <button
                type="button"
                className="pcx-row-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(row);
                }}
                aria-label={`Edit ${row.card.name}`}
              >
                Edit
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                className="pcx-row-btn danger"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(row);
                }}
                aria-label={`Delete ${row.card.name}`}
              >
                Delete
              </button>
            )}
          </div>
          <span className="pcx-caret" aria-hidden>
            &#x203A;
          </span>
        </div>
      </div>
      {open && (
        <div className="pcx-lbody">
          <DetailGrid
            card={row.card}
            onMainImageUpload={onMainImageUpload ? () => onMainImageUpload(row) : undefined}
          />
          <div className="pcx-detail-sec">
            <div className="pcx-sec-head">
              <h5>
                {cat === "Single Cards"
                  ? "Variants in stock"
                  : "Stock"}
              </h5>
              <span className="pcx-sh-meta">
                {(row.card.stockSkuGroups ?? []).length}{" "}
                {cat === "Single Cards"
                  ? `variant${(row.card.stockSkuGroups ?? []).length === 1 ? "" : "s"}`
                  : "line"}{" "}
                &middot; {fmtInt(b.available)} {unitNoun(cat)} available now
              </span>
            </div>
            <VariantTable
              stockSkuGroups={row.card.stockSkuGroups ?? []}
              category={cat}
              actions={buildVariantActions(row)}
            />
          </div>
          <BoxPanel
            row={row}
            groups={row.card.stockSkuGroups ?? []}
            onOpenBox={onOpenBox}
          />
          {cat !== "Sealed Boxes" && (
            <CampaignPrizesSection
              prizes={row.prizes}
              campaigns={campaigns}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Num({
  color,
  v,
  label,
}: {
  color: string;
  v: number;
  label: string;
}) {
  return (
    <span className="pcx-rn">
      <span className="pcx-dot" style={{ background: color }} />
      <b style={{ color }}>{fmtInt(v)}</b>
      <span>{label}</span>
    </span>
  );
}

function Thumb({
  name,
  code,
  image,
  category,
}: {
  name: string;
  code: string;
  image: string | null;
  category: string;
}): ReactNode {
  const isSealed = category !== "Single Cards";
  const sealClass = isSealed ? " seal" : "";
  const thumbW = 56;
  const thumbH = isSealed ? 56 : 72;
  if (image) {
    return (
      <span className={`pcx-thumb${sealClass}`}>
        <img src={image} alt={name} width={thumbW} height={thumbH} loading="lazy" />
      </span>
    );
  }
  return (
    <span className={`pcx-thumb${sealClass}`}>
      <span className="pcx-ph-code">{code}</span>
    </span>
  );
}

function DetailGrid({
  card,
  onMainImageUpload,
}: {
  card: AdminCardCatalogRow["card"];
  onMainImageUpload?: () => void;
}) {
  const cells: Array<[string, string]> = [
    ["Model code", card.modelCode ?? card.code ?? "—"],
    ["Card number", card.cardNumber ?? "—"],
    ["Release year", card.releaseYear != null ? String(card.releaseYear) : "—"],
    ["Set", card.cardSet ?? "—"],
    ["Category", String(card.catalogCategory ?? "Single Cards")],
  ];
  return (
    <div className="pcx-detail-grid">
      {cells.map(([label, value]) => (
        <div key={label} className="pcx-di">
          <div className="pcx-dl">{label}</div>
          <div className="pcx-dv">{value}</div>
        </div>
      ))}
      {onMainImageUpload && (
        <div className="pcx-di pcx-di-action">
          <button
            type="button"
            className="pcx-btn pcx-btn-sm"
            onClick={onMainImageUpload}
            aria-label={card.photoUrl ? "Replace card image" : "Add card image"}
          >
            {card.photoUrl ? "Replace card image" : "Add card image"}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Box → pack panel: shown in expanded detail when any Sub-SKU group has `unitKind === "box"`.
 * Displays sealed box count, linked pack count, potential packs preview, and an "Open boxes" button.
 */
function BoxPanel({
  row,
  groups,
  onOpenBox,
}: {
  row: AdminCardCatalogRow;
  groups: StockSkuGroupElement[];
  onOpenBox?: (row: AdminCardCatalogRow, boxGroup: StockSkuGroupElement) => void;
}) {
  const boxGroups = groups.filter(
    (g) => (g.unitKind ?? "").toLowerCase() === "box",
  );
  if (boxGroups.length === 0) return null;

  return (
    <>
      {boxGroups.map((boxGroup) => {
        const hasRule =
          boxGroup.childStockSkuId != null && (boxGroup.childQuantity ?? 0) > 0;
        const linkedPack = hasRule
          ? groups.find((g) => g.stockSkuId === boxGroup.childStockSkuId) ?? null
          : null;
        const loosePacks = linkedPack?.availableUnits ?? 0;
        const packsPerBox = boxGroup.childQuantity ?? 0;
        const potentialPacks =
          hasRule ? boxGroup.availableUnits * packsPerBox + loosePacks : 0;

        return (
          <div key={boxGroup.key} className="pcx-detail-sec pcx-box-panel">
            <div className="pcx-sec-head">
              <h5>Box &rarr; pack</h5>
              <span className="pcx-sh-meta">{boxGroup.label}</span>
            </div>
            <div className="pcx-box-stats">
              <div className="pcx-box-stat">
                <span className="pcx-box-stat-v">
                  {fmtInt(boxGroup.availableUnits)}
                </span>
                <span className="pcx-box-stat-l">sealed boxes</span>
              </div>
              {hasRule && (
                <>
                  <div className="pcx-box-stat">
                    <span className="pcx-box-stat-v">
                      {fmtInt(loosePacks)}
                    </span>
                    <span className="pcx-box-stat-l">
                      packs ({linkedPack?.label ?? boxGroup.childLabel ?? "linked"})
                    </span>
                  </div>
                  <div className="pcx-box-stat pcx-box-stat-potential">
                    <span className="pcx-box-stat-v">
                      {fmtInt(potentialPacks)}
                    </span>
                    <span className="pcx-box-stat-l">
                      potential packs if all opened
                    </span>
                  </div>
                </>
              )}
              {!hasRule && (
                <div className="pcx-box-stat pcx-box-stat-warn">
                  <span className="pcx-box-stat-l">
                    No conversion rule set
                  </span>
                </div>
              )}
            </div>
            {onOpenBox && (
              <button
                type="button"
                className="pcx-btn pcx-btn-primary pcx-btn-sm"
                onClick={() => onOpenBox(row, boxGroup)}
              >
                Open boxes &rarr; packs
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}

function chipClass(cat: string) {
  return cat === "Sealed Boxes"
    ? "box"
    : cat === "Sealed Packs"
      ? "pack"
      : "card";
}
