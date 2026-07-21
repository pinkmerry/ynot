"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { MpBtn, MpPanel, MpToasts, useToasts } from "../shared/MpPrimitives";
import { MpIcon } from "../shared/MpIcon";
import { formatThb } from "../shared/money";
import {
  createSellPhotos,
  MAX_SELL_PHOTOS,
  PhotoUploader,
  type SellPhoto,
} from "./PhotoUploader";
import { SellIdentityPanel } from "./SellIdentityPanel";
import { SellSummaryRail } from "./SellSummaryRail";
import type { SellCatalogOptions, SellFieldValues, SellPayoutPreview } from "./sellFormTypes";

/**
 * Marketplace "Sell a card" form — visual redesign of MarketplaceSellerClient
 * (src/features/ynot/MarketplaceSellerClient.tsx), styled after the design
 * prototype's ProtoSell (/Users/pinkmerry/Downloads/ynott/project/
 * marketplace-proto-3.jsx:93-265). Split across this file (data + submission
 * flow) plus SellIdentityPanel (card-details/condition panels) and
 * SellSummaryRail (live preview + price + payout) to stay under file-size
 * budget; PhotoUploader owns the photo picker.
 *
 * Reuses the EXACT existing contracts (see MarketplaceSellerClient for the
 * originals):
 *  - terms:   POST /api/marketplace/seller/terms
 *  - create:  POST /api/marketplace/seller/submissions
 *             (SELLER_SUBMISSION_FIELDS payload, "idempotency-key" header)
 *  - photos:  POST /api/marketplace/seller/submissions/{id}/photos
 *             multipart field name "sellerPhoto" (see
 *             src/app/api/ynot/marketplace/seller/submissions/[submissionId]/photos/route.ts
 *             getSellerPhotoFile(): form.get("sellerPhoto") ?? form.get("photo"))
 *  - preview: POST /api/marketplace/seller/payout-preview
 *             { askingPriceSatang } -> { preview: { sellerMarketplaceFeeSatang,
 *             sellerPayoutSatang, ... } } (server fee/net only, no hardcoded %)
 *  - detail:  GET  /api/marketplace/seller/submissions/{id}  (edit prefill)
 *
 * The prototype's cert autofill button (proto lines ~196-208) is intentionally
 * CUT — graded cards keep a plain cert-number text input with no autofill
 * affordance and no lookup network request.
 *
 * Edit mode (?submission=ID): there is NO update/PATCH route for seller
 * submissions in this codebase (confirmed against every route file under
 * src/app/api/ynot/marketplace/seller/submissions/ and against the seller
 * consignment SQL migration — only create / mutate-state (submit,cancel) /
 * confirm-handoff / attach-photo RPCs exist, none take an update payload).
 * So edit mode here PREFILLS from the real GET detail route and is otherwise
 * read-only with an honest inline notice, instead of guessing a save contract
 * that doesn't exist on the server.
 */

export type { SellCatalogOptions } from "./sellFormTypes";

const PRICE_PREVIEW_DEBOUNCE_MS = 400;

export interface SellFormEditSubmission {
  id: string;
  submissionNumber: string;
  status: string;
  version: number;
  titleSnapshot: string;
  conditionCode: string;
  askingPriceSatang: number;
  gradeLabel: string | null;
  language: string | null;
  certNumber: string | null;
  conditionNotes: string | null;
  sellerNote: string | null;
  referenceCardId: string | null;
  referenceVariantId: string | null;
  variantSnapshot: Record<string, unknown>;
  referenceSnapshot: Record<string, unknown>;
  photoCount: number;
}

export interface SellFormProps {
  sellerActive: boolean;
  mockMode: boolean;
  options: SellCatalogOptions;
  editSubmission: SellFormEditSubmission | null;
}

/**
 * Last payout quote fetched from the server, tagged with the price it was
 * requested for. The rail's `preview`/`previewLoading` props are DERIVED
 * from this during render (see the payout-preview effect in SellForm) —
 * the effect itself only talks to the network and never calls setState
 * synchronously in its body (react-hooks/set-state-in-effect).
 */
type PayoutQuoteState = {
  requestedPriceSatang: number;
  preview: SellPayoutPreview;
} | null;

const DEFAULT_FIELDS: SellFieldValues = {
  name: "",
  series: "",
  category: "single_cards",
  set: "",
  code: "",
  variant: "",
  print: "",
  language: "english",
  year: "",
  condition: "raw",
  grader: "psa",
  grade: "",
  cert: "",
  priceThb: "",
};

function nextIdempotencyKey(scope: string) {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `marketplace:${scope}:${suffix}`;
}

async function parseJson<T = { error?: string }>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as ({ error?: string } & T) | null;
  if (!response.ok) {
    throw new Error(body?.error ?? "Marketplace seller request failed.");
  }
  return body as T;
}

