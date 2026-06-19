# Admin AVIF Visual Image Uploads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins upload AVIF files for visual asset images while existing JPG, PNG, and WebP behavior keeps working and payment/slip image flows stay unchanged.

**Architecture:** Add purpose-specific upload policies so admin visual assets accept AVIF but payment QR and slip uploads remain JPG/PNG/WebP only. Extend server-side magic-byte verification to recognize AVIF safely, then update the visual upload API routes, admin UI accept lists, storage bucket MIME allowlists, and source-level tests that prove all customer-facing image display paths still pass URLs through correctly.

**Tech Stack:** Next.js App Router, React, TypeScript, Supabase Storage, Supabase RPCs, Node `node:test`, YNOTT admin/customer image surfaces.

---

## Scope

In scope:
- YNOTT admin visual image uploads:
  - Main SKU / card catalog image upload through `/api/ynot/admin/cards/image`
  - Sub-SKU and stock-unit images that reuse `/api/ynot/admin/cards/image`
  - Pack banner image upload through `/api/ynot/admin/campaigns/banner-image`
  - Legacy lucky-draw admin card image upload through `/api/lucky-draw/admin/card-image`
  - Tier animation poster upload through `/api/ynot/admin/tier-animations`
- Customer/admin image display paths that use stored URLs:
  - pack list cards
  - pack detail hero
  - prize/reward images
  - bag/collection/shipping images
  - tier animation posters

Out of scope:
- Payment slips and payment QR images accepting AVIF. These stay JPG/PNG/WebP because payment verification and QR scanning integrations are a different risk boundary.
- Image conversion, fallback generation, CDN transcoding, or changing stored URL schemas.
- RPC rewrites. The stock image RPCs already accept `image_url` and `image_storage_path` as text.

## File Structure

- Modify `Website/src/lib/uploads/magic-bytes.ts`
  - Owns max upload size, MIME allowlists, magic-byte verification, and verified image extension mapping.
- Modify `Website/scripts/test-magic-bytes.mjs`
  - Locks AVIF magic-byte recognition and prevents AVIF leakage into slip/payment routes.
- Modify `Website/scripts/test-pack-banner-image-upload.mjs`
  - Locks pack banner upload validation, `.avif` banner storage path validation, and path-safe fixture loading.
- Create `Website/scripts/test-admin-avif-image-surfaces.mjs`
  - Locks admin UI accept lists and customer image URL pass-through behavior for AVIF URLs.
- Modify `Website/package.json`
  - Adds `test:admin-avif-images`.
- Modify `Website/src/app/api/ynot/admin/cards/image/route.ts`
  - Allows AVIF for YNOTT visual card/catalog/stock image uploads.
- Modify `Website/src/app/api/ynot/admin/campaigns/banner-image/route.ts`
  - Allows AVIF for pack banner uploads.
- Modify `Website/src/app/api/ynot/admin/campaigns/route.ts`
  - Allows saved pack banner storage paths ending in `.avif`.
- Modify `Website/src/app/api/lucky-draw/admin/card-image/route.ts`
  - Allows AVIF for legacy lucky-draw visual card image uploads.
- Modify `Website/src/app/api/ynot/admin/payment-methods/qr-image/route.ts`
  - Keeps QR uploads limited to JPG/PNG/WebP and checks verified content type after magic verification.
- Modify `Website/src/app/api/lucky-draw/admin/qr/route.ts`
  - Keeps legacy QR uploads limited to JPG/PNG/WebP and checks verified content type after magic verification.
- Modify `Website/src/app/api/ynot/wallet/route.ts`
  - Keeps top-up slip uploads limited to JPG/PNG/WebP and checks verified content type after magic verification.
- Modify `Website/src/app/api/lucky-draw/route.ts`
  - Keeps legacy checkout slip uploads limited to JPG/PNG/WebP and checks verified content type after magic verification.
- Modify `Website/src/features/ynot/client.tsx`
  - Splits visual image upload types from QR image upload types and updates visual admin accept strings/messages.
- Modify `Website/src/features/lucky-draw/admin/AdminView.tsx`
  - Allows AVIF for legacy card image controls only, not QR controls.
- Modify `Website/src/app/admin/tier-animations/AdminTierAnimationForm.tsx`
  - Allows AVIF for poster image file picker.
- Modify `Website/src/app/api/ynot/admin/tier-animations/route.ts`
  - Allows AVIF for poster uploads and assigns a correct `.avif` extension when needed.
- Create `Database/supabase/migrations/20260611190000_allow_avif_visual_asset_uploads.sql`
  - Adds `image/avif` to visual asset buckets only.

## Implementation Tasks

### Task 1: Fix Banner Test Path Loading

**Files:**
- Modify: `Website/scripts/test-pack-banner-image-upload.mjs`

- [ ] **Step 1: Replace URL pathname path handling**

Replace the import block and `root` definition at the top of `Website/scripts/test-pack-banner-image-upload.mjs` with:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
```

- [ ] **Step 2: Run the existing banner test**

Run from `Website/`:

```bash
npm run test:pack-banner-images
```

Expected: PASS or feature-related failures only. It must not fail because `/Users/pinkmerry/Project%20X/...` cannot be opened.

- [ ] **Step 3: Commit**

```bash
git add Website/scripts/test-pack-banner-image-upload.mjs
git commit -m "Stabilize banner image upload test path handling

