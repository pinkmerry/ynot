import "server-only";

import type {
  ResolvedAdminSession,
  ResolvedProfileSession,
} from "@/lib/auth/resolve-current-profile";
import {
  getActiveMarketplaceMoneyPolicy,
  type MarketplaceMoneyPolicy,
  marketplaceMoneyPreview,
} from "./money";
import type { SafeMarketplaceAccount } from "./account-bridge";
import { marketplaceConfig } from "./config";
import { mockMarketplaceSellerSubmissions } from "./mock-data";
import {
  createMarketplaceSupabaseClient,
  marketplaceRpcError,
  MarketplaceServiceError,
} from "./supabase-adapter";

export const SELLER_SUBMISSION_FIELDS = [
  "itemType",
  "titleSnapshot",
  "conditionCode",
  "conditionNotes",
  "askingPriceSatang",
  "referenceSource",
  "referenceCardId",
  "referenceVariantId",
  "variantSnapshot",
  "referenceSnapshot",
  "gradeLabel",
  "language",
  "certNumber",
  "sellerNote",
  "submitNow",
] as const;

export const SELLER_PAYOUT_PREVIEW_FIELDS = [
  "askingPriceSatang",
] as const;

export const SELLER_LISTING_ACTIVATION_FIELDS = [
  "expectedVersion",
  "publicDescription",
  "adminNote",
] as const;

export const SELLER_SUBMISSION_STATE_FIELDS = [
  "expectedVersion",
  "sellerNote",
] as const;

export const SELLER_HANDOFF_CONFIRMATION_FIELDS = [
  "expectedVersion",
  "handoffMethod",
  "carrier",
  "trackingCode",
  "sellerNote",
] as const;

export const SELLER_PHOTO_METADATA_FIELDS = [
  "expectedVersion",
  "storagePath",
  "photoRole",
  "displayOrder",
  "fileSha256",
  "fileSizeBytes",
  "contentType",
] as const;

export const ADMIN_SELLER_INTAKE_TRANSITION_FIELDS = [
  "expectedVersion",
  "status",
  "adminNote",
  "intakeInstructionId",
] as const;

const SELLER_ITEM_TYPES: ReadonlySet<string> = new Set([
  "card",
  "sealed_box",
  "sealed_pack",
]);

const SELLER_HANDOFF_METHODS: ReadonlySet<string> = new Set([
  "ship_to_store",
  "bring_to_store",
]);

const SELLER_PHOTO_CONTENT_TYPES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export const SELLER_MAX_PHOTOS_PER_SUBMISSION = 10;

export const SELLER_PHOTO_ROLES = [
  "front",
  "back",
  "left_edge",
  "right_edge",
  "top_bottom_edges",
  "corners",
  "surface",
  "serial_or_cert",
  "other",
] as const;

const SELLER_PHOTO_ROLE_SET: ReadonlySet<string> = new Set(SELLER_PHOTO_ROLES);

const ADMIN_INTAKE_STATUSES: ReadonlySet<string> = new Set([
  "intake_instruction_sent",
  "received",
  "inspection_passed",
  "inspection_failed",
]);

const FORBIDDEN_SELLER_SOURCE_RE =
  /customer[_-]?bag|gacha|reward|wallet|draw|collection|conversion/i;

type SellerItemType = "card" | "sealed_box" | "sealed_pack";

export type SellerSubmissionRow = {
  id: string;
  submission_number: string;
  status: string;
  item_type: SellerItemType;
  title_snapshot: string;
  condition_code: string;
  asking_price_satang: number;
  currency: "THB";
  seller_marketplace_fee_bps: number;
  seller_marketplace_fee_satang: number;
  payout_preview_satang: number;
  source_kind: "seller_physical_intake";
  version: number;
  created_at: string | null;
  updated_at: string | null;
};

export type SellerSubmissionPhotoRow = {
  id: string;
  status: string;
  photo_role: string;
  display_order: number;
  storage_bucket: string;
  storage_path: string;
  file_sha256: string | null;
  file_size_bytes: number | null;
  content_type: string | null;
  created_at: string | null;
};

export type SellerSubmissionHandoffRow = {
  id: string;
  handoff_method: string;
  carrier: string | null;
  tracking_code: string | null;
  seller_note: string | null;
  confirmed_at: string | null;
};

export type SellerSubmissionDetail = SellerSubmissionRow & {
  reference_source: string | null;
  reference_card_id: string | null;
  reference_variant_id: string | null;
  condition_notes: string | null;
  variant_snapshot: Record<string, unknown>;
  reference_snapshot: Record<string, unknown>;
  grade_label: string | null;
  language: string | null;
  cert_number: string | null;
  seller_note: string | null;
  admin_visible_note: string | null;
  photos: SellerSubmissionPhotoRow[];
  handoffConfirmations: SellerSubmissionHandoffRow[];
};

export type AdminSellerSubmissionQueueRow = SellerSubmissionRow & {
  marketplace_account_id: string;
  ynot_profile_id: string;
  reference_source: string | null;
  reference_card_id: string | null;
  reference_variant_id: string | null;
  grade_label: string | null;
  language: string | null;
  cert_number: string | null;
  admin_visible_note: string | null;
  approved_inventory_id: string | null;
  listing_id: string | null;
  photo_count: number;
};

export type SellerSaleRow = {
  id: string;
  listing_id: string;
  payment_state: string;
  fulfilment_state: string;
  refund_state: string;
  item_price_satang: number;
  seller_fee_satang: number;
  seller_payout_satang: number;
  seller_payout_state: string;
  currency: "THB";
  created_at: string | null;
  updated_at: string | null;
};

