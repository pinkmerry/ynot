"use client";

import { useEffect } from "react";

type MarketplaceListingLightboxProps = {
  photos: string[];
  title: string;
  activeIndex: number;
  open: boolean;
  onClose: () => void;
  onSelect: (index: number) => void;
};

export function MarketplaceListingLightbox({
  photos,
  title,
  activeIndex,
  open,
  onClose,
  onSelect,
}: MarketplaceListingLightboxProps) {
  const safePhotos = photos.filter(Boolean).slice(0, 10);
  const activePhoto = safePhotos[activeIndex] ?? safePhotos[0] ?? null;
  const hasMultiplePhotos = safePhotos.length > 1;

  useEffect(() => {
    if (!open || safePhotos.length === 0) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") {
        onSelect((activeIndex - 1 + safePhotos.length) % safePhotos.length);
      }
      if (event.key === "ArrowRight") {
        onSelect((activeIndex + 1) % safePhotos.length);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, onClose, onSelect, open, safePhotos.length]);

  if (!open || !activePhoto) return null;

  function previousPhoto() {
    if (!hasMultiplePhotos) return;
    onSelect((activeIndex - 1 + safePhotos.length) % safePhotos.length);
  }

  function nextPhoto() {
    if (!hasMultiplePhotos) return;
    onSelect((activeIndex + 1) % safePhotos.length);
  }

  return (
    <div
      className="marketplace-listing-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} image viewer`}
    >
      <button
        type="button"
        className="marketplace-listing-lightbox-backdrop"
        aria-label="Close image viewer"
        onClick={onClose}
      />
      <div className="marketplace-listing-lightbox-panel">
        <div className="marketplace-listing-lightbox-toolbar">
          <span>
            {activeIndex + 1} / {safePhotos.length}
          </span>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="marketplace-listing-lightbox-stage">
          <button
            type="button"
            className="marketplace-listing-lightbox-arrow"
            disabled={!hasMultiplePhotos}
            onClick={previousPhoto}
            aria-label="Previous item photo"
          >
            <span aria-hidden="true">{"<"}</span>
          </button>
          <img src={activePhoto} alt={`${title} actual item photo ${activeIndex + 1}`} />
          <button
            type="button"
            className="marketplace-listing-lightbox-arrow"
            disabled={!hasMultiplePhotos}
            onClick={nextPhoto}
            aria-label="Next item photo"
          >
            <span aria-hidden="true">{">"}</span>
          </button>
        </div>
        {safePhotos.length > 1 ? (
          <div className="marketplace-listing-lightbox-thumbs">
            {safePhotos.map((photo, index) => (
              <button
                type="button"
                key={`${photo}-${index}`}
                className={index === activeIndex ? "is-active" : undefined}
                onClick={() => onSelect(index)}
                aria-label={`Show item photo ${index + 1}`}
              >
                <img src={photo} alt="" aria-hidden="true" />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
