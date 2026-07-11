import "server-only";

import type { ResolvedAdminSession } from "@/lib/auth/resolve-current-profile";
import {
  createMarketplaceSupabaseClient,
  marketplaceRpcError,
  MarketplaceServiceError,
} from "./supabase-adapter";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WEBHOOK_MAX_BYTES = 16 * 1024;

export const RECONCILIATION_RESOLVE_FIELDS = [
  "action",
  "resolutionNote",
] as const;

export const REFUND_TRANSITION_FIELDS = [
  "refundState",
  "providerReference",
  "adminNote",
  "expectedRefundState",
] as const;

type AdminRole = "owner" | "admin" | "staff";

export type MarketplaceQueueSummary = {
  paymentReviewCount: number;
  refundOpenCount: number;
  reconciliationOpenCount: number;
  payoutBlockedCount: number;
  providerEventOpenCount: number;
};

export type MarketplaceReconciliationRow = {
  id: string;
  order_id: string | null;
  target_type: string;
  target_id: string | null;
  reconciliation_state: string;
  reason_code: string;
  priority: string;
  created_at: string | null;
  updated_at: string | null;
};

export type MarketplaceAuditTimelineRow = {
  id: string;
  source: "audit" | "command";
  eventType: string;
  actorRole: string | null;
  createdAt: string | null;
  payload: Record<string, unknown>;
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

function assertAdminRole(
  admin: ResolvedAdminSession | null | undefined,
  allowed: readonly AdminRole[],
) {
  const role = admin?.adminRole as AdminRole | undefined;
  if (!role || !allowed.includes(role)) {
    throw new MarketplaceServiceError(
      "marketplace_admin_required",
      "Marketplace admin access is required.",
      403,
    );
  }
  return admin as ResolvedAdminSession & { adminRole: AdminRole };
}

function textField(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string") {
    throw new MarketplaceServiceError(
      `marketplace_${label}_invalid`,
      "Marketplace request is invalid.",
      400,
    );
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new MarketplaceServiceError(
      `marketplace_${label}_invalid`,
      "Marketplace request is invalid.",
      400,
    );
  }
  return normalized;
}

function optionalTextField(value: unknown, label: string, maxLength: number) {
  if (value === undefined || value === null || value === "") return null;
  return textField(value, label, maxLength);
}

function integerField(value: unknown, label: string) {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new MarketplaceServiceError(
      `marketplace_${label}_invalid`,
      "Marketplace request is invalid.",
      400,
    );
  }
  return Number(value);
}

function safeAuditPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const blocked = new Set([
    "provider_response",
    "providerResponse",
    "rawPayload",
    "payload",
    "proof_storage_path",
    "proofStoragePath",
    "bankAccount",
    "address",
  ]);
  return Object.fromEntries(
    Object.entries(source).filter(([key]) => !blocked.has(key)),
  );
}

function normalizeCountResult(data: unknown) {
  return typeof data === "number" && Number.isFinite(data) ? data : 0;
}

export async function listMarketplaceQueueSummary(
  admin: ResolvedAdminSession | null,
): Promise<MarketplaceQueueSummary> {
  assertAdminRole(admin, ["owner", "admin", "staff"]);
  const supabase = createMarketplaceSupabaseClient();
  const [
    paymentReview,
    refundOpen,
    reconciliationOpen,
    payoutBlocked,
    providerEventOpen,
  ] = await Promise.all([
    supabase
      .from("marketplace_orders")
      .select("id", { count: "exact", head: true })
      .in("payment_state", ["payment_submitted", "pending_payment"]),
    supabase
      .from("marketplace_refund_requests")
      .select("id", { count: "exact", head: true })
      .in("refund_state", ["requested", "approved"]),
    supabase
      .from("marketplace_reconciliation_items")
      .select("id", { count: "exact", head: true })
      .eq("reconciliation_state", "open"),
    supabase
      .from("marketplace_seller_payouts")
      .select("id", { count: "exact", head: true })
      .in("payout_state", ["held", "eligible"]),
    supabase
      .from("marketplace_provider_payment_events")
      .select("id", { count: "exact", head: true })
      .in("processing_state", ["received", "reconciliation_required", "conflict"]),
  ]);

  for (const result of [
    paymentReview,
    refundOpen,
    reconciliationOpen,
    payoutBlocked,
    providerEventOpen,
  ]) {
    if (result.error) throw marketplaceRpcError(result.error);
  }

  return {
    paymentReviewCount: normalizeCountResult(paymentReview.count),
    refundOpenCount: normalizeCountResult(refundOpen.count),
    reconciliationOpenCount: normalizeCountResult(reconciliationOpen.count),
    payoutBlockedCount: normalizeCountResult(payoutBlocked.count),
    providerEventOpenCount: normalizeCountResult(providerEventOpen.count),
  };
}