Constraint: Repo paths can contain spaces on this machine.
Confidence: high
Scope-risk: narrow
Directive: Keep file URL conversion path-safe in Node tests.
Tested: npm run test:pack-banner-images
Not-tested: Browser upload flow"
```

### Task 2: Write AVIF Upload Policy Tests

**Files:**
- Modify: `Website/scripts/test-magic-bytes.mjs`

- [ ] **Step 1: Add AVIF constants and purpose-specific allowlists to the test mirror**

In `Website/scripts/test-magic-bytes.mjs`, replace the constants and helper section from `const JPEG_SIGNATURE` through `verifyImageMagicBytes` with:

```js
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP_RIFF_PREFIX = [0x52, 0x49, 0x46, 0x46];
const WEBP_FORMAT_MARKER = [0x57, 0x45, 0x42, 0x50];
const BMFF_FTYP_MARKER = [0x66, 0x74, 0x79, 0x70];
const allowedSlipTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const allowedVisualAssetTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

function matches(bytes, signature, offset = 0) {
  if (bytes.byteLength < offset + signature.length) return false;
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[offset + i] !== signature[i]) return false;
  }
  return true;
}

function ascii(bytes, offset, length) {
  if (bytes.byteLength < offset + length) return "";
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function hasAvifBrand(bytes) {
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

async function verifyImageMagicBytes(file) {
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
```

- [ ] **Step 2: Add AVIF tests**

Add these tests after the existing WebP header test:

```js
test("accepts AVIF header with avif major brand", async () => {
  const file = fileFromBytes(
    [
      0x00, 0x00, 0x00, 0x20,
      0x66, 0x74, 0x79, 0x70,
      0x61, 0x76, 0x69, 0x66,
      0x00, 0x00, 0x00, 0x00,
      0x61, 0x76, 0x69, 0x66,
    ],
    "a.avif",
    "image/avif",
  );
  const result = await verifyImageMagicBytes(file);
  assert.deepEqual(result, { ok: true, contentType: "image/avif" });
});

test("accepts AVIF header with avif compatible brand", async () => {
  const file = fileFromBytes(
    [
      0x00, 0x00, 0x00, 0x20,
      0x66, 0x74, 0x79, 0x70,
      0x6d, 0x69, 0x66, 0x31,
      0x00, 0x00, 0x00, 0x00,
      0x61, 0x76, 0x69, 0x66,
    ],
    "compatible.avif",
    "image/avif",
  );
  const result = await verifyImageMagicBytes(file);
  assert.deepEqual(result, { ok: true, contentType: "image/avif" });
});

test("rejects BMFF file without AVIF brand", async () => {
  const file = fileFromBytes(
    [
      0x00, 0x00, 0x00, 0x20,
      0x66, 0x74, 0x79, 0x70,
      0x6d, 0x70, 0x34, 0x32,
      0x00, 0x00, 0x00, 0x00,
      0x6d, 0x70, 0x34, 0x32,
    ],
    "video-ish.avif",
    "image/avif",
  );
  const result = await verifyImageMagicBytes(file);
  assert.equal(result.ok, false);
});

test("purpose allowlists let visual assets use AVIF but keep slips on JPG PNG WEBP", () => {
  assert.equal(allowedVisualAssetTypes.has("image/avif"), true);
  assert.equal(allowedSlipTypes.has("image/avif"), false);
  assert.equal(allowedSlipTypes.has("image/jpeg"), true);
  assert.equal(allowedSlipTypes.has("image/png"), true);
  assert.equal(allowedSlipTypes.has("image/webp"), true);
});
```

- [ ] **Step 3: Add source assertions for slip/payment route verified-type guards**

Extend the existing `"YNOT admin image uploads reject oversized bodies before form parsing"` test or add a new test below it:

```js
test("slip and QR routes re-check the verified content type against the slip allowlist", () => {
  const ynotWalletRoute = readSource("../src/app/api/ynot/wallet/route.ts");
  const luckyDrawCheckoutRoute = readSource("../src/app/api/lucky-draw/route.ts");
  const ynotQrRoute = readSource("../src/app/api/ynot/admin/payment-methods/qr-image/route.ts");
  const luckyDrawQrRoute = readSource("../src/app/api/lucky-draw/admin/qr/route.ts");

  for (const route of [
    ynotWalletRoute,
    luckyDrawCheckoutRoute,
    ynotQrRoute,
    luckyDrawQrRoute,
  ]) {
    assert.match(route, /allowedSlipTypes\.has\(magicCheck\.contentType\)/);
  }
});
```

- [ ] **Step 4: Run tests and verify failure before implementation**

Run from `Website/`:

```bash
npm run test:uploads
```

Expected: FAIL because production code does not yet export `allowedVisualAssetTypes`, does not recognize AVIF, and slip/QR routes do not yet re-check `magicCheck.contentType`.

### Task 3: Implement Purpose-Specific Image Magic Verification

**Files:**
- Modify: `Website/src/lib/uploads/magic-bytes.ts`
- Modify: `Website/src/app/api/ynot/wallet/route.ts`
- Modify: `Website/src/app/api/lucky-draw/route.ts`
- Modify: `Website/src/app/api/ynot/admin/payment-methods/qr-image/route.ts`
- Modify: `Website/src/app/api/lucky-draw/admin/qr/route.ts`

- [ ] **Step 1: Replace the upload helper content**

Replace `Website/src/lib/uploads/magic-bytes.ts` with:

```ts
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

function ascii(bytes: Uint8Array, offset: number, length: number) {
  if (bytes.byteLength < offset + length) return "";
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function hasAvifBrand(bytes: Uint8Array) {
  if (!matches(bytes, BMFF_FTYP_MARKER, 4)) return false;
  const majorBrand = ascii(bytes, 8, 4);
  if (majorBrand === "avif" || majorBrand === "avis") return true;

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
```

- [ ] **Step 2: Add verified-type guards to payment/slip routes**

In each route below, immediately after `if (!magicCheck.ok) { ... }`, add the shown guard.

`Website/src/app/api/ynot/wallet/route.ts`:

```ts
  if (!allowedSlipTypes.has(magicCheck.contentType)) {
    return jsonNoStore({ error: "Slip must be JPG, PNG, or WEBP." }, { status: 400 });
  }
```

`Website/src/app/api/lucky-draw/route.ts`:

```ts
  if (magicCheck && !allowedSlipTypes.has(magicCheck.contentType)) {
    return Response.json({ error: "Slip must be JPG, PNG, or WEBP." }, { status: 400 });
  }
```

`Website/src/app/api/ynot/admin/payment-methods/qr-image/route.ts`:

```ts
  if (!allowedSlipTypes.has(magicCheck.contentType)) {
    return Response.json(
      { error: "QR image must be JPG, PNG, or WEBP." },
      { status: 400 },
    );
  }
```

`Website/src/app/api/lucky-draw/admin/qr/route.ts`:

```ts
  if (!allowedSlipTypes.has(magicCheck.contentType)) {
    return Response.json({ error: "QR image must be JPG, PNG, or WEBP." }, { status: 400 });
  }
```

- [ ] **Step 3: Use centralized extension mapping in QR routes**

In `Website/src/app/api/ynot/admin/payment-methods/qr-image/route.ts` and `Website/src/app/api/lucky-draw/admin/qr/route.ts`:

Replace the import of `type VerifiedImageContentType` with `extensionForVerifiedImage`.

Delete the local `extensionFor` function.

Replace:

```ts
const ext = extensionFor(magicCheck.contentType);
```

or:

```ts
extensionFor(magicCheck.contentType)
```

with:

```ts
const ext = extensionForVerifiedImage(magicCheck.contentType);
```

For the legacy lucky-draw QR route, use this path line:

```ts
  const path = `payment-qr/${activeDraw.id}-${Date.now()}.${extensionForVerifiedImage(magicCheck.contentType)}`;
```

- [ ] **Step 4: Run upload tests**

Run from `Website/`:

```bash
npm run test:uploads
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Website/src/lib/uploads/magic-bytes.ts Website/src/app/api/ynot/wallet/route.ts Website/src/app/api/lucky-draw/route.ts Website/src/app/api/ynot/admin/payment-methods/qr-image/route.ts Website/src/app/api/lucky-draw/admin/qr/route.ts Website/scripts/test-magic-bytes.mjs
git commit -m "Allow AVIF verification without changing payment upload policy

Constraint: Payment slips and QR images must stay JPG PNG WEBP only.
Rejected: Adding AVIF to the shared slip allowlist | would silently widen payment upload surfaces.
Confidence: high
Scope-risk: moderate
Directive: Re-check verified content type against the route purpose allowlist after magic-byte detection.
Tested: npm run test:uploads
Not-tested: Browser upload UI"
```

### Task 4: Write API and Storage-Path Tests for Visual Uploads

**Files:**
- Modify: `Website/scripts/test-pack-banner-image-upload.mjs`

- [ ] **Step 1: Update banner upload route expectations**

In `Website/scripts/test-pack-banner-image-upload.mjs`, replace the `"admin banner upload route is guarded and validates image uploads"` test with:

```js
test("admin banner upload route is guarded and validates visual image uploads", () => {
  const route = source("src/app/api/ynot/admin/campaigns/banner-image/route.ts");

  assert.match(route, /resolveAdminSession/);
  assert.match(route, /ynot:admin:campaigns:banner-image/);
  assert.match(route, /requestExceedsUploadLimit\(request, maxSlipBytes\)/);
  assert.match(route, /allowedVisualAssetTypes\.has\(file\.type\)/);
  assert.match(route, /allowedVisualAssetTypes\.has\(magicCheck\.contentType\)/);
  assert.match(route, /verifyImageMagicBytes\(file\)/);
  assert.match(route, /campaign-banners\/\$\{day\}/);
  assert.match(route, /extensionForVerifiedImage\(magicCheck\.contentType\)/);
  assert.match(route, /campaign_banner_image_uploaded/);
});
```

- [ ] **Step 2: Add banner path regex AVIF coverage**

Add this test after `"admin campaign API accepts only uploaded banner image paths"`:

```js
test("admin campaign API allows AVIF banner storage paths from the upload flow", () => {
  const route = source("src/app/api/ynot/admin/campaigns/route.ts");

  assert.match(route, /campaignBannerPathPattern/);
  assert.match(route, /\(jpg\|png\|webp\|avif\)/);
  assert.match(route, /campaignBannerPathPattern\.test\(requestedPath\)/);
});
```

- [ ] **Step 3: Run banner image tests and verify failure before implementation**

Run from `Website/`:

```bash
npm run test:pack-banner-images
```

Expected: FAIL because banner upload still imports `allowedSlipTypes` and the campaign banner path regex still rejects `.avif`.

### Task 5: Implement Visual Upload API AVIF Support

**Files:**
- Modify: `Website/src/app/api/ynot/admin/cards/image/route.ts`
- Modify: `Website/src/app/api/ynot/admin/campaigns/banner-image/route.ts`
- Modify: `Website/src/app/api/ynot/admin/campaigns/route.ts`
- Modify: `Website/src/app/api/lucky-draw/admin/card-image/route.ts`

- [ ] **Step 1: Update YNOT card image upload route**

In `Website/src/app/api/ynot/admin/cards/image/route.ts`, change the upload-helper import to:

```ts
import {
  allowedVisualAssetTypes,
  extensionForVerifiedImage,
  maxSlipBytes,
  requestExceedsUploadLimit,
  verifyImageMagicBytes,
} from "@/lib/uploads/magic-bytes";
```

Delete the local `extensionFor` function.

Replace both file type checks with:

```ts
  if (!allowedVisualAssetTypes.has(file.type)) {
    return Response.json(
      { error: "Card image must be JPG, PNG, WEBP, or AVIF." },
      { status: 400 },
    );
  }
```

After the `magicCheck.ok` block, add:

```ts
  if (!allowedVisualAssetTypes.has(magicCheck.contentType)) {
    return Response.json(
      { error: "Card image must be JPG, PNG, WEBP, or AVIF." },
      { status: 400 },
    );
  }
```

Replace:

```ts
  const ext = extensionFor(magicCheck.contentType);
```

with:

```ts
  const ext = extensionForVerifiedImage(magicCheck.contentType);
```

- [ ] **Step 2: Update YNOT banner image upload route**

In `Website/src/app/api/ynot/admin/campaigns/banner-image/route.ts`, change the upload-helper import to:

```ts
import {
  allowedVisualAssetTypes,
  extensionForVerifiedImage,
  maxSlipBytes,
  requestExceedsUploadLimit,
  verifyImageMagicBytes,
} from "@/lib/uploads/magic-bytes";
```

Delete the local `extensionFor` function.

Replace the declared type check with:

```ts
  if (!allowedVisualAssetTypes.has(file.type)) {
    return Response.json(
      { error: "Pack banner image must be JPG, PNG, WEBP, or AVIF." },
      { status: 400 },
    );
  }
```

After the `magicCheck.ok` block, add:

```ts
  if (!allowedVisualAssetTypes.has(magicCheck.contentType)) {
    return Response.json(
      { error: "Pack banner image must be JPG, PNG, WEBP, or AVIF." },
      { status: 400 },
    );
  }
```

Replace:

```ts
  const ext = extensionFor(magicCheck.contentType);
```

with:

```ts
  const ext = extensionForVerifiedImage(magicCheck.contentType);
```

- [ ] **Step 3: Allow `.avif` banner storage paths when saving campaigns**

In `Website/src/app/api/ynot/admin/campaigns/route.ts`, replace:

```ts
const campaignBannerPathPattern =
  /^campaign-banners\/\d{4}-\d{2}-\d{2}\/\d+-[0-9a-f-]{36}-[a-z0-9._-]+\.(jpg|png|webp)$/;
```

with:

```ts
const campaignBannerPathPattern =
  /^campaign-banners\/\d{4}-\d{2}-\d{2}\/\d+-[0-9a-f-]{36}-[a-z0-9._-]+\.(jpg|png|webp|avif)$/;
```

- [ ] **Step 4: Update legacy lucky-draw card image upload route**

In `Website/src/app/api/lucky-draw/admin/card-image/route.ts`, change the upload-helper import to:

```ts
import {
  allowedVisualAssetTypes,
  extensionForVerifiedImage,
  maxSlipBytes,
  verifyImageMagicBytes,
} from "@/lib/uploads/magic-bytes";
```

Delete the local `extensionFor` function.

Replace the declared type check with:

```ts
  if (!allowedVisualAssetTypes.has(file.type)) {
    return Response.json({ error: "Card image must be JPG, PNG, WEBP, or AVIF." }, { status: 400 });
  }
```

After the `magicCheck.ok` block, add:

```ts
  if (!allowedVisualAssetTypes.has(magicCheck.contentType)) {
    return Response.json({ error: "Card image must be JPG, PNG, WEBP, or AVIF." }, { status: 400 });
  }
```

Replace:

```ts
  const path = `card-images/${activeDraw.id}/${Date.now()}.${extensionFor(magicCheck.contentType)}`;
```

with:

```ts
  const path = `card-images/${activeDraw.id}/${Date.now()}.${extensionForVerifiedImage(magicCheck.contentType)}`;
```

- [ ] **Step 5: Run route tests**

Run from `Website/`:

```bash
npm run test:uploads
npm run test:pack-banner-images
```

Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add Website/src/app/api/ynot/admin/cards/image/route.ts Website/src/app/api/ynot/admin/campaigns/banner-image/route.ts Website/src/app/api/ynot/admin/campaigns/route.ts Website/src/app/api/lucky-draw/admin/card-image/route.ts Website/scripts/test-pack-banner-image-upload.mjs
git commit -m "Allow AVIF on admin visual image upload APIs

Constraint: Admin visual assets can use AVIF but payment surfaces cannot.
Rejected: Reusing allowedSlipTypes for visual assets | the name and behavior are payment-specific.
Confidence: high
Scope-risk: moderate
Directive: Visual upload routes must check both declared file type and verified magic type against allowedVisualAssetTypes.
Tested: npm run test:uploads; npm run test:pack-banner-images
Not-tested: Supabase bucket upload against production"
```

### Task 6: Write Admin UI and Display Surface Tests

**Files:**
- Create: `Website/scripts/test-admin-avif-image-surfaces.mjs`
- Modify: `Website/package.json`
- Modify: `Website/scripts/test-subsku-image-routing.mjs`

- [ ] **Step 1: Create source-level AVIF surface test**

Create `Website/scripts/test-admin-avif-image-surfaces.mjs` with:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("YNOT admin visual upload controls accept AVIF while QR controls do not", () => {
  const client = source("../src/features/ynot/client.tsx");

  assert.match(
    client,
    /const adminVisualImageUploadTypes = new Set\(\["image\/jpeg", "image\/png", "image\/webp", "image\/avif"\]\)/,
  );
  assert.match(
    client,
    /const paymentQrImageUploadTypes = new Set\(\["image\/jpeg", "image\/png", "image\/webp"\]\)/,
  );
  assert.match(client, /const adminVisualImageAccept = "image\/jpeg,image\/png,image\/webp,image\/avif";/);
  assert.match(client, /const paymentQrImageAccept = "image\/jpeg,image\/png,image\/webp";/);
  assert.match(client, /Use a JPG, PNG, WEBP, or AVIF image\./);
  assert.match(client, /Pack banner image must be JPG, PNG, WEBP, or AVIF\./);

  const qrDropzoneStart = client.indexOf("function AdminQrImageDropzone");
  const qrDropzoneEnd = client.indexOf("function AdminCategoryManager");
  const qrDropzoneSource = client.slice(qrDropzoneStart, qrDropzoneEnd);
  assert.match(qrDropzoneSource, /paymentQrImageUploadTypes\.has\(file\.type\)/);
  assert.match(qrDropzoneSource, /accept=\{paymentQrImageAccept\}/);
  assert.doesNotMatch(qrDropzoneSource, /image\/avif/);
});

test("legacy lucky-draw card image controls accept AVIF but QR and slip controls do not", () => {
  const admin = source("../src/features/lucky-draw/admin/AdminView.tsx");
  const checkout = source("../src/features/lucky-draw/customer/CheckoutView.tsx");
  const wallet = source("../src/features/ynot/cr/WalletExperience.tsx");

  assert.match(admin, /accept="image\/jpeg,image\/png,image\/webp,image\/avif"/);
  assert.match(admin, /JPG, PNG, WEBP, or AVIF/);
  assert.match(admin, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(checkout, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.doesNotMatch(checkout, /image\/avif/);
  assert.match(wallet, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.doesNotMatch(wallet, /image\/avif/);
});

test("tier animation poster controls accept AVIF", () => {
  const form = source("../src/app/admin/tier-animations/AdminTierAnimationForm.tsx");
  const route = source("../src/app/api/ynot/admin/tier-animations/route.ts");

  assert.match(form, /accept="image\/png,image\/jpeg,image\/webp,image\/avif"/);
  assert.match(route, /ALLOWED_POSTER_MIME = new Set\(\["image\/png", "image\/jpeg", "image\/webp", "image\/avif"\]\)/);
  assert.match(route, /extensionForUpload\(file, fallbackExt\)/);
});

test("visual asset storage migration adds AVIF only to visual buckets", () => {
  const migration = source("../../Database/supabase/migrations/20260611190000_allow_avif_visual_asset_uploads.sql");

  assert.match(migration, /where id = 'lucky-draw-assets'/);
  assert.match(migration, /where id = 'tier-animations'/);
  assert.match(migration, /'image\/avif'/);
  assert.match(migration, /payment-slips/);
  assert.match(migration, /raise exception 'payment-slips must not allow image\/avif'/);
});
```

- [ ] **Step 2: Add AVIF URL pass-through coverage to sub-SKU image tests**

In `Website/scripts/test-subsku-image-routing.mjs`, add these assertions inside the first test after the existing `.png` assertion:

```js
  assert.equal(
    helper.publicSubSkuImageUrl(" https://cdn.example/unit.avif ", "https://cdn.example/catalog.png"),
    "https://cdn.example/unit.avif",
  );
  assert.equal(
    helper.publicSubSkuImageUrl("", " https://cdn.example/catalog.avif "),
    "https://cdn.example/catalog.avif",
  );
```

- [ ] **Step 3: Add package script**

In `Website/package.json`, add this script after `test:pack-banner-images`:

```json
"test:admin-avif-images": "node --test scripts/test-admin-avif-image-surfaces.mjs",
```

- [ ] **Step 4: Run new tests and verify failure before UI/storage implementation**

Run from `Website/`:

```bash
npm run test:admin-avif-images
npm run test:subsku-images
```

Expected:
- `test:admin-avif-images` FAILS because UI and migration changes are not implemented yet.
- `test:subsku-images` PASSES because URL pass-through already supports `.avif` URLs.

### Task 7: Implement Admin UI AVIF Accept Lists

**Files:**
- Modify: `Website/src/features/ynot/client.tsx`
- Modify: `Website/src/features/lucky-draw/admin/AdminView.tsx`
- Modify: `Website/src/app/admin/tier-animations/AdminTierAnimationForm.tsx`

- [ ] **Step 1: Split YNOT visual and QR file type constants**

In `Website/src/features/ynot/client.tsx`, replace:

```ts
const maxAdminImageUploadBytes = 10 * 1024 * 1024;
const adminImageUploadTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
```

with:

```ts
const maxAdminImageUploadBytes = 10 * 1024 * 1024;
const adminVisualImageAccept = "image/jpeg,image/png,image/webp,image/avif";
const paymentQrImageAccept = "image/jpeg,image/png,image/webp";
const adminVisualImageUploadTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);
const paymentQrImageUploadTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
```

- [ ] **Step 2: Update `AdminImageDropzone` visual upload messaging**

In `Website/src/features/ynot/client.tsx`, inside `AdminImageDropzone`, replace:

```ts
  hint = "JPG, PNG, or WEBP. Uploaded to Supabase storage.",
```

with:

```ts
  hint = "JPG, PNG, WEBP, or AVIF. Uploaded to Supabase storage.",
```

Replace:

```ts
    if (!adminImageUploadTypes.has(file.type)) {
      setFileError("Use a JPG, PNG, or WEBP image.");
```

with:

```ts
    if (!adminVisualImageUploadTypes.has(file.type)) {
      setFileError("Use a JPG, PNG, WEBP, or AVIF image.");
```

Replace:

```tsx
          accept="image/jpeg,image/png,image/webp"
```

with:

```tsx
          accept={adminVisualImageAccept}
```

- [ ] **Step 3: Keep `AdminQrImageDropzone` on JPG/PNG/WebP**

In `Website/src/features/ynot/client.tsx`, inside `AdminQrImageDropzone`, replace:

```ts
    if (!adminImageUploadTypes.has(file.type)) {
      setFileError("Use a JPG, PNG, or WEBP image.");
```

with:

```ts
    if (!paymentQrImageUploadTypes.has(file.type)) {
      setFileError("Use a JPG, PNG, or WEBP image.");
```

Replace:

```tsx
          accept="image/jpeg,image/png,image/webp"
```

with:

```tsx
          accept={paymentQrImageAccept}
```

- [ ] **Step 4: Update pack banner image picker**

In `Website/src/features/ynot/client.tsx`, inside the pack banner input, replace:

```tsx
                      accept="image/jpeg,image/png,image/webp"
```

with:

```tsx
                      accept={adminVisualImageAccept}
```

Replace:

```ts
                        if (!adminImageUploadTypes.has(file.type)) {
                          setMessageTone("error");
                          setMessage("Pack banner image must be JPG, PNG, or WEBP.");
```

with:

```ts
                        if (!adminVisualImageUploadTypes.has(file.type)) {
                          setMessageTone("error");
                          setMessage("Pack banner image must be JPG, PNG, WEBP, or AVIF.");
```

Replace:

```tsx
                Accepted ratio 4:3. Recommended 1600 x 1200. JPG, PNG, or WEBP
```

with:

```tsx
                Accepted ratio 4:3. Recommended 1600 x 1200. JPG, PNG, WEBP, or AVIF
```

- [ ] **Step 5: Update stock-unit inline image picker**

In `Website/src/features/ynot/client.tsx`, replace:

```tsx
              accept="image/png,image/jpeg,image/webp"
```

with:

```tsx
              accept={adminVisualImageAccept}
```

Find the image file handler near this control. Replace any remaining:

```ts
adminImageUploadTypes.has(file.type)
```

with:

```ts
adminVisualImageUploadTypes.has(file.type)
```

For the stock image error message, use:

```ts
"Use a JPG, PNG, WEBP, or AVIF image."
```

- [ ] **Step 6: Update legacy lucky-draw admin card image controls**

In `Website/src/features/lucky-draw/admin/AdminView.tsx`, change only the card/visual image file inputs and their nearby helper text from:

```tsx
accept="image/jpeg,image/png,image/webp"
```

to:

```tsx
accept="image/jpeg,image/png,image/webp,image/avif"
```

Change card image helper text from:

```tsx
JPG, PNG, or WEBP · max 10 MB
```

to:

```tsx
JPG, PNG, WEBP, or AVIF · max 10 MB
```

Leave legacy QR and slip controls as:

```tsx
accept="image/jpeg,image/png,image/webp"
```

- [ ] **Step 7: Update tier animation poster input**

In `Website/src/app/admin/tier-animations/AdminTierAnimationForm.tsx`, replace:

```tsx
<input type="file" name="poster" accept="image/png,image/jpeg,image/webp" />
```

with:

```tsx
<input type="file" name="poster" accept="image/png,image/jpeg,image/webp,image/avif" />
```

- [ ] **Step 8: Run UI source tests**

Run from `Website/`:

```bash
npm run test:admin-avif-images
```

Expected: still FAIL because tier route and storage migration are not complete yet. The YNOT UI assertions should pass.

### Task 8: Implement Tier Poster AVIF Support

**Files:**
- Modify: `Website/src/app/api/ynot/admin/tier-animations/route.ts`

- [ ] **Step 1: Add poster MIME set and extension mapping**

In `Website/src/app/api/ynot/admin/tier-animations/route.ts`, after `ALLOWED_AUDIO_MIME`, add:

```ts
const ALLOWED_POSTER_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/avif"]);
const EXTENSION_BY_MIME = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
  ["video/mp4", "mp4"],
  ["video/webm", "webm"],
  ["audio/mpeg", "mp3"],
  ["audio/mp3", "mp3"],
  ["audio/wav", "wav"],
  ["audio/ogg", "ogg"],
]);
```

- [ ] **Step 2: Replace extension picker**

Replace:

```ts
function pickExtension(file: File, fallback: string) {
  const name = file.name?.toLowerCase() ?? "";
  const dot = name.lastIndexOf(".");
  if (dot > -1 && dot < name.length - 1) return name.slice(dot + 1);
  return fallback;
}
```

with:

```ts
function extensionForUpload(file: File, fallback: string) {
  const name = file.name?.toLowerCase() ?? "";
  const dot = name.lastIndexOf(".");
  if (dot > -1 && dot < name.length - 1) return name.slice(dot + 1);
  return EXTENSION_BY_MIME.get(file.type) ?? fallback;
}
```

Inside `uploadAndGetUrl`, replace:

```ts
    const ext = pickExtension(file, fallbackExt);
```

with:

```ts
    const ext = extensionForUpload(file, fallbackExt);
```

- [ ] **Step 3: Use poster MIME set**

Replace:

```ts
        new Set(["image/png", "image/jpeg", "image/webp"]),
```

with:

```ts
        ALLOWED_POSTER_MIME,
```

- [ ] **Step 4: Run tier/UI source tests**

Run from `Website/`:

```bash
npm run test:admin-avif-images
```

Expected: FAIL only because the storage migration file does not exist yet.

### Task 9: Add Supabase Storage Bucket AVIF Migration

**Files:**
- Create: `Database/supabase/migrations/20260611190000_allow_avif_visual_asset_uploads.sql`

- [ ] **Step 1: Create migration**

Create `Database/supabase/migrations/20260611190000_allow_avif_visual_asset_uploads.sql`:

```sql
-- Allow AVIF only for public visual asset uploads.
-- Payment slips stay JPG/PNG/WebP because payment verification is a separate boundary.

update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
where id = 'lucky-draw-assets';

update storage.buckets
set allowed_mime_types = array[
  'video/mp4',
  'video/webm',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/avif',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/ogg'
]
where id = 'tier-animations';

do $$
begin
  if exists (
    select 1
    from storage.buckets
    where id = 'payment-slips'
      and allowed_mime_types is not null
      and 'image/avif' = any(allowed_mime_types)
  ) then
    raise exception 'payment-slips must not allow image/avif';
  end if;
end $$;
```

- [ ] **Step 2: Run source tests**

Run from `Website/`:

```bash
npm run test:admin-avif-images
```

Expected: PASS.

- [ ] **Step 3: Commit UI, tier, and migration changes**

```bash
git add Website/src/features/ynot/client.tsx Website/src/features/lucky-draw/admin/AdminView.tsx Website/src/app/admin/tier-animations/AdminTierAnimationForm.tsx Website/src/app/api/ynot/admin/tier-animations/route.ts Website/scripts/test-admin-avif-image-surfaces.mjs Website/scripts/test-subsku-image-routing.mjs Website/package.json Database/supabase/migrations/20260611190000_allow_avif_visual_asset_uploads.sql
git commit -m "Expose AVIF on admin visual image controls

Constraint: Visual asset buckets can accept AVIF while payment-slip storage cannot.
Rejected: Adding AVIF to all image inputs | payment and QR flows should not widen format support.
Confidence: high
Scope-risk: moderate
Directive: Keep visual image controls and payment image controls on separate accept constants.
Tested: npm run test:admin-avif-images; npm run test:subsku-images
Not-tested: Production bucket migration apply"
```

### Task 10: Full Verification and Manual Display QA

**Files:**
- No code files unless verification reveals a failure.

- [ ] **Step 1: Run targeted automated tests**

Run from `Website/`:

```bash
npm run test:uploads
npm run test:pack-banner-images
npm run test:admin-avif-images
npm run test:subsku-images
npm run typecheck
```

Expected: all PASS.

- [ ] **Step 2: Run a local app smoke test**

Run from `Website/`:

```bash
npm run dev
```

Expected: local Next server starts and prints a localhost URL.

- [ ] **Step 3: Browser QA for admin visual uploads**

Use an AVIF file smaller than 10 MB.

Check these paths:
- Admin card catalog / Main SKU image:
  - Upload AVIF.
  - Preview shows immediately.
  - Save succeeds.
  - Existing JPG/PNG/WebP upload still succeeds.
- Admin Sub-SKU / stock-unit image:
  - Upload AVIF via the stock-unit image control.
  - Thumbnail shows in admin.
  - Save succeeds.
- Pack banner image:
  - Upload AVIF on create or edit page.
  - Preview shows as 4:3 banner.
  - Save succeeds.
  - Pack list and pack detail hero show the uploaded AVIF.
- Legacy lucky-draw admin card image:
  - Upload AVIF in the card image field.
  - Preview/saved image URL displays.
- Tier animation poster:
  - Upload AVIF as poster.
  - Save succeeds.
  - Poster URL loads in the browser.

- [ ] **Step 4: Browser QA for protected payment flows**

Use the same AVIF file.

Check these paths:
- Admin payment QR image upload rejects AVIF with `QR image must be JPG, PNG, or WEBP.`
- YNOT wallet top-up slip upload rejects AVIF with `Slip must be JPG, PNG, or WEBP.`
- Legacy lucky-draw checkout slip upload rejects AVIF with `Slip must be JPG, PNG, or WEBP.`

- [ ] **Step 5: Production-readiness storage check before applying migration**

Before applying the migration to production, run a read-only bucket check and confirm current state:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
node - <<'NODE'
const { createClient } = require("@supabase/supabase-js");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing Supabase env");
const supabase = createClient(url, key, { auth: { persistSession: false } });
supabase.storage.listBuckets().then(({ data, error }) => {
  if (error) throw error;
  console.log(JSON.stringify(
    data
      .filter((bucket) => ["lucky-draw-assets", "tier-animations", "payment-slips"].includes(bucket.id))
      .map((bucket) => ({
        id: bucket.id,
        public: bucket.public,
        allowedMimeTypes: bucket.allowed_mime_types,
      })),
    null,
    2,
  ));
});
NODE
```

Expected before migration:
- `lucky-draw-assets` does not include `image/avif`
- `payment-slips` does not include `image/avif`
- `tier-animations` may not include `image/avif`

- [ ] **Step 6: Apply migration only through the normal guarded Supabase workflow**

Use the project-standard Supabase migration path for YNOTT. Do not manually edit old migration files.

Expected after migration:
- `lucky-draw-assets` includes `image/avif`
- `tier-animations` includes `image/avif`
- `payment-slips` does not include `image/avif`

- [ ] **Step 7: Final commit if verification fixes were needed**

If Step 10 required any code/test corrections, commit them:

```bash
git add Website Database
git commit -m "Verify AVIF visual image upload behavior

Constraint: AVIF must work for admin visual assets without changing payment image policy.
Confidence: high
Scope-risk: narrow
Directive: Preserve separate visual and payment upload policies.
Tested: npm run test:uploads; npm run test:pack-banner-images; npm run test:admin-avif-images; npm run test:subsku-images; npm run typecheck
Not-tested: Production customer devices without AVIF browser support"
```

## Self-Review

Spec coverage:
- Admin can upload AVIF: covered by Tasks 3, 5, 7, 8, and 9.
- Existing JPG/PNG/WebP behavior keeps working: allowlists keep existing MIME types and tests retain existing JPEG/PNG/WebP cases.
- Related images show correctly: covered by Tasks 6 and 10 through Sub-SKU URL pass-through, pack banner display, reward/bag image chain, and manual browser QA.
- API/RPC checked: API route changes are explicit; RPCs are intentionally unchanged because image fields are text URL/path fields.
- Payment/slip flows protected: covered by Tasks 2, 3, 6, and 10.

Placeholder scan:
- No unresolved implementation placeholders are left in this plan.

Type consistency:
- `VerifiedImageContentType`, `allowedVisualAssetTypes`, `allowedSlipTypes`, and `extensionForVerifiedImage` are defined in Task 3 before route usage in Task 5.
- Frontend constants `adminVisualImageAccept`, `paymentQrImageAccept`, `adminVisualImageUploadTypes`, and `paymentQrImageUploadTypes` are defined in Task 7 before use.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-11-admin-avif-visual-image-uploads.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** - Execute tasks in this session using superpower-executing-plans, batch execution with checkpoints.

Which approach?
