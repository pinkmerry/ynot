import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appRoot, "..");
const migrationPath = path.join(
  repoRoot,
  "Database/marketplace-supabase/migrations/20260628110000_marketplace_seller_consignment.sql",
);
const userSellerPurchaseMigrationPath = path.join(
  repoRoot,
  "Database/marketplace-supabase/migrations/20260628120000_marketplace_user_seller_purchase.sql",
);
const sellerPhotoPerspectiveMigrationPath = path.join(
  repoRoot,
  "Database/marketplace-supabase/migrations/20260629170000_marketplace_seller_photo_perspectives.sql",
);
const marketplaceIdempotencyRepairMigrationPath = path.join(
  repoRoot,
  "Database/marketplace-supabase/migrations/20260721100000_marketplace_idempotency_status_columns.sql",
);
const sellerSubmissionEditMigrationPath = path.join(
  repoRoot,
  "Database/marketplace-supabase/migrations/20260721110000_marketplace_seller_submission_edit.sql",
);
const forbiddenCoreMigrationPath = path.join(
  repoRoot,
  "Database/supabase/migrations/20260628110000_marketplace_seller_consignment.sql",
);

function readApp(relPath) {
  return readFileSync(path.join(appRoot, relPath), "utf8");
}

function readMigration() {
  return readFileSync(migrationPath, "utf8");
}

function readUserSellerPurchaseMigration() {
  return readFileSync(userSellerPurchaseMigrationPath, "utf8");
}

function readSellerPhotoPerspectiveMigration() {
  return readFileSync(sellerPhotoPerspectiveMigrationPath, "utf8");
}

function readMarketplaceIdempotencyRepairMigration() {
  return readFileSync(marketplaceIdempotencyRepairMigrationPath, "utf8");
}

function readSellerSubmissionEditMigration() {
  return readFileSync(sellerSubmissionEditMigrationPath, "utf8");
}

