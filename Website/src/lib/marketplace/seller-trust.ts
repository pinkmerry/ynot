import "server-only";

import type { ResolvedAdminSession } from "@/lib/auth/resolve-current-profile";
import {
  createMarketplaceSupabaseClient,
  marketplaceRpcError,
  MarketplaceServiceError,
} from "./supabase-adapter";
import { marketplaceConfig } from "./config";
import {
  getMockMarketplaceListing,
  mockMarketplaceListings,
  mockMarketplaceOrders,
  mockMarketplaceSellerSubmissions,
  MOCK_OFFICIAL_SELLER_PUBLIC_PROFILE_ID,
  MOCK_USER_SELLER_PUBLIC_PROFILE_ID,
} from "./mock-data";
import {
  getMarketplaceListing,
  listMarketplaceListingPage,
  type MarketplaceListingSnapshot,
  type MarketplaceListingQuery,
} from "./listings";
import type {
  SellerSubmissionDetail,
  SellerSubmissionHandoffRow,
  SellerSubmissionPhotoRow,
  SellerSubmissionRow,
} from "./seller-consignment";
import { listMarketplaceAuditTimeline, type MarketplaceAuditTimelineRow } from "./ops-hardening";
import { projectPublicListingSnapshot } from "./public-projection";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PublicSellerTrustProfile = {
  seller_public_profile_id: string;
  display_name: string;
  seller_kind: "official_shop" | "user_seller";
  status: "active" | "paused" | "suspended";
  fulfilled_order_count: number;
  positive_rating_count: number;
  rating_count: number;
  active_listing_count: number;
  updated_at: string | null;
};

export type AdminMarketplaceListingDetail = MarketplaceListingSnapshot & {
  seller_marketplace_account_id: string | null;
  created_at: string | null;
  auditTimeline: MarketplaceAuditTimelineRow[];
};

export type AdminSellerSubmissionEventRow = {
  id: string;
  event_type: string;
  before_status: string | null;
  after_status: string | null;
  actor_admin_role: string | null;
  event_payload: Record<string, unknown>;
  request_id: string | null;
  created_at: string | null;
};

export type AdminSellerSubmissionDetail = SellerSubmissionDetail & {
  marketplace_account_id: string;
  ynot_profile_id: string;
  request_id: string | null;
  approved_inventory_id: string | null;
  listing_id: string | null;
  events: AdminSellerSubmissionEventRow[];
};

export type AdminMarketplaceOrderDetail = {
  id: string;
  pending_payment_order_id: string;
  listing_id: string;
  inventory_item_id: string;
  buyer_marketplace_account_id: string;
  seller_marketplace_account_id: string | null;
  listing_source: "official_shop" | "user_seller";
  payment_state: string;
  fulfilment_state: string;
  refund_state: string;
  item_price_satang: number;
  shipping_fee_satang: number;
  buyer_service_fee_satang: number;
  buyer_total_satang: number;
  seller_fee_satang: number;
  seller_payout_satang: number;
  seller_payout_state: string | null;
  currency: "THB";
  request_id: string | null;
  idempotency: {
    scope: string | null;
    idempotency_key_preview: string | null;
    request_hash_preview: string | null;
    locked_at: string | null;
    expires_at: string | null;
  } | null;
  created_at: string | null;
  updated_at: string | null;
  listing: MarketplaceListingSnapshot | null;
  auditTimeline: MarketplaceAuditTimelineRow[];
};

function assertUuid(value: string, label: string) {
  if (!UUID_RE.test(value)) {
    throw new MarketplaceServiceError(
      `marketplace_${label}_invalid`,
      "Marketplace request is invalid.",
      400,
    );
  }
  return value.toLowerCase();
}

function assertAdmin(admin: ResolvedAdminSession | null) {
  if (!admin || !["owner", "admin", "staff"].includes(admin.adminRole)) {
    throw new MarketplaceServiceError(
      "marketplace_admin_required",
      "Marketplace admin access is required.",
      403,
    );
  }
  return admin;
}

