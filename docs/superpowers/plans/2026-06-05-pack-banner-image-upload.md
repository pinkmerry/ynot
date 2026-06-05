# Pack Banner Image Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpower-subagent-driven-development (recommended) or superpower-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins upload one 4:3 pack banner while creating or editing a random pack, then reuse that banner on both the `/packs` card and the pack detail hero while removing the visible THB price input from the admin form.

**Architecture:** Add persistent banner image fields to `draw_rounds`, expose them through the existing `YnotCampaign` DTO, and add a campaign-banner upload API that uses the same Supabase Storage, magic-byte validation, audit logging, and admin auth pattern as card/QR uploads. Customer rendering treats the banner as public promotional artwork only; it does not expose odds, weights, internal prize units, stock unit ids, or house logic. The existing 5-card detail hero remains the fallback for packs without a banner.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Supabase Postgres, Supabase Storage bucket `lucky-draw-assets`, Node `--test` source regression tests, existing YNOTT admin APIs.

---

## File Structure

- Create: `Database/supabase/migrations/20260605200000_pack_banner_images.sql`
  - Adds `banner_image_url` and `banner_image_storage_path` to `public.draw_rounds`.
- Modify: `Website/src/lib/supabase/types.ts`
  - Adds generated-type equivalents for the two new columns.
- Modify: `Website/src/features/ynot/types.ts`
  - Adds `bannerImageUrl` and `bannerImageStoragePath` to `YnotCampaign`.
- Modify: `Website/src/features/ynot/data.ts`
  - Maps DB columns into `YnotCampaign` and preserves public projection behavior.
- Modify: `Website/src/app/api/ynot/admin/campaigns/route.ts`
  - Accepts banner fields on create/edit and persists them without touching prize logic.
- Create: `Website/src/app/api/ynot/admin/campaigns/banner-image/route.ts`
  - Uploads admin campaign banner files to Supabase Storage.
- Modify: `Website/src/features/ynot/client.tsx`
  - Adds a compact admin banner upload UI to create/edit random pack.
  - Removes the visible THB price input and derives legacy `priceThb` from coin cost.
- Modify: `Website/src/features/ynot/components.tsx`
  - Shows the uploaded banner on `/packs` cards.
- Modify: `Website/src/features/ynot/cr/PackDetailExperience.tsx`
  - Shows the uploaded banner on the pack detail hero and keeps the 5-card fan only when no banner exists.
- Modify: `Website/src/app/globals.css`
  - Adds 4:3 card banner styles and compact admin banner upload styles.
- Modify: `Website/src/features/ynot/cr/theme.css`
  - Changes detail banner image path to 4:3 when a pack banner exists.
- Create: `Website/scripts/test-pack-banner-image-upload.mjs`
  - Source-level regression coverage for schema, DTO, upload route, admin UI, and public rendering.
- Modify: `Website/package.json`
  - Adds `test:pack-banner-images`.

## Product Decisions

- Use **4:3** as the single reusable banner ratio.
  - Current `/packs` card art is already `4 / 3`.
  - Current detail hero is `5 / 4`; change it to `4 / 3` only when a banner image exists.
  - Recommended admin upload design size: `1600 x 1200` or `1200 x 900`.
- Do not delete the detail 5-card fan code.
  - If `campaign.bannerImageUrl` exists, show the uploaded banner.
  - If it does not exist, keep the current 5-card fan hero.
- Remove only the **admin-visible THB input**.
  - Keep `draw_rounds.price_thb` because the DB/API still has a not-null legacy field.
  - Derive submitted `priceThb` from `costCoins` so old code paths stay valid.

---

### Task 1: Add Banner Columns to `draw_rounds`

**Files:**
- Create: `Database/supabase/migrations/20260605200000_pack_banner_images.sql`
- Modify: `Website/src/lib/supabase/types.ts`
- Test: `Website/scripts/test-pack-banner-image-upload.mjs`

- [ ] **Step 1: Create the migration**

Create `Database/supabase/migrations/20260605200000_pack_banner_images.sql`:

```sql
alter table if exists public.draw_rounds
  add column if not exists banner_image_url text,
  add column if not exists banner_image_storage_path text;

comment on column public.draw_rounds.banner_image_url is
  'Public promotional banner image URL for pack cards and pack detail hero.';

comment on column public.draw_rounds.banner_image_storage_path is
  'Supabase Storage object path for the promotional pack banner image.';
```

- [ ] **Step 2: Update Supabase TS types**

In `Website/src/lib/supabase/types.ts`, update `draw_rounds.Row` near the other image fields:

```ts
          banner_image_url: string | null;
          banner_image_storage_path: string | null;
```

Update `draw_rounds.Insert` in the same table type:

```ts
          banner_image_url?: string | null;
          banner_image_storage_path?: string | null;
```

No separate `Update` edit is required because this repo currently defines:

```ts
        Update: Partial<Database["public"]["Tables"]["draw_rounds"]["Insert"]>;
```

- [ ] **Step 3: Write the schema regression test**

