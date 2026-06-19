import { defaultDraw, seedOrders } from "@/lib/lucky-draw/defaults";
import { fetchOrderByProfileIdempotency, getActiveDraw, getLuckyDrawState, isSupabaseConfigured, toOrder } from "@/lib/lucky-draw/data";
import { requireVerifiedAnchor } from "@/lib/auth/verified-anchor";
import { resolveAdminSession, resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { enforceSameOriginMutation } from "@/lib/security/same-origin";
import { createSlip2GoProviderError, sha256Hex, verifySlipWithSlip2Go } from "@/lib/slip2go/client";
import { findLiveDuplicateSlip } from "@/lib/slip2go/dedup";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import { allowedSlipTypes, maxSlipBytes, verifyImageMagicBytes } from "@/lib/uploads/magic-bytes";

type CreateOrderBody = {
  quantity?: unknown;
  slipName?: unknown;
  customerNote?: unknown;
  idempotencyKey?: unknown;
};

const slipBucketName = "payment-slips";
const LEGACY_ORDER_IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9:_-]{16,180}$/;

export const dynamic = "force-dynamic";

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

function cleanFileName(name: string) {
  return name
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120) || "payment-slip";
}

function normalizeLegacyOrderIdempotencyKey(value: unknown) {
  if (value == null) {
    return null;
  }
  if (typeof value !== "string") return null;
  const clean = value.trim();
  if (!clean) return null;
  return LEGACY_ORDER_IDEMPOTENCY_KEY_RE.test(clean) ? clean : null;
}

async function readCreateOrderRequest(request: Request): Promise<{
  quantity: number;
  slipName: string;
  customerNote: string | null;
  slipFile: File | null;
  idempotencyKey: string | null;
} | Response> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("slip");
    const slipFile = file instanceof File && file.size > 0 ? file : null;
    return {
      quantity: Number(form.get("quantity")),
      slipName:
        typeof form.get("slipName") === "string" && String(form.get("slipName")).trim()
          ? String(form.get("slipName")).trim()
          : slipFile?.name ?? "manual-transfer",
      customerNote: typeof form.get("customerNote") === "string" ? String(form.get("customerNote")) : null,
      slipFile,
      idempotencyKey: normalizeLegacyOrderIdempotencyKey(form.get("idempotencyKey")),
    };
  }

  let body: CreateOrderBody;
  try {
    body = (await request.json()) as CreateOrderBody;
  } catch {
    return Response.json({ error: "Invalid order body." }, { status: 400 });
  }

  return {
    quantity: Number(body.quantity),
    slipName: typeof body.slipName === "string" && body.slipName.trim() ? body.slipName.trim() : "manual-transfer",
    customerNote: typeof body.customerNote === "string" ? body.customerNote : null,
    slipFile: null,
    idempotencyKey: normalizeLegacyOrderIdempotencyKey(body.idempotencyKey),
  };
}

