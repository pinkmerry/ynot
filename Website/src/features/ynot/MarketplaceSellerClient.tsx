"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type SellerSubmission = {
  id: string;
  submission_number: string;
  status: string;
  item_type: "card" | "sealed_box" | "sealed_pack";
  title_snapshot: string;
  condition_code: string;
  asking_price_satang: number;
  seller_marketplace_fee_satang: number;
  payout_preview_satang: number;
  currency: "THB";
  version?: number;
  updated_at: string | null;
};

type SellerPhotoRole =
  | "front"
  | "back"
  | "left_edge"
  | "right_edge"
  | "top_bottom_edges"
  | "corners"
  | "surface"
  | "serial_or_cert"
  | "other";

type SellerSubmissionResponse = {
  submission?: SellerSubmission;
};

type SellerPhotoUploadResponse = {
  photo?: {
    version?: number;
  };
};

const MAX_SELLER_PHOTOS = 10;
const SELLER_UPLOAD_PHOTO_ROLE: SellerPhotoRole = "other";

type MarketplaceSellerClientProps = {
  sellerStatus: string | null;
  payoutStatus: string | null;
  sellerFeeBps: number;
  submissions: SellerSubmission[];
  mockMode?: boolean;
};

function thb(amountSatang: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(amountSatang / 100);
}

function nextIdempotencyKey(scope: string) {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `marketplace:${scope}:${suffix}`;
}

async function parseJson<T = { error?: string }>(
  response: Response,
) {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  if (!response.ok) {
    throw new Error(body?.error ?? "Marketplace seller request failed.");
  }
  return body as T;
}

