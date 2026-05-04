import { cookies } from "next/headers";
import { defaultDraw, seedOrders } from "@/lib/lucky-draw/defaults";
import { getActiveDraw, getLuckyDrawState, isSupabaseConfigured, toOrder } from "@/lib/lucky-draw/data";
import { readSessionCookie, verifyAdminSession } from "@/lib/lucky-draw/session";
import { createSlip2GoProviderError, sha256Hex, verifySlipWithSlip2Go } from "@/lib/slip2go/client";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

type CreateOrderBody = {
  quantity?: unknown;
  slipName?: unknown;
  customerNote?: unknown;
};

const slipBucketName = "payment-slips";
const maxSlipBytes = 10 * 1024 * 1024;
const allowedSlipTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

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

async function readCreateOrderRequest(request: Request): Promise<{
  quantity: number;
  slipName: string;
  customerNote: string | null;
  slipFile: File | null;
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
  };
}

export async function GET() {
  if (!isSupabaseConfigured()) {
    return jsonNoStore({
      configured: false,
      state: { draw: defaultDraw, orders: seedOrders },
    });
  }

  const session = readSessionCookie(await cookies());
  const adminSession = await verifyAdminSession(session);
  const state = await getLuckyDrawState({
    profileId: session?.profileId,
    includeAllOrders: Boolean(adminSession),
  });

  return jsonNoStore({
    configured: true,
    viewer: session
      ? {
          displayName: session.displayName ?? "LINE Customer",
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

  const session = readSessionCookie(await cookies());
  if (!session) {
    return Response.json({ error: "LINE login is required before creating an order." }, { status: 401 });
  }

  const parsed = await readCreateOrderRequest(request);
  if (parsed instanceof Response) return parsed;

  const { quantity, slipName, customerNote, slipFile } = parsed;
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 50) {
    return Response.json({ error: "Quantity must be between 1 and 50." }, { status: 400 });
  }

  if (slipFile && !allowedSlipTypes.has(slipFile.type)) {
    return Response.json({ error: "Slip must be JPG, PNG, or WEBP." }, { status: 400 });
  }

  if (slipFile && slipFile.size > maxSlipBytes) {
    return Response.json({ error: "Slip must be 10 MB or smaller." }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const activeDraw = await getActiveDraw(supabase, { statuses: ["live"], priority: ["live"] });
  if (!activeDraw || activeDraw.status !== "live") {
    return Response.json({ error: "No live draw is accepting orders." }, { status: 409 });
  }

  const slipFileBuffer = slipFile ? await slipFile.arrayBuffer() : null;
  const slipFileSha256 = slipFileBuffer ? sha256Hex(slipFileBuffer) : null;
  const { data: localDuplicateSlip, error: localDuplicateError } = slipFileSha256
    ? await supabase
        .from("payment_slips")
        .select("id")
        .eq("file_sha256", slipFileSha256)
        .eq("verification_status", "valid")
        .order("verified_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null, error: null };

  if (localDuplicateError) throw localDuplicateError;

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      draw_round_id: activeDraw.id,
      profile_id: session.profileId,
      quantity,
      amount_thb: quantity * activeDraw.price_thb,
      customer_note: customerNote,
    })
    .select("*")
    .single();

  if (orderError) throw orderError;

  let storageProvider: "supabase" | "manual_line" = "manual_line";
  let filePath: string | null = null;

  if (slipFile) {
    storageProvider = "supabase";
    filePath = `${activeDraw.id}/${order.id}/${Date.now()}-${cleanFileName(slipFile.name)}`;
    const { error: uploadError } = await supabase.storage.from(slipBucketName).upload(filePath, slipFile, {
      contentType: slipFile.type,
      upsert: false,
    });

    if (uploadError) {
      await supabase.from("orders").delete().eq("id", order.id);
      return Response.json({ error: uploadError.message }, { status: 500 });
    }
  }

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
    await supabase.from("orders").delete().eq("id", order.id);
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

    const verificationFile = slipFileBuffer
      ? new File([slipFileBuffer], slipFile.name, { type: slipFile.type })
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
    const duplicateFilters = [
      verification.referenceId ? `slip2go_reference_id.eq.${verification.referenceId}` : null,
      verification.decodedQrHash ? `decoded_qr_hash.eq.${verification.decodedQrHash}` : null,
    ].filter(Boolean);

    if (duplicateFilters.length) {
      const { data: duplicateSlip, error: duplicateSlipError } = await supabase
        .from("payment_slips")
        .select("id")
        .eq("verification_status", "valid")
        .neq("id", slip.id)
        .or(duplicateFilters.join(","))
        .limit(1)
        .maybeSingle();

      if (duplicateSlipError) {
        duplicateLookupFailed = true;
        console.warn("slip_verification_duplicate_lookup_failed", {
          orderPublicCode: order.public_code,
          paymentSlipId: slip.id,
          message: duplicateSlipError.message,
        });
      }
      duplicateOfSlipId = duplicateSlip?.id ?? null;
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
