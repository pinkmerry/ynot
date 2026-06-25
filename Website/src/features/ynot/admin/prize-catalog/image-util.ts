/**
 * Client-side image downscale utility for prize-catalog uploads.
 * Ported from prototype `pickImage()` canvas logic. Reused for both
 * main card and per-variant image uploads.
 */

const JPEG_QUALITY = 0.72;

/**
 * Downscale an image File to at most `maxWidth` pixels wide, preserving
 * aspect ratio. Returns a new File (JPEG) if the image exceeds `maxWidth`,
 * or the original if it is already small enough and is JPEG.
 */
export function downscaleImage(
  file: File,
  maxWidth: number,
): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Failed to decode image."));
      img.onload = () => {
        // If already within bounds and JPEG, return as-is.
        if (img.width <= maxWidth && file.type === "image/jpeg") {
          resolve(file);
          return;
        }

        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas 2D context unavailable."));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Canvas toBlob returned null."));
              return;
            }
            const name = file.name.replace(/\.[^.]+$/, ".jpg");
            resolve(new File([blob], name, { type: "image/jpeg" }));
          },
          "image/jpeg",
          JPEG_QUALITY,
        );
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/** Max width for main card images (from prototype uploadItemImage). */
export const MAIN_IMAGE_MAX_WIDTH = 420;

/** Max width for variant/sub-SKU images (from prototype uploadVariantImage). */
export const VARIANT_IMAGE_MAX_WIDTH = 300;