function fieldsFromEdit(edit: SellFormEditSubmission | null): SellFieldValues {
  if (!edit) return DEFAULT_FIELDS;
  const variantSnapshot = edit.variantSnapshot ?? {};
  const referenceSnapshot = edit.referenceSnapshot ?? {};
  const readString = (source: Record<string, unknown>, key: string) => {
    const value = source[key];
    return typeof value === "string" ? value : "";
  };
  return {
    name: edit.titleSnapshot,
    series: readString(variantSnapshot, "series"),
    category: readString(referenceSnapshot, "category") || DEFAULT_FIELDS.category,
    set: readString(variantSnapshot, "set"),
    code: readString(variantSnapshot, "code"),
    variant: readString(variantSnapshot, "variant"),
    print: readString(variantSnapshot, "print"),
    language: edit.language ?? DEFAULT_FIELDS.language,
    year: readString(variantSnapshot, "year"),
    condition:
      edit.conditionCode === "graded" || edit.conditionCode === "sealed"
        ? (edit.conditionCode as SellFieldValues["condition"])
        : "raw",
    grader: readString(variantSnapshot, "grader") || DEFAULT_FIELDS.grader,
    grade: edit.gradeLabel ?? "",
    cert: edit.certNumber ?? "",
    priceThb: String(Math.round(edit.askingPriceSatang / 100)),
  };
}