function numberField(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function recordField(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function previewSecret(value: string | null) {
  if (!value) return null;
  if (value.length <= 16) return value;
  return `${value.slice(0, 8)}...${value.slice(-8)}`;
}

function publicProfileFromMock(
  sellerPublicProfileId: string,
): PublicSellerTrustProfile | null {
  const sellerKind =
    sellerPublicProfileId === MOCK_OFFICIAL_SELLER_PUBLIC_PROFILE_ID
      ? "official_shop"
      : sellerPublicProfileId === MOCK_USER_SELLER_PUBLIC_PROFILE_ID
        ? "user_seller"
        : null;
  if (!sellerKind) return null;
  const activeListingCount = mockMarketplaceListings.filter(
    (listing) => listing.seller_public_profile_id === sellerPublicProfileId,
  ).length;
  return {
    seller_public_profile_id: sellerPublicProfileId,
    display_name: sellerKind === "official_shop" ? "YNOT Official Shop" : "YNOT Verified Seller",
    seller_kind: sellerKind,
    status: "active",
    fulfilled_order_count: sellerKind === "official_shop" ? 42 : 12,
    positive_rating_count: sellerKind === "official_shop" ? 41 : 11,
    rating_count: sellerKind === "official_shop" ? 42 : 12,
    active_listing_count: activeListingCount,
    updated_at: "2026-06-29T09:00:00.000Z",
  };
}

function mockSubmissionPhotos(submissionId: string): SellerSubmissionPhotoRow[] {
  return [
    "front",
    "back",
    "corners",
    "surface",
    "serial_or_cert",
    "other",
  ].map((photoRole, index) => ({
    id: `${submissionId.slice(0, 24)}${String(index + 1).padStart(8, "0")}`,
    status: index < 4 ? "admin_approved" : "uploaded",
    photo_role: photoRole,
    display_order: index + 1,
    storage_bucket: "marketplace-seller-submission-photos",
    storage_path: `mock-account/${submissionId}/${photoRole}.webp`,
    file_sha256: "a".repeat(64),
    file_size_bytes: 128_000 + index * 1024,
    content_type: "image/webp",
    created_at: "2026-06-29T08:30:00.000Z",
  }));
}

function mockSubmissionDetail(
  submissionId: string,
): AdminSellerSubmissionDetail | null {
  const submission = mockMarketplaceSellerSubmissions.find(
    (entry) => entry.id === submissionId,
  );
  if (!submission) return null;
  const isFirst = submission.id === mockMarketplaceSellerSubmissions[0]?.id;
  return {
    ...(submission as SellerSubmissionRow),
    marketplace_account_id: isFirst
      ? "00000000-0000-4000-8000-000000000101"
      : "00000000-0000-4000-8000-000000000102",
    ynot_profile_id: isFirst
      ? "00000000-0000-4000-8000-000000000201"
      : "00000000-0000-4000-8000-000000000202",
    reference_source: "mock_catalog_reference",
    reference_card_id: null,
    reference_variant_id: null,
    condition_notes: isFirst
      ? "Slab surface checked, corners visible in uploaded photos."
      : "Sealed pack edge and seal photo required before listing.",
    variant_snapshot: {},
    reference_snapshot: {},
    grade_label: isFirst ? "PSA 9" : null,
    language: isFirst ? "JP" : "EN",
    cert_number: isFirst ? "MOCK-CERT-1001" : null,
    seller_note: "Mock seller note for admin review.",
    admin_visible_note: isFirst
      ? "Mock seller item ready for activation review."
      : "Mock seller item waiting for intake review.",
    request_id: `mock-request-${submission.submission_number}`,
    approved_inventory_id: isFirst
      ? "22222222-3333-4333-8333-222222222222"
      : null,
    listing_id: isFirst ? "22222222-2222-4222-8222-222222222222" : null,
    photos: mockSubmissionPhotos(submissionId).slice(0, isFirst ? 6 : 3),
    handoffConfirmations: [
      {
        id: `${submissionId.slice(0, 24)}handoff1`,
        handoff_method: "ship_to_store",
        carrier: "YNOT Mock Courier",
        tracking_code: "MOCK-TRACK-1001",
        seller_note: "Packed with sleeve and top loader.",
        confirmed_at: "2026-06-29T08:40:00.000Z",
      },
    ] satisfies SellerSubmissionHandoffRow[],
    events: [
      {
        id: `${submissionId.slice(0, 24)}event001`,
        event_type: "seller_submission.submitted",
        before_status: "draft",
        after_status: "submitted",
        actor_admin_role: null,
        event_payload: { photoCount: isFirst ? 6 : 3 },
        request_id: `mock-request-${submission.submission_number}`,
        created_at: submission.created_at,
      },
      {
        id: `${submissionId.slice(0, 24)}event002`,
        event_type: "seller_submission.reviewed",
        before_status: "submitted",
        after_status: submission.status,
        actor_admin_role: "owner",
        event_payload: { inspection: submission.status },
        request_id: `mock-admin-${submission.submission_number}`,
        created_at: submission.updated_at,
      },
    ],
  };
}

export async function getPublicSellerTrustProfile(
  sellerPublicProfileId: string,
): Promise<PublicSellerTrustProfile | null> {
  const sellerId = assertUuid(sellerPublicProfileId, "seller_public_profile_id");
  if (marketplaceConfig().mockData) {
    return publicProfileFromMock(sellerId);
  }

  const supabase = createMarketplaceSupabaseClient();
  const profileResult = await supabase
    .from("marketplace_public_seller_profiles")
    .select(
      [
        "seller_public_profile_id",
        "display_name",
        "seller_kind",
        "status",
        "fulfilled_order_count",
        "positive_rating_count",
        "rating_count",
        "updated_at",
      ].join(","),
    )
    .eq("seller_public_profile_id", sellerId)
    .eq("status", "active")
    .maybeSingle();

  if (profileResult.error) throw marketplaceRpcError(profileResult.error);
  if (!profileResult.data) return null;

  const listingsResult = await supabase
    .from("marketplace_public_listing_snapshots")
    .select("listing_id", { count: "exact", head: true })
    .eq("seller_public_profile_id", sellerId);
  if (listingsResult.error) throw marketplaceRpcError(listingsResult.error);

  const row = profileResult.data as unknown as Record<string, unknown>;
  return {
    seller_public_profile_id: String(row.seller_public_profile_id),
    display_name: String(row.display_name),
    seller_kind:
      row.seller_kind === "official_shop" ? "official_shop" : "user_seller",
    status: row.status === "active" ? "active" : "paused",
    fulfilled_order_count: numberField(row.fulfilled_order_count),
    positive_rating_count: numberField(row.positive_rating_count),
    rating_count: numberField(row.rating_count),
    active_listing_count: listingsResult.count ?? 0,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

export async function getSellerPublicListings(
  sellerPublicProfileId: string,
  filters: Omit<MarketplaceListingQuery, "sellerPublicProfileId"> = {},
) {
  const sellerId = assertUuid(sellerPublicProfileId, "seller_public_profile_id");
  return listMarketplaceListingPage({
    ...filters,
    sellerPublicProfileId: sellerId,
    limit: filters.limit ?? 24,
  });
}

export async function getAdminMarketplaceListingDetail(input: {
  admin: ResolvedAdminSession | null;
  listingId: string;
}): Promise<AdminMarketplaceListingDetail> {
  const admin = assertAdmin(input.admin);
  const listingId = assertUuid(input.listingId, "listing_id");
  if (marketplaceConfig().mockData) {
    const listing = getMockMarketplaceListing(listingId);
    if (!listing) {
      throw new MarketplaceServiceError(
        "marketplace_listing_not_found",
        "Marketplace listing was not found.",
        404,
      );
    }
    return {
      ...listing,
      seller_marketplace_account_id:
        listing.listing_source === "official_shop"
          ? "00000000-0000-4000-8000-000000000301"
          : "00000000-0000-4000-8000-000000000302",
      created_at: listing.visible_from,
      auditTimeline: [
        {
          id: `${listing.listing_id.slice(0, 24)}audit01`,
          source: "audit",
          eventType: "marketplace_listing_snapshot_created",
          actorRole: "owner",
          createdAt: listing.visible_from,
          payload: {
            listingSource: listing.listing_source,
            snapshotVersion: listing.snapshot_version,
          },
        },
      ],
    };
  }

  const supabase = createMarketplaceSupabaseClient();
  const result = await supabase
    .from("marketplace_listing_snapshots")
    .select(
      [
        "listing_id",
        "inventory_item_id",
        "product_id",
        "variant_id",
        "seller_marketplace_account_id",
        "listing_source",
        "listing_state",
        "public_slug",
        "title",
        "item_price_satang",
        "currency",
        "quantity_available_snapshot",
        "public_description",
        "photo_urls",
        "snapshot_payload",
        "snapshot_version",
        "visible_from",
        "created_at",
        "updated_at",
      ].join(","),
    )
    .eq("listing_id", listingId)
    .maybeSingle();
  if (result.error) throw marketplaceRpcError(result.error);
  if (!result.data) {
    throw new MarketplaceServiceError(
      "marketplace_listing_not_found",
      "Marketplace listing was not found.",
      404,
    );
  }

  let publicSellerId: string | null = null;
  const listingRow = result.data as unknown as Record<string, unknown>;
  const sellerAccountId =
    typeof listingRow.seller_marketplace_account_id === "string"
      ? listingRow.seller_marketplace_account_id
      : null;
  if (sellerAccountId) {
    const sellerResult = await supabase
      .from("marketplace_public_seller_profiles")
      .select("seller_public_profile_id")
      .eq("marketplace_account_id", sellerAccountId)
      .maybeSingle();
    if (sellerResult.error) throw marketplaceRpcError(sellerResult.error);
    const sellerRow = sellerResult.data as unknown as Record<string, unknown> | null;
    publicSellerId =
      typeof sellerRow?.seller_public_profile_id === "string"
        ? sellerRow.seller_public_profile_id
        : null;
  }

  const auditTimeline = await listMarketplaceAuditTimeline({
    admin,
    targetType: "listing",
    targetId: listingId,
  });
  const publicListing = projectPublicListingSnapshot({
    ...listingRow,
    seller_public_profile_id: publicSellerId,
  } as Record<string, unknown> & {
    snapshot_payload?: unknown;
    photo_urls?: unknown;
  }) as unknown as MarketplaceListingSnapshot;
  return {
    ...publicListing,
    seller_marketplace_account_id: sellerAccountId,
    created_at:
      typeof listingRow.created_at === "string" ? listingRow.created_at : null,
    auditTimeline,
  };
}

export async function getAdminSellerSubmissionDetail(input: {
  admin: ResolvedAdminSession | null;
  submissionId: string;
}): Promise<AdminSellerSubmissionDetail> {
  assertAdmin(input.admin);
  const submissionId = assertUuid(input.submissionId, "submission_id");
  if (marketplaceConfig().mockData) {
    const detail = mockSubmissionDetail(submissionId);
    if (!detail) {
      throw new MarketplaceServiceError(
        "marketplace_seller_submission_not_found",
        "Marketplace seller submission was not found.",
        404,
      );
    }
    return detail;
  }

  const supabase = createMarketplaceSupabaseClient();
  const submissionResult = await supabase
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
        "request_id",
        "approved_inventory_id",
        "listing_id",
        "version",
        "created_at",
        "updated_at",
      ].join(","),
    )
    .eq("id", submissionId)
    .maybeSingle();
  if (submissionResult.error) throw marketplaceRpcError(submissionResult.error);
  if (!submissionResult.data) {
    throw new MarketplaceServiceError(
      "marketplace_seller_submission_not_found",
      "Marketplace seller submission was not found.",
      404,
    );
  }
  const submission = submissionResult.data as unknown as Record<string, unknown>;
  const sellerAccountId = String(submission.marketplace_account_id);

  const [photosResult, handoffResult, eventsResult] = await Promise.all([
    supabase
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
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("marketplace_seller_handoff_confirmations")
      .select("id,handoff_method,carrier,tracking_code,seller_note,confirmed_at")
      .eq("submission_id", submissionId)
      .order("confirmed_at", { ascending: false }),
    supabase
      .from("marketplace_seller_submission_events")
      .select(
        "id,event_type,before_status,after_status,actor_admin_role,event_payload,request_id,created_at",
      )
      .eq("submission_id", submissionId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (photosResult.error) throw marketplaceRpcError(photosResult.error);
  if (handoffResult.error) throw marketplaceRpcError(handoffResult.error);
  if (eventsResult.error) throw marketplaceRpcError(eventsResult.error);

  return {
    ...(submission as unknown as SellerSubmissionRow),
    marketplace_account_id: sellerAccountId,
    ynot_profile_id: String(submission.ynot_profile_id),
    reference_source:
      typeof submission.reference_source === "string" ? submission.reference_source : null,
    reference_card_id:
      typeof submission.reference_card_id === "string"
        ? submission.reference_card_id
        : null,
    reference_variant_id:
      typeof submission.reference_variant_id === "string"
        ? submission.reference_variant_id
        : null,
    condition_notes:
      typeof submission.condition_notes === "string" ? submission.condition_notes : null,
    variant_snapshot: recordField(submission.variant_snapshot),
    reference_snapshot: recordField(submission.reference_snapshot),
    grade_label: typeof submission.grade_label === "string" ? submission.grade_label : null,
    language: typeof submission.language === "string" ? submission.language : null,
    cert_number: typeof submission.cert_number === "string" ? submission.cert_number : null,
    seller_note: typeof submission.seller_note === "string" ? submission.seller_note : null,
    admin_visible_note:
      typeof submission.admin_visible_note === "string"
        ? submission.admin_visible_note
        : null,
    request_id: typeof submission.request_id === "string" ? submission.request_id : null,
    approved_inventory_id:
      typeof submission.approved_inventory_id === "string"
        ? submission.approved_inventory_id
        : null,
    listing_id: typeof submission.listing_id === "string" ? submission.listing_id : null,
    photos: (photosResult.data ?? []) as unknown as SellerSubmissionPhotoRow[],
    handoffConfirmations: (handoffResult.data ?? []) as unknown as SellerSubmissionHandoffRow[],
    events: ((eventsResult.data ?? []) as Array<Record<string, unknown>>).map((event) => ({
      id: String(event.id),
      event_type: String(event.event_type),
      before_status:
        typeof event.before_status === "string" ? event.before_status : null,
      after_status:
        typeof event.after_status === "string" ? event.after_status : null,
      actor_admin_role:
        typeof event.actor_admin_role === "string" ? event.actor_admin_role : null,
      event_payload: recordField(event.event_payload),
      request_id: typeof event.request_id === "string" ? event.request_id : null,
      created_at: typeof event.created_at === "string" ? event.created_at : null,
    })),
  } as AdminSellerSubmissionDetail;
}

export async function getAdminMarketplaceOrderDetail(input: {
  admin: ResolvedAdminSession | null;
  orderId: string;
}): Promise<AdminMarketplaceOrderDetail> {
  const admin = assertAdmin(input.admin);
  const orderId = assertUuid(input.orderId, "order_id");
  if (marketplaceConfig().mockData) {
    const order = mockMarketplaceOrders.find((entry) => entry.id === orderId);
    if (!order) {
      throw new MarketplaceServiceError(
        "marketplace_order_not_found",
        "Marketplace order was not found.",
        404,
      );
    }
    const listing = getMockMarketplaceListing(order.listing_id);
    const sellerFeeSatang =
      order.listing_source === "user_seller"
        ? Math.floor(Number(order.item_price_satang ?? 0) * 0.1)
        : 0;
    return {
      ...order,
      listing_source:
        order.listing_source === "user_seller" ? "user_seller" : "official_shop",
      currency: "THB",
      buyer_marketplace_account_id: "00000000-0000-4000-8000-000000000401",
      seller_marketplace_account_id:
        order.listing_source === "user_seller"
          ? "00000000-0000-4000-8000-000000000302"
          : null,
      seller_fee_satang: sellerFeeSatang,
      seller_payout_satang: Number(order.item_price_satang ?? 0) - sellerFeeSatang,
      seller_payout_state:
        order.listing_source === "user_seller" ? "held" : "not_applicable",
      request_id: `mock-order-${order.id.slice(0, 8)}`,
      idempotency: {
        scope:
          order.listing_source === "user_seller"
            ? "user_seller.checkout"
            : "official.checkout",
        idempotency_key_preview: "mock-che...checkout",
        request_hash_preview: "mock-has...vidence",
        locked_at: order.created_at,
        expires_at: order.updated_at,
      },
      listing,
      auditTimeline: [
        {
          id: `${order.id.slice(0, 24)}audit01`,
          source: "command",
          eventType: "marketplace_order.payment_review",
          actorRole: "owner",
          createdAt: order.updated_at,
          payload: {
            paymentState: order.payment_state,
            fulfilmentState: order.fulfilment_state,
          },
        },
      ],
    };
  }

  const supabase = createMarketplaceSupabaseClient();
  const result = await supabase
    .from("marketplace_orders")
    .select(
      [
        "id",
        "pending_payment_order_id",
        "listing_id",
        "inventory_item_id",
        "buyer_marketplace_account_id",
        "seller_marketplace_account_id",
        "listing_source",
        "payment_state",
        "fulfilment_state",
        "refund_state",
        "item_price_satang",
        "shipping_fee_satang",
        "buyer_service_fee_satang",
        "buyer_total_satang",
        "seller_fee_satang",
        "seller_payout_satang",
        "seller_payout_state",
        "currency",
        "request_id",
        "created_at",
        "updated_at",
      ].join(","),
    )
    .eq("id", orderId)
    .maybeSingle();
  if (result.error) throw marketplaceRpcError(result.error);
  if (!result.data) {
    throw new MarketplaceServiceError(
      "marketplace_order_not_found",
      "Marketplace order was not found.",
      404,
    );
  }

  const order = result.data as unknown as Record<string, unknown>;
  let idempotency: AdminMarketplaceOrderDetail["idempotency"] = null;
  const pendingPaymentOrderId =
    typeof order.pending_payment_order_id === "string"
      ? order.pending_payment_order_id
      : null;
  if (pendingPaymentOrderId) {
    const pendingResult = await supabase
      .from("marketplace_pending_payment_orders")
      .select("idempotency_key,buyer_marketplace_account_id")
      .eq("id", pendingPaymentOrderId)
      .maybeSingle();
    if (pendingResult.error) throw marketplaceRpcError(pendingResult.error);
    const pendingRow = pendingResult.data as unknown as Record<string, unknown> | null;
    const idempotencyKey =
      typeof pendingRow?.idempotency_key === "string"
        ? pendingRow.idempotency_key
        : null;
    const buyerAccountId =
      typeof pendingRow?.buyer_marketplace_account_id === "string"
        ? pendingRow.buyer_marketplace_account_id
        : null;
    if (idempotencyKey && buyerAccountId) {
      const ledgerResult = await supabase
        .from("marketplace_idempotency_keys")
        .select("scope,idempotency_key,request_hash,locked_at,expires_at")
        .eq("marketplace_account_id", buyerAccountId)
        .eq("idempotency_key", idempotencyKey)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (ledgerResult.error) throw marketplaceRpcError(ledgerResult.error);
      const ledgerRow = ledgerResult.data as unknown as Record<string, unknown> | null;
      idempotency = {
        scope: typeof ledgerRow?.scope === "string" ? ledgerRow.scope : null,
        idempotency_key_preview: previewSecret(
          typeof ledgerRow?.idempotency_key === "string"
            ? ledgerRow.idempotency_key
            : idempotencyKey,
        ),
        request_hash_preview: previewSecret(
          typeof ledgerRow?.request_hash === "string"
            ? ledgerRow.request_hash
            : null,
        ),
        locked_at:
          typeof ledgerRow?.locked_at === "string" ? ledgerRow.locked_at : null,
        expires_at:
          typeof ledgerRow?.expires_at === "string" ? ledgerRow.expires_at : null,
      };
    }
  }
  let listing: MarketplaceListingSnapshot | null = null;
  try {
    listing = await getMarketplaceListing(String(order.listing_id));
  } catch (error) {
    if (
      !(error instanceof MarketplaceServiceError) ||
      error.code !== "marketplace_listing_not_found"
    ) {
      throw error;
    }
  }

  const auditTimeline = await listMarketplaceAuditTimeline({
    admin,
    targetType: "order",
    targetId: orderId,
  });
  return {
    id: String(order.id),
    pending_payment_order_id: String(order.pending_payment_order_id),
    listing_id: String(order.listing_id),
    inventory_item_id: String(order.inventory_item_id),
    buyer_marketplace_account_id: String(order.buyer_marketplace_account_id),
    seller_marketplace_account_id:
      typeof order.seller_marketplace_account_id === "string"
        ? order.seller_marketplace_account_id
        : null,
    listing_source:
      order.listing_source === "user_seller" ? "user_seller" : "official_shop",
    payment_state: String(order.payment_state),
    fulfilment_state: String(order.fulfilment_state),
    refund_state: String(order.refund_state),
    item_price_satang: numberField(order.item_price_satang),
    shipping_fee_satang: numberField(order.shipping_fee_satang),
    buyer_service_fee_satang: numberField(order.buyer_service_fee_satang),
    buyer_total_satang: numberField(order.buyer_total_satang),
    seller_fee_satang: numberField(order.seller_fee_satang),
    seller_payout_satang: numberField(order.seller_payout_satang),
    seller_payout_state:
      typeof order.seller_payout_state === "string"
        ? order.seller_payout_state
        : null,
    currency: "THB",
    request_id: typeof order.request_id === "string" ? order.request_id : null,
    idempotency,
    created_at: typeof order.created_at === "string" ? order.created_at : null,
    updated_at: typeof order.updated_at === "string" ? order.updated_at : null,
    listing,
    auditTimeline,
  };
}