export async function listMarketplaceReconciliationItems(input: {
  admin: ResolvedAdminSession | null;
  state?: string | null;
}) {
  assertAdminRole(input.admin, ["owner", "admin", "staff"]);
  const state = input.state?.trim() || "open";
  if (!["open", "resolved", "cancelled"].includes(state)) {
    throw new MarketplaceServiceError(
      "marketplace_reconciliation_state_invalid",
      "Marketplace reconciliation state is invalid.",
      400,
    );
  }

  const supabase = createMarketplaceSupabaseClient();
  const result = await supabase
    .from("marketplace_reconciliation_items")
    .select(
      [
        "id",
        "order_id",
        "target_type",
        "target_id",
        "reconciliation_state",
        "reason_code",
        "priority",
        "created_at",
        "updated_at",
      ].join(","),
    )
    .eq("reconciliation_state", state)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (result.error) throw marketplaceRpcError(result.error);
  return (result.data ?? []) as unknown as MarketplaceReconciliationRow[];
}

export async function resolveMarketplaceReconciliationItem(input: {
  itemId: string;
  body: Record<string, unknown>;
  admin: ResolvedAdminSession | null;
  requestId: string;
  idempotencyKey: string;
  requestHash: string;
}) {
  const admin = assertAdminRole(input.admin, ["owner", "admin"]);
  const action = textField(input.body.action, "reconciliation_action", 20);
  if (!["resolve", "reopen"].includes(action)) {
    throw new MarketplaceServiceError(
      "marketplace_reconciliation_action_invalid",
      "Marketplace reconciliation action is invalid.",
      400,
    );
  }

  const supabase = createMarketplaceSupabaseClient();
  const result = (await supabase.rpc("marketplace_resolve_reconciliation_item", {
    p_reconciliation_item_id: assertUuid(input.itemId, "reconciliation_id"),
    p_request_id: input.requestId,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: input.requestHash,
    p_admin_profile_id: admin.profileId,
    p_admin_role: admin.adminRole,
    p_action: action,
    p_resolution_note: textField(input.body.resolutionNote, "admin_note", 1000),
  })) as {
    data: unknown;
    error: { message?: string; code?: string } | null;
  };

  if (result.error) throw marketplaceRpcError(result.error);
  return result.data;
}

export async function recordMarketplaceRefundTransition(input: {
  refundRequestId: string;
  body: Record<string, unknown>;
  admin: ResolvedAdminSession | null;
  requestId: string;
  idempotencyKey: string;
  requestHash: string;
}) {
  const admin = assertAdminRole(input.admin, ["owner", "admin"]);
  const refundState = textField(input.body.refundState, "refund_state", 40);
  if (!["approved", "rejected", "refunded"].includes(refundState)) {
    throw new MarketplaceServiceError(
      "marketplace_refund_state_invalid",
      "Marketplace refund state is invalid.",
      400,
    );
  }
  const providerReference = optionalTextField(
    input.body.providerReference,
    "provider_reference",
    160,
  );
  if (refundState === "refunded" && !providerReference) {
    throw new MarketplaceServiceError(
      "marketplace_evidence_required",
      "Marketplace evidence is required.",
      422,
    );
  }
  const expectedRefundState = optionalTextField(
    input.body.expectedRefundState,
    "expected_refund_state",
    40,
  );
  if (
    expectedRefundState &&
    !["requested", "approved", "rejected", "refunded"].includes(expectedRefundState)
  ) {
    throw new MarketplaceServiceError(
      "marketplace_refund_state_invalid",
      "Marketplace refund state is invalid.",
      400,
    );
  }

  const supabase = createMarketplaceSupabaseClient();
  const result = (await supabase.rpc("marketplace_record_refund_transition", {
    p_refund_request_id: assertUuid(input.refundRequestId, "refund_id"),
    p_request_id: input.requestId,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: input.requestHash,
    p_admin_profile_id: admin.profileId,
    p_admin_role: admin.adminRole,
    p_refund_state: refundState,
    p_provider_reference: providerReference,
    p_admin_note: textField(input.body.adminNote, "admin_note", 1000),
    p_expected_refund_state: expectedRefundState,
  })) as {
    data: unknown;
    error: { message?: string; code?: string } | null;
  };

  if (result.error) throw marketplaceRpcError(result.error);
  return result.data;
}

