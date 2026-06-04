// Node --test runner for the image magic-byte verifier.
// The verifier itself lives at src/lib/uploads/magic-bytes.ts and uses
// TypeScript "server-only", so we re-express the logic here in plain JS
// rather than transpile at test time. The verify-hardening assertions
// grep both files for the same byte literals so this implementation
// cannot drift from the production helper silently.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP_RIFF_PREFIX = [0x52, 0x49, 0x46, 0x46];
const WEBP_FORMAT_MARKER = [0x57, 0x45, 0x42, 0x50];

function matches(bytes, signature, offset = 0) {
  if (bytes.byteLength < offset + signature.length) return false;
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[offset + i] !== signature[i]) return false;
  }
  return true;
}

async function verifyImageMagicBytes(file) {
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

function fileFromBytes(arrayLike, name = "input.bin", type = "application/octet-stream") {
  const buffer = new Uint8Array(arrayLike).buffer;
  return new File([buffer], name, { type });
}

test("accepts JPEG header", async () => {
  const file = fileFromBytes([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01], "a.jpg", "image/jpeg");
  const result = await verifyImageMagicBytes(file);
  assert.deepEqual(result, { ok: true, contentType: "image/jpeg" });
});

test("accepts PNG header", async () => {
  const file = fileFromBytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d], "a.png", "image/png");
  const result = await verifyImageMagicBytes(file);
  assert.deepEqual(result, { ok: true, contentType: "image/png" });
});

test("accepts WebP header (RIFF....WEBP)", async () => {
  const file = fileFromBytes([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50], "a.webp", "image/webp");
  const result = await verifyImageMagicBytes(file);
  assert.deepEqual(result, { ok: true, contentType: "image/webp" });
});

test("rejects HTML payload declared as JPEG", async () => {
  const html = "<!DOCTYPE html><html><body>x</body></html>";
  const bytes = new TextEncoder().encode(html);
  const file = new File([bytes], "fake.jpg", { type: "image/jpeg" });
  const result = await verifyImageMagicBytes(file);
  assert.equal(result.ok, false);
});

test("rejects WAV (RIFF....WAVE) declared as WebP", async () => {
  const file = fileFromBytes([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45], "fake.webp", "image/webp");
  const result = await verifyImageMagicBytes(file);
  assert.equal(result.ok, false);
});

test("rejects 2-byte file as too small", async () => {
  const file = fileFromBytes([0xff, 0xd8], "tiny.jpg", "image/jpeg");
  const result = await verifyImageMagicBytes(file);
  assert.equal(result.ok, false);
  assert.match(result.error, /too small/i);
});

test("rejects empty file", async () => {
  const file = new File([new Uint8Array(0)], "empty.png", { type: "image/png" });
  const result = await verifyImageMagicBytes(file);
  assert.equal(result.ok, false);
});

test("rejects 6-byte PNG truncation (header started but incomplete)", async () => {
  const file = fileFromBytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a], "broken.png", "image/png");
  const result = await verifyImageMagicBytes(file);
  assert.equal(result.ok, false);
});

test("YNOT admin image uploads reject oversized bodies before form parsing", () => {
  const cardImageRoute = readSource("../src/app/api/ynot/admin/cards/image/route.ts");
  const paymentQrRoute = readSource("../src/app/api/ynot/admin/payment-methods/qr-image/route.ts");
  const uploadHelper = readSource("../src/lib/uploads/magic-bytes.ts");

  assert.match(uploadHelper, /requestExceedsUploadLimit\(request: Request/);
  assert.match(uploadHelper, /content-length/);
  for (const route of [cardImageRoute, paymentQrRoute]) {
    assert.match(route, /requestExceedsUploadLimit\(request,\s*maxSlipBytes\)/);
    assert.match(route, /status:\s*413/);
    assert.match(route, /requestExceedsUploadLimit\(request,\s*maxSlipBytes\)[\s\S]*request\.formData\(\)/);
  }
});

test("YNOT admin uploads stream to storage without full file buffer copies", () => {
  const cardImageRoute = readSource("../src/app/api/ynot/admin/cards/image/route.ts");
  const paymentQrRoute = readSource("../src/app/api/ynot/admin/payment-methods/qr-image/route.ts");
  const tierAnimationRoute = readSource("../src/app/api/ynot/admin/tier-animations/route.ts");

  for (const route of [cardImageRoute, paymentQrRoute, tierAnimationRoute]) {
    assert.doesNotMatch(route, /file\.arrayBuffer\(\)/);
    assert.doesNotMatch(route, /new Uint8Array\(await file\.arrayBuffer\(\)\)/);
    assert.match(route, /\.upload\(\s*path,\s*file\.stream\(\),/);
  }
});
