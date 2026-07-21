"use client";

import Link from "next/link";
import { MpBadge, MpBtn, MpPanel } from "../shared/MpPrimitives";
import { MpIcon } from "../shared/MpIcon";
import { formatThb } from "../shared/money";
import type { SellPhoto } from "./PhotoUploader";
import type { SellFieldValues, SellPayoutPreview } from "./sellFormTypes";

/**
 * Right rail of the sell form — live card preview + "Set your price" panel +
 * the server-quoted fee/net summary + submit/cancel actions. Split out of
 * SellForm.tsx to keep that file focused on data/submission logic.
 *
 * The fee line and "You receive" total always render the SERVER's preview
 * response (see SellForm's payout-preview effect) — never a hardcoded
 * percentage. When no preview has come back yet (price not set, or the
 * request is in flight) this shows "Quoted at submit" / "Quoting..." instead
 * of guessing a number.
 */

export interface SellSummaryRailProps {
  fields: SellFieldValues;
  priceSatang: number;
  isGraded: boolean;
  canEdit: boolean;
  isValid: boolean;
  submitting: boolean;
  buttonLabel: string;
  preview: SellPayoutPreview;
  previewLoading: boolean;
  coverPhoto: SellPhoto | undefined;
  onPriceChange: (value: string) => void;
  onSubmit: () => void;
}

export function SellSummaryRail({
  fields,
  priceSatang,
  isGraded,
  canEdit,
  isValid,
  submitting,
  buttonLabel,
  preview,
  previewLoading,
  coverPhoto,
  onPriceChange,
  onSubmit,
}: SellSummaryRailProps) {
  return (
    <div className="mp-stack" style={{ position: "sticky", top: 20, gap: 16 }}>
      <div className="mp-stack" style={{ gap: 8 }}>
        <span className="mp-eyebrow">Live preview</span>
        <div className="mp-card">
          <div className="mp-card-art">
            {coverPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element -- local object URL, not a remote asset
              <img
                className="mp-product-media-image"
                src={coverPhoto.previewUrl}
                alt=""
              />
            ) : (
              <span className="ph">[ your cover photo ]</span>
            )}
            <span className="corner">
              <MpBadge kind="community">Community</MpBadge>
            </span>
          </div>
          <div className="mp-card-body">
            <span className="mp-card-set">
              {fields.set || fields.series
                ? `${fields.set}${fields.set && fields.series ? " · " : ""}${fields.series}`
                : "Set · Series"}
            </span>
            <span className="mp-card-title">{fields.name || "Card name"}</span>
            <span className="mp-card-meta">
              {fields.code || "Card no."} · {isGraded ? fields.grade || "Graded" : fields.condition}
            </span>
            <div className="mp-card-foot">
              <span className="mp-price">
                <span className="coins">{priceSatang ? formatThb(priceSatang) : "—"}</span>
              </span>
              <span className="mp-seller-mini">
                <span className="dot">NW</span> You
              </span>
            </div>
          </div>
        </div>
      </div>

      <MpPanel>
        <div className="mp-stack" style={{ gap: 4 }}>
        <span className="mp-eyebrow" style={{ marginBottom: 6 }}>
          Set your price
        </span>
        <div
          className="mp-row"
          style={{
            gap: 10,
            border: "1px solid var(--mp-line-strong)",
            borderRadius: 10,
            padding: "9px 13px",
            marginBottom: 8,
          }}
        >
          <span style={{ fontFamily: "var(--mp-mono)", fontWeight: 800, fontSize: 20, color: "var(--mp-mute)" }}>
            ฿
          </span>
          <input
            value={fields.priceThb}
            onChange={(event) => onPriceChange(event.target.value.replace(/[^0-9]/g, ""))}
            placeholder="0"
            inputMode="numeric"
            aria-label="Asking price in THB"
            disabled={!canEdit}
            style={{
              border: 0,
              outline: 0,
              background: "transparent",
              font: "inherit",
              fontFamily: "var(--mp-mono)",
              fontWeight: 800,
              fontSize: 22,
              width: "100%",
              color: "var(--mp-ink)",
            }}
          />
          <span className="mp-small mp-mute mp-mono">THB</span>
        </div>
        <div className="mp-line-row">
          <span className="l">Your ask</span>
          <span className="v">{priceSatang ? formatThb(priceSatang) : "—"}</span>
        </div>
        <div className="mp-line-row">
          <span className="l">{preview?.feeLabel ?? "Seller fee"}</span>
          <span className="v" style={{ color: "var(--mp-rose)" }}>
            {preview ? `−${formatThb(preview.feeSatang)}` : previewLoading ? "Quoting..." : "Quoted at submit"}
          </span>
        </div>
        <hr className="mp-hairline" style={{ margin: "8px 0" }} />
        <div className="mp-line-row total">
          <span className="l">You receive</span>
          <span className="v">{preview ? formatThb(preview.payoutSatang) : "—"}</span>
        </div>
        <span className="mp-small mp-mute" style={{ marginTop: 2 }}>
          Paid to your bank account when the buyer&apos;s order clears verification.
        </span>
        <MpBtn
          variant="primary"
          size="lg"
          style={{ marginTop: 14 }}
          disabled={!isValid || submitting || !canEdit}
          onClick={onSubmit}
        >
          {buttonLabel}
        </MpBtn>
        <Link href="/marketplace/orders?tab=listings" className="mp-btn mp-btn-lg">
          Cancel
        </Link>
        </div>
      </MpPanel>

      <div className="mp-alert mp-alert-green">
        <MpIcon name="shield" size={15} />
        <span>
          Every listing is verified in-hand by YNOT before a buyer receives it — that&apos;s what
          keeps the market trusted.
        </span>
      </div>
    </div>
  );
}