export function SellForm({ sellerActive, mockMode, options, editSubmission }: SellFormProps) {
  const router = useRouter();
  const { toasts, toast } = useToasts();
  const isEdit = Boolean(editSubmission);

  const [fields, setFields] = useState<SellFieldValues>(() => fieldsFromEdit(editSubmission));
  const [photos, setPhotos] = useState<SellPhoto[]>([]);
  const [payoutQuote, setPayoutQuote] = useState<PayoutQuoteState>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [termsBusy, setTermsBusy] = useState(false);
  const [accepted, setAccepted] = useState(sellerActive);

  const isGraded = fields.condition === "graded";
  const priceSatang = useMemo(() => {
    const value = Number(fields.priceThb);
    return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : 0;
  }, [fields.priceThb]);

  function setField<K extends keyof SellFieldValues>(key: K, value: SellFieldValues[K]) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  function addPhotos(files: FileList | File[]) {
    setPhotos((current) => {
      const room = Math.max(0, MAX_SELL_PHOTOS - current.length);
      if (room <= 0) return current;
      return [...current, ...createSellPhotos(Array.from(files).slice(0, room))];
    });
  }

  function removePhoto(id: string) {
    setPhotos((current) => current.filter((photo) => photo.id !== id));
  }

  // Live payout preview: debounce 400ms on price change, then ask the server
  // for the real fee/net split. The seeded policy is 10% today but this must
  // never be assumed client-side — only the server response is rendered.
  //
  // The effect body only syncs with the network: every setState lives inside
  // the debounced async callback, never the synchronous body
  // (react-hooks/set-state-in-effect). The old effect-body resets are now
  // render-time derivations below — `preview` is null whenever there is no
  // price or we're in mock mode (mock has no live backend; the summary card
  // stays honest with "Quoted at submit" instead of a fabricated fee split),
  // and `previewLoading` falls out of comparing the quote's requested price
  // against the current one, which covers the same visible window the old
  // effect-managed flag did (from the moment the price changes, through the
  // debounce, until its fetch settles).
  useEffect(() => {
    if (priceSatang <= 0 || mockMode) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/marketplace/seller/payout-preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ askingPriceSatang: priceSatang }),
        });
        const payload = (await response.json().catch(() => null)) as {
          preview?: {
            sellerMarketplaceFeeSatang?: number;
            sellerPayoutSatang?: number;
          };
        } | null;
        if (controller.signal.aborted) return;
        if (!response.ok || !payload?.preview) {
          // Leave the previous preview (or none) visible rather than guessing
          // a number; recording the attempted price clears the loading state.
          setPayoutQuote((current) => ({
            requestedPriceSatang: priceSatang,
            preview: current?.preview ?? null,
          }));
          return;
        }
        setPayoutQuote({
          requestedPriceSatang: priceSatang,
          preview: {
            priceSatang,
            feeSatang: Number(payload.preview.sellerMarketplaceFeeSatang ?? 0),
            feeLabel: "Seller fee",
            payoutSatang: Number(payload.preview.sellerPayoutSatang ?? 0),
          },
        });
      } catch {
        // Aborted: a newer price (or unmount) owns the state now — do
        // nothing. Network hiccup: same keep-the-previous-preview handling
        // as the !ok branch above.
        if (controller.signal.aborted) return;
        setPayoutQuote((current) => ({
          requestedPriceSatang: priceSatang,
          preview: current?.preview ?? null,
        }));
      }
    }, PRICE_PREVIEW_DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [priceSatang, mockMode]);

  const previewActive = priceSatang > 0 && !mockMode;
  const preview = previewActive ? payoutQuote?.preview ?? null : null;
  const previewLoading =
    previewActive && payoutQuote?.requestedPriceSatang !== priceSatang;

  async function acceptTerms() {
    setTermsBusy(true);
    try {
      if (mockMode) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        setAccepted(true);
        toast("Mock seller terms accepted", "success");
        return;
      }
      await parseJson(
        await fetch("/api/marketplace/seller/terms", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": nextIdempotencyKey("seller-terms"),
          },
          body: "{}",
        }),
      );
      setAccepted(true);
      toast("Seller terms accepted", "success");
      router.refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Terms failed.", "error");
    } finally {
      setTermsBusy(false);
    }
  }

  async function uploadPhoto(
    submissionId: string,
    expectedVersion: number | undefined,
    order: number,
    file: File,
  ) {
    const form = new FormData();
    form.append("sellerPhoto", file);
    form.append("photoRole", "other");
    form.append("displayOrder", String(order));
    if (expectedVersion) form.append("expectedVersion", String(expectedVersion));
    return parseJson<{ photo?: { version?: number } }>(
      await fetch(`/api/marketplace/seller/submissions/${submissionId}/photos`, {
        method: "POST",
        headers: { "idempotency-key": nextIdempotencyKey(`seller-photo-${order}`) },
        body: form,
      }),
    );
  }

  const categoryLabel =
    options.categoryOptions.find((option) => option.value === fields.category)?.label ?? "";
  const validationReason =
    !photos.length && !isEdit
      ? "Add at least one photo"
      : !fields.name.trim()
        ? "Add a card name"
        : !fields.series.trim()
          ? "Add a series"
          : priceSatang <= 0
            ? "Set a price"
            : isGraded && !fields.grade
              ? "Select a grade"
              : null;
  const isValid = validationReason === null;

  async function handleSubmit() {
    if (!isValid || isEdit) return;
    setSubmitting(true);
    setUploadProgress(null);
    try {
      const variantSnapshot = {
        series: fields.series,
        set: fields.set,
        code: fields.code,
        variant: fields.variant,
        print: fields.print,
        year: fields.year,
        grader: isGraded ? fields.grader : "",
      };
      const referenceSnapshot = {
        category: fields.category,
        categoryLabel,
      };

      if (mockMode) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        toast(`Mock submission saved with ${photos.length} photo(s).`, "success");
        router.push("/marketplace/orders?tab=listings");
        return;
      }

      // Real backend: the create RPC returns { submissionId, version, ... }
      // (marketplace_create_seller_submission's jsonb_build_object). Mock mode
      // returns a row-shaped { id, ... }. Accept both keys.
      const payload = await parseJson<{
        submission?: { submissionId?: string; id?: string; version?: number };
      }>(
        await fetch("/api/marketplace/seller/submissions", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": nextIdempotencyKey("seller-submission"),
          },
          body: JSON.stringify({
            itemType: "card",
            titleSnapshot: fields.name.trim(),
            conditionCode: fields.condition,
            conditionNotes: "",
            askingPriceSatang: priceSatang,
            referenceSource: "catalog_reference",
            referenceCardId: "",
            referenceVariantId: "",
            variantSnapshot,
            referenceSnapshot,
            gradeLabel: isGraded ? fields.grade : "",
            language: fields.language,
            certNumber: isGraded ? fields.cert.trim() : "",
            sellerNote: "",
            // Photos are attached only while a consignment is a draft. Create
            // it first, then upload every selected photo before submitting it.
            submitNow: false,
          }),
        }),
      );

      const submission = payload.submission;
      const submissionId = submission?.submissionId ?? submission?.id;
      if (!submissionId) {
        throw new Error("Submission was saved but its ID was not returned.");
      }

      let expectedVersion = submission?.version;
      for (const [index, photo] of photos.entries()) {
        setUploadProgress(`Uploading photo ${index + 1} of ${photos.length}...`);
        const uploaded = await uploadPhoto(submissionId, expectedVersion, index + 1, photo.file);
        expectedVersion = uploaded.photo?.version ?? expectedVersion;
      }

      setUploadProgress("Submitting consignment...");
      await parseJson(
        await fetch(`/api/marketplace/seller/submissions/${submissionId}/submit`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": nextIdempotencyKey("seller-submission-submit"),
          },
          body: JSON.stringify({ expectedVersion, sellerNote: "" }),
        }),
      );

      toast(`Listed for ${formatThb(priceSatang)}`, "success");
      router.push("/marketplace/orders?tab=listings");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Submission failed.", "error");
    } finally {
      setSubmitting(false);
      setUploadProgress(null);
    }
  }

  if (!accepted) {
    return (
      <div className="mp-stack" style={{ gap: 20 }}>
        <div className="mp-stack" style={{ gap: 6 }}>
          <span className="mp-eyebrow">Sell a card</span>
          <h1 className="mp-h1">Accept seller terms to start selling</h1>
          <p className="mp-lead">
            Ship it to YNOT — we verify, photograph, and vault it — then it lists to the
            community market with your details.
          </p>
        </div>
        <MpPanel>
          <div className="mp-stack" style={{ gap: 14 }}>
            <div className="mp-alert mp-alert-gold">
              <MpIcon name="shield" size={15} />
              <span>
                Accept the YNOT seller terms once to unlock consignment selling. Every listing is
                still verified in-hand before a buyer receives it.
              </span>
            </div>
            <MpBtn variant="primary" size="lg" disabled={termsBusy} onClick={acceptTerms}>
              {termsBusy ? "Accepting..." : "Accept seller terms"}
            </MpBtn>
          </div>
        </MpPanel>
        <MpToasts toasts={toasts} />
      </div>
    );
  }

  const buttonLabel = submitting
    ? uploadProgress ?? "Saving..."
    : isEdit
      ? "Editing is not available yet"
      : isValid
        ? `List for ${formatThb(priceSatang)}`
        : "Complete the form to list";

  return (
    <div className="mp-stack" style={{ gap: 6 }}>
      <div className="mp-row mp-small mp-mute" style={{ gap: 6, marginBottom: 12 }}>
        <Link href="/marketplace" style={{ fontWeight: 600 }}>
          Marketplace
        </Link>
        <span>/</span>
        {isEdit ? (
          <>
            <Link href="/marketplace/orders?tab=listings" style={{ fontWeight: 600 }}>
              My listings
            </Link>
            <span>/</span>
          </>
        ) : null}
        <span style={{ color: "var(--mp-ink)", fontWeight: 600 }}>
          {isEdit ? "Edit listing" : "Sell a card"}
        </span>
      </div>

      <div className="mp-stack" style={{ gap: 6, marginBottom: 24 }}>
        <span className="mp-eyebrow">{isEdit ? "Edit listing" : "Sell a card"}</span>
        <h1 className="mp-h1">{isEdit ? "Your listing" : "List a card for sale"}</h1>
        <p className="mp-lead">
          {isEdit
            ? `Submission ${editSubmission?.submissionNumber ?? ""} — status ${editSubmission?.status ?? ""}.`
            : "Upload your photos and describe the card. Ship it to YNOT — we verify, photograph and vault it — then it lists to the community market with your details."}
        </p>
        {isEdit ? (
          <div className="mp-alert mp-alert-gold">
            <MpIcon name="tag" size={14} />
            <span>
              Editing a saved item isn&apos;t available yet — this page shows what you submitted.
              To change details, unlist it from{" "}
              <Link href="/marketplace/orders?tab=listings" style={{ fontWeight: 700 }}>
                My listings
              </Link>{" "}
              and create a new one.
            </span>
          </div>
        ) : null}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 26, alignItems: "start" }}>
        {/* form */}
        <div className="mp-stack" style={{ gap: 22 }}>
          <MpPanel>
            <div className="mp-row" style={{ gap: 9, marginBottom: 14 }}>
              <span className="mp-step now" style={{ fontSize: 13 }}>
                <span className="n">1</span>
              </span>
              <span className="mp-h3">Photos</span>
              <span className="mp-spacer" />
              <span className="mp-small mp-mute">
                {photos.length}/{MAX_SELL_PHOTOS}
              </span>
            </div>
            <PhotoUploader
              photos={photos}
              onAdd={addPhotos}
              onRemove={removePhoto}
              existingPhotoNote={
                isEdit && editSubmission?.photoCount
                  ? `${editSubmission.photoCount} photo(s) already attached to this submission.`
                  : null
              }
            />
          </MpPanel>

          <SellIdentityPanel
            fields={fields}
            options={options}
            isGraded={isGraded}
            disabledIdentity={isEdit}
            setField={setField}
          />
        </div>

        <SellSummaryRail
          fields={fields}
          priceSatang={priceSatang}
          isGraded={isGraded}
          isEdit={isEdit}
          isValid={isValid}
          submitting={submitting}
          buttonLabel={buttonLabel}
          preview={preview}
          previewLoading={previewLoading}
          coverPhoto={photos[0]}
          onPriceChange={(value) => setField("priceThb", value)}
          onSubmit={handleSubmit}
        />
      </div>

      <MpToasts toasts={toasts} />
    </div>
  );
}