function textField(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string") {
    throw new MarketplaceServiceError(
      `marketplace_${label}_invalid`,
      "Marketplace request is invalid.",
      400,
    );
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    throw new MarketplaceServiceError(
      `marketplace_${label}_invalid`,
      "Marketplace request is invalid.",
      400,
    );
  }
  return trimmed;
}

function optionalTextField(value: unknown, label: string, maxLength: number) {
  if (value === undefined || value === null || value === "") return null;
  return textField(value, label, maxLength);
}

function positiveInteger(value: unknown, label: string) {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new MarketplaceServiceError(
      `marketplace_${label}_invalid`,
      "Marketplace request is invalid.",
      400,
    );
  }
  return Number(value);
}

function optionalPositiveInteger(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") return null;
  return positiveInteger(value, label);
}

function optionalBoolean(value: unknown) {
  if (value === undefined || value === null) return false;
  if (typeof value !== "boolean") {
    throw new MarketplaceServiceError(
      "marketplace_submit_now_invalid",
      "Marketplace request is invalid.",
      400,
    );
  }
  return value;
}

function jsonObject(value: unknown, label: string) {
  if (value === undefined || value === null) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MarketplaceServiceError(
      `marketplace_${label}_invalid`,
      "Marketplace request is invalid.",
      400,
    );
  }
  const serialized = JSON.stringify(value);
  if (FORBIDDEN_SELLER_SOURCE_RE.test(serialized)) {
    throw new MarketplaceServiceError(
      "marketplace_seller_source_forbidden",
      "Marketplace seller submissions must use physical intake, not gacha or customer-bag rewards.",
      422,
    );
  }
  return value as Record<string, unknown>;
}

function normalizeSellerItemType(value: unknown) {
  if (typeof value !== "string" || !SELLER_ITEM_TYPES.has(value)) {
    throw new MarketplaceServiceError(
      "marketplace_seller_item_type_invalid",
      "Marketplace seller submissions support cards, sealed boxes, and sealed packs.",
      400,
    );
  }
  return value as SellerItemType;
}

function normalizeHandoffMethod(value: unknown) {
  if (typeof value !== "string" || !SELLER_HANDOFF_METHODS.has(value)) {
    throw new MarketplaceServiceError(
      "marketplace_handoff_method_invalid",
      "Marketplace handoff method is invalid.",
      400,
    );
  }
  return value;
}

function normalizeAdminIntakeStatus(value: unknown) {
  if (typeof value !== "string" || !ADMIN_INTAKE_STATUSES.has(value)) {
    throw new MarketplaceServiceError(
      "marketplace_intake_status_invalid",
      "Marketplace intake status is invalid.",
      400,
    );
  }
  return value;
}

function normalizePhotoStoragePath(
  value: unknown,
  accountId: string,
  submissionId: string,
) {
  const storagePath = textField(value, "photo_storage_path", 500);
  const requiredPrefix = `${accountId}/${submissionId}/`;
  if (storagePath.length < 8) {
    throw new MarketplaceServiceError(
      "marketplace_photo_storage_path_invalid",
      "Marketplace photo metadata is invalid.",
      400,
    );
  }
  if (
    storagePath.includes("://") ||
    storagePath.startsWith("/") ||
    storagePath.includes("..") ||
    storagePath.includes("//") ||
    !storagePath.startsWith(requiredPrefix) ||
    !/^[a-zA-Z0-9._/-]+$/.test(storagePath)
  ) {
    throw new MarketplaceServiceError(
      "marketplace_photo_storage_path_invalid",
      "Marketplace photo metadata is invalid.",
      400,
    );
  }
  return storagePath;
}

function requiredSha256(value: unknown) {
  if (value === undefined || value === null || value === "") {
    throw new MarketplaceServiceError(
      "marketplace_photo_sha256_invalid",
      "Marketplace photo metadata is invalid.",
      400,
    );
  }
  const sha256 = textField(value, "photo_sha256", 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new MarketplaceServiceError(
      "marketplace_photo_sha256_invalid",
      "Marketplace photo metadata is invalid.",
      400,
    );
  }
  return sha256;
}

function requiredPhotoSizeBytes(value: unknown) {
  if (value === undefined || value === null || value === "") {
    throw new MarketplaceServiceError(
      "marketplace_photo_size_invalid",
      "Marketplace photo metadata is invalid.",
      400,
    );
  }
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 10_485_760) {
    throw new MarketplaceServiceError(
      "marketplace_photo_size_invalid",
      "Marketplace photo metadata is invalid.",
      400,
    );
  }
  return Number(value);
}

function requiredPhotoContentType(value: unknown) {
  if (value === undefined || value === null || value === "") {
    throw new MarketplaceServiceError(
      "marketplace_photo_content_type_invalid",
      "Marketplace photo metadata is invalid.",
      400,
    );
  }
  if (typeof value !== "string" || !SELLER_PHOTO_CONTENT_TYPES.has(value)) {
    throw new MarketplaceServiceError(
      "marketplace_photo_content_type_invalid",
      "Marketplace photo metadata is invalid.",
      400,
    );
  }
  return value;
}

export function normalizeSellerPhotoRole(value: unknown) {
  const role = typeof value === "string" && value.trim() ? value.trim() : "other";
  if (!SELLER_PHOTO_ROLE_SET.has(role)) {
    throw new MarketplaceServiceError(
      "marketplace_photo_role_invalid",
      "Marketplace photo type is invalid.",
      400,
    );
  }
  return role;
}

