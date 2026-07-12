"use client";

import { useEffect, useState } from "react";
import { MpBtn } from "../shared/MpPrimitives";
import { MpIcon } from "../shared/MpIcon";
import { StockModalFields } from "./StockModalFields";
import {
  BLANK_STOCK_FORM,
  type OfficialItemType,
  type StockConditionCode,
  type StockFormState,
} from "./stockFormTypes";

/**
 * Official stock add/edit/restock modal. Visual chrome (overlay + modal
 * shell) mirrors SlipModal.tsx's own raw .mpa-overlay/.mpa-modal markup --
 * there is no shared MpaModal wrapper component in this codebase yet (the
 * design prototype's MpaModal, marketplace-admin-3.jsx:9-25, was never
 * extracted into one), so this follows the same pattern rather than
 * introducing a new shared abstraction outside this task's scope. Fields
 * layout is StockModalFields.tsx; this file owns mode handling, the detail
 * fetch, form state, and the create/PATCH submission.
 *
 * Three real modes, all opened by StockActions.tsx via next/dynamic
 * ssr:false (same reasoning as OrderActions' SlipModal: purely
 * interaction-gated, only ever rendered after a click):
 *
 *  - create (blank):    POST /api/marketplace/admin/official-inventory
 *                        allowedFields = CREATE_FIELDS (official-shop.ts
 *                        route.ts) = itemType/title/conditionCode/
 *                        quantityTotal/itemPriceSatang/publicDescription/
 *                        photoUrls/referenceSnapshot/sourceReferenceId/
 *                        procurementNote/adminNote (adminNote optional).
 *  - create (prefilled, "Restock"): same POST/CREATE_FIELDS contract, form
 *                        pre-populated by fetching the sold-out row's own
 *                        detail first. This is NOT an edit-in-place --
 *                        marketplace_update_official_inventory AND
 *                        marketplace_archive_official_inventory both
 *                        unconditionally reject item_state IN ('sold',
 *                        'archived') (20260628150000_marketplace_official_
 *                        admin_controls.sql:254,665), so a fully sold-out
 *                        row can never be PATCHed or archived again --
 *                        "restocking" a sold-out item for real means
 *                        creating a fresh inventory row, which is exactly
 *                        what this mode does (minus quantity/adminNote,
 *                        which reset to a blank slate for the new batch).
 *  - edit:               PATCH /api/marketplace/admin/official-inventory/
 *                        [inventoryId], allowedFields = exactly
 *                        OFFICIAL_INVENTORY_UPDATE_FIELDS -- notably NOT
 *                        itemType (immutable after creation) and WITH a
 *                        REQUIRED adminNote (normalizeOfficialInventoryUpdateInput
 *                        uses textField, not optionalTextField, and the RPC
 *                        raises marketplace_admin_note_required otherwise --
 *                        unlike create's optional adminNote). Every
 *                        edit/archive adminNote is appended to a running
 *                        log server-side (`concat_ws(E'\n', existing,
 *                        new)`, official_admin_controls.sql:319,333), not a
 *                        replaceable "current value" -- so unlike the
 *                        Fees & settings note, this one always starts
 *                        blank rather than prefilled from the last note.
 *
 * Every optional PATCH field the server accepts is sent on every edit save
 * (not diffed against the loaded detail, unlike FeesSettingsForm) --
 * marketplace_update_official_inventory coalesces a missing/empty scalar
 * field to its existing value either way (`coalesce(nullif(trim(...), ''),
 * existing)`), so sending the full current form state is exactly as safe
 * as diffing and a lot simpler. That same coalesce means clearing
 * publicDescription/sourceReferenceId/procurementNote to blank in edit
 * mode silently keeps the old value instead of clearing it -- isEditMode
 * (passed to StockModalFields below) renders a "Leave blank to keep the
 * current value." hint under exactly those three fields so this isn't a
 * surprise. Frontend-only mitigation: no RPC/behavior change here.
 */

