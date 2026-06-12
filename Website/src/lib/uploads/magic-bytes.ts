import "server-only";

export const maxSlipBytes = 10 * 1024 * 1024;
export const maxMultipartEnvelopeBytes = 64 * 1024;

export type VerifiedImageContentType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/avif";

export const allowedSlipTypes: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export const allowedVisualAssetTypes: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

export function declaredVisualAssetTypeLooksSupported(type: string) {
  const normalized = type.trim().toLowerCase();
  return (
    !normalized ||
    normalized === "application/octet-stream" ||
    allowedVisualAssetTypes.has(normalized)
  );
}

export type VerifyImageMagicBytesResult =
  | { ok: true; contentType: VerifiedImageContentType }
  | { ok: false; error: string };

export function requestExceedsUploadLimit(request: Request, maxFileBytes = maxSlipBytes) {
  const contentLength = Number(request.headers.get("content-length"));
  return (
    Number.isFinite(contentLength) &&
    contentLength > maxFileBytes + maxMultipartEnvelopeBytes
  );
}

export function extensionForVerifiedImage(type: VerifiedImageContentType) {
  switch (type) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/avif":
      return "avif";
  }
}

const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP_RIFF_PREFIX = [0x52, 0x49, 0x46, 0x46];
const WEBP_FORMAT_MARKER = [0x57, 0x45, 0x42, 0x50];
const BMFF_FTYP_MARKER = [0x66, 0x74, 0x79, 0x70];

function matches(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.byteLength < offset + signature.length) return false;
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[offset + i] !== signature[i]) return false;
  }
  return true;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  if (bytes.byteLength < offset + length) return "";
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function hasAvifBrand(bytes: Uint8Array): boolean {
  if (!matches(bytes, BMFF_FTYP_MARKER, 4)) return false;
  if (ascii(bytes, 8, 4) === "avif" || ascii(bytes, 8, 4) === "avis") {
    return true;
  }
  for (let offset = 16; offset + 4 <= bytes.byteLength; offset += 4) {
    const brand = ascii(bytes, offset, 4);
    if (brand === "avif" || brand === "avis") return true;
  }
  return false;
}

export async function verifyImageMagicBytes(file: File): Promise<VerifyImageMagicBytesResult> {
  const header = await file.slice(0, 64).arrayBuffer();
  const bytes = new Uint8Array(header);

  if (bytes.byteLength < 3) {
    return { ok: false, error: "File too small to be a valid image." };
  }

  if (matches(bytes, JPEG_SIGNATURE)) {
    return { ok: true, contentType: "image/jpeg" };
  }

  if (matches(bytes, PNG_SIGNATURE)) {
    return { ok: true, contentType: "image/png" };
  }

  if (matches(bytes, WEBP_RIFF_PREFIX) && matches(bytes, WEBP_FORMAT_MARKER, 8)) {
    return { ok: true, contentType: "image/webp" };
  }

  if (hasAvifBrand(bytes)) {
    return { ok: true, contentType: "image/avif" };
  }

  return {
    ok: false,
    error: "File content does not match a supported image type (JPEG, PNG, WebP, or AVIF).",
  };
}