function compactSql(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function requirePattern(source, pattern, label) {
  assert.match(source, pattern, label);
}

function assertCentralMutationGuard(source, relPath) {
  const mutationGuard = readApp("src/lib/marketplace/mutation-guard.ts");
  assert.match(source, /prepareMarketplaceMutation/, `${relPath} must use the centralized mutation guard`);
  assert.match(mutationGuard, /resolveCurrentProfile/, "central mutation guard must resolve YNOTT login");
  assert.match(mutationGuard, /ownerOnlyMarketplaceAccess/, "central mutation guard must keep owner-only prelaunch gate");
  assert.match(mutationGuard, /enforceSameOriginMutation/, "central mutation guard must enforce same origin");
  assert.match(mutationGuard, /enforceRateLimit/, "central mutation guard must rate-limit");
  assert.match(mutationGuard, /marketplaceIdempotencyKey/, "central mutation guard must require idempotency by default");
  assert.match(mutationGuard, /readMarketplaceJsonBody/, "central mutation guard must use JSON allowlists");
  assert.match(mutationGuard, /marketplaceRequestHash/, "central mutation guard must hash requests");
}

const ynotRoutes = [
  "src/app/api/ynot/marketplace/seller/session/route.ts",
  "src/app/api/ynot/marketplace/seller/terms/route.ts",
  "src/app/api/ynot/marketplace/seller/submissions/route.ts",
  "src/app/api/ynot/marketplace/seller/payout-preview/route.ts",
];

const aliases = [
  "src/app/api/marketplace/seller/session/route.ts",
  "src/app/api/marketplace/seller/terms/route.ts",
  "src/app/api/marketplace/seller/submissions/route.ts",
  "src/app/api/marketplace/seller/payout-preview/route.ts",
];

const sellerSubmissionDetailRoutes = [
  "src/app/api/ynot/marketplace/seller/submissions/[submissionId]/route.ts",
  "src/app/api/ynot/marketplace/seller/submissions/[submissionId]/submit/route.ts",
  "src/app/api/ynot/marketplace/seller/submissions/[submissionId]/cancel/route.ts",
  "src/app/api/ynot/marketplace/seller/submissions/[submissionId]/handoff/route.ts",
  "src/app/api/ynot/marketplace/seller/submissions/[submissionId]/photos/route.ts",
];

const sellerSubmissionDetailAliases = [
  "src/app/api/marketplace/seller/submissions/[submissionId]/route.ts",
  "src/app/api/marketplace/seller/submissions/[submissionId]/submit/route.ts",
  "src/app/api/marketplace/seller/submissions/[submissionId]/cancel/route.ts",
  "src/app/api/marketplace/seller/submissions/[submissionId]/handoff/route.ts",
  "src/app/api/marketplace/seller/submissions/[submissionId]/photos/route.ts",
];

const adminSellerConsignmentRoutes = [
  "src/app/api/ynot/marketplace/admin/seller-consignments/[submissionId]/activate/route.ts",
  "src/app/api/ynot/marketplace/admin/seller-consignments/[submissionId]/transition/route.ts",
];

const adminSellerConsignmentAliases = [
  "src/app/api/marketplace/admin/seller-consignments/[submissionId]/activate/route.ts",
  "src/app/api/marketplace/admin/seller-consignments/[submissionId]/transition/route.ts",
];

test("package exposes the scoped marketplace seller consignment test script", () => {
  const packageJson = JSON.parse(readApp("package.json"));
  assert.equal(
    packageJson.scripts["test:marketplace-seller-consignment"],
    "node --test scripts/test-marketplace-seller-consignment.mjs",
  );
});

test("seller consignment migration is separate, indexed, service-role only, and blocks gacha sources", () => {
  assert.ok(existsSync(migrationPath), "missing seller consignment marketplace migration");
  assert.ok(
    !existsSync(forbiddenCoreMigrationPath),
    "seller consignment migration must not live in the core YNOTT Supabase stream",
  );

  const sql = compactSql(readMigration());
  for (const table of [
    "marketplace_seller_terms_acceptances",
    "marketplace_seller_submissions",
    "marketplace_seller_submission_photos",
    "marketplace_seller_submission_events",
    "marketplace_seller_handoff_confirmations",
  ]) {
    requirePattern(sql, new RegExp(`create table if not exists public\\.${table}\\b`), `missing ${table}`);
    requirePattern(sql, new RegExp(`alter table public\\.${table} enable row level security`), `${table} must enable RLS`);
    requirePattern(sql, new RegExp(`grant all on[\\s\\S]*public\\.${table}[\\s\\S]*to service_role`), `${table} must be service-role owned`);
  }

  requirePattern(sql, /source_kind text not null default 'seller_physical_intake'/);
  requirePattern(sql, /source_kind = 'seller_physical_intake'/);
  requirePattern(sql, /item_type text not null check \(item_type in \('card', 'sealed_box', 'sealed_pack'\)\)/);
  requirePattern(sql, /marketplace_seller_submissions_seller_idx/);
  requirePattern(sql, /marketplace_seller_submissions_admin_queue_idx/);
  requirePattern(sql, /marketplace_seller_events_submission_idx/);
  requirePattern(sql, /marketplace-seller-submission-photos/);
  requirePattern(sql, /combined_source_text ~\* '\(customer_bag\|customer-bag\|gacha\|reward\|wallet\|draw\|collection\|conversion\)'/);
  assert.doesNotMatch(
    sql,
    /references public\.(gacha|customer_bag|reward|wallet|draw|collection)/,
    "seller consignment must not foreign-key to gacha/customer bag/reward state",
  );
  requirePattern(sql, /approved_inventory_id is null or status in \('inventory_created', 'listed', 'sold'\)/);
  requirePattern(sql, /listing_id is null or status in \('listed', 'sold'\)/);
});

test("seller consignment RPCs are fixed-search-path, idempotent, and audit submission creation", () => {
  const sql = compactSql(readMigration());
  for (const rpc of [
    "marketplace_create_seller_submission",
    "marketplace_quote_seller_payout_preview",
    "marketplace_mutate_seller_submission_state",
    "marketplace_confirm_seller_handoff",
    "marketplace_attach_seller_submission_photo",
    "marketplace_admin_transition_seller_intake",
  ]) {
    requirePattern(sql, new RegExp(`create or replace function public\\.${rpc}\\b`), `missing ${rpc}`);
    requirePattern(sql, new RegExp(`create or replace function public\\.${rpc}[\\s\\S]*security definer[\\s\\S]*set search_path = public, pg_temp`), `${rpc} must lock search_path`);
    requirePattern(sql, new RegExp(`revoke all on function public\\.${rpc}[\\s\\S]*from public, anon, authenticated`), `${rpc} must revoke browser execution`);
    requirePattern(sql, new RegExp(`grant execute on function public\\.${rpc}[\\s\\S]*to service_role`), `${rpc} must grant service_role execution`);
  }

  requirePattern(sql, /seller_submission\.create/);
  requirePattern(sql, /p_action not in \('submit', 'cancel'\)/);
  requirePattern(sql, /'seller_submission\.' \|\| p_action/);
  requirePattern(sql, /seller_submission\.handoff/);
  requirePattern(sql, /seller_submission\.photo\.attach/);
  requirePattern(sql, /seller_intake\.transition/);
  requirePattern(sql, /marketplace_seller_submission_created/);
  requirePattern(sql, /marketplace_seller_submission_draft_created|marketplace_seller_submission_submitted/);
  requirePattern(sql, /marketplace_seller_submission_cancelled/);
  requirePattern(sql, /marketplace_seller_handoff_confirmed/);
  requirePattern(sql, /marketplace_seller_submission_photo_attached/);
  requirePattern(sql, /marketplace_seller_intake_/);
  requirePattern(sql, /account_row\.seller_status <> 'active'/);
  requirePattern(sql, /payout_preview_satang = asking_price_satang - seller_marketplace_fee_satang/);
  requirePattern(sql, /where id = p_submission_id\s+and marketplace_account_id = p_marketplace_account_id\s+and ynot_profile_id = p_ynot_profile_id/);
  requirePattern(sql, /p_target_status not in \('intake_instruction_sent', 'received', 'inspection_passed', 'inspection_failed'\)/);
  requirePattern(compactSql(readUserSellerPurchaseMigration()), /submission_row\.status <> 'inspection_passed'/);
  requirePattern(sql, /marketplace_seller_photo_required/);
  requirePattern(sql, /p_content_type is null or p_content_type not in \('image\/jpeg', 'image\/png', 'image\/webp'\)/);
  requirePattern(sql, /p_file_size_bytes is null or p_file_size_bytes < 1 or p_file_size_bytes > 10485760/);
  requirePattern(sql, /p_file_sha256 is null or lower\(p_file_sha256\) !~ '\^\[a-f0-9\]\{64\}\$'/);
  requirePattern(sql, /normalized_storage_path not like p_marketplace_account_id::text \|\| '\/' \|\| p_submission_id::text \|\| '\/%'/);
  requirePattern(sql, /normalized_storage_path like '\/%' or normalized_storage_path like '%:\/\/%'/);
  requirePattern(sql, /marketplace_seller_handoff_one_per_submission_idx/);
  assert.ok(
    existsSync(sellerPhotoPerspectiveMigrationPath),
    "missing seller photo perspective migration",
  );
  const photoSql = compactSql(readSellerPhotoPerspectiveMigration());
  requirePattern(photoSql, /photo_role text not null default 'other'/);
  requirePattern(photoSql, /display_order integer not null default 1/);
  requirePattern(photoSql, /check \(display_order between 1 and 10\)/);
  requirePattern(photoSql, /marketplace_seller_photos_order_idx/);
  requirePattern(photoSql, /p_photo_role text default 'other'/);
  requirePattern(photoSql, /p_display_order integer default 1/);
  requirePattern(photoSql, /marketplace_photo_role_invalid/);
  requirePattern(photoSql, /marketplace_photo_display_order_invalid/);
  requirePattern(photoSql, /'photorole', photo_row\.photo_role/);
  requirePattern(photoSql, /'displayorder', photo_row\.display_order/);
  assert.doesNotMatch(
    sql,
    /insert into public\.marketplace_listing_snapshots[\s\S]*marketplace_create_seller_submission/,
    "seller submission RPC must not create active listings",
  );
});

test("seller photo idempotency completion fields are present before the photo RPC uses them", () => {
  assert.ok(
    existsSync(marketplaceIdempotencyRepairMigrationPath),
    "missing marketplace idempotency repair migration",
  );
  const repairSql = compactSql(readMarketplaceIdempotencyRepairMigration());
  requirePattern(repairSql, /alter table public\.marketplace_idempotency_keys/);
  requirePattern(repairSql, /add column if not exists status text not null default 'processing'/);
  requirePattern(repairSql, /add column if not exists completed_at timestamptz/);
  requirePattern(repairSql, /status = 'completed'/);
  requirePattern(compactSql(readSellerPhotoPerspectiveMigration()), /status = 'completed'/);
  requirePattern(compactSql(readSellerPhotoPerspectiveMigration()), /completed_at = now\(\)/);
});

test("draft seller listings can be edited with their private photos while submitted listings remain locked", () => {
  assert.ok(
    existsSync(sellerSubmissionEditMigrationPath),
    "missing seller submission edit migration",
  );
  const editSql = compactSql(readSellerSubmissionEditMigration());
  requirePattern(editSql, /create or replace function public\.marketplace_update_seller_submission/);
  requirePattern(editSql, /security definer[\s\S]*set search_path = public, pg_temp/);
  requirePattern(editSql, /submission_row\.status <> 'draft'/);
  requirePattern(editSql, /marketplace_seller_submission_not_editable/);
  requirePattern(editSql, /submission_row\.version <> p_expected_version/);
  requirePattern(editSql, /seller_submission\.update/);
  requirePattern(editSql, /version = submission_row\.version \+ 1/);

  const service = readApp("src/lib/marketplace/seller-consignment.ts");
  const detailRoute = readApp("src/app/api/ynot/marketplace/seller/submissions/[submissionId]/route.ts");
  const privatePhotoRoute = readApp("src/app/api/ynot/marketplace/seller/submissions/[submissionId]/photos/[photoId]/file/route.ts");
  const form = readApp("src/features/marketplace-ui/sell/SellForm.tsx");
  const uploader = readApp("src/features/marketplace-ui/sell/PhotoUploader.tsx");
  requirePattern(service, /SELLER_SUBMISSION_UPDATE_FIELDS/);
  requirePattern(service, /marketplace_update_seller_submission/);
  requirePattern(detailRoute, /export async function PATCH/);
  requirePattern(privatePhotoRoute, /getMarketplaceAccountForProfile/);
  requirePattern(privatePhotoRoute, /\.eq\("marketplace_account_id", account\.accountId\)/);
  requirePattern(privatePhotoRoute, /Cache-Control": "private, no-store"/);
  requirePattern(form, /Save draft changes/);
  requirePattern(form, /existingPhotos/);
  requirePattern(form, /filter\(\(photo\) => photo\.file\)/);
  requirePattern(uploader, /photo\.file \?/);
});

test("seller modules and routes enforce account bridge, owner gate, validation, idempotency, and no trusted seller ids", () => {
  const serviceModule = readApp("src/lib/marketplace/seller-consignment.ts");
  assert.match(serviceModule, /import "server-only"/);
  assert.match(serviceModule, /SELLER_SUBMISSION_FIELDS/);
  assert.match(serviceModule, /customer\[_-\]\?bag\|gacha\|reward\|wallet\|draw\|collection\|conversion/i);
  assert.match(serviceModule, /getActiveMarketplaceMoneyPolicy/);
  assert.match(serviceModule, /marketplaceMoneyPreview/);
  assert.match(serviceModule, /marketplace_create_seller_submission/);
  assert.match(serviceModule, /marketplace_mutate_seller_submission_state/);
  assert.match(serviceModule, /marketplace_confirm_seller_handoff/);
  assert.match(serviceModule, /marketplace_attach_seller_submission_photo/);
  assert.match(serviceModule, /marketplace_admin_transition_seller_intake/);
  assert.match(serviceModule, /listAdminSellerSubmissionQueue/);
  assert.match(serviceModule, /marketplace_seller_submissions/);
  assert.match(serviceModule, /\.eq\("marketplace_account_id", account\.accountId\)/);
  assert.match(serviceModule, /getSellerSubmissionDetail/);
  assert.match(serviceModule, /handoffConfirmations/);
  assert.match(serviceModule, /SELLER_HANDOFF_CONFIRMATION_FIELDS/);
  assert.match(serviceModule, /ADMIN_SELLER_INTAKE_TRANSITION_FIELDS/);
  assert.match(serviceModule, /requiredSha256/);
  assert.match(serviceModule, /SELLER_MAX_PHOTOS_PER_SUBMISSION = 10/);
  assert.match(serviceModule, /marketplace_seller_photo_limit_exceeded/);
  assert.match(serviceModule, /SELLER_PHOTO_ROLES/);
  assert.match(serviceModule, /normalizeSellerPhotoRole/);
  assert.match(serviceModule, /normalizeSellerPhotoDisplayOrder/);
  assert.match(serviceModule, /p_photo_role/);
  assert.match(serviceModule, /p_display_order/);
  assert.match(serviceModule, /\.order\("display_order", \{ ascending: true \}\)/);
  assert.match(serviceModule, /storagePath\.includes\(":\/\/"\)/);
  assert.match(serviceModule, /storagePath\.startsWith\(requiredPrefix\)/);
  assert.match(serviceModule, /SELLER_PHOTO_CONTENT_TYPES/);
  assert.match(serviceModule, /marketplaceSellerSubmissionPhotoUrl/);
  assert.match(
    serviceModule,
    /\/api\/marketplace\/files\/seller-submissions\/\$\{submissionId\}\/photos\/\$\{photoId\}/,
  );
  assert.match(serviceModule, /resolveSellerSubmissionPhotoUrls/);
  assert.doesNotMatch(
    serviceModule,
    /SELLER_LISTING_ACTIVATION_FIELDS\s*=\s*\[[\s\S]*?"photoUrls"[\s\S]*?\] as const/,
    "seller listing activation must derive photo URLs from stored uploads",
  );

  for (const relPath of ynotRoutes) {
    assert.ok(existsSync(path.join(appRoot, relPath)), `missing ${relPath}`);
    const source = readApp(relPath);
    if (relPath.includes("session/route.ts")) {
      assert.match(source, /ownerOnlyMarketplaceAccess/, `${relPath} must keep owner-only prelaunch gate`);
      assert.match(source, /resolveCurrentProfile/, `${relPath} must resolve YNOTT login`);
      assert.match(source, /enforceRateLimit/, `${relPath} must rate-limit`);
    } else {
      assertCentralMutationGuard(source, relPath);
      assert.match(source, /allowedFields:/, `${relPath} mutation must declare JSON allowlist`);
      assert.match(source, /mutation\.requestHash/, `${relPath} mutation must hash requests`);
    }
    assert.doesNotMatch(source, /seller_marketplace_account_id|buyer_marketplace_account_id|actor_ynot_profile_id/);
  }

  const submissionsRoute = readApp("src/app/api/ynot/marketplace/seller/submissions/route.ts");
  assert.match(submissionsRoute, /prepareMarketplaceMutation/);
  assert.doesNotMatch(submissionsRoute, /requireIdempotency:\s*false/);
  assert.match(submissionsRoute, /getMarketplaceAccountForProfile/);
  assert.match(submissionsRoute, /createSellerSubmission/);

  for (const relPath of sellerSubmissionDetailRoutes) {
    assert.ok(existsSync(path.join(appRoot, relPath)), `missing ${relPath}`);
    const source = readApp(relPath);
    assert.match(source, /getMarketplaceAccountForProfile/, `${relPath} must derive seller account from session`);
    assert.match(source, /submissionId/, `${relPath} must bind route submission id`);
    assert.doesNotMatch(source, /seller_marketplace_account_id|buyer_marketplace_account_id|actor_ynot_profile_id/);
    if (relPath.endsWith("[submissionId]/route.ts")) {
      assert.match(source, /ownerOnlyMarketplaceAccess/, `${relPath} must keep owner-only prelaunch gate`);
      assert.match(source, /resolveCurrentProfile/, `${relPath} must resolve YNOTT login`);
      assert.match(source, /enforceRateLimit/, `${relPath} must rate-limit`);
    } else {
      assertCentralMutationGuard(source, relPath);
      if (relPath.includes("/photos/")) {
        assert.match(source, /readBody: false/, `${relPath} upload must let the route parse multipart form data`);
        assert.match(source, /multipart\/form-data/, `${relPath} photo upload must require multipart form data`);
        assert.match(source, /verifyImageMagicBytes/, `${relPath} photo upload must verify image magic bytes`);
        assert.match(source, /sha256Hex/, `${relPath} photo upload must hash files`);
        assert.match(source, /crypto\.subtle\.digest\("SHA-256"/, `${relPath} photo upload must use the Worker-compatible SHA-256 API`);
        assert.doesNotMatch(source, /@\/lib\/slip2go\/client/, `${relPath} photo upload must not use the Node Buffer hash helper`);
        assert.match(source, /marketplace-seller-submission-photos/, `${relPath} photo upload must use private marketplace bucket`);
      } else {
        assert.match(source, /allowedFields:/, `${relPath} mutation must use JSON allowlist`);
      }
      assert.doesNotMatch(source, /requireIdempotency:\s*false/, `${relPath} mutation must require idempotency`);
      assert.match(source, /mutation\.(requestHash|requestHashForBody)/, `${relPath} mutation must hash request body`);
      assert.match(source, /seller_submission\./, `${relPath} must scope idempotency command`);
    }
  }

  const detailRoute = readApp("src/app/api/ynot/marketplace/seller/submissions/[submissionId]/route.ts");
  assert.match(detailRoute, /getSellerSubmissionDetail/);
  assert.doesNotMatch(detailRoute, /readMarketplaceJsonBody|marketplaceIdempotencyKey/);

  const handoffRoute = readApp("src/app/api/ynot/marketplace/seller/submissions/[submissionId]/handoff/route.ts");
  assert.match(handoffRoute, /SELLER_HANDOFF_CONFIRMATION_FIELDS/);
  assert.match(handoffRoute, /confirmSellerSubmissionHandoff/);

  const photoRoute = readApp("src/app/api/ynot/marketplace/seller/submissions/[submissionId]/photos/route.ts");
  assert.match(photoRoute, /request\.formData\(\)/);
  assert.match(photoRoute, /allowedSlipTypes/);
  assert.match(photoRoute, /extensionForVerifiedImage/);
  assert.match(photoRoute, /attachSellerSubmissionPhotoMetadata/);
  assert.match(photoRoute, /photoRole/);
  assert.match(photoRoute, /displayOrder/);
  assert.match(photoRoute, /normalizeSellerPhotoRole/);
  assert.match(photoRoute, /normalizeSellerPhotoDisplayOrder/);
  assert.match(photoRoute, /cleanFileName\(idempotencyKey\)/);

  for (const relPath of adminSellerConsignmentRoutes) {
    assert.ok(existsSync(path.join(appRoot, relPath)), `missing ${relPath}`);
    const source = readApp(relPath);
    assertCentralMutationGuard(source, relPath);
    assert.match(source, /allowedFields:/, `${relPath} mutation must use JSON allowlist`);
    assert.doesNotMatch(source, /requireIdempotency:\s*false/, `${relPath} mutation must require idempotency`);
    assert.match(source, /mutation\.requestHash/, `${relPath} mutation must hash request body`);
    assert.doesNotMatch(source, /seller_marketplace_account_id|buyer_marketplace_account_id|actor_ynot_profile_id/);
  }

  const transitionRoute = readApp("src/app/api/ynot/marketplace/admin/seller-consignments/[submissionId]/transition/route.ts");
  assert.match(transitionRoute, /ADMIN_SELLER_INTAKE_TRANSITION_FIELDS/);
  assert.match(transitionRoute, /transitionSellerConsignmentIntake/);
  assert.match(transitionRoute, /seller_intake\.transition/);

  const termsRoute = readApp("src/app/api/ynot/marketplace/seller/terms/route.ts");
  assert.match(termsRoute, /ensureMarketplaceAccountForProfile/);
  assert.match(termsRoute, /acceptMarketplaceSellerTerms/);

  for (const relPath of aliases) {
    assert.ok(existsSync(path.join(appRoot, relPath)), `missing ${relPath}`);
    assert.match(readApp(relPath), /@\/app\/api\/ynot\/marketplace\/seller/);
  }

  for (const relPath of sellerSubmissionDetailAliases) {
    assert.ok(existsSync(path.join(appRoot, relPath)), `missing ${relPath}`);
    assert.match(readApp(relPath), /@\/app\/api\/ynot\/marketplace\/seller\/submissions\/\[submissionId\]/);
  }

  for (const relPath of adminSellerConsignmentAliases) {
    assert.ok(existsSync(path.join(appRoot, relPath)), `missing ${relPath}`);
    assert.match(readApp(relPath), /@\/app\/api\/ynot\/marketplace\/admin\/seller-consignments\/\[submissionId\]/);
  }
});

test("seller dashboard is a separate marketplace surface with terms, submission form, and payout estimate", () => {
  const page = readApp("src/app/(store)/marketplace/seller/page.tsx");
  // Redesign (feat: marketplace sell-a-card redesign): the seller page now
  // renders marketplace-ui SellForm instead of MarketplaceSellerClient, and
  // fetches a single submission for ?submission=ID edit prefill instead of
  // the full list (the list moved to the orders page's listings tab).
  assert.match(page, /SellForm/);
  assert.match(page, /getSellerSubmissionDetail/);
  assert.match(page, /ownerOnly|config\.ownerOnly/);
  assert.doesNotMatch(
    page,
    /config\.ownerOnly \?[^:]+:\s*viewer\.isAdmin/s,
    "seller page must allow signed-in users when owner-only mode is disabled",
  );

  const client = readApp("src/features/marketplace-ui/sell/SellForm.tsx");
  const uploader = readApp("src/features/marketplace-ui/sell/PhotoUploader.tsx");
  const rail = readApp("src/features/marketplace-ui/sell/SellSummaryRail.tsx");
  assert.match(client, /\/api\/marketplace\/seller\/terms/);
  assert.match(client, /\/api\/marketplace\/seller\/submissions/);
  assert.match(client, /Accept seller terms/);
  assert.match(client, /\/api\/marketplace\/seller\/payout-preview/);
  assert.match(client, /sellerPayoutSatang/);
  assert.match(client, /submitNow/);
  assert.match(rail, /You receive/);
  assert.match(rail, /formatThb\(/);
  assert.match(uploader, /MAX_SELL_PHOTOS = 10/);
  assert.match(uploader, /Upload card photos/);
  assert.match(client, /photoRole/);
  assert.match(client, /displayOrder/);
  assert.match(client, /\/api\/marketplace\/seller\/submissions\/\$\{submissionId\}\/photos/);
  for (const source of [client, uploader]) {
    assert.doesNotMatch(source, /front and back/i);
    assert.doesNotMatch(source, /perspective/i);
    assert.doesNotMatch(source, /CoinMark|coin/i);
  }
  // The rail's "coins" span is the shared mp-price CSS hook from the theme;
  // the payout itself must render THB via formatThb with no coin iconography.
  assert.doesNotMatch(rail, /CoinMark|MpCoin/);

  const adminPage = readApp("src/app/admin/marketplace/page.tsx");
  assert.match(adminPage, /buildMarketplaceOpsSnapshot/);
  // Admin shell + overview redesign (see test-marketplace-ui-admin-shell.mjs):
  // the inline "Seller intake" / "Sell requests" submissions table (with its
  // raw photo_count field) moved off this page -- a later task rebuilds a
  // dedicated seller-submissions list screen (AdminShell's "Verification
  // queue" nav entry already points at /admin/marketplace/seller-submissions).
  // The overview's queue summary list still surfaces how many submissions
  // are waiting for review.
  const overviewScreen = readApp("src/features/marketplace-ui/admin/OverviewScreen.tsx");
  const adminShell = readApp("src/features/marketplace-ui/admin/AdminShell.tsx");
  assert.match(adminPage, /sellerSubmissionReviewCount/);
  assert.match(overviewScreen, /Seller submissions to review/);
  assert.match(adminShell, /"\/admin\/marketplace\/seller-submissions"/);
  const opsSnapshot = readApp("src/lib/marketplace/ops-snapshot.ts");
  assert.match(opsSnapshot, /listAdminSellerSubmissionQueue/);

  const marketplacePage = readApp("src/features/ynot/components.tsx");
  assert.match(marketplacePage, /\/marketplace\/seller/);
});