Create `Website/scripts/test-pack-banner-image-upload.mjs`:

```js
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("draw_rounds stores public campaign banner image fields", () => {
  const migrationPath = new URL(
    "../../Database/supabase/migrations/20260605200000_pack_banner_images.sql",
    import.meta.url,
  );
  assert.ok(existsSync(migrationPath), "banner image migration must exist");
  const migration = readFileSync(migrationPath, "utf8");
  assert.match(migration, /add column if not exists banner_image_url text/i);
  assert.match(migration, /add column if not exists banner_image_storage_path text/i);

  const types = readSource("../src/lib/supabase/types.ts");
  assert.match(types, /banner_image_url:\s*string\s*\|\s*null/);
  assert.match(types, /banner_image_storage_path:\s*string\s*\|\s*null/);
  assert.match(types, /banner_image_url\?:\s*string\s*\|\s*null/);
  assert.match(types, /banner_image_storage_path\?:\s*string\s*\|\s*null/);
});
```

- [ ] **Step 4: Run the failing test**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
node --test scripts/test-pack-banner-image-upload.mjs
```

Expected before the migration/type edits are complete: `FAIL` with an assertion mentioning `banner_image_url`.

- [ ] **Step 5: Run the passing test**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
node --test scripts/test-pack-banner-image-upload.mjs
```

Expected after edits:

```text
# pass 1
# fail 0
```

- [ ] **Step 6: Commit Task 1**

```bash
git add Database/supabase/migrations/20260605200000_pack_banner_images.sql Website/src/lib/supabase/types.ts Website/scripts/test-pack-banner-image-upload.mjs
git commit -m "Persist pack banner artwork

Constraint: Admin-uploaded pack banners must survive deploys and render in production.
Rejected: Static slug-to-file mapping | It would require code changes for every future pack banner.
Confidence: high
Scope-risk: narrow
Directive: Keep banner fields promotional only; do not mix them with prize or stock-unit image logic.
Tested: node --test scripts/test-pack-banner-image-upload.mjs
Not-tested: Supabase linked migration apply"
```

---

### Task 2: Expose Banner Fields Through Campaign DTO and Admin API

**Files:**
- Modify: `Website/src/features/ynot/types.ts`
- Modify: `Website/src/features/ynot/data.ts`
- Modify: `Website/src/app/api/ynot/admin/campaigns/route.ts`
- Test: `Website/scripts/test-pack-banner-image-upload.mjs`

- [ ] **Step 1: Extend the campaign type**

In `Website/src/features/ynot/types.ts`, add these fields to `YnotCampaign` after `displayTags?: string[];`:

```ts
  bannerImageUrl?: string | null;
  bannerImageStoragePath?: string | null;
```

- [ ] **Step 2: Map DB rows into `YnotCampaign`**

In `Website/src/features/ynot/data.ts`, inside `toYnotCampaign`, add the fields after `displayTags: safeDisplayTags(row),`:

```ts
    bannerImageUrl: row.banner_image_url,
    bannerImageStoragePath: row.banner_image_storage_path,
```

Customer DTOs must expose only `bannerImageUrl`. Keep `bannerImageStoragePath` available for admin edit state, but strip it in `publicYnotCampaign` so public list/detail/open-history flows cannot see internal storage paths.

- [ ] **Step 3: Extend admin campaign body**

In `Website/src/app/api/ynot/admin/campaigns/route.ts`, add to `type CampaignBody`:

```ts
  bannerImageUrl?: unknown;
  bannerImageStoragePath?: unknown;
```

- [ ] **Step 4: Persist only verified uploaded banner fields**

Keep banner fields out of the generic scalar `campaignPatch`. Add a separate `campaignBannerImagePatch` helper that:

- returns no patch when banner fields are absent;
- clears both DB fields when admin clears the image;
- requires `bannerImageStoragePath` when a banner is present;
- accepts only `campaign-banners/YYYY-MM-DD/...` paths from the admin upload flow;
- verifies the exact object exists in Supabase Storage before saving;
- derives `banner_image_url` from `getPublicUrl(requestedPath)` and rejects mismatched client URLs.

The helper patch then works for create, draft edit, and live cosmetic edit by spreading it beside `campaignPatch`.

```ts
  const bannerPatch = await campaignBannerImagePatch(body, supabase);
  if (!bannerPatch.ok) return bannerPatch.response;
```

- [ ] **Step 5: Add DTO/API assertions**

Append these tests to `Website/scripts/test-pack-banner-image-upload.mjs`:

```js
test("YnotCampaign exposes banner URL but rendering can ignore storage path", () => {
  const types = readSource("../src/features/ynot/types.ts");
  assert.match(types, /bannerImageUrl\?:\s*string\s*\|\s*null/);
  assert.match(types, /bannerImageStoragePath\?:\s*string\s*\|\s*null/);

  const data = readSource("../src/features/ynot/data.ts");
  assert.match(data, /bannerImageUrl:\s*row\.banner_image_url/);
  assert.match(data, /bannerImageStoragePath:\s*row\.banner_image_storage_path/);
});

test("admin campaign API accepts banner image fields as cosmetic pack data", () => {
  const route = readSource("../src/app/api/ynot/admin/campaigns/route.ts");
  assert.match(route, /bannerImageUrl\?:\s*unknown/);
  assert.match(route, /bannerImageStoragePath\?:\s*unknown/);
  assert.match(route, /banner_image_url:\s*[\s\S]*body\.bannerImageUrl/);
  assert.match(route, /banner_image_storage_path:\s*[\s\S]*body\.bannerImageStoragePath/);
  assert.doesNotMatch(route, /bannerImageUrl[\s\S]{0,120}initialPrizes/);
});
```

- [ ] **Step 6: Run the test**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
node --test scripts/test-pack-banner-image-upload.mjs
```

Expected:

```text
# pass 3
# fail 0
```

- [ ] **Step 7: Commit Task 2**

```bash
git add Website/src/features/ynot/types.ts Website/src/features/ynot/data.ts Website/src/app/api/ynot/admin/campaigns/route.ts Website/scripts/test-pack-banner-image-upload.mjs
git commit -m "Expose pack banner artwork through campaigns

Constraint: Banner art is public promotional data and must not affect prize or stock selection.
Rejected: Store banner URL in logic_snapshot | That would mix display art with random-pack logic configuration.
Confidence: high
Scope-risk: narrow
Directive: Do not use banner image fields in opening, odds, prize allocation, or collection reward logic.
Tested: node --test scripts/test-pack-banner-image-upload.mjs
Not-tested: Browser rendering"
```

---

### Task 3: Add Campaign Banner Upload API

**Files:**
- Create: `Website/src/app/api/ynot/admin/campaigns/banner-image/route.ts`
- Test: `Website/scripts/test-pack-banner-image-upload.mjs`
- Test: `Website/scripts/test-magic-bytes.mjs`

- [ ] **Step 1: Create the upload route**

Create `Website/src/app/api/ynot/admin/campaigns/banner-image/route.ts`:

```ts
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import {
  allowedSlipTypes,
  maxSlipBytes,
  requestExceedsUploadLimit,
  verifyImageMagicBytes,
  type VerifiedImageContentType,
} from "@/lib/uploads/magic-bytes";

export const dynamic = "force-dynamic";

const bucketName = "lucky-draw-assets";

function extensionFor(type: VerifiedImageContentType) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