export async function listMarketplaceAuditTimeline(input: {
  admin: ResolvedAdminSession | null;
  targetType: string;
  targetId: string;
}) {
  assertAdminRole(input.admin, ["owner", "admin", "staff"]);
  const targetType = textField(input.targetType, "target_type", 40);
  const targetId = assertUuid(input.targetId, "target_id");
  if (
    ![
      "inventory",
      "listing",
      "order",
      "payment",
      "refund",
      "shipment",
      "payout",
      "reconciliation",
    ].includes(targetType)
  ) {
    throw new MarketplaceServiceError(
      "marketplace_target_type_invalid",
      "Marketplace target type is invalid.",
      400,
    );
  }

  const supabase = createMarketplaceSupabaseClient();
  const [commands, auditTargets] = await Promise.all([
    supabase
      .from("marketplace_admin_commands")
      .select(
        "id,command_name,actor_admin_role,command_payload,result_payload,created_at",
      )
      .eq("target_type", targetType)
      .eq("target_id", targetId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("marketplace_audit_event_targets")
      .select("audit_event_id,created_at")
      .eq("target_type", targetType)
      .eq("target_id", targetId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (commands.error) throw marketplaceRpcError(commands.error);
  if (auditTargets.error) throw marketplaceRpcError(auditTargets.error);

  const auditEventIds = Array.from(
    new Set(
      ((auditTargets.data ?? []) as Array<Record<string, unknown>>)
        .map((row) => row.audit_event_id)
        .filter((value): value is string => typeof value === "string" && UUID_RE.test(value)),
    ),
  );
  const audit = auditEventIds.length
    ? await supabase
        .from("marketplace_audit_events")
        .select("id,event_type,actor_admin_role,event_payload,created_at")
        .in("id", auditEventIds)
        .order("created_at", { ascending: false })
        .limit(50)
    : { data: [], error: null };
  if (audit.error) throw marketplaceRpcError(audit.error);

  const commandRows = ((commands.data ?? []) as Array<Record<string, unknown>>).map(
    (row) => ({
      id: String(row.id),
      source: "command" as const,
      eventType: String(row.command_name),
      actorRole: typeof row.actor_admin_role === "string" ? row.actor_admin_role : null,
      createdAt: typeof row.created_at === "string" ? row.created_at : null,
      payload: safeAuditPayload(row.result_payload ?? row.command_payload),
    }),
  );
  const auditRows = ((audit.data ?? []) as Array<Record<string, unknown>>).map(
    (row) => ({
      id: String(row.id),
      source: "audit" as const,
      eventType: String(row.event_type),
      actorRole: typeof row.actor_admin_role === "string" ? row.actor_admin_role : null,
      createdAt: typeof row.created_at === "string" ? row.created_at : null,
      payload: safeAuditPayload(row.event_payload),
    }),
  );

  return [...commandRows, ...auditRows]
    .sort((left, right) => (right.createdAt ?? "").localeCompare(left.createdAt ?? ""))
    .slice(0, 100) satisfies MarketplaceAuditTimelineRow[];
}

async function sha256Hex(raw: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(raw),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256Hex(secret: string, raw: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(raw),
  );
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function normalizeSignature(value: string | null) {
  return (value ?? "").trim().replace(/^sha256=/i, "").toLowerCase();
}

function redactedWebhookPayload(value: Record<string, unknown>) {
  return {
    providerEventId: typeof value.eventId === "string" ? value.eventId : null,
    eventType: typeof value.eventType === "string" ? value.eventType : null,
    orderId: typeof value.orderId === "string" ? value.orderId : null,
    paymentState: typeof value.paymentState === "string" ? value.paymentState : null,
    amountSatang: Number.isInteger(value.amountSatang) ? value.amountSatang : null,
    currency: typeof value.currency === "string" ? value.currency : null,
    receiverReference:
      typeof value.receiverReference === "string" ? value.receiverReference : null,
    provider: "slip2go",
  };
}

export async function applyMarketplacePaymentWebhook(input: {
  request: Request;
  requestId: string;
}) {
  const secret = process.env.MARKETPLACE_PAYMENT_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new MarketplaceServiceError(
      "marketplace_webhook_secret_missing",
      "Marketplace payment webhook is not configured.",
      503,
    );
  }

  const contentLength = input.request.headers.get("content-length");
  if (
    contentLength &&
    Number.isFinite(Number(contentLength)) &&
    Number(contentLength) > WEBHOOK_MAX_BYTES
  ) {
    throw new MarketplaceServiceError(
      "marketplace_webhook_body_too_large",
      "Marketplace webhook body is too large.",
      413,
    );
  }

  const rawBody = await input.request.text();
  if (new TextEncoder().encode(rawBody).byteLength > WEBHOOK_MAX_BYTES) {
    throw new MarketplaceServiceError(
      "marketplace_webhook_body_too_large",
      "Marketplace webhook body is too large.",
      413,
    );
  }

  const submittedSignature = normalizeSignature(
    input.request.headers.get("x-marketplace-signature") ??
      input.request.headers.get("x-slip2go-signature"),
  );
  const expectedSignature = await hmacSha256Hex(secret, rawBody);
  if (
    !submittedSignature ||
    !/^[0-9a-f]{64}$/.test(submittedSignature) ||
    !constantTimeEqual(submittedSignature, expectedSignature)
  ) {
    throw new MarketplaceServiceError(
      "marketplace_webhook_signature_invalid",
      "Marketplace webhook signature is invalid.",
      401,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new MarketplaceServiceError(
      "marketplace_malformed_json",
      "Marketplace webhook body is malformed.",
      400,
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new MarketplaceServiceError(
      "marketplace_body_invalid",
      "Marketplace webhook body must be an object.",
      400,
    );
  }

  const body = parsed as Record<string, unknown>;
  const eventId = textField(body.eventId, "provider_event_id", 200);
  const orderId = assertUuid(textField(body.orderId, "order_id", 80), "order_id");
  const eventType = textField(body.eventType ?? "payment.updated", "event_type", 120);
  const paymentState = textField(body.paymentState, "payment_state", 40);
  const amountSatang = integerField(body.amountSatang, "provider_amount");
  const currency = textField(body.currency, "provider_currency", 3).toUpperCase();
  const receiverReference = optionalTextField(
    body.receiverReference,
    "receiver_reference",
    120,
  );
  const payloadHash = await sha256Hex(rawBody);

  const supabase = createMarketplaceSupabaseClient();
  const result = (await supabase.rpc("marketplace_apply_provider_payment_event", {
    p_provider: "slip2go",
    p_provider_event_id: eventId,
    p_payload_hash: payloadHash,
    p_event_type: eventType,
    p_order_id: orderId,
    p_payment_state: paymentState,
    p_provider_amount_satang: amountSatang,
    p_provider_currency: currency,
    p_receiver_reference: receiverReference,
    p_payload_redacted: redactedWebhookPayload(body),
    p_request_id: input.requestId,
  })) as {
    data: unknown;
    error: { message?: string; code?: string } | null;
  };

  if (result.error) throw marketplaceRpcError(result.error);
  return result.data;
}
