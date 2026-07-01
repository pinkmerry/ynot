"use client";

import { useState } from "react";
import { MarketplaceListingLightbox } from "./MarketplaceListingLightbox";

type MarketplaceListingGalleryProps = {
  photos: string[];
  title: string;
};

export function MarketplaceListingGallery({
  photos,
  title,
}: MarketplaceListingGalleryProps) {
  const safePhotos = photos.filter(Boolean).slice(0, 10);
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const activePhoto = safePhotos[activeIndex] ?? null;
  const hasMultiplePhotos = safePhotos.length > 1;

  function showPhoto(index: number) {
    if (safePhotos.length === 0) return;
    setActiveIndex((index + safePhotos.length) % safePhotos.length);
  }

  function previousPhoto() {
    showPhoto(activeIndex - 1);
  }

  function nextPhoto() {
    showPhoto(activeIndex + 1);
  }

  return (
    <section
      className="marketplace-listing-gallery"
      aria-label="Uploaded item photos"
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") previousPhoto();
        if (event.key === "ArrowRight") nextPhoto();
      }}
    >
      <div className="marketplace-listing-carousel">
        {activePhoto ? (
          <figure className="marketplace-listing-photo marketplace-listing-photo--primary">
            <img
              src={activePhoto}
              alt={`${title} actual item photo ${activeIndex + 1}`}
            />
            <figcaption>Photo {activeIndex + 1}</figcaption>
          </figure>
        ) : (
          <div className="marketplace-listing-photo marketplace-listing-photo--empty">
            <span>{title.slice(0, 1)}</span>
          </div>
        )}

        <span className="marketplace-listing-photo-count">
          {safePhotos.length > 0 ? activeIndex + 1 : 0} /{" "}
          {Math.max(safePhotos.length, 1)}
        </span>

        {activePhoto ? (
          <button
            type="button"
            className="marketplace-listing-zoom-button"
            onClick={() => setLightboxOpen(true)}
          >
            Zoom image
          </button>
        ) : null}

        <button
          type="button"
          className="marketplace-listing-gallery-arrow marketplace-listing-gallery-arrow--prev"
          onClick={previousPhoto}
          disabled={!hasMultiplePhotos}
          aria-label="Previous item photo"
        >
          <span aria-hidden="true">{"<"}</span>
        </button>
        <button
          type="button"
          className="marketplace-listing-gallery-arrow marketplace-listing-gallery-arrow--next"
          onClick={nextPhoto}
          disabled={!hasMultiplePhotos}
          aria-label="Next item photo"
        >
          <span aria-hidden="true">{">"}</span>
        </button>
      </div>

      {safePhotos.length > 1 ? (
        <div className="marketplace-listing-thumbnails" aria-label="Select item photo">
          {safePhotos.map((photo, index) => (
            <button
              type="button"
              className={
                index === activeIndex
                  ? "marketplace-listing-thumbnail active"
                  : "marketplace-listing-thumbnail"
              }
              onClick={() => showPhoto(index)}
              aria-current={index === activeIndex ? "true" : undefined}
              aria-label={`Show item photo ${index + 1}`}
              key={`${photo}-${index}`}
            >
              <img src={photo} alt="" aria-hidden="true" />
              <span>Photo {index + 1}</span>
            </button>
          ))}
        </div>
      ) : null}

      <MarketplaceListingLightbox
        photos={safePhotos}
        title={title}
        activeIndex={activeIndex}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        onSelect={showPhoto}
      />
    </section>
  );
}
