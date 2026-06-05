import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;

function source(path) {
  return readFileSync(join(root, path), "utf8");
}

test("draw_rounds stores optional pack banner image fields", () => {
  const migration = source(
    "../Database/supabase/migrations/20260605200000_pack_banner_images.sql",
  );
  const types = source("src/lib/supabase/types.ts");

  assert.match(migration, /add column if not exists banner_image_url text/);
  assert.match(
    migration,
    /add column if not exists banner_image_storage_path text/,
  );
  assert.match(types, /banner_image_url: string \| null;/);
  assert.match(types, /banner_image_storage_path: string \| null;/);
});

test("admin campaign API accepts only uploaded banner image paths", () => {
  const route = source("src/app/api/ynot/admin/campaigns/route.ts");

  assert.match(route, /bannerImageUrl\?: unknown;/);
  assert.match(route, /bannerImageStoragePath\?: unknown;/);
  assert.match(route, /async function campaignBannerImagePatch/);
  assert.match(route, /campaignBannerPathPattern\.test\(requestedPath\)/);
  assert.match(route, /async function verifyUploadedCampaignBannerImage/);
  assert.match(route, /\.list\(folder,\s*\{\s*limit:\s*1,\s*search:\s*fileName\s*\}\)/);
  assert.match(route, /item\.name === fileName/);
  assert.match(route, /CAMPAIGN_BANNER_UPLOAD_NOT_FOUND/);
  assert.match(route, /\.from\(campaignBannerBucketName\)\s*\n\s*\.getPublicUrl\(requestedPath\)/);
  assert.match(route, /CAMPAIGN_BANNER_URL_INVALID/);
  assert.doesNotMatch(
    route,
    /banner_image_url:\s*\n?\s*body\.bannerImageUrl/,
    "campaign save must not persist a raw client-provided banner URL",
  );
});

test("admin banner upload route is guarded and validates image uploads", () => {
  const route = source("src/app/api/ynot/admin/campaigns/banner-image/route.ts");

  assert.match(route, /resolveAdminSession/);
  assert.match(route, /ynot:admin:campaigns:banner-image/);
  assert.match(route, /requestExceedsUploadLimit\(request, maxSlipBytes\)/);
  assert.match(route, /allowedSlipTypes\.has\(file\.type\)/);
  assert.match(route, /verifyImageMagicBytes\(file\)/);
  assert.match(route, /campaign-banners\/\$\{day\}/);
  assert.match(route, /campaign_banner_image_uploaded/);
});

test("admin create pack form shows explicit 4:3 banner guidance", () => {
  const client = source("src/features/ynot/client.tsx");
  const formStart = client.indexOf("export function AdminCampaignForm");
  const formEnd = client.indexOf("export function AdminCampaignActionPanel");
  const formSource = client.slice(formStart, formEnd);

  assert.match(client, /uploadAdminCampaignBannerImage/);
  assert.match(client, /className="admin-campaign-banner-preview"/);
  assert.match(client, />4:3 image</);
  assert.match(client, /Accepted ratio 4:3\. Recommended 1600 x 1200/);
  assert.doesNotMatch(formSource, /<span>Price THB<\/span>/);
  assert.doesNotMatch(formSource, /derivedPriceThb/);
  assert.doesNotMatch(formSource, /priceThb:/);
});

test("customer pack card and detail hero prefer banner image with fallback fan", () => {
  const components = source("src/features/ynot/components.tsx");
  const packList = source("src/features/ynot/cr/YPackExperience.tsx");
  const detail = source("src/features/ynot/cr/PackDetailExperience.tsx");
  const globalCss = source("src/app/globals.css");
  const detailCss = source("src/features/ynot/cr/theme.css");

  assert.match(components, /campaign\.bannerImageUrl\?\.trim\(\)/);
  assert.match(components, /className="campaign-art-banner-image"/);
  assert.match(components, /!hasBannerImage && heroPrizes\.length/);
  assert.match(globalCss, /\.campaign-art \.campaign-art-banner-image/);
  assert.match(packList, /campaign\.bannerImageUrl\?\.trim\(\)/);
  assert.match(packList, /className="cr-pack-art-image"/);
  assert.match(packList, /!hasBannerImage && \(/);
  assert.match(detail, /campaign\.bannerImageUrl\?\.trim\(\)/);
  assert.match(detail, /className="cr-detail-hero-image"/);
  assert.match(detail, /!hasBannerImage && <HeroFan campaign=\{campaign\} \/>/);
  assert.match(detailCss, /\.cr-pack-art\.has-banner-image/);
  assert.match(detailCss, /\.cr-pack-art-image/);
  assert.match(detailCss, /\.cr-detail-hero-art\.has-banner-image/);
  assert.match(detailCss, /aspect-ratio: 4 \/ 3;/);
});
