"use client";

import {
  cardConditionOptions,
  cardGradeOptions,
  cardLanguageOptions,
  gradingServiceOptions,
} from "@/features/ynot/card-catalog-metadata";
import { MpBadge, MpBtn } from "../shared/MpPrimitives";
import { MpIcon } from "../shared/MpIcon";
import { formatThb } from "../shared/money";
import { SellField, SellInput, SellSeg, SellSelect } from "../sell/SellFormFields";
import type { OfficialItemType, StockFormState } from "./stockFormTypes";

/**
 * Pure presentational fields for StockModal, split out to keep that file
 * focused on data/submission logic -- same split as SellForm.tsx/
 * SellIdentityPanel.tsx/SellSummaryRail.tsx.
 *
 * Reuses SellField/SellInput/SellSeg/SellSelect (../sell/SellFormFields)
 * rather than re-inventing them -- those are already the real, in-repo
 * equivalent of the design prototype's SellField/SellInput/SellSeg/
 * SellSelect window globals that marketplace-admin-3.jsx's StockModal
 * (prototype: /Users/pinkmerry/Downloads/ynott/project/
 * marketplace-admin-3.jsx:151-260) references. Options come from
 * card-catalog-metadata.ts (cardConditionOptions/cardLanguageOptions/
 * gradingServiceOptions/cardGradeOptions) -- the SAME catalog options the
 * real "Sell a card" form (marketplace-ui/sell/SellForm.tsx) already uses,
 * except itemType, which is official inventory's own 3-value enum (card |
 * sealed_box | sealed_pack, see OfficialItemType in official-shop.ts) --
 * NOT catalogCategoryOptions' 7-value single_cards/packs/boxes/... slugs,
 * which is a different axis entirely.
 *
 * The prototype's SellUploader has no real equivalent here: official
 * inventory's photoUrls field is an array of already-hosted URL strings
 * (validated server-side to start with "https://" or "/"), not a file
 * upload target -- there is no official-inventory photo upload route in
 * this codebase. So photos are a paste-a-URL-and-add list instead of a
 * dropzone.
 */

const ITEM_TYPE_OPTIONS: { value: OfficialItemType; label: string }[] = [
  { value: "card", label: "Card" },
  { value: "sealed_box", label: "Sealed box" },
  { value: "sealed_pack", label: "Sealed pack" },
];

const MAX_STOCK_PHOTOS = 10;

/**
 * marketplace_update_official_inventory coalesces a blank/missing
 * publicDescription, sourceReferenceId, or procurementNote to the
 * existing stored value (`coalesce(nullif(trim(...), ''), existing)`,
 * see StockModal.tsx's file doc comment) -- clearing one of these three
 * fields in edit mode does not clear it server-side. This hint is the
 * frontend-only mitigation: shown under exactly those three fields, edit
 * mode only.
 */
const KEEP_CURRENT_VALUE_HINT = "Leave blank to keep the current value.";

export interface StockModalFieldsProps {
  form: StockFormState;
  setField: <K extends keyof StockFormState>(key: K, value: StockFormState[K]) => void;
  itemTypeLocked: boolean;
  isEditMode: boolean;
  photoUrlDraft: string;
  setPhotoUrlDraft: (value: string) => void;
  onAddPhotoUrl: () => void;
  onRemovePhotoUrl: (index: number) => void;
}