export function normalizeSellerPhotoDisplayOrder(value: unknown) {
  const parsed =
    typeof value === "string" && value.trim() !== ""
      ? Number(value)
      : typeof value === "number"
        ? value
        : 1;
  if (
    !Number.isInteger(parsed) ||
    parsed < 1 ||
    parsed > SELLER_MAX_PHOTOS_PER_SUBMISSION
  ) {
    throw new MarketplaceServiceError(
      "marketplace_photo_display_order_invalid",
      "Marketplace photo order is invalid.",
      400,
    );
  }
  return parsed;
}

function rejectForbiddenSource(...values: Array<unknown>) {
  const combined = values
    .map((value) =>
      typeof value === "string" ? value : JSON.stringify(value ?? null),
    )
    .join(" ");
  if (!FORBIDDEN_SELLER_SOURCE_RE.test(combined)) return;
  throw new MarketplaceServiceError(
    "marketplace_seller_source_forbidden",
    "Marketplace seller submissions must use physical intake, not gacha or customer-bag rewards.",
    422,
  );
}

function assertSellerAccount(
  account: SafeMarketplaceAccount | null,
): SafeMarketplaceAccount {
  if (!account?.accountId) {
    throw new MarketplaceServiceError(
      "marketplace_account_required",
      "Marketplace account is required.",
      400,
    );
  }
  if (account.sellerStatus !== "active") {
    throw new MarketplaceServiceError(
      "marketplace_seller_terms_required",
      "Seller terms must be accepted before submitting items.",
      403,
    );
  }
  return account;
}

function assertAdmin(admin: ResolvedAdminSession | null | undefined) {
  if (!admin?.profileId || !admin.adminRole) {
    throw new MarketplaceServiceError(
      "marketplace_admin_required",
      "Marketplace admin access is required.",
      403,
    );
  }
  return admin as ResolvedAdminSession & { adminRole: "owner" | "admin" | "staff" };
}

function assertUuid(value: string, label: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new MarketplaceServiceError(
      `marketplace_${label}_invalid`,
      "Marketplace request is invalid.",
      400,
    );
  }
  return value.toLowerCase();
}

export function marketplaceSellerSubmissionPhotoUrl(input: {
  submissionId: string;
  photoId: string;
}) {
  const submissionId = assertUuid(input.submissionId, "submission_id");
  const photoId = assertUuid(input.photoId, "photo_id");
  return `/api/marketplace/files/seller-submissions/${submissionId}/photos/${photoId}`;
}

type SellerPublishSubmission = {
  id: string;
  title_snapshot: string;
  condition_code: string;
  reference_card_id: string | null;
  reference_variant_id: string | null;
  variant_snapshot: Record<string, unknown>;
  reference_snapshot: Record<string, unknown>;
  grade_label: string | null;
  language: string | null;
};

function optionalUuid(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    return null;
  }
  return value.toLowerCase();
}