export type StockModalMode =
  | { kind: "create"; prefillFromInventoryId?: string }
  | { kind: "edit"; inventoryId: string };

export interface StockModalProps {
  mode: StockModalMode;
  onClose: () => void;
  onSaved: () => void;
}

interface DetailInventory {
  item_type: OfficialItemType;
  title_snapshot: string;
  condition_code: string | null;
  reference_snapshot: Record<string, unknown> | null;
  quantity_total: number;
  item_price_satang: number;
  public_description: string | null;
  photo_urls: string[] | null;
  version: number;
}

interface DetailSource {
  source_reference_id: string | null;
  procurement_note: string | null;
}

interface OfficialInventoryDetailPayload {
  inventory: DetailInventory;
  source: DetailSource | null;
}

type LoadState =
  | { kind: "ready" }
  | { kind: "loading" }
  | { kind: "error"; message: string };

type SubmitStatus = { kind: "idle" } | { kind: "busy" } | { kind: "error"; message: string };

function nextIdempotencyKey(scope: string) {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `marketplace:admin:${scope}:${suffix}`;
}

function thbInputFor(satang: number) {
  return (satang / 100).toFixed(2).replace(/\.00$/, "");
}

function thbInputToSatang(value: string): number | null {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

function positiveIntInput(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return parsed >= 1 ? parsed : null;
}

function readSnapshotString(snapshot: Record<string, unknown>, key: string) {
  return typeof snapshot[key] === "string" ? (snapshot[key] as string) : "";
}

function formFromDetail(detail: OfficialInventoryDetailPayload, isRestock: boolean): StockFormState {
  const snapshot = detail.inventory.reference_snapshot ?? {};
  const conditionCode = detail.inventory.condition_code;
  const normalizedCondition: StockConditionCode =
    conditionCode === "sealed" || conditionCode === "graded" ? conditionCode : "raw";
  return {
    itemType: detail.inventory.item_type,
    title: detail.inventory.title_snapshot,
    conditionCode: normalizedCondition,
    setLabel: readSnapshotString(snapshot, "setLabel"),
    language: readSnapshotString(snapshot, "language") || "english",
    gradeService: readSnapshotString(snapshot, "gradeService") || "psa",
    gradeValue: readSnapshotString(snapshot, "gradeValue"),
    certNumber: readSnapshotString(snapshot, "certNumber"),
    priceThb: thbInputFor(detail.inventory.item_price_satang),
    quantityTotal: isRestock ? "1" : String(detail.inventory.quantity_total),
    publicDescription: detail.inventory.public_description ?? "",
    photoUrls: detail.inventory.photo_urls ?? [],
    sourceReferenceId: detail.source?.source_reference_id ?? "",
    procurementNote: detail.source?.procurement_note ?? "",
    adminNote: "",
  };
}

function buildReferenceSnapshot(form: StockFormState): Record<string, string> {
  const isGraded = form.itemType === "card" && form.conditionCode === "graded";
  const entries: [string, string][] = [
    ["setLabel", form.setLabel.trim()],
    ["language", form.language],
  ];
  if (isGraded) {
    entries.push(
      ["gradeService", form.gradeService],
      ["gradeValue", form.gradeValue],
      ["certNumber", form.certNumber.trim()],
    );
  }
  return Object.fromEntries(entries.filter(([, value]) => value !== ""));
}

function buildRequestBody(
  mode: StockModalMode,
  form: StockFormState,
  expectedVersion: number | null,
): { ok: true; body: Record<string, unknown> } | { ok: false; error: string } {
  const title = form.title.trim();
  if (!title) return { ok: false, error: "Enter a product name." };
  const itemPriceSatang = thbInputToSatang(form.priceThb);
  if (itemPriceSatang === null) return { ok: false, error: "Enter a valid price." };
  const quantityTotal = positiveIntInput(form.quantityTotal);
  if (quantityTotal === null) {
    return { ok: false, error: "Enter a valid quantity (whole number, at least 1)." };
  }
  const isCard = form.itemType === "card";
  if (isCard && form.conditionCode === "graded" && !form.gradeValue) {
    return { ok: false, error: "Select a grade." };
  }

  const shared: Record<string, unknown> = {
    title,
    conditionCode: isCard ? form.conditionCode : undefined,
    quantityTotal,
    itemPriceSatang,
    publicDescription: form.publicDescription.trim(),
    photoUrls: form.photoUrls,
    referenceSnapshot: buildReferenceSnapshot(form),
    sourceReferenceId: form.sourceReferenceId.trim(),
    procurementNote: form.procurementNote.trim(),
  };

  if (mode.kind === "create") {
    return {
      ok: true,
      body: { itemType: form.itemType, ...shared, adminNote: form.adminNote.trim() || undefined },
    };
  }

  if (!form.adminNote.trim()) {
    return { ok: false, error: "Add a note describing this change." };
  }
  return {
    ok: true,
    body: { expectedVersion, ...shared, adminNote: form.adminNote.trim() },
  };
}

export function StockModal({ mode, onClose, onSaved }: StockModalProps) {
  const [form, setForm] = useState<StockFormState>(BLANK_STOCK_FORM);
  const [expectedVersion, setExpectedVersion] = useState<number | null>(null);
  const [loadState, setLoadState] = useState<LoadState>(
    mode.kind === "edit" || mode.prefillFromInventoryId ? { kind: "loading" } : { kind: "ready" },
  );
  const [status, setStatus] = useState<SubmitStatus>({ kind: "idle" });
  const [photoUrlDraft, setPhotoUrlDraft] = useState("");

  // A "create" mode only ever carries prefillFromInventoryId for the
  // Restock entry point (plain "Add stock" passes no prefill target at
  // all) -- isRestock is only read once prefillId has already gated this
  // effect to one of those two real prefill scenarios.
  const isRestock = mode.kind === "create";
  const prefillId = mode.kind === "edit" ? mode.inventoryId : mode.prefillFromInventoryId;

  useEffect(() => {
    if (!prefillId) return;
    // No mid-lifecycle reset needed here either (see SlipModal.tsx): both
    // StockModal call sites (AddStockButton, StockActions) only ever mount
    // this component while a modal-open state is truthy, so mode/prefillId
    // is fixed for the component's whole lifetime and the useState
    // initializer above already starts this mount at { kind: "loading" }.
    let cancelled = false;
    fetch(`/api/marketplace/admin/official-inventory/${prefillId}`, { cache: "no-store" })
      .then(async (response) => {
        if (cancelled) return;
        const payload = (await response.json().catch(() => null)) as
          | { ok?: boolean; detail?: OfficialInventoryDetailPayload; error?: string }
          | null;
        if (!response.ok || !payload?.ok || !payload.detail) {
          setLoadState({ kind: "error", message: payload?.error ?? "Could not load this item." });
          return;
        }
        setForm(formFromDetail(payload.detail, isRestock));
        setExpectedVersion(payload.detail.inventory.version);
        setLoadState({ kind: "ready" });
      })
      .catch(() => {
        if (!cancelled) setLoadState({ kind: "error", message: "Network error. Try again." });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prefillId alone identifies the fetch target
  }, [prefillId]);

  function setField<K extends keyof StockFormState>(key: K, value: StockFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function addPhotoUrl() {
    const trimmed = photoUrlDraft.trim();
    if (!trimmed || form.photoUrls.length >= 10) return;
    if (!trimmed.startsWith("https://") && !trimmed.startsWith("/")) {
      setStatus({ kind: "error", message: "Photo URLs must start with https:// or /." });
      return;
    }
    setForm((current) => ({ ...current, photoUrls: [...current.photoUrls, trimmed] }));
    setPhotoUrlDraft("");
  }

  function removePhotoUrl(index: number) {
    setForm((current) => ({
      ...current,
      photoUrls: current.photoUrls.filter((_, photoIndex) => photoIndex !== index),
    }));
  }

  async function submit() {
    const result = buildRequestBody(mode, form, expectedVersion);
    if (!result.ok) {
      setStatus({ kind: "error", message: result.error });
      return;
    }
    setStatus({ kind: "busy" });
    try {
      const endpoint =
        mode.kind === "edit"
          ? `/api/marketplace/admin/official-inventory/${mode.inventoryId}`
          : "/api/marketplace/admin/official-inventory";
      const response = await fetch(endpoint, {
        method: mode.kind === "edit" ? "PATCH" : "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": nextIdempotencyKey(mode.kind === "edit" ? "stock-update" : "stock-create"),
        },
        body: JSON.stringify(result.body),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!response.ok || !payload?.ok) {
        if (response.status === 401) {
          setStatus({ kind: "error", message: "Login is required. Refresh and sign back in." });
          return;
        }
        setStatus({ kind: "error", message: payload?.error ?? "That action could not be completed." });
        return;
      }
      onSaved();
      onClose();
    } catch {
      setStatus({ kind: "error", message: "Network error. Try again." });
    }
  }

  const title =
    mode.kind === "edit" ? "Edit official stock" : mode.prefillFromInventoryId ? "Restock official stock" : "Add official stock";

  return (
    <div className="mpa-overlay" onClick={onClose}>
      <div className="mpa-modal" style={{ maxWidth: 880 }} onClick={(event) => event.stopPropagation()}>
        <div className="mp-row" style={{ marginBottom: 16 }}>
          <div className="mp-stack" style={{ gap: 2 }}>
            <h2 className="mp-h2" style={{ fontSize: 18 }}>
              {title}
            </h2>
            <span className="mp-small mp-mute mp-mono">
              Sold by YNOTT Shop · pinned on top of card pages · no seller fee
            </span>
          </div>
          <span className="mp-spacer" />
          <button
            type="button"
            className="mp-icon-btn"
            onClick={onClose}
            aria-label="Close official stock editor"
          >
            <MpIcon name="x" size={15} />
          </button>
        </div>

        {loadState.kind === "loading" ? <p className="mp-small mp-mute">Loading item…</p> : null}
        {loadState.kind === "error" ? (
          <p className="mp-alert mp-alert-rose mp-small">{loadState.message}</p>
        ) : null}

        {loadState.kind === "ready" ? (
          <>
            <StockModalFields
              form={form}
              setField={setField}
              itemTypeLocked={mode.kind === "edit"}
              isEditMode={mode.kind === "edit"}
              photoUrlDraft={photoUrlDraft}
              setPhotoUrlDraft={setPhotoUrlDraft}
              onAddPhotoUrl={addPhotoUrl}
              onRemovePhotoUrl={removePhotoUrl}
            />

            <label className="mp-stack" style={{ gap: 6, marginTop: 16 }}>
              <span className="mp-rail-label" style={{ color: "var(--mp-mute)" }}>
                Admin note {mode.kind === "edit" ? "(required)" : "(optional)"}
              </span>
              <textarea
                className="mp-textarea"
                rows={2}
                maxLength={1000}
                placeholder={
                  mode.kind === "edit" ? "Describe this change for the record" : "Note for the record (optional)"
                }
                value={form.adminNote}
                onChange={(event) => setField("adminNote", event.target.value)}
              />
            </label>

            {status.kind === "error" ? (
              <p className="mp-alert mp-alert-rose mp-small" style={{ marginTop: 10 }}>
                {status.message}
              </p>
            ) : null}

            <div className="mp-row" style={{ gap: 8, marginTop: 16 }}>
              <MpBtn
                variant="primary"
                onClick={submit}
                disabled={status.kind === "busy"}
                style={{ flex: 1 }}
              >
                {status.kind === "busy"
                  ? "Saving…"
                  : mode.kind === "edit"
                    ? "Save changes"
                    : "Add to shop"}
              </MpBtn>
              <MpBtn onClick={onClose} disabled={status.kind === "busy"}>
                Cancel
              </MpBtn>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