export function MarketplaceSellerClient({
  sellerStatus,
  payoutStatus,
  sellerFeeBps,
  submissions,
  mockMode = false,
}: MarketplaceSellerClientProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<"terms" | "submit" | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [visibleSubmissions, setVisibleSubmissions] = useState(submissions);
  const [priceThb, setPriceThb] = useState("1000");
  const [itemType, setItemType] =
    useState<SellerSubmission["item_type"]>("card");
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const sellerActive = mockMode || sellerStatus === "active";
  const selectedPhotos = photoFiles.map((file, index) => ({
    file,
    displayOrder: index + 1,
  }));
  const visiblePhotoInputIndexes = Array.from(
    {
      length: Math.min(
        MAX_SELLER_PHOTOS,
        Math.max(1, photoFiles.length + 1),
      ),
    },
    (_, index) => index,
  );
  const priceSatang = Number.isFinite(Number(priceThb))
    ? Math.max(0, Math.round(Number(priceThb) * 100))
    : 0;
  const fallbackFeeSatang = Math.floor((priceSatang * sellerFeeBps) / 10_000);
  const fallbackPreview = {
    feeSatang: fallbackFeeSatang,
    payoutSatang: priceSatang - fallbackFeeSatang,
  };
  const [serverPreview, setServerPreview] = useState<{
    priceSatang: number;
    feeSatang: number;
    payoutSatang: number;
  } | null>(null);
  const preview =
    serverPreview?.priceSatang === priceSatang ? serverPreview : fallbackPreview;

  function updatePhoto(index: number, file: File | null) {
    if (!file) return;
    setPhotoFiles((current) => {
      const next = [...current];
      next[index] = file;
      return next.filter(Boolean).slice(0, MAX_SELLER_PHOTOS);
    });
  }

  function removePhoto(index: number) {
    setPhotoFiles((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  function resetSellerForm(formElement: HTMLFormElement) {
    formElement.reset();
    setPhotoFiles([]);
    setPriceThb("1000");
    setItemType("card");
    setUploadProgress(null);
  }

  async function uploadSubmissionPhoto(input: {
    submissionId: string;
    expectedVersion?: number;
    displayOrder: number;
    file: File;
  }) {
    const form = new FormData();
    form.append("sellerPhoto", input.file);
    form.append("photoRole", SELLER_UPLOAD_PHOTO_ROLE);
    form.append("displayOrder", String(input.displayOrder));
    if (input.expectedVersion) {
      form.append("expectedVersion", String(input.expectedVersion));
    }

    return parseJson<SellerPhotoUploadResponse>(
      await fetch(`/api/marketplace/seller/submissions/${input.submissionId}/photos`, {
        method: "POST",
        headers: {
          "idempotency-key": nextIdempotencyKey(
            `seller-photo-${input.displayOrder}`,
          ),
        },
        body: form,
      }),
    );
  }

  async function submitSavedSubmission(input: {
    submissionId: string;
    expectedVersion?: number;
    sellerNote: string;
  }) {
    await parseJson(
      await fetch(`/api/marketplace/seller/submissions/${input.submissionId}/submit`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": nextIdempotencyKey("seller-submission-submit"),
        },
        body: JSON.stringify({
          expectedVersion: input.expectedVersion,
          sellerNote: input.sellerNote,
        }),
      }),
    );
  }

  useEffect(() => {
    if (mockMode) return;
    if (!sellerActive || priceSatang <= 0) return;

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
        if (!response.ok || !payload?.preview) return;
        setServerPreview({
          priceSatang,
          feeSatang: Number(payload.preview.sellerMarketplaceFeeSatang ?? 0),
          payoutSatang: Number(payload.preview.sellerPayoutSatang ?? 0),
        });
      } catch {
        // Keep the derived fallback preview visible if the server quote is unavailable.
      }
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [mockMode, priceSatang, sellerActive, sellerFeeBps]);

  async function acceptTerms() {
    setBusy("terms");
    setMessage(null);
    try {
      if (mockMode) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        setMessage("Mock seller terms accepted");
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
      setMessage("Seller terms accepted");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Terms failed.");
    } finally {
      setBusy(null);
    }
  }

  async function createSubmission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const submitForReview = form.get("submitNow") === "on";
    if (submitForReview && selectedPhotos.length < 1) {
      setMessage("Add at least one item photo before sending this item for review.");
      return;
    }
    setBusy("submit");
    setMessage(null);
    setUploadProgress(null);
    try {
      if (mockMode) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        const now = new Date().toISOString();
        setVisibleSubmissions((current) => [
          {
            id: `mock-submission-${Date.now()}`,
            submission_number: `MKT-MOCK-${current.length + 1001}`,
            status: submitForReview ? "submitted" : "draft",
            item_type: itemType,
            title_snapshot: String(form.get("titleSnapshot") ?? ""),
            condition_code: String(form.get("conditionCode") ?? ""),
            asking_price_satang: priceSatang,
            seller_marketplace_fee_satang: preview.feeSatang,
            payout_preview_satang: preview.payoutSatang,
            currency: "THB",
            version: 1,
            updated_at: now,
          },
          ...current,
        ]);
        setMessage(
          submitForReview
            ? `Mock submission saved with ${selectedPhotos.length} photo(s) and sent for review.`
            : `Mock submission saved with ${selectedPhotos.length} photo(s).`,
        );
        resetSellerForm(formElement);
        return;
      }
      const payload = await parseJson<SellerSubmissionResponse>(
        await fetch("/api/marketplace/seller/submissions", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": nextIdempotencyKey("seller-submission"),
          },
          body: JSON.stringify({
            itemType,
            titleSnapshot: String(form.get("titleSnapshot") ?? ""),
            conditionCode: String(form.get("conditionCode") ?? ""),
            conditionNotes: String(form.get("conditionNotes") ?? ""),
            askingPriceSatang: priceSatang,
            referenceSource: "catalog_reference",
            referenceCardId: String(form.get("referenceCardId") ?? ""),
            referenceVariantId: String(form.get("referenceVariantId") ?? ""),
            variantSnapshot: {
              grade: String(form.get("gradeLabel") ?? ""),
              language: String(form.get("language") ?? ""),
              certNumber: String(form.get("certNumber") ?? ""),
            },
            referenceSnapshot: {
              itemType,
              title: String(form.get("titleSnapshot") ?? ""),
            },
            gradeLabel: String(form.get("gradeLabel") ?? ""),
            language: String(form.get("language") ?? ""),
            certNumber: String(form.get("certNumber") ?? ""),
            sellerNote: String(form.get("sellerNote") ?? ""),
            submitNow: false,
          }),
        }),
      );
      const savedSubmission = payload.submission;
      if (!savedSubmission?.id) {
        throw new Error("Submission was saved but its ID was not returned.");
      }
      let expectedVersion = savedSubmission.version;
      for (const photo of selectedPhotos) {
        setUploadProgress(`Uploading photo ${photo.displayOrder}...`);
        const photoPayload = await uploadSubmissionPhoto({
          submissionId: savedSubmission.id,
          expectedVersion,
          displayOrder: photo.displayOrder,
          file: photo.file,
        });
        expectedVersion = photoPayload.photo?.version ?? expectedVersion;
      }
      if (submitForReview) {
        setUploadProgress("Sending item for YNOT review...");
        await submitSavedSubmission({
          submissionId: savedSubmission.id,
          expectedVersion,
          sellerNote: String(form.get("sellerNote") ?? ""),
        });
      }
      setMessage(
        submitForReview
          ? `Submission saved with ${selectedPhotos.length} photo(s) and sent for review.`
          : `Submission saved with ${selectedPhotos.length} photo(s).`,
      );
      resetSellerForm(formElement);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Submission failed.");
    } finally {
      setUploadProgress(null);
      setBusy(null);
    }
  }

  return (
    <div className="marketplace-seller-workspace">
      <section className="marketplace-status-strip marketplace-seller-strip">
        <div className="marketplace-account-state">
          <strong>Seller status</strong>
          <p>{sellerStatus ?? "not_started"}</p>
        </div>
        <div className="marketplace-account-state">
          <strong>Payout readiness</strong>
          <p>{payoutStatus ?? "not_started"}</p>
        </div>
        <div className="marketplace-status-main">
          {!sellerActive ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy === "terms"}
              onClick={acceptTerms}
            >
              {busy === "terms" ? "Accepting..." : "Accept seller terms"}
            </button>
          ) : (
            <span className="status-pill ready">Ready for submissions</span>
          )}
        </div>
      </section>

      <section className="marketplace-seller-layout">
        <form className="marketplace-seller-form" onSubmit={createSubmission}>
          <h2>Sell an item</h2>
          <p className="marketplace-seller-note">
            Add the item details first, then upload clear photos for YNOT
            review. Add up to 10 images for each item.
          </p>
          <div className="marketplace-seller-grid">
            <label>
              <span>Type</span>
              <select
                value={itemType}
                onChange={(event) =>
                  setItemType(event.currentTarget.value as SellerSubmission["item_type"])
                }
              >
                <option value="card">Card</option>
                <option value="sealed_box">Sealed box</option>
                <option value="sealed_pack">Sealed pack</option>
              </select>
            </label>
            <label>
              <span>Title</span>
              <input name="titleSnapshot" required maxLength={240} />
            </label>
            <label>
              <span>Variant</span>
              <input name="referenceVariantId" maxLength={160} />
            </label>
            <label>
              <span>Card ref</span>
              <input name="referenceCardId" maxLength={160} />
            </label>
            <label>
              <span>Condition</span>
              <select name="conditionCode" required>
                <option value="raw">Raw</option>
                <option value="graded">Graded</option>
                <option value="sealed">Sealed</option>
              </select>
            </label>
            <label>
              <span>Grade</span>
              <input name="gradeLabel" maxLength={80} />
            </label>
            <label>
              <span>Language</span>
              <input name="language" maxLength={80} />
            </label>
            <label>
              <span>Cert</span>
              <input name="certNumber" maxLength={120} />
            </label>
            <label>
              <span>Price THB</span>
              <input
                inputMode="numeric"
                value={priceThb}
                onChange={(event) => setPriceThb(event.currentTarget.value)}
                required
              />
            </label>
          </div>
          <label className="marketplace-seller-wide">
            <span>Condition notes</span>
            <textarea name="conditionNotes" maxLength={1000} rows={3} />
          </label>
          <label className="marketplace-seller-wide">
            <span>Seller note</span>
            <textarea name="sellerNote" maxLength={1000} rows={3} />
          </label>
          <section
            className="marketplace-seller-photo-section"
            aria-label="Seller item photos"
          >
            <div className="marketplace-seller-photo-head">
              <div>
                <h3>Upload item photos</h3>
                <p>
                  Start with one image. After you choose a file, another upload
                  line appears automatically until you reach 10 images.
                </p>
              </div>
              <span>{photoFiles.length}/{MAX_SELLER_PHOTOS} selected</span>
            </div>
            <div className="marketplace-seller-photo-grid">
              {visiblePhotoInputIndexes.map((index) => {
                const selectedFile = photoFiles[index] ?? null;
                const isAddRow = !selectedFile;
                return (
                  <label key={index} className="marketplace-seller-photo-slot">
                    <span>
                      {isAddRow
                        ? photoFiles.length === 0
                          ? "Add photo"
                          : "Add another photo"
                        : `Photo ${index + 1}`}
                    </span>
                    <small>
                      {isAddRow
                        ? `Maximum ${MAX_SELLER_PHOTOS} images per item.`
                        : "Ready to upload with this item."}
                    </small>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) =>
                        updatePhoto(index, event.currentTarget.files?.[0] ?? null)
                      }
                    />
                    <em>{selectedFile ? selectedFile.name : "No photo selected"}</em>
                    {selectedFile ? (
                      <button
                        type="button"
                        className="marketplace-seller-photo-clear"
                        onClick={() => removePhoto(index)}
                      >
                        Remove photo
                      </button>
                    ) : null}
                  </label>
                );
              })}
            </div>
          </section>
          <dl className="marketplace-checkout-summary">
            <div>
              <dt>Asking price</dt>
              <dd>{thb(priceSatang)}</dd>
            </div>
            <div>
              <dt>YNOT fee</dt>
              <dd>{thb(preview.feeSatang)}</dd>
            </div>
            <div>
              <dt>Estimated payout</dt>
              <dd>{thb(preview.payoutSatang)}</dd>
            </div>
            <div>
              <dt>Shipping</dt>
              <dd>Buyer paid</dd>
            </div>
          </dl>
          <label className="marketplace-submit-check">
            <input type="checkbox" name="submitNow" />
            <span>Submit for YNOT intake review</span>
          </label>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!sellerActive || busy === "submit"}
          >
            {busy === "submit" ? "Saving and uploading..." : "Save item and upload photos"}
          </button>
          {uploadProgress ? (
            <p className="marketplace-checkout-status">{uploadProgress}</p>
          ) : null}
        </form>

        <section className="marketplace-seller-list">
          <h2>Your selling items</h2>
          {visibleSubmissions.length ? (
            visibleSubmissions.map((submission) => (
              <article key={submission.id} className="marketplace-seller-row">
                <div>
                  <strong>{submission.title_snapshot}</strong>
                  <span>{submission.submission_number}</span>
                </div>
                <dl>
                  <div>
                    <dt>Status</dt>
                    <dd>{submission.status}</dd>
                  </div>
                  <div>
                    <dt>Price</dt>
                    <dd>{thb(submission.asking_price_satang)}</dd>
                  </div>
                  <div>
                    <dt>Payout</dt>
                    <dd>{thb(submission.payout_preview_satang)}</dd>
                  </div>
                </dl>
              </article>
            ))
          ) : (
            <div className="marketplace-empty">
              <strong>No submissions yet</strong>
              <p>Physical consignment items will appear here.</p>
            </div>
          )}
        </section>
      </section>
      {message ? <p className="marketplace-checkout-status">{message}</p> : null}
    </div>
  );
}