async function latestSlipForOrder(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  orderId: string,
) {
  const { data, error } = await supabase
    .from("payment_slips")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function replayLegacyOrderResponse(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  order: NonNullable<Awaited<ReturnType<typeof fetchOrderByProfileIdempotency>>>,
  lineName?: string | null,
) {
  const slip = await latestSlipForOrder(supabase, order.id);
  if (!slip) return null;

  return jsonNoStore({
    order: toOrder({
      order,
      lineName,
      slipName: slip.original_filename ?? "manual-transfer",
      slipProvider: slip.storage_provider,
      slipFilePath: slip.file_path,
      slipVerificationStatus: slip.verification_status,
      slipProviderCode: slip.provider_code,
      slipProviderMessage: slip.provider_message,
      slots: [],
    }),
    replayed: true,
  });
}

async function clearLegacyOrderIdempotencyKey(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  orderId: string,
) {
  const { error } = await supabase
    .from("orders")
    .update({ idempotency_key: null })
    .eq("id", orderId);
  return error;
}

async function deleteIncompleteLegacyOrder(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  order: { id: string; public_code: string | null },
  context: string,
) {
  const { error: deleteError } = await supabase.from("orders").delete().eq("id", order.id);
  if (!deleteError) return;

  const clearError = await clearLegacyOrderIdempotencyKey(supabase, order.id);
  console.warn("legacy_order_incomplete_cleanup_failed", {
    context,
    orderPublicCode: order.public_code,
    deleteMessage: deleteError.message,
    clearIdempotencyMessage: clearError?.message ?? null,
  });
}

function isUniqueConstraintError(error: { code?: string } | null) {
  return error?.code === "23505";
}

export async function GET() {
  if (!isSupabaseConfigured()) {
    const allowLocalFallback = process.env.NODE_ENV !== "production";
    return jsonNoStore({
      configured: false,
      state: { draw: defaultDraw, orders: allowLocalFallback ? seedOrders : [] },
    });
  }

  const session = await resolveCurrentProfile();
  const adminSession = await resolveAdminSession(session);
  const state = await getLuckyDrawState({
    profileId: session?.profileId,
    includeAllOrders: Boolean(adminSession),
  });

  return jsonNoStore({
    configured: true,
    viewer: session
      ? {
          displayName: session.displayName ?? "YNot Customer",
          isAdmin: Boolean(adminSession),
          adminRole: adminSession?.adminRole ?? null,
        }
      : null,
    state: state ?? { draw: defaultDraw, orders: [] },
  });
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const crossOrigin = enforceSameOriginMutation(request);
  if (crossOrigin) return crossOrigin;

  const session = await resolveCurrentProfile();
  if (!session) {
    return Response.json({ error: "Login is required before creating an order." }, { status: 401 });
  }

  const blocked = await requireVerifiedAnchor(session);
  if (blocked) return blocked;

  const limited = await enforceRateLimit(
    request,
    "ynot:legacy-order:create",
    { limit: 6, windowMs: 60_000 },
    session.profileId,
  );
  if (limited) return limited;

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxSlipBytes + 64 * 1024) {
    return jsonNoStore({ error: "Slip must be 10 MB or smaller." }, { status: 413 });
  }

  const parsed = await readCreateOrderRequest(request);
  if (parsed instanceof Response) return parsed;

  const { quantity, slipName, customerNote, slipFile, idempotencyKey } = parsed;
  if (!idempotencyKey) {
    return jsonNoStore({ error: "Invalid idempotency key." }, { status: 400 });
  }

  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 50) {
    return Response.json({ error: "Quantity must be between 1 and 50." }, { status: 400 });
  }

  if (slipFile && !allowedSlipTypes.has(slipFile.type)) {
    return Response.json({ error: "Slip must be JPG, PNG, or WEBP." }, { status: 400 });
  }

  if (slipFile && slipFile.size > maxSlipBytes) {
    return Response.json({ error: "Slip must be 10 MB or smaller." }, { status: 400 });
  }

  const magicCheck = slipFile ? await verifyImageMagicBytes(slipFile) : null;
  if (magicCheck && !magicCheck.ok) {
    return Response.json({ error: magicCheck.error }, { status: 400 });
  }
  if (magicCheck && !allowedSlipTypes.has(magicCheck.contentType)) {
    return Response.json({ error: "Slip must be JPG, PNG, or WEBP." }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const existingOrder = await fetchOrderByProfileIdempotency(supabase, session.profileId, idempotencyKey);
  if (existingOrder) {
    const replayResponse = await replayLegacyOrderResponse(supabase, existingOrder, session.displayName);
    if (replayResponse) return replayResponse;
    return jsonNoStore({ error: "Order is still being prepared. Please try again." }, { status: 409 });
  }

  const activeDraw = await getActiveDraw(supabase, {
    statuses: ["live"],
    priority: ["live"],
    requirePublicApproved: true,
  });
  if (
    !activeDraw ||
    activeDraw.status !== "live" ||
    activeDraw.visibility !== "public" ||
    (
      activeDraw.approval_status !== undefined &&
      activeDraw.approval_status !== "approved"
    )
  ) {
    return Response.json({ error: "No live draw is accepting orders." }, { status: 409 });
  }

  const slipFileBuffer = slipFile ? await slipFile.arrayBuffer() : null;
  const slipFileSha256 = slipFileBuffer ? sha256Hex(slipFileBuffer) : null;

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      draw_round_id: activeDraw.id,
      profile_id: session.profileId,
      quantity,
      amount_thb: quantity * activeDraw.price_thb,
      customer_note: customerNote,
      idempotency_key: idempotencyKey,
    })
    .select("*")
    .single();

  if (orderError) {
    if (isUniqueConstraintError(orderError)) {
      const replayOrder = await fetchOrderByProfileIdempotency(supabase, session.profileId, idempotencyKey);
      if (replayOrder) {
        const replayResponse = await replayLegacyOrderResponse(supabase, replayOrder, session.displayName);
        if (replayResponse) return replayResponse;
        return jsonNoStore({ error: "Order is still being prepared. Please try again." }, { status: 409 });
      }
    }
    throw orderError;
  }

  let storageProvider: "supabase" | "manual_line" = "manual_line";
  let filePath: string | null = null;

  if (slipFile && magicCheck?.ok) {
    storageProvider = "supabase";
    filePath = `${activeDraw.id}/${order.id}/${Date.now()}-${cleanFileName(slipFile.name)}`;
    const { error: uploadError } = await supabase.storage.from(slipBucketName).upload(filePath, slipFile, {
      contentType: magicCheck.contentType,
      upsert: false,
    });

    if (uploadError) {
      await deleteIncompleteLegacyOrder(supabase, order, "slip_upload_failed");
      console.warn("legacy_order_slip_upload_failed", {
        orderPublicCode: order.public_code,
        message: String(uploadError),
      });
      return jsonNoStore({ error: "Could not upload this slip. Please try again." }, { status: 500 });
    }
  }

  // Two-step dedup that skips slips whose parent order is cancelled/expired/
  // refunded so users can re-upload after a rejected first attempt. See
  // src/lib/slip2go/dedup.ts for the rationale.
  const localDuplicateSlip = slipFileSha256
    ? await findLiveDuplicateSlip(supabase, {
        column: "file_sha256",
        value: slipFileSha256,
      })
    : null;

  const initialProviderResponse: Json = localDuplicateSlip
    ? { source: "local_file_hash", duplicateSlipId: localDuplicateSlip.id }
    : {};
  const { data: slip, error: slipError } = await supabase.from("payment_slips").insert({
    order_id: order.id,
    storage_provider: storageProvider,
    file_path: filePath,
    original_filename: slipName,
    file_sha256: slipFileSha256,
    verification_status: localDuplicateSlip ? "duplicate" : slipFile ? "unverified" : "manual_review",
    provider_code: localDuplicateSlip ? "LOCAL_DUPLICATE" : null,
    provider_message: localDuplicateSlip ? "This slip image was already used on another approved order." : null,
    provider_response: initialProviderResponse,
    duplicate_of_slip_id: localDuplicateSlip?.id ?? null,
    verified_at: localDuplicateSlip ? new Date().toISOString() : null,
  }).select("*").single();

  if (slipError) {
    if (filePath) await supabase.storage.from(slipBucketName).remove([filePath]);
    await deleteIncompleteLegacyOrder(supabase, order, "slip_insert_failed");
    throw slipError;
  }

  let savedSlip = slip;
  let savedOrder = order;

  if (slipFile && !localDuplicateSlip) {
    console.info("slip_verification_started", {
      orderPublicCode: order.public_code,
      paymentSlipId: slip.id,
      bankName: activeDraw.bank_name,
      hasPromptPay: Boolean(activeDraw.promptpay_id?.replace(/\D+/g, "")),
      hasBankAccount: Boolean(activeDraw.bank_account_number?.replace(/\D+/g, "")),
    });

    const verifiedContentType = magicCheck?.ok ? magicCheck.contentType : slipFile.type;
    const verificationFile = slipFileBuffer
      ? new File([slipFileBuffer], slipFile.name, { type: verifiedContentType })
      : slipFile;
    const verification = await verifySlipWithSlip2Go(verificationFile, {
      amountThb: order.amount_thb,
      promptPayId: activeDraw.promptpay_id,
      bankName: activeDraw.bank_name,
      bankAccountNumber: activeDraw.bank_account_number,
      bankAccountName: activeDraw.bank_account_name,
    }).catch((error: unknown) => {
      console.warn("slip_verification_failed_before_provider_response", {
        orderPublicCode: order.public_code,
        paymentSlipId: slip.id,
        message: error instanceof Error ? error.message : String(error),
      });
      return createSlip2GoProviderError("Slip verification failed before provider response.");
    });

    let duplicateOfSlipId: string | null = null;
    let duplicateLookupFailed = false;

    try {
      const refDup = verification.referenceId
        ? await findLiveDuplicateSlip(supabase, {
            column: "slip2go_reference_id",
            value: verification.referenceId,
            excludeSlipId: slip.id,
          })
        : null;
      const qrDup =
        !refDup && verification.decodedQrHash
          ? await findLiveDuplicateSlip(supabase, {
              column: "decoded_qr_hash",
              value: verification.decodedQrHash,
              excludeSlipId: slip.id,
            })
          : null;
      duplicateOfSlipId = refDup?.id ?? qrDup?.id ?? null;
    } catch (error: unknown) {
      duplicateLookupFailed = true;
      console.warn("slip_verification_duplicate_lookup_failed", {
        orderPublicCode: order.public_code,
        paymentSlipId: slip.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    const finalStatus = duplicateLookupFailed ? "provider_error" : duplicateOfSlipId ? "duplicate" : verification.status;
    const finalProviderMessage = duplicateLookupFailed
      ? "Slip verified, but duplicate recheck failed. Admin review required."
      : duplicateOfSlipId
        ? "This slip was already used on another approved order."
        : verification.providerMessage;
    console.info("slip_verification_finished", {
      orderPublicCode: order.public_code,
      paymentSlipId: slip.id,
      status: finalStatus,
      providerCode: verification.providerCode,
      autoApprove: verification.autoApprove && !duplicateOfSlipId && !duplicateLookupFailed,
    });

    const { data: verifiedSlip, error: verifiedSlipError } = await supabase
      .from("payment_slips")
      .update({
        verification_status: finalStatus,
        slip2go_reference_id: verification.referenceId,
        decoded_qr_hash: verification.decodedQrHash,
        provider_code: verification.providerCode,
        provider_message: finalProviderMessage,
        provider_response: verification.providerResponse,
        duplicate_of_slip_id: duplicateOfSlipId,
        verified_at: new Date().toISOString(),
      })
      .eq("id", slip.id)
      .select("*")
      .single();

    if (verifiedSlipError) {
      console.warn("slip_verification_update_failed", {
        orderPublicCode: order.public_code,
        paymentSlipId: slip.id,
        message: verifiedSlipError.message,
      });
      throw verifiedSlipError;
    }
    savedSlip = verifiedSlip;

    if (verification.autoApprove && !duplicateOfSlipId && !duplicateLookupFailed) {
      const approvedAt = new Date().toISOString();
      const { data: approvedOrder, error: approvedOrderError } = await supabase
        .from("orders")
        .update({
          status: "approved_for_pick",
          approved_at: approvedAt,
          rejected_by: null,
          rejected_at: null,
        })
        .eq("id", order.id)
        .select("*")
        .single();

      if (approvedOrderError) throw approvedOrderError;
      savedOrder = approvedOrder;

      await supabase.from("audit_events").insert({
        actor_profile_id: session.profileId,
        event_type: "payment_auto_approved",
        draw_round_id: order.draw_round_id,
        order_id: order.id,
        metadata: {
          public_code: order.public_code,
          payment_slip_id: slip.id,
          provider: "slip2go",
          provider_code: verification.providerCode,
        },
      });
    }
  }

  return Response.json({
    order: toOrder({
      order: savedOrder,
      lineName: session.displayName,
      slipName: savedSlip.original_filename ?? slipName,
      slipProvider: savedSlip.storage_provider,
      slipFilePath: savedSlip.file_path,
      slipVerificationStatus: savedSlip.verification_status,
      slipProviderCode: savedSlip.provider_code,
      slipProviderMessage: savedSlip.provider_message,
      slots: [],
    }),
  });
}
