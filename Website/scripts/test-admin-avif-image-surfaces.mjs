import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function transpile(sourceText) {
  return ts.transpileModule(sourceText, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}

function loadTierAnimationRouteForTest() {
  const magicModule = { exports: {} };
  vm.runInNewContext(transpile(source("../src/lib/uploads/magic-bytes.ts")), {
    exports: magicModule.exports,
    module: magicModule,
    require: (id) => (id === "server-only" ? {} : require(id)),
  });

  const routeModule = { exports: {} };
  const mockSupabase = {
    storage: {
      from() {
        return {
          upload() {
            throw new Error("Storage upload should not run for an invalid poster image.");
          },
          getPublicUrl() {
            return { data: { publicUrl: "https://cdn.example/poster.avif" } };
          },
        };
      },
    },
    from() {
      return {
        update() {
          return {
            eq() {
              return {
                select() {
                  return {
                    single: async () => ({ data: {}, error: null }),
                  };
                },
              };
            },
          };
        },
        insert: async () => ({ error: null }),
      };
    },
  };

  function mockRequire(id) {
    if (id === "next/cache") return { revalidatePath() {} };
    if (id === "@/lib/auth/resolve-current-profile") {
      return { resolveAdminSession: async () => ({ adminId: "admin", profileId: "profile" }) };
    }
    if (id === "@/lib/lucky-draw/data") return { isSupabaseConfigured: () => true };
    if (id === "@/lib/supabase/server") return { createServiceSupabaseClient: () => mockSupabase };
    if (id === "@/lib/security/rate-limit") return { enforceRateLimit: async () => null };
    if (id === "@/lib/uploads/magic-bytes") return magicModule.exports;
    return require(id);
  }

  vm.runInNewContext(transpile(source("../src/app/api/ynot/admin/tier-animations/route.ts")), {
    exports: routeModule.exports,
    module: routeModule,
    require: mockRequire,
    File,
    FormData,
    Response,
  });
  return routeModule.exports;
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
  assert.match(client, /function adminVisualImageFileLooksAllowed\(file: File\)/);
  assert.match(client, /file\.type === "application\/octet-stream"/);
  assert.match(client, /adminVisualImageExtensionPattern\.test\(file\.name\)/);
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
  assert.match(route, /allowedVisualAssetTypes/);
  assert.match(route, /declaredVisualAssetTypeLooksSupported/);
  assert.match(route, /verifyImageMagicBytes/);
  assert.match(route, /extensionForVerifiedImage/);
  assert.match(route, /kind === "poster"[\s\S]*verifyImageMagicBytes\(file\)/);
  assert.match(route, /allowedVisualAssetTypes\.has\(magicCheck\.contentType\)/);
  assert.match(route, /extensionForVerifiedImage\(magicCheck\.contentType\)/);
  assert.match(route, /contentType = magicCheck\.contentType/);
});

test("tier animation poster rejects declared AVIF when bytes are not an image", async () => {
  const route = loadTierAnimationRouteForTest();
  const form = new FormData();
  form.set("tier", "gold");
  form.set(
    "poster",
    new File(["<!doctype html><html></html>"], "fake.avif", { type: "image/avif" }),
  );

  const response = await route.POST({ formData: async () => form });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /supported image type|valid image/i);
});

test("visual asset storage migration adds AVIF only to visual buckets", () => {
  const migration = source("../../Database/supabase/migrations/20260611190000_allow_avif_visual_asset_uploads.sql");

  assert.match(migration, /where id = 'lucky-draw-assets'/);
  assert.match(migration, /where id = 'tier-animations'/);
  assert.match(migration, /'image\/avif'/);
  assert.match(migration, /payment-slips/);
  assert.match(migration, /raise exception 'payment-slips must not allow image\/avif'/);
});