function safePathPart(value: unknown) {
  const clean =
    typeof value === "string"
      ? value
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9._-]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 60)
      : "";
  return clean || "pack-banner";
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return Response.json(
      { error: "Supabase is not configured." },
      { status: 503 },
    );
  }

  const admin = await resolveAdminSession();
  if (!admin) {
    return Response.json(
      { error: "Admin access is required." },
      { status: 403 },
    );
  }

  const limited = await enforceRateLimit(
    request,
    "ynot:admin:campaigns:banner-image",
    { limit: 60, windowMs: 60_000 },
    admin.profileId,
  );
  if (limited) return limited;

  if (requestExceedsUploadLimit(request, maxSlipBytes)) {
    return Response.json(
      { error: "Pack banner image must be 10 MB or smaller." },
      { status: 413 },
    );
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return Response.json({ error: "Invalid form payload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json(
      { error: "Pack banner image file is required." },
      { status: 400 },
    );
  }

  if (!allowedSlipTypes.has(file.type)) {
    return Response.json(
      { error: "Pack banner image must be JPG, PNG, or WEBP." },
      { status: 400 },
    );
  }

  if (file.size > maxSlipBytes) {
    return Response.json(
      { error: "Pack banner image must be 10 MB or smaller." },
      { status: 400 },
    );
  }

  const magicCheck = await verifyImageMagicBytes(file);
  if (!magicCheck.ok) {
    return Response.json({ error: magicCheck.error }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const label = safePathPart(form.get("slug") || form.get("title") || file.name);
  const ext = extensionFor(magicCheck.contentType);
  const path = `campaign-banners/${day}/${Date.now()}-${crypto.randomUUID()}-${label}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from(bucketName)
    .upload(path, file.stream(), {
      contentType: magicCheck.contentType,
      upsert: false,
    });

  if (uploadError) {
    return Response.json({ error: uploadError.message }, { status: 500 });
  }

  const { data } = supabase.storage.from(bucketName).getPublicUrl(path);

  await supabase.from("audit_events").insert({
    actor_admin_id: admin.adminId,
    event_type: "campaign_banner_image_uploaded",
    metadata: {
      bucket: bucketName,
      path,
      size: file.size,
      contentType: magicCheck.contentType,
      originalFilename: file.name,
    },
  });

  return Response.json({
    imageUrl: data.publicUrl,
    storagePath: path,
  });
}
```

- [ ] **Step 2: Add upload-route assertions**

Append to `Website/scripts/test-pack-banner-image-upload.mjs`:

```js
test("campaign banner upload route uses guarded admin storage flow", () => {
  const route = readSource("../src/app/api/ynot/admin/campaigns/banner-image/route.ts");
  assert.match(route, /resolveAdminSession/);
  assert.match(route, /"ynot:admin:campaigns:banner-image"/);
  assert.match(route, /\{\s*limit:\s*60,\s*windowMs:\s*60_000\s*\}/);
  assert.match(route, /verifyImageMagicBytes\(file\)/);
  assert.match(route, /requestExceedsUploadLimit\(request,\s*maxSlipBytes\)/);
  assert.match(route, /const bucketName = "lucky-draw-assets"/);
  assert.match(route, /campaign-banners\/\$\{day\}/);
  assert.match(route, /event_type:\s*"campaign_banner_image_uploaded"/);
});
```

- [ ] **Step 3: Extend upload safety tests**

In `Website/scripts/test-magic-bytes.mjs`, extend the existing upload route checks so they also read:

```js
const campaignBannerRoute = readSource("../src/app/api/ynot/admin/campaigns/banner-image/route.ts");
```

Add assertions alongside card/payment upload assertions:

```js
assert.match(campaignBannerRoute, /requestExceedsUploadLimit\(request,\s*maxSlipBytes\)/);
assert.match(campaignBannerRoute, /verifyImageMagicBytes\(file\)/);
assert.match(campaignBannerRoute, /allowedSlipTypes\.has\(file\.type\)/);
```

- [ ] **Step 4: Run upload tests**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:uploads
node --test scripts/test-pack-banner-image-upload.mjs
```

Expected:

```text
# pass
# fail 0
```

- [ ] **Step 5: Commit Task 3**

```bash
git add Website/src/app/api/ynot/admin/campaigns/banner-image/route.ts Website/scripts/test-pack-banner-image-upload.mjs Website/scripts/test-magic-bytes.mjs
git commit -m "Upload pack banner artwork from admin

Constraint: Admin file uploads must keep existing auth, rate limit, magic-byte, storage, and audit patterns.
Rejected: Reuse card-image endpoint | Campaign banners need a separate audit event and storage prefix.
Confidence: high
Scope-risk: narrow
Directive: Keep campaign banner uploads public-assets only; never accept executable or arbitrary file types.
Tested: npm run test:uploads; node --test scripts/test-pack-banner-image-upload.mjs
Not-tested: Real browser upload to production storage"
```

---

### Task 4: Add Compact Admin Banner UI and Remove Visible THB Field

**Files:**
- Modify: `Website/src/features/ynot/client.tsx`
- Modify: `Website/src/app/globals.css`
- Test: `Website/scripts/test-pack-banner-image-upload.mjs`

- [ ] **Step 1: Add the upload client helper**

In `Website/src/features/ynot/client.tsx`, after `uploadAdminPaymentQrImage`, add:

```ts
async function uploadAdminCampaignBannerImage(
  file: File,
  details: { slug?: string; title?: string },
): Promise<AdminCardImageUpload> {
  const form = new FormData();
  form.set("file", file);
  if (details.slug) form.set("slug", details.slug);
  if (details.title) form.set("title", details.title);

  const response = await fetch("/api/ynot/admin/campaigns/banner-image", {
    method: "POST",
    body: form,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new AdminRequestError(requestErrorMessage(payload), {
      code: isRecord(payload) ? stringValue(payload.code) || undefined : undefined,
      payload,
      status: response.status,
    });
  }
  if (
    !isRecord(payload) ||
    !stringValue(payload.imageUrl) ||
    !stringValue(payload.storagePath)
  ) {
    throw new Error("Upload response did not include a banner image URL.");
  }
  return {
    imageUrl: stringValue(payload.imageUrl),
    storagePath: stringValue(payload.storagePath),
  };
}
```

- [ ] **Step 2: Add banner state to `AdminCampaignForm`**

Inside `AdminCampaignForm`, after `displayTags` state:

```ts
  const [bannerImageUrl, setBannerImageUrl] = useState(
    editingCampaign?.bannerImageUrl ?? "",
  );
  const [bannerImageStoragePath, setBannerImageStoragePath] = useState(
    editingCampaign?.bannerImageStoragePath ?? "",
  );
  const [bannerImageFile, setBannerImageFile] = useState<File | null>(null);
  const [bannerPreviewUrl, setBannerPreviewUrl] = useState(
    editingCampaign?.bannerImageUrl ?? "",
  );
```

Add cleanup near existing preview cleanup patterns:

```ts
  useEffect(() => {
    if (!bannerImageFile) return;
    const objectUrl = URL.createObjectURL(bannerImageFile);
    setBannerPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [bannerImageFile]);
```

- [ ] **Step 3: Remove visible THB state and derive legacy price**

Replace:

```ts
  const [priceThb, setPriceThb] = useState(editingCampaign?.priceThb ?? 100);
```

with:

```ts
  const derivedPriceThb = Math.max(1, Math.ceil(Number(costCoins) || 1));
```

Remove the admin field whose label text is `Price THB` or `Price`. Keep the coin-cost field visible.

In `basePayload`, replace:

```ts
          priceThb,
```

with:

```ts
          priceThb: derivedPriceThb,
```

- [ ] **Step 4: Add upload processing before save**

At the start of the `try` block in `submit`, before `const basePayload = {`, add:

```ts
        let nextBannerImageUrl = bannerImageUrl.trim();
        let nextBannerImageStoragePath = bannerImageStoragePath.trim();
        if (bannerImageFile) {
          const uploaded = await uploadAdminCampaignBannerImage(bannerImageFile, {
            slug,
            title: titleEn || titleTh,
          });
          nextBannerImageUrl = uploaded.imageUrl;
          nextBannerImageStoragePath = uploaded.storagePath;
          setBannerImageUrl(uploaded.imageUrl);
          setBannerImageStoragePath(uploaded.storagePath);
          setBannerImageFile(null);
          setBannerPreviewUrl(uploaded.imageUrl);
        }
```

Add to `basePayload`:

```ts
          bannerImageUrl: nextBannerImageUrl || null,
          bannerImageStoragePath: nextBannerImageStoragePath || null,
```

- [ ] **Step 5: Add compact banner field UI**

Inside the `Pack info` form, place this after the English title field and before open mode:

```tsx
            <div className="admin-field admin-field-wide admin-pack-banner-field">
              <span>Pack banner</span>
              <div className="admin-pack-banner-upload">
                <div className="admin-pack-banner-preview" aria-label="Pack banner preview">
                  {bannerPreviewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- Admin preview accepts Supabase storage URLs and local object URLs.
                    <img src={bannerPreviewUrl} alt="Pack banner preview" />
                  ) : (
                    <span>4:3</span>
                  )}
                </div>
                <div className="admin-pack-banner-actions">
                  <p>Recommended 1600 x 1200. JPG, PNG, or WEBP up to 10 MB.</p>
                  <div>
                    <label className="admin-pack-banner-button">
                      <input
                        accept="image/jpeg,image/png,image/webp"
                        disabled={isPending}
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null;
                          setBannerImageFile(file);
                          if (!file && bannerImageUrl) setBannerPreviewUrl(bannerImageUrl);
                        }}
                        type="file"
                      />
                      Choose banner
                    </label>
                    {(bannerPreviewUrl || bannerImageUrl) && (
                      <button
                        type="button"
                        className="admin-pack-banner-clear"
                        disabled={isPending}
                        onClick={() => {
                          setBannerImageFile(null);
                          setBannerImageUrl("");
                          setBannerImageStoragePath("");
                          setBannerPreviewUrl("");
                        }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
```

- [ ] **Step 6: Add compact upload styles**

Add to `Website/src/app/globals.css` near existing admin image dropzone styles:

```css
.admin-pack-banner-field {
  display: grid;
  gap: 8px;
}

.admin-pack-banner-upload {
  align-items: center;
  border: 1px solid rgba(148, 163, 184, 0.28);
  display: grid;
  gap: 12px;
  grid-template-columns: 132px 1fr;
  padding: 10px;
}

.admin-pack-banner-preview {
  align-items: center;
  aspect-ratio: 4 / 3;
  background: rgba(15, 23, 42, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.24);
  color: rgba(226, 232, 240, 0.72);
  display: flex;
  font-family: var(--font-mono), ui-monospace, monospace;
  font-size: 0.72rem;
  font-weight: 900;
  justify-content: center;
  overflow: hidden;
}

.admin-pack-banner-preview img {
  height: 100%;
  object-fit: cover;
  width: 100%;
}

.admin-pack-banner-actions {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.admin-pack-banner-actions p {
  color: rgba(226, 232, 240, 0.68);
  font-size: 0.78rem;
  line-height: 1.35;
  margin: 0;
}

.admin-pack-banner-actions > div {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.admin-pack-banner-button,
.admin-pack-banner-clear {
  align-items: center;
  background: rgba(255, 224, 138, 0.96);
  border: 1px solid rgba(255, 224, 138, 0.96);
  color: #171100;
  cursor: pointer;
  display: inline-flex;
  font-weight: 900;
  justify-content: center;
  min-height: 38px;
  padding: 8px 12px;
}

.admin-pack-banner-button input {
  display: none;
}

.admin-pack-banner-clear {
  background: transparent;
  color: rgba(226, 232, 240, 0.9);
}

@media (max-width: 720px) {
  .admin-pack-banner-upload {
    grid-template-columns: 1fr;
  }

  .admin-pack-banner-preview {
    max-width: 220px;
  }
}
```

- [ ] **Step 7: Add admin UI source assertions**

Append to `Website/scripts/test-pack-banner-image-upload.mjs`:

```js
test("admin random-pack form uploads one 4:3 banner and hides THB price input", () => {
  const client = readSource("../src/features/ynot/client.tsx");
  assert.match(client, /uploadAdminCampaignBannerImage/);
  assert.match(client, /\/api\/ynot\/admin\/campaigns\/banner-image/);
  assert.match(client, /const \[bannerImageUrl,\s*setBannerImageUrl\]/);
  assert.match(client, /const \[bannerImageStoragePath,\s*setBannerImageStoragePath\]/);
  assert.match(client, /const \[bannerImageFile,\s*setBannerImageFile\]/);
  assert.match(client, /Recommended 1600 x 1200/);
  assert.match(client, /bannerImageUrl:\s*nextBannerImageUrl\s*\|\|\s*null/);
  assert.match(client, /bannerImageStoragePath:\s*nextBannerImageStoragePath\s*\|\|\s*null/);
  assert.match(client, /priceThb:\s*derivedPriceThb/);
  assert.doesNotMatch(client, /setPriceThb/);
  assert.doesNotMatch(client, />\s*Price THB\s*</i);

  const css = readSource("../src/app/globals.css");
  assert.match(css, /\.admin-pack-banner-preview[\s\S]*aspect-ratio:\s*4\s*\/\s*3/);
  assert.match(css, /\.admin-pack-banner-button/);
});
```

- [ ] **Step 8: Run the admin UI test**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
node --test scripts/test-pack-banner-image-upload.mjs
```

Expected:

```text
# pass 5
# fail 0
```

- [ ] **Step 9: Commit Task 4**

```bash
git add Website/src/features/ynot/client.tsx Website/src/app/globals.css Website/scripts/test-pack-banner-image-upload.mjs
git commit -m "Add pack banner controls to random pack admin

Constraint: Admins need one creation flow for pack info, prizes, and public banner artwork.
Rejected: Keep THB price visible | Random packs are priced in coins for this product surface.
Confidence: medium
Scope-risk: moderate
Directive: Keep price_thb as a derived legacy persistence field until the schema is intentionally simplified.
Tested: node --test scripts/test-pack-banner-image-upload.mjs
Not-tested: Browser upload interaction"
```

---

### Task 5: Render Uploaded Banner on Packs Page and Detail Page

**Files:**
- Modify: `Website/src/features/ynot/components.tsx`
- Modify: `Website/src/features/ynot/cr/PackDetailExperience.tsx`
- Modify: `Website/src/app/globals.css`
- Modify: `Website/src/features/ynot/cr/theme.css`
- Test: `Website/scripts/test-pack-banner-image-upload.mjs`
- Test: `Website/scripts/test-pack-open-privacy.mjs`

- [ ] **Step 1: Render banner image in `CampaignArtwork`**

In `Website/src/features/ynot/components.tsx`, inside `CampaignArtwork`, add:

```ts
  const bannerImageUrl = campaign.bannerImageUrl?.trim() || null;
```

Update the class name to include:

```tsx
${bannerImageUrl ? "has-campaign-banner" : ""}
```

Immediately after `<span className="art-glow" aria-hidden />`, add:

```tsx
      {bannerImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- Campaign banners are admin-managed Supabase assets.
        <img
          className="campaign-art-banner-image"
          src={bannerImageUrl}
          alt={`${campaign.titleEn || campaign.titleTh} banner`}
          loading="lazy"
        />
      ) : null}
```

Change the clean-cover condition so text fallback does not overlay uploaded art:

```tsx
      {clean && !quiet && !hasPackAsset && !bannerImageUrl && (
```

- [ ] **Step 2: Add packs-page banner CSS**

In `Website/src/app/globals.css`, add:

```css
.campaign-art.has-campaign-banner,
.clean-pack-card .campaign-art.clean-art.has-campaign-banner {
  background: #050812 !important;
}

.campaign-art-banner-image {
  inset: 0;
  height: 100%;
  object-fit: cover;
  object-position: center;
  position: absolute;
  width: 100%;
  z-index: 0;
}

.campaign-art.has-campaign-banner::after,
.clean-pack-card .campaign-art.clean-art.has-campaign-banner::after {
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.02), rgba(0, 0, 0, 0.16));
}
```

- [ ] **Step 3: Render detail banner and keep fan fallback**

In `Website/src/features/ynot/cr/PackDetailExperience.tsx`, add near `soldOut` calculations:

```ts
  const bannerImageUrl = campaign.bannerImageUrl?.trim() || null;
```

Change:

```tsx
        <div className={`cr-detail-hero-art ${campaign.series}`}>
```

to:

```tsx
        <div className={`cr-detail-hero-art ${campaign.series} ${bannerImageUrl ? "has-banner" : ""}`}>
```

Replace the unconditional fan section:

```tsx
          <span className="cr-hero-eyebrow">
            {seriesLabel(campaign.series).toUpperCase()}
          </span>
          <HeroFan campaign={campaign} />
          <span className="cr-hero-footer">
            {(campaign.titleEn || campaign.titleTh).toUpperCase()}
          </span>
```

with:

```tsx
          {bannerImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Campaign banners are admin-managed Supabase assets.
            <img
              className="cr-detail-hero-image"
              src={bannerImageUrl}
              alt={`${campaign.titleEn || campaign.titleTh} banner`}
            />
          ) : (
            <>
              <span className="cr-hero-eyebrow">
                {seriesLabel(campaign.series).toUpperCase()}
              </span>
              <HeroFan campaign={campaign} />
              <span className="cr-hero-footer">
                {(campaign.titleEn || campaign.titleTh).toUpperCase()}
              </span>
            </>
          )}
```

- [ ] **Step 4: Add detail-page banner CSS**

In `Website/src/features/ynot/cr/theme.css`, add after `.cr-detail-hero-art`:

```css
.cr-detail-hero-art.has-banner {
  aspect-ratio: 4 / 3;
  background: #050812;
}

.cr-detail-hero-image {
  height: 100%;
  inset: 0;
  object-fit: cover;
  object-position: center;
  position: absolute;
  width: 100%;
}

.cr-detail-hero-art.has-banner .cr-hero-glow {
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.04), rgba(0, 0, 0, 0.18));
  z-index: 1;
}

.cr-detail-hero-art.has-banner .cr-pack-art-sticker,
.cr-detail-hero-art.has-banner .cr-hero-stock {
  z-index: 2;
}
```

- [ ] **Step 5: Add rendering assertions**

Append to `Website/scripts/test-pack-banner-image-upload.mjs`:

```js
test("customer pack card and detail hero use uploaded banner with card-fan fallback", () => {
  const components = readSource("../src/features/ynot/components.tsx");
  assert.match(components, /campaign\.bannerImageUrl\?\.trim\(\)\s*\|\|\s*null/);
  assert.match(components, /has-campaign-banner/);
  assert.match(components, /className="campaign-art-banner-image"/);
  assert.match(components, /!bannerImageUrl[\s\S]*clean-pack-cover/);

  const detail = readSource("../src/features/ynot/cr/PackDetailExperience.tsx");
  assert.match(detail, /campaign\.bannerImageUrl\?\.trim\(\)\s*\|\|\s*null/);
  assert.match(detail, /has-banner/);
  assert.match(detail, /className="cr-detail-hero-image"/);
  assert.match(detail, /bannerImageUrl\s*\?\s*\(/);
  assert.match(detail, /<HeroFan campaign=\{campaign\} \/>/);

  const globals = readSource("../src/app/globals.css");
  assert.match(globals, /\.campaign-art-banner-image[\s\S]*object-fit:\s*cover/);
  const crTheme = readSource("../src/features/ynot/cr/theme.css");
  assert.match(crTheme, /\.cr-detail-hero-art\.has-banner[\s\S]*aspect-ratio:\s*4\s*\/\s*3/);
  assert.match(crTheme, /\.cr-detail-hero-image[\s\S]*object-fit:\s*cover/);
});
```

- [ ] **Step 6: Run privacy and banner tests**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
node --test scripts/test-pack-banner-image-upload.mjs
npm run test:pack-open-privacy
npm run test:campaign-detail-privacy
```

Expected:

```text
# fail 0
```

- [ ] **Step 7: Commit Task 5**

```bash
git add Website/src/features/ynot/components.tsx Website/src/features/ynot/cr/PackDetailExperience.tsx Website/src/app/globals.css Website/src/features/ynot/cr/theme.css Website/scripts/test-pack-banner-image-upload.mjs
git commit -m "Render pack banners across customer pack surfaces

Constraint: The same 4:3 campaign banner must work on pack cards and detail heroes.
Rejected: Remove HeroFan globally | Packs without banner art still need a visual fallback.
Confidence: high
Scope-risk: moderate
Directive: Banner rendering must remain display-only and must never reveal internal prize metadata.
Tested: node --test scripts/test-pack-banner-image-upload.mjs; npm run test:pack-open-privacy; npm run test:campaign-detail-privacy
Not-tested: Mobile screenshot crop"
```

---

### Task 6: Package Test Script and Run Full Local Verification

**Files:**
- Modify: `Website/package.json`

- [ ] **Step 1: Add package script**

In `Website/package.json`, add:

```json
"test:pack-banner-images": "node --test scripts/test-pack-banner-image-upload.mjs",
```

Place it near the other `test:*` scripts.

- [ ] **Step 2: Run targeted checks**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run test:pack-banner-images
npm run test:uploads
npm run test:pack-open-privacy
npm run test:campaign-detail-privacy
npm run lint
npm run typecheck
```

Expected:

```text
All targeted tests pass, eslint exits 0, and tsc exits 0.
```

- [ ] **Step 3: Run build**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run build
```

Expected:

```text
Build completes without TypeScript, lint, or Next.js route errors.
```

- [ ] **Step 4: Commit Task 6**

```bash
git add Website/package.json
git commit -m "Cover pack banner behavior with regression checks

Constraint: Banner upload and rendering touches schema, API, admin UI, and customer UI together.
Rejected: Manual-only QA | Source regressions are needed because banner fields are production-visible.
Confidence: high
Scope-risk: narrow
Directive: Keep test:pack-banner-images in the targeted verification set for future random-pack UI changes.
Tested: npm run test:pack-banner-images; npm run test:uploads; npm run test:pack-open-privacy; npm run test:campaign-detail-privacy; npm run lint; npm run typecheck; npm run build
Not-tested: Production Supabase migration apply"
```

---

### Task 7: Browser QA for Admin and Customer Screens

**Files:**
- No source edits expected unless QA finds layout defects.

- [ ] **Step 1: Start local dev server**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run dev -- --port 3022
```

Expected:

```text
Local: http://localhost:3022
```

- [ ] **Step 2: Verify admin create/edit UI**

Open:

```text
http://localhost:3022/admin/campaigns
```

Check:

- The THB price input is not visible.
- Coin cost remains visible and editable.
- Pack banner upload is compact, button-like, and shows a small 4:3 preview.
- Selecting `/Users/pinkmerry/Downloads/OP2000COINS.png` shows a preview before saving.
- The preview makes crop behavior obvious; if critical text is cut, create a 4:3 banner asset before uploading to production.

- [ ] **Step 3: Verify packs page rendering**

Open:

```text
http://localhost:3022/packs
```

Check:

- A pack with `bannerImageUrl` shows the banner in the card image area.
- Pack card badges and sold-out state remain readable.
- Pack cards without `bannerImageUrl` still show existing generated/fallback art.

- [ ] **Step 4: Verify pack detail rendering**

Open:

```text
http://localhost:3022/packs/op2000coins
```

or the active route currently used by this app:

```text
http://localhost:3022/gacha/op2000coins
```

Check:

- A pack with `bannerImageUrl` shows the banner as the top hero.
- The 5-card fan is not shown on banner packs.
- A pack without `bannerImageUrl` still shows the 5-card fan.
- Sold-out and stock badges remain above the image.

- [ ] **Step 5: Verify mobile layout**

Use mobile viewport around `390 x 844`.

Check:

- The `/packs` card image remains 4:3.
- The detail hero remains 4:3.
- The admin upload preview stacks cleanly and does not overlap text.

- [ ] **Step 6: Fix layout issues if found**

If crop is unacceptable for square uploads, keep the 4:3 UI ratio but change uploaded banner image rendering from:

```css
object-fit: cover;
```

to:

```css
object-fit: contain;
background: #050812;
```

Apply that change consistently to `.campaign-art-banner-image`, `.cr-detail-hero-image`, and `.admin-pack-banner-preview img`.

- [ ] **Step 7: Commit QA fixes**

If edits were made:

```bash
git add Website/src/app/globals.css Website/src/features/ynot/cr/theme.css
git commit -m "Polish pack banner responsive rendering

Constraint: One uploaded banner must read clearly on both pack cards and detail heroes.
Rejected: Separate mobile and desktop uploads | Admin should upload one reusable image.
Confidence: medium
Scope-risk: narrow
Directive: Preserve a single 4:3 admin guidance ratio unless product intentionally changes banner templates.
Tested: Browser QA on /admin/campaigns, /packs, and /gacha/op2000coins at desktop and mobile widths
Not-tested: Production CDN cache behavior"
```

---

### Task 8: Production Migration and Publish Guard

**Files:**
- No source edits expected.

- [ ] **Step 1: Confirm the implementation branch is isolated**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git status --short
git log --oneline -5
```

Expected:

```text
Only intentional pack banner commits are present on the implementation branch.
```

- [ ] **Step 2: Inspect linked Supabase migration state**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Database
supabase migration list --linked
supabase db push --linked --dry-run --include-all
```

Expected:

```text
The dry-run includes 20260605200000_pack_banner_images.sql if production has not received it yet.
```

- [ ] **Step 3: Apply production migration only after dry-run is clean**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Database
supabase db push --linked --include-all
supabase migration list --linked
```

Expected:

```text
The linked ledger includes 20260605200000.
```

- [ ] **Step 4: Run production DB readiness**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT/Website
npm run verify:production-db
```

Expected:

```text
Production DB readiness check exits 0.
```

- [ ] **Step 5: Merge/push using repo publish convention**

Run:

```bash
cd /Users/pinkmerry/Project\ X/YNOTT
git status --short
git push origin HEAD:main
```

Expected:

```text
Push succeeds and GitHub main contains the banner image commits.
```

---

## Self-Review

**Spec coverage:**
- One reusable image ratio: covered by 4:3 decision and rendering CSS in Tasks 4, 5, and 7.
- Packs page card image: covered by Task 5.
- Pack detail top hero image: covered by Task 5.
- Remove 5-card fan from banner detail page only: covered by Task 5 with fallback behavior.
- Add admin upload when creating/editing pack: covered by Tasks 3 and 4.
- Remove THB price input: covered by Task 4 while keeping DB/API compatibility.
- Keep house data private: covered by Tasks 2, 5, and privacy tests.
- Production readiness: covered by Task 8.

**Placeholder scan:** This plan contains concrete paths, commands, code snippets, expected results, and commit messages. It does not leave implementation blanks.

**Type consistency:** The DB columns are `banner_image_url` and `banner_image_storage_path`; API/body fields are `bannerImageUrl` and `bannerImageStoragePath`; DTO fields are `bannerImageUrl` and `bannerImageStoragePath`; renderers consume only `bannerImageUrl`.