export function StockModalFields({
  form,
  setField,
  itemTypeLocked,
  isEditMode,
  photoUrlDraft,
  setPhotoUrlDraft,
  onAddPhotoUrl,
  onRemovePhotoUrl,
}: StockModalFieldsProps) {
  const isCard = form.itemType === "card";
  const isGraded = isCard && form.conditionCode === "graded";
  const priceSatang = Math.round((Number(form.priceThb) || 0) * 100);
  const quantityTotal = Number(form.quantityTotal) || 0;
  const conditionBadgeLabel = isCard
    ? isGraded
      ? form.gradeValue || "Graded"
      : form.conditionCode || "Raw"
    : ITEM_TYPE_OPTIONS.find((option) => option.value === form.itemType)?.label ?? form.itemType;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20, alignItems: "start" }}>
      <div className="mp-stack" style={{ gap: 16 }}>
        {/* photos */}
        <div className="mp-stack" style={{ gap: 8 }}>
          <span className="mp-eyebrow">
            Photos · {form.photoUrls.length}/{MAX_STOCK_PHOTOS}
          </span>
          <div className="mp-row" style={{ gap: 8 }}>
            <input
              className="mp-input"
              placeholder="https://... product photo URL"
              aria-label="Photo URL"
              value={photoUrlDraft}
              onChange={(event) => setPhotoUrlDraft(event.target.value)}
              disabled={form.photoUrls.length >= MAX_STOCK_PHOTOS}
            />
            <MpBtn
              size="sm"
              onClick={onAddPhotoUrl}
              disabled={!photoUrlDraft.trim() || form.photoUrls.length >= MAX_STOCK_PHOTOS}
            >
              Add
            </MpBtn>
          </div>
          {form.photoUrls.length > 0 ? (
            <div className="mp-row" style={{ gap: 8, flexWrap: "wrap" }}>
              {form.photoUrls.map((url, index) => (
                <span
                  key={`${url}-${index}`}
                  className="mp-chip"
                  style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  title={url}
                >
                  {index === 0 ? "Cover · " : ""}
                  {url}
                  <button
                    type="button"
                    onClick={() => onRemovePhotoUrl(index)}
                    aria-label={`Remove photo ${index + 1}`}
                    style={{ border: 0, background: "transparent", cursor: "pointer", padding: 0, marginLeft: 6, display: "inline-flex" }}
                  >
                    <MpIcon name="x" size={11} />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <span className="mp-small mp-mute">No photos added yet.</span>
          )}
        </div>

        {/* identity */}
        <div className="mp-stack" style={{ gap: 8 }}>
          <span className="mp-eyebrow">Product details</span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <SellField label="Product name" wide>
              <SellInput
                value={form.title}
                maxLength={240}
                onChange={(event) => setField("title", event.target.value)}
                placeholder="e.g. Booster Box — 36 packs (sealed)"
              />
            </SellField>
            <SellField label="Item type" hint={itemTypeLocked ? "Can't change type after creation." : undefined}>
              {itemTypeLocked ? (
                // SellSelect has no disabled prop (SellFormFields.tsx) --
                // rather than show an interactive-looking control whose
                // edits would silently be dropped (itemType isn't part of
                // OFFICIAL_INVENTORY_UPDATE_FIELDS), render the locked
                // value as plain read-only text.
                <div className="mp-input" style={{ color: "var(--mp-mute)", cursor: "not-allowed" }}>
                  {ITEM_TYPE_OPTIONS.find((option) => option.value === form.itemType)?.label ?? form.itemType}
                </div>
              ) : (
                <SellSelect
                  value={form.itemType}
                  onChange={(value) => setField("itemType", value as OfficialItemType)}
                  options={ITEM_TYPE_OPTIONS}
                />
              )}
            </SellField>
            <SellField label="Set / series" hint="SV-151, OP-09…">
              <SellInput
                value={form.setLabel}
                onChange={(event) => setField("setLabel", event.target.value)}
                placeholder="SV-151"
              />
            </SellField>
            <SellField label="Language">
              <SellSelect
                value={form.language}
                onChange={(value) => setField("language", value)}
                options={cardLanguageOptions}
              />
            </SellField>
          </div>
        </div>

        {/* condition (cards only) */}
        {isCard ? (
          <div className="mp-stack" style={{ gap: 10 }}>
            <span className="mp-eyebrow">Condition &amp; grade</span>
            <SellSeg
              value={form.conditionCode}
              onChange={(value) => setField("conditionCode", value as StockFormState["conditionCode"])}
              options={cardConditionOptions}
            />
            {isGraded ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <SellField label="Grading service">
                  <SellSelect
                    value={form.gradeService}
                    onChange={(value) => setField("gradeService", value)}
                    options={gradingServiceOptions}
                  />
                </SellField>
                <SellField label="Grade">
                  <SellSelect
                    value={form.gradeValue}
                    onChange={(value) => setField("gradeValue", value)}
                    options={cardGradeOptions.map((grade) => ({ value: grade, label: grade }))}
                    placeholder="Select grade…"
                  />
                </SellField>
                <SellField label="Cert number">
                  <SellInput
                    value={form.certNumber}
                    onChange={(event) => setField("certNumber", event.target.value)}
                    placeholder="82114307"
                  />
                </SellField>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* sourcing */}
        <div className="mp-stack" style={{ gap: 8 }}>
          <span className="mp-eyebrow">Sourcing (internal)</span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <SellField
              label="Source reference"
              hint={
                isEditMode
                  ? `Supplier invoice / PO number. ${KEEP_CURRENT_VALUE_HINT}`
                  : "Supplier invoice / PO number"
              }
            >
              <SellInput
                value={form.sourceReferenceId}
                onChange={(event) => setField("sourceReferenceId", event.target.value)}
                placeholder="PO-2026-0142"
              />
            </SellField>
          </div>
          <label className="mp-stack" style={{ gap: 6 }}>
            <span className="mp-rail-label" style={{ color: "var(--mp-mute)" }}>
              Procurement note
            </span>
            <textarea
              className="mp-textarea"
              rows={2}
              maxLength={1000}
              value={form.procurementNote}
              onChange={(event) => setField("procurementNote", event.target.value)}
            />
            {isEditMode ? <span className="mp-small mp-mute">{KEEP_CURRENT_VALUE_HINT}</span> : null}
          </label>
          <label className="mp-stack" style={{ gap: 6 }}>
            <span className="mp-rail-label" style={{ color: "var(--mp-mute)" }}>
              Public description
            </span>
            <textarea
              className="mp-textarea"
              rows={2}
              maxLength={1000}
              value={form.publicDescription}
              onChange={(event) => setField("publicDescription", event.target.value)}
            />
            {isEditMode ? <span className="mp-small mp-mute">{KEEP_CURRENT_VALUE_HINT}</span> : null}
          </label>
        </div>
      </div>

      {/* right: price + qty + preview */}
      <div className="mp-stack" style={{ gap: 12 }}>
        <div className="mp-panel" style={{ display: "flex", flexDirection: "column", gap: 10, padding: 16 }}>
          <span className="mp-eyebrow">Price &amp; stock</span>
          <div
            className="mp-row"
            style={{ gap: 10, border: "1px solid var(--mp-line-strong)", borderRadius: 10, padding: "8px 12px" }}
          >
            <span className="mp-mono" style={{ fontWeight: 800, fontSize: 17, color: "var(--mp-mute)" }}>
              ฿
            </span>
            <input
              value={form.priceThb}
              onChange={(event) => setField("priceThb", event.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="0"
              inputMode="decimal"
              aria-label="Price in Thai baht"
              style={{
                border: 0,
                outline: 0,
                background: "transparent",
                font: "inherit",
                fontFamily: "var(--mp-mono)",
                fontWeight: 800,
                fontSize: 19,
                width: "100%",
                color: "var(--mp-ink)",
              }}
            />
          </div>
          <div className="mp-row" style={{ gap: 10 }}>
            <span className="mp-small" style={{ fontWeight: 700 }}>
              Quantity
            </span>
            <span className="mp-spacer" />
            <input
              value={form.quantityTotal}
              onChange={(event) => setField("quantityTotal", event.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric"
              aria-label="Quantity"
              className="mp-input"
              style={{ width: 70, textAlign: "right", fontFamily: "var(--mp-mono)", fontWeight: 700 }}
            />
          </div>
          <span className="mp-small mp-mute">No seller fee — official sales are 100% revenue.</span>
        </div>

        <div className="mp-stack" style={{ gap: 6 }}>
          <span className="mp-eyebrow">Preview</span>
          <div className="mp-card">
            <div className="mp-card-art">
              {form.photoUrls[0] ? (
                // eslint-disable-next-line @next/next/no-img-element -- admin-entered remote URL, not a Next-optimizable local asset
                <img
                  src={form.photoUrls[0]}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <span className="ph">[ cover photo ]</span>
              )}
              <span className="corner">
                <MpBadge kind="official">Official</MpBadge>
              </span>
            </div>
            <div className="mp-card-body">
              <span className="mp-card-set">{form.setLabel || "Set · Series"}</span>
              <span className="mp-card-title" style={{ fontSize: 12.5 }}>
                {form.title || "Product name"}
              </span>
              <span className="mp-card-meta">
                {conditionBadgeLabel}
                {quantityTotal > 1 ? ` · ${quantityTotal} in stock` : ""}
              </span>
              <div className="mp-card-foot">
                <span className="mp-price">
                  <span className="coins">{priceSatang ? formatThb(priceSatang) : "—"}</span>
                </span>
                <span className="mp-seller-mini">
                  <MpIcon name="shield" size={12} /> YNOTT Shop
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