function snapshotText(snapshot: Record<string, unknown>, key: string) {
  const value = snapshot[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sellerVariantProjection(submission: SellerPublishSubmission) {
  const grader = snapshotText(submission.variant_snapshot, "grader")?.toLowerCase() ?? "";
  const gradeService =
    submission.condition_code !== "graded"
      ? null
      : grader === "psa"
        ? "PSA"
        : grader === "bgs"
          ? "BGS"
          : grader === "ars"
            ? "ARS"
            : "OTHER";
  const gradeValue = submission.grade_label?.trim() || null;
  const grade = gradeValue?.toLowerCase() ?? "";
  let conditionBucket = "raw_a";
  if (submission.condition_code === "graded") {
    if (gradeService === "PSA") {
      conditionBucket = /(^|\D)10(\D|$)/.test(grade)
        ? "psa_10"
        : /(^|\D)9(\D|$)/.test(grade)
          ? "psa_9"
          : "psa_8_or_under";
    } else if (gradeService === "BGS") {
      conditionBucket = grade.includes("black label")
        ? "bgs_10_black_label"
        : /(^|\D)10(\D|$)/.test(grade)
          ? "bgs_10_gold_label"
          : /9[.]5/.test(grade)
            ? "bgs_9_5"
            : "bgs_9_or_under";
    } else if (gradeService === "ARS") {
      conditionBucket = /10\+/.test(grade)
        ? "ars_10_plus"
        : /(^|\D)10(\D|$)/.test(grade)
          ? "ars_10"
          : /(^|\D)9(\D|$)/.test(grade)
            ? "ars_9"
            : "ars_8_or_under";
    } else {
      conditionBucket = "other_graded";
    }
  }
  return {
    conditionBucket,
    gradeService,
    gradeValue,
    variantLabel:
      gradeValue ??
      `${submission.condition_code.charAt(0).toUpperCase()}${submission.condition_code.slice(1)}`,
  };
}

async function resolveSellerSubmissionPhotoUrls(input: {
  submissionId: string;
  supabase: ReturnType<typeof createMarketplaceSupabaseClient>;
}) {
  const [submissionResult, photosResult] = await Promise.all([
    input.supabase
      .from("marketplace_seller_submissions")
      .select(
        [
          "id",
          "title_snapshot",
          "condition_code",
          "reference_card_id",
          "reference_variant_id",
          "variant_snapshot",
          "reference_snapshot",
          "grade_label",
          "language",
        ].join(","),
      )
      .eq("id", input.submissionId)
      .maybeSingle(),
    input.supabase
      .from("marketplace_seller_submission_photos")
      .select("id")
      .eq("submission_id", input.submissionId)
      .in("status", ["seller_attached", "admin_approved", "public_derivative_ready"])
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (submissionResult.error) throw marketplaceRpcError(submissionResult.error);
  if (photosResult.error) throw marketplaceRpcError(photosResult.error);
  if (!submissionResult.data) {
    throw new MarketplaceServiceError(
      "marketplace_seller_submission_not_found",
      "Marketplace seller submission was not found.",
      404,
    );
  }
  const uploadedPhotoUrls = (photosResult.data ?? []).map((photo) =>
    marketplaceSellerSubmissionPhotoUrl({
      submissionId: input.submissionId,
      photoId: String(photo.id),
    }),
  );
  if (uploadedPhotoUrls.length === 0) {
    throw new MarketplaceServiceError(
      "marketplace_seller_photo_required",
      "At least one seller photo is required before this listing can go live.",
      409,
    );
  }
  return {
    submission: submissionResult.data as unknown as SellerPublishSubmission,
    uploadedPhotoUrls,
  };
}

async function ensureSellerListingProductProjection(input: {
  activationPayload: Record<string, unknown>;
  submission: SellerPublishSubmission;
  uploadedPhotoUrls: string[];
  supabase: ReturnType<typeof createMarketplaceSupabaseClient>;
}) {
  const inventoryId = optionalUuid(input.activationPayload.inventoryId);
  const listingId = optionalUuid(input.activationPayload.listingId);
  if (!inventoryId || !listingId) {
    throw new MarketplaceServiceError(
      "marketplace_listing_activation_invalid",
      "Marketplace listing activation did not return its inventory records.",
      500,
    );
  }

  const productSlug = `seller-${input.submission.id.replaceAll("-", "")}`;
  let productId =
    optionalUuid(input.activationPayload.productId) ??
    optionalUuid(input.submission.reference_card_id);
  if (productId) {
    const existingProduct = await input.supabase
      .from("marketplace_products")
      .select("id")
      .eq("id", productId)
      .maybeSingle();
    if (existingProduct.error) throw marketplaceRpcError(existingProduct.error);
    if (!existingProduct.data) productId = null;
  }

  if (!productId) {
    const productResult = await input.supabase
      .from("marketplace_products")
      .upsert(
        {
          product_slug: productSlug,
          title: input.submission.title_snapshot,
          category:
            snapshotText(input.submission.reference_snapshot, "categoryLabel") ??
            snapshotText(input.submission.reference_snapshot, "category") ??
            "Single Cards",
          series_name: snapshotText(input.submission.variant_snapshot, "series"),
          set_name: snapshotText(input.submission.variant_snapshot, "set"),
          card_code: snapshotText(input.submission.variant_snapshot, "code"),
          language: input.submission.language,
          hero_image_url: input.uploadedPhotoUrls[0],
          product_metadata: {
            sourceKind: "seller_consignment",
            sellerSubmissionId: input.submission.id,
          },
        },
        { onConflict: "product_slug" },
      )
      .select("id")
      .single();
    if (productResult.error) throw marketplaceRpcError(productResult.error);
    productId = optionalUuid(productResult.data?.id);
  } else {
    const productResult = await input.supabase
      .from("marketplace_products")
      .update({ hero_image_url: input.uploadedPhotoUrls[0] })
      .eq("id", productId);
    if (productResult.error) throw marketplaceRpcError(productResult.error);
  }
  if (!productId) {
    throw new MarketplaceServiceError(
      "marketplace_product_projection_failed",
      "Marketplace product projection could not be created.",
      500,
    );
  }

  const variantProjection = sellerVariantProjection(input.submission);
  let variantId =
    optionalUuid(input.activationPayload.variantId) ??
    optionalUuid(input.submission.reference_variant_id);
  if (variantId) {
    const existingVariant = await input.supabase
      .from("marketplace_product_variants")
      .select("id")
      .eq("id", variantId)
      .eq("product_id", productId)
      .maybeSingle();
    if (existingVariant.error) throw marketplaceRpcError(existingVariant.error);
    if (!existingVariant.data) variantId = null;
  }

  if (!variantId) {
    const variantResult = await input.supabase
      .from("marketplace_product_variants")
      .upsert(
        {
          product_id: productId,
          variant_slug: productSlug,
          variant_label: variantProjection.variantLabel.slice(0, 120),
          condition_bucket: variantProjection.conditionBucket,
          grade_service: variantProjection.gradeService,
          grade_value: variantProjection.gradeValue,
          variant_snapshot: input.submission.variant_snapshot,
          image_urls: input.uploadedPhotoUrls,
        },
        { onConflict: "product_id,variant_slug" },
      )
      .select("id")
      .single();
    if (variantResult.error) throw marketplaceRpcError(variantResult.error);
    variantId = optionalUuid(variantResult.data?.id);
  } else {
    const variantResult = await input.supabase
      .from("marketplace_product_variants")
      .update({ image_urls: input.uploadedPhotoUrls })
      .eq("id", variantId)
      .eq("product_id", productId);
    if (variantResult.error) throw marketplaceRpcError(variantResult.error);
  }
  if (!variantId) {
    throw new MarketplaceServiceError(
      "marketplace_variant_projection_failed",
      "Marketplace product variant projection could not be created.",
      500,
    );
  }

  const [inventoryResult, listingResult] = await Promise.all([
    input.supabase
      .from("marketplace_inventory_items")
      .update({ product_id: productId, variant_id: variantId })
      .eq("id", inventoryId)
      .eq("source_kind", "seller_consignment"),
    input.supabase
      .from("marketplace_listing_snapshots")
      .update({ product_id: productId, variant_id: variantId })
      .eq("listing_id", listingId)
      .eq("listing_source", "user_seller"),
  ]);
  if (inventoryResult.error) throw marketplaceRpcError(inventoryResult.error);
  if (listingResult.error) throw marketplaceRpcError(listingResult.error);

  return { productId, variantId };
}

export function normalizeSellerSubmissionInput(
  body: Record<string, unknown>,
  policy: MarketplaceMoneyPolicy,
) {
  const referenceSource = optionalTextField(
    body.referenceSource,
    "reference_source",
    120,
  );
  const referenceCardId = optionalTextField(
    body.referenceCardId,
    "reference_card_id",
    160,
  );
  const referenceVariantId = optionalTextField(
    body.referenceVariantId,
    "reference_variant_id",
    160,
  );
  const variantSnapshot = jsonObject(body.variantSnapshot, "variant_snapshot");
  const referenceSnapshot = jsonObject(
    body.referenceSnapshot,
    "reference_snapshot",
  );
  rejectForbiddenSource(
    referenceSource,
    referenceCardId,
    referenceVariantId,
    variantSnapshot,
    referenceSnapshot,
  );

  const askingPriceSatang = positiveInteger(
    body.askingPriceSatang,
    "price",
  );

  return {
    itemType: normalizeSellerItemType(body.itemType),
    titleSnapshot: textField(body.titleSnapshot, "title", 240),
    conditionCode: textField(body.conditionCode, "condition_code", 80),
    conditionNotes: optionalTextField(
      body.conditionNotes,
      "condition_notes",
      1000,
    ),
    askingPriceSatang,
    referenceSource,
    referenceCardId,
    referenceVariantId,
    variantSnapshot,
    referenceSnapshot,
    gradeLabel: optionalTextField(body.gradeLabel, "grade_label", 80),
    language: optionalTextField(body.language, "language", 80),
    certNumber: optionalTextField(body.certNumber, "cert_number", 120),
    sellerNote: optionalTextField(body.sellerNote, "seller_note", 1000),
    submitNow: optionalBoolean(body.submitNow),
    sellerMarketplaceFeeBps: policy.sellerFeeBps,
  };
}

export async function quoteSellerPayoutPreview(body: Record<string, unknown>) {
  const policy = await getActiveMarketplaceMoneyPolicy();
  return marketplaceMoneyPreview({
    itemPriceSatang: positiveInteger(body.askingPriceSatang, "price"),
    sellerFeeBps: policy.sellerFeeBps,
    policy,
  });
}

export async function createSellerSubmission(input: {
  body: Record<string, unknown>;
  profile: ResolvedProfileSession;
  account: SafeMarketplaceAccount | null;
  requestId: string;
  idempotencyKey: string;
  requestHash: string;
}) {
  const account = assertSellerAccount(input.account);
  const policy = await getActiveMarketplaceMoneyPolicy();
  const submission = normalizeSellerSubmissionInput(input.body, policy);
  if (marketplaceConfig().mockData) {
    const sellerMarketplaceFeeSatang = Math.floor(
      (submission.askingPriceSatang * submission.sellerMarketplaceFeeBps) /
        10_000,
    );
    const now = new Date().toISOString();
    return {
      id: `mock-submission-${Date.now()}`,
      submission_number: `MKT-MOCK-${Math.floor(Date.now() / 1000)}`,
      status: submission.submitNow ? "submitted" : "draft",
      item_type: submission.itemType,
      title_snapshot: submission.titleSnapshot,
      condition_code: submission.conditionCode,
      asking_price_satang: submission.askingPriceSatang,
      currency: "THB",
      seller_marketplace_fee_bps: submission.sellerMarketplaceFeeBps,
      seller_marketplace_fee_satang: sellerMarketplaceFeeSatang,
      payout_preview_satang:
        submission.askingPriceSatang - sellerMarketplaceFeeSatang,
      source_kind: "seller_physical_intake",
      version: 1,
      created_at: now,
      updated_at: now,
      marketplace_account_id: account.accountId,
      ynot_profile_id: input.profile.profileId,
    };
  }
  const supabase = createMarketplaceSupabaseClient();
  const result = (await supabase.rpc("marketplace_create_seller_submission", {
    p_request_id: input.requestId,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: input.requestHash,
    p_ynot_profile_id: input.profile.profileId,
    p_marketplace_account_id: account.accountId,
    p_item_type: submission.itemType,
    p_title_snapshot: submission.titleSnapshot,
    p_condition_code: submission.conditionCode,
    p_asking_price_satang: submission.askingPriceSatang,
    p_reference_source: submission.referenceSource,
    p_reference_card_id: submission.referenceCardId,
    p_reference_variant_id: submission.referenceVariantId,
    p_variant_snapshot: submission.variantSnapshot,
    p_reference_snapshot: submission.referenceSnapshot,
    p_condition_notes: submission.conditionNotes,
    p_grade_label: submission.gradeLabel,
    p_language: submission.language,
    p_cert_number: submission.certNumber,
    p_seller_note: submission.sellerNote,
    p_submit_now: submission.submitNow,
    p_seller_marketplace_fee_bps: submission.sellerMarketplaceFeeBps,
  })) as {
    data: unknown;
    error: { message?: string; code?: string } | null;
  };

  if (result.error) throw marketplaceRpcError(result.error);
  return result.data;
}

export async function listSellerSubmissions(account: SafeMarketplaceAccount | null) {
  if (!account?.accountId) return [];
  if (marketplaceConfig().mockData) {
    return mockMarketplaceSellerSubmissions as SellerSubmissionRow[];
  }
  const supabase = createMarketplaceSupabaseClient();
  const result = await supabase
    .from("marketplace_seller_submissions")
    .select(
      [
        "id",
        "submission_number",
        "status",
        "item_type",
        "title_snapshot",
        "condition_code",
        "asking_price_satang",
        "currency",
        "seller_marketplace_fee_bps",
        "seller_marketplace_fee_satang",
        "payout_preview_satang",
        "source_kind",
        "version",
        "created_at",
        "updated_at",
      ].join(","),
    )
    .eq("marketplace_account_id", account.accountId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (result.error) throw marketplaceRpcError(result.error);
  return (result.data ?? []) as unknown as SellerSubmissionRow[];
}

export async function listAdminSellerSubmissionQueue(
  admin: ResolvedAdminSession | null,
) {
  assertAdmin(admin);
  if (marketplaceConfig().mockData) {
    return mockMarketplaceSellerSubmissions.map((submission, index) => ({
      ...submission,
      marketplace_account_id: `mock-marketplace-account-${index + 1}`,
      ynot_profile_id: `mock-ynot-profile-${index + 1}`,
      reference_source: "mock_catalog_reference",
      reference_card_id: null,
      reference_variant_id: null,
      grade_label: submission.condition_code === "graded" ? "PSA 9" : null,
      language: index === 0 ? "JP" : "EN",
      cert_number: index === 0 ? "MOCK-CERT-1001" : null,
      admin_visible_note:
        index === 0
          ? "Mock seller item ready for activation review."
          : "Mock seller item waiting for intake review.",
      approved_inventory_id:
        index === 0 ? "22222222-3333-4333-8333-222222222222" : null,
      listing_id:
        index === 0 ? "22222222-2222-4222-8222-222222222222" : null,
      photo_count: index === 0 ? 6 : 3,
    })) as AdminSellerSubmissionQueueRow[];
  }

  const supabase = createMarketplaceSupabaseClient();
  const submissionsResult = await supabase
    .from("marketplace_seller_submissions")
    .select(
      [
        "id",
        "marketplace_account_id",
        "ynot_profile_id",
        "submission_number",
        "status",
        "item_type",
        "reference_source",
        "reference_card_id",
        "reference_variant_id",
        "title_snapshot",
        "condition_code",
        "grade_label",
        "language",
        "cert_number",
        "asking_price_satang",
        "currency",
        "seller_marketplace_fee_bps",
        "seller_marketplace_fee_satang",
        "payout_preview_satang",
        "source_kind",
        "admin_visible_note",
        "approved_inventory_id",
        "listing_id",
        "version",
        "created_at",
        "updated_at",
      ].join(","),
    )
    .order("updated_at", { ascending: false })
    .limit(100);

  if (submissionsResult.error) throw marketplaceRpcError(submissionsResult.error);
  const submissions =
    (submissionsResult.data ?? []) as unknown as AdminSellerSubmissionQueueRow[];
  const submissionIds = submissions.map((submission) => submission.id);
  if (submissionIds.length === 0) return [];

  const photosResult = await supabase
    .from("marketplace_seller_submission_photos")
    .select("submission_id")
    .in("submission_id", submissionIds);

  if (photosResult.error) throw marketplaceRpcError(photosResult.error);
  const photoCounts = new Map<string, number>();
  for (const row of (photosResult.data ?? []) as Array<{ submission_id?: string }>) {
    if (!row.submission_id) continue;
    photoCounts.set(row.submission_id, (photoCounts.get(row.submission_id) ?? 0) + 1);
  }

  return submissions.map((submission) => ({
    ...submission,
    photo_count: photoCounts.get(submission.id) ?? 0,
  }));
}

export async function getSellerSubmissionDetail(input: {
  submissionId: string;
  account: SafeMarketplaceAccount | null;
}) {
  const account = assertSellerAccount(input.account);
  const submissionId = assertUuid(input.submissionId, "submission_id");
  const supabase = createMarketplaceSupabaseClient();
  const submissionResult = await supabase
    .from("marketplace_seller_submissions")
    .select(
      [
        "id",
        "submission_number",
        "status",
        "item_type",
        "reference_source",
        "reference_card_id",
        "reference_variant_id",
        "title_snapshot",
        "condition_code",
        "condition_notes",
        "variant_snapshot",
        "reference_snapshot",
        "grade_label",
        "language",
        "cert_number",
        "asking_price_satang",
        "currency",
        "seller_marketplace_fee_bps",
        "seller_marketplace_fee_satang",
        "payout_preview_satang",
        "source_kind",
        "seller_note",
        "admin_visible_note",
        "version",
        "created_at",
        "updated_at",
      ].join(","),
    )
    .eq("id", submissionId)
    .eq("marketplace_account_id", account.accountId)
    .maybeSingle();

  if (submissionResult.error) throw marketplaceRpcError(submissionResult.error);
  if (!submissionResult.data) {
    throw new MarketplaceServiceError(
      "marketplace_seller_submission_not_found",
      "Marketplace seller submission was not found.",
      404,
    );
  }

  const photosResult = await supabase
    .from("marketplace_seller_submission_photos")
    .select(
      [
        "id",
        "status",
        "photo_role",
        "display_order",
        "storage_bucket",
        "storage_path",
        "file_sha256",
        "file_size_bytes",
        "content_type",
        "created_at",
      ].join(","),
    )
    .eq("submission_id", submissionId)
    .eq("marketplace_account_id", account.accountId)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (photosResult.error) throw marketplaceRpcError(photosResult.error);

  const handoffResult = await supabase
    .from("marketplace_seller_handoff_confirmations")
    .select("id,handoff_method,carrier,tracking_code,seller_note,confirmed_at")
    .eq("submission_id", submissionId)
    .eq("marketplace_account_id", account.accountId)
    .order("confirmed_at", { ascending: false });
  if (handoffResult.error) throw marketplaceRpcError(handoffResult.error);

  return {
    ...(submissionResult.data as unknown as SellerSubmissionRow),
    photos: (photosResult.data ?? []) as unknown as SellerSubmissionPhotoRow[],
    handoffConfirmations: (handoffResult.data ?? []) as unknown as SellerSubmissionHandoffRow[],
  } as SellerSubmissionDetail;
}

export async function submitSellerSubmission(input: {
  submissionId: string;
  body: Record<string, unknown>;
  profile: ResolvedProfileSession;
  account: SafeMarketplaceAccount | null;
  requestId: string;
  idempotencyKey: string;
  requestHash: string;
}) {
  return mutateSellerSubmissionState({
    ...input,
    action: "submit",
  });
}

export async function cancelSellerSubmission(input: {
  submissionId: string;
  body: Record<string, unknown>;
  profile: ResolvedProfileSession;
  account: SafeMarketplaceAccount | null;
  requestId: string;
  idempotencyKey: string;
  requestHash: string;
}) {
  return mutateSellerSubmissionState({
    ...input,
    action: "cancel",
  });
}

async function mutateSellerSubmissionState(input: {
  submissionId: string;
  body: Record<string, unknown>;
  profile: ResolvedProfileSession;
  account: SafeMarketplaceAccount | null;
  requestId: string;
  idempotencyKey: string;
  requestHash: string;
  action: "submit" | "cancel";
}) {
  const account = assertSellerAccount(input.account);
  const supabase = createMarketplaceSupabaseClient();
  const result = (await supabase.rpc("marketplace_mutate_seller_submission_state", {
    p_submission_id: assertUuid(input.submissionId, "submission_id"),
    p_request_id: input.requestId,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: input.requestHash,
    p_ynot_profile_id: input.profile.profileId,
    p_marketplace_account_id: account.accountId,
    p_action: input.action,
    p_expected_version: optionalPositiveInteger(input.body.expectedVersion, "version"),
    p_seller_note: optionalTextField(input.body.sellerNote, "seller_note", 1000),
  })) as {
    data: unknown;
    error: { message?: string; code?: string } | null;
  };

  if (result.error) throw marketplaceRpcError(result.error);
  return result.data;
}

export async function confirmSellerSubmissionHandoff(input: {
  submissionId: string;
  body: Record<string, unknown>;
  profile: ResolvedProfileSession;
  account: SafeMarketplaceAccount | null;
  requestId: string;
  idempotencyKey: string;
  requestHash: string;
}) {
  const account = assertSellerAccount(input.account);
  const supabase = createMarketplaceSupabaseClient();
  const result = (await supabase.rpc("marketplace_confirm_seller_handoff", {
    p_submission_id: assertUuid(input.submissionId, "submission_id"),
    p_request_id: input.requestId,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: input.requestHash,
    p_ynot_profile_id: input.profile.profileId,
    p_marketplace_account_id: account.accountId,
    p_expected_version: optionalPositiveInteger(input.body.expectedVersion, "version"),
    p_handoff_method: normalizeHandoffMethod(input.body.handoffMethod),
    p_carrier: optionalTextField(input.body.carrier, "carrier", 120),
    p_tracking_code: optionalTextField(input.body.trackingCode, "tracking_code", 160),
    p_seller_note: optionalTextField(input.body.sellerNote, "seller_note", 1000),
  })) as {
    data: unknown;
    error: { message?: string; code?: string } | null;
  };

  if (result.error) throw marketplaceRpcError(result.error);
  return result.data;
}

export async function attachSellerSubmissionPhotoMetadata(input: {
  submissionId: string;
  body: Record<string, unknown>;
  profile: ResolvedProfileSession;
  account: SafeMarketplaceAccount | null;
  requestId: string;
  idempotencyKey: string;
  requestHash: string;
}) {
  const account = assertSellerAccount(input.account);
  const supabase = createMarketplaceSupabaseClient();
  const submissionId = assertUuid(input.submissionId, "submission_id");
  const existingPhotos = await supabase
    .from("marketplace_seller_submission_photos")
    .select("id", { count: "exact", head: true })
    .eq("submission_id", submissionId)
    .eq("marketplace_account_id", account.accountId);
  if (existingPhotos.error) throw marketplaceRpcError(existingPhotos.error);
  if ((existingPhotos.count ?? 0) >= SELLER_MAX_PHOTOS_PER_SUBMISSION) {
    throw new MarketplaceServiceError(
      "marketplace_seller_photo_limit_exceeded",
      "Seller item can have up to 10 photos.",
      422,
    );
  }

  const result = (await supabase.rpc("marketplace_attach_seller_submission_photo", {
    p_submission_id: submissionId,
    p_request_id: input.requestId,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: input.requestHash,
    p_ynot_profile_id: input.profile.profileId,
    p_marketplace_account_id: account.accountId,
    p_expected_version: optionalPositiveInteger(input.body.expectedVersion, "version"),
    p_storage_path: normalizePhotoStoragePath(
      input.body.storagePath,
      account.accountId,
      submissionId,
    ),
    p_photo_role: normalizeSellerPhotoRole(input.body.photoRole),
    p_display_order: normalizeSellerPhotoDisplayOrder(input.body.displayOrder),
    p_file_sha256: requiredSha256(input.body.fileSha256),
    p_file_size_bytes: requiredPhotoSizeBytes(input.body.fileSizeBytes),
    p_content_type: requiredPhotoContentType(input.body.contentType),
  })) as {
    data: unknown;
    error: { message?: string; code?: string } | null;
  };

  if (result.error) throw marketplaceRpcError(result.error);
  return result.data;
}

export async function transitionSellerConsignmentIntake(input: {
  submissionId: string;
  body: Record<string, unknown>;
  admin: ResolvedAdminSession | null;
  requestId: string;
  idempotencyKey: string;
  requestHash: string;
}) {
  const admin = assertAdmin(input.admin);
  const supabase = createMarketplaceSupabaseClient();
  const result = (await supabase.rpc(
    "marketplace_admin_transition_seller_intake",
    {
      p_submission_id: assertUuid(input.submissionId, "submission_id"),
      p_request_id: input.requestId,
      p_idempotency_key: input.idempotencyKey,
      p_request_hash: input.requestHash,
      p_admin_profile_id: admin.profileId,
      p_admin_role: admin.adminRole,
      p_expected_version: positiveInteger(input.body.expectedVersion, "version"),
      p_target_status: normalizeAdminIntakeStatus(input.body.status),
      p_admin_note: optionalTextField(input.body.adminNote, "admin_note", 1000),
      p_intake_instruction_id:
        input.body.intakeInstructionId === undefined ||
        input.body.intakeInstructionId === null ||
        input.body.intakeInstructionId === ""
          ? null
          : assertUuid(String(input.body.intakeInstructionId), "intake_instruction_id"),
    },
  )) as {
    data: unknown;
    error: { message?: string; code?: string } | null;
  };

  if (result.error) throw marketplaceRpcError(result.error);
  return result.data;
}

export async function activateSellerConsignmentListing(input: {
  submissionId: string;
  body: Record<string, unknown>;
  admin: ResolvedAdminSession | null;
  requestId: string;
  idempotencyKey: string;
  requestHash: string;
}) {
  const admin = assertAdmin(input.admin);
  const expectedVersion = positiveInteger(input.body.expectedVersion, "version");
  const supabase = createMarketplaceSupabaseClient();
  const submissionId = assertUuid(input.submissionId, "submission_id");
  const { submission, uploadedPhotoUrls } = await resolveSellerSubmissionPhotoUrls({
    submissionId,
    supabase,
  });
  const result = (await supabase.rpc(
    "marketplace_admin_activate_seller_listing",
    {
      p_submission_id: submissionId,
      p_request_id: input.requestId,
      p_idempotency_key: input.idempotencyKey,
      p_request_hash: input.requestHash,
      p_admin_profile_id: admin.profileId,
      p_admin_role: admin.adminRole,
      p_expected_version: expectedVersion,
      p_public_description: optionalTextField(
        input.body.publicDescription,
        "public_description",
        1000,
      ),
      p_photo_urls: uploadedPhotoUrls,
      p_admin_note: optionalTextField(input.body.adminNote, "admin_note", 1000),
    },
  )) as {
    data: unknown;
    error: { message?: string; code?: string } | null;
  };

  if (result.error) throw marketplaceRpcError(result.error);
  if (!result.data || typeof result.data !== "object" || Array.isArray(result.data)) {
    throw new MarketplaceServiceError(
      "marketplace_listing_activation_invalid",
      "Marketplace listing activation returned an invalid response.",
      500,
    );
  }
  const activationPayload = result.data as Record<string, unknown>;
  const projection = await ensureSellerListingProductProjection({
    activationPayload,
    submission,
    uploadedPhotoUrls,
    supabase,
  });
  return { ...activationPayload, ...projection, heroImageUrl: uploadedPhotoUrls[0] };
}

export async function listSellerSales(account: SafeMarketplaceAccount | null) {
  if (!account?.accountId) return [];
  if (marketplaceConfig().mockData) {
    return [
      {
        id: "66666666-6666-4666-8666-666666666666",
        listing_id: "22222222-2222-4222-8222-222222222222",
        payment_state: "valid",
        fulfilment_state: "ready_to_ship",
        refund_state: "none",
        item_price_satang: 86_000,
        seller_fee_satang: 8_600,
        seller_payout_satang: 77_400,
        seller_payout_state: "pending_admin_release",
        currency: "THB",
        created_at: "2026-06-29T08:05:00.000Z",
        updated_at: "2026-06-29T08:25:00.000Z",
      },
    ] as SellerSaleRow[];
  }
  const supabase = createMarketplaceSupabaseClient();
  const result = await supabase
    .from("marketplace_orders")
    .select(
      [
        "id",
        "listing_id",
        "payment_state",
        "fulfilment_state",
        "refund_state",
        "item_price_satang",
        "seller_fee_satang",
        "seller_payout_satang",
        "seller_payout_state",
        "currency",
        "created_at",
        "updated_at",
      ].join(","),
    )
    .eq("seller_marketplace_account_id", account.accountId)
    .eq("listing_source", "user_seller")
    .order("created_at", { ascending: false })
    .limit(50);

  if (result.error) throw marketplaceRpcError(result.error);
  return (result.data ?? []) as unknown as SellerSaleRow[];
}

export function sellerSubmissionSummary(submissions: SellerSubmissionRow[]) {
  return submissions.reduce(
    (acc, submission) => {
      acc.total += 1;
      acc[submission.status] = (acc[submission.status] ?? 0) + 1;
      return acc;
    },
    { total: 0 } as Record<string, number>,
  );
}
