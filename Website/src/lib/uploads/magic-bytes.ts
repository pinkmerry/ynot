import "server-only";

export const maxSlipBytes = 10 * 1024 * 1024;
export const maxMultipartEnvelopeBytes = 64 * 1024;

export const allowedSlipTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type VerifiedImageContentType = "image/jpeg" | "image/png" | "image/webp";

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

const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP_RIFF_PREFIX = [0x52, 0x49, 0x46, 0x46];
const WEBP_FORMAT_MARKER = [0x57, 0x45, 0x42, 0x50];

function matches(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.byteLength < offset + signature.length) return false;
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[offset + i] !== signature[i]) return false;
  }
  return true;
}

export async function verifyImageMagicBytes(file: File): Promise<VerifyImageMagicBytesResult> {
  const header = await file.slice(0, 12).arrayBuffer();
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

  return { ok: false, error: "File content does not match a supported image type (JPEG, PNG, or WebP)." };
}
