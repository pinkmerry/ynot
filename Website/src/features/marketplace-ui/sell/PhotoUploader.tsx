"use client";

import { useEffect, useMemo, useRef } from "react";
import { MpIcon } from "../shared/MpIcon";

/**
 * Sell-form photo uploader — visual port of SellUploader from the design
 * prototype (/Users/pinkmerry/Downloads/ynott/project/marketplace-proto-3.jsx:57-89).
 *
 * Files are kept entirely client-side (never uploaded) until the parent form
 * submits: SellForm owns the File[] state and only calls
 * POST /api/marketplace/seller/submissions/{id}/photos once the submission
 * itself has been created. This component just renders the drop zone +
 * thumbnail strip and reports add/remove back to the parent.
 */

export const MAX_SELL_PHOTOS = 10;

export interface SellPhoto {
  id: string;
  file: File;
  previewUrl: string;
}

export interface PhotoUploaderProps {
  photos: SellPhoto[];
  onAdd: (files: FileList | File[]) => void;
  onRemove: (id: string) => void;
  existingPhotoNote?: string | null;
}

function nextPhotoId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `photo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createSellPhotos(files: FileList | File[]): SellPhoto[] {
  return Array.from(files).map((file) => ({
    id: nextPhotoId(),
    file,
    previewUrl: URL.createObjectURL(file),
  }));
}

export function PhotoUploader({
  photos,
  onAdd,
  onRemove,
  existingPhotoNote,
}: PhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previewUrls = useMemo(() => photos.map((photo) => photo.previewUrl), [photos]);

  // Object URLs are only released here, on unmount/replacement — never eagerly,
  // since the cover thumbnail and live preview both read photos[0].previewUrl
  // for as long as the photo stays selected.
  useEffect(() => {
    return () => {
      for (const url of previewUrls) URL.revokeObjectURL(url);
    };
  }, [previewUrls]);

  const atLimit = photos.length >= MAX_SELL_PHOTOS;

  return (
    <div className="mp-stack" style={{ gap: 10 }}>
      <div
        role="button"
        tabIndex={atLimit ? -1 : 0}
        aria-disabled={atLimit}
        onClick={() => !atLimit && inputRef.current?.click()}
        onKeyDown={(event) => {
          if (atLimit) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (atLimit) return;
          onAdd(event.dataTransfer.files);
        }}
        style={{
          border: "1.5px dashed var(--mp-line-strong)",
          borderRadius: 14,
          padding: "26px 20px",
          textAlign: "center",
          cursor: atLimit ? "default" : "pointer",
          opacity: atLimit ? 0.6 : 1,
          background: "var(--mp-bg-soft)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: "var(--mp-paper)",
            border: "1px solid var(--mp-line-strong)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--mp-mute)",
          }}
        >
          <MpIcon name="plus" size={20} />
        </span>
        <span style={{ fontSize: 13.5, fontWeight: 700 }}>
          {atLimit ? "Photo limit reached" : "Upload card photos"}
        </span>
        <span className="mp-small mp-mute">
          Drag &amp; drop or click · front, back, cert, corners, close-ups · up to {MAX_SELL_PHOTOS}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          style={{ display: "none" }}
          onChange={(event) => {
            if (event.currentTarget.files?.length) onAdd(event.currentTarget.files);
            event.currentTarget.value = "";
          }}
        />
      </div>
      {existingPhotoNote ? (
        <span className="mp-small mp-mute">{existingPhotoNote}</span>
      ) : null}
      {photos.length > 0 ? (
        <div className="mp-row" style={{ gap: 10, flexWrap: "wrap" }}>
          {photos.map((photo, index) => (
            <div
              key={photo.id}
              style={{
                position: "relative",
                width: 74,
                height: 96,
                borderRadius: 10,
                overflow: "hidden",
                border: "1px solid var(--mp-line)",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL, not a remote asset */}
              <img
                className="mp-product-media-image"
                src={photo.previewUrl}
                alt={`Item photo ${index + 1}`}
              />
              {index === 0 ? (
                <span
                  className="mp-badge mp-badge-official"
                  style={{ position: "absolute", left: 4, top: 4, padding: "2px 6px", fontSize: 8 }}
                >
                  Cover
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => onRemove(photo.id)}
                aria-label={`Remove photo ${index + 1}`}
                style={{
                  position: "absolute",
                  right: 3,
                  top: 3,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  border: 0,
                  background: "rgba(23,22,16,0.72)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                <MpIcon name="x" size={11} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
