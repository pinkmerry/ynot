import { getMarketplaceAccountForProfile } from "@/lib/marketplace/account-bridge";
import { prepareMarketplaceMutation } from "@/lib/marketplace/mutation-guard";
import {
  getBuyerPendingPaymentOrder,
  submitMarketplacePaymentProof,
} from "@/lib/marketplace/orders";
import {
  marketplaceErrorResponse,
} from "@/lib/marketplace/route-guards";
import {
  createMarketplaceSupabaseClient,
  MarketplaceServiceError,
} from "@/lib/marketplace/supabase-adapter";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import {
  createSlip2GoProviderError,
  sha256Hex,
  verifySlipWithSlip2Go,
} from "@/lib/slip2go/client";
import { findLiveDuplicateSlip } from "@/lib/slip2go/dedup";
import {
  allowedSlipTypes,
  extensionForVerifiedImage,
  maxSlipBytes,
  requestExceedsUploadLimit,
  verifyImageMagicBytes,
} from "@/lib/uploads/magic-bytes";

export const dynamic = "force-dynamic";

const proofBucketName = "marketplace-payment-proofs";
type CoreDuplicateColumn =
  | "file_sha256"
  | "slip2go_reference_id"
  | "decoded_qr_hash";

function cleanFileName(name: string) {
  return (
    name
      .trim()
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 120) || "payment-proof"
  );
}

function storageObjectAlreadyExists(error: {
  error?: string;
  message?: string;
  status?: number | string;
  statusCode?: number | string;
}) {
  const status = String(error.status ?? error.statusCode ?? "");
  const material = `${error.error ?? ""} ${error.message ?? ""}`.toLowerCase();
  return (
    status === "409" ||
    material.includes("already exists") ||
    material.includes("duplicate")
  );
}

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

function getPaymentProofFile(form: FormData) {
  const file = form.get("paymentProof") ?? form.get("slip");
  if (!(file instanceof File)) {
    throw new MarketplaceServiceError(
      "marketplace_payment_proof_required",
      "Payment proof is required.",
      400,
    );
  }
  if (file.size <= 0 || file.size > maxSlipBytes) {
    throw new MarketplaceServiceError(
      "marketplace_payment_proof_invalid",
      "Payment proof is invalid.",
      400,
    );
  }
  return file;
}

async function findCorePaymentSlipDuplicate(input: {
  column: CoreDuplicateColumn;
  value: string;
  pendingOrderId: string;
  requestId: string;
}) {
  try {
    const duplicate = await findLiveDuplicateSlip(createServiceSupabaseClient(), {
      column: input.column,
      value: input.value,
    });
    return { failed: false, duplicateSlipId: duplicate?.id ?? null };
  } catch (error) {
    console.warn("marketplace_core_slip_duplicate_lookup_failed", {
      pendingOrderId: input.pendingOrderId,
      requestId: input.requestId,
      column: input.column,
      message: error instanceof Error ? error.message : String(error),
    });
    return { failed: true, duplicateSlipId: null };
  }
}

function assertPendingOrderAcceptsProof(pendingOrder: {
  order_state: string;
  expires_at: string;
}) {
  const expiresAt = new Date(pendingOrder.expires_at);
  if (
    pendingOrder.order_state === "pending_payment" &&
    Number.isFinite(expiresAt.getTime()) &&
    expiresAt <= new Date()
  ) {
    throw new MarketplaceServiceError(
      "marketplace_pending_order_expired",
      "Payment window expired. Create a new marketplace order before uploading a slip.",
      409,
    );
  }
  if (
    pendingOrder.order_state !== "pending_payment" &&
    pendingOrder.order_state !== "payment_submitted"
  ) {
    throw new MarketplaceServiceError(
      "marketplace_payment_state_invalid",
      "Payment proof is closed for this order.",
      409,
    );
  }
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ pendingOrderId: string }> },
) {
  const mutation = await prepareMarketplaceMutation(request, {
    method: "POST",
    accessMode: "customer",
    action: "paymentProof",
    rateLimit: {
      key: "ynot:marketplace:checkout:payment-proof",
      limit: 6,
      windowMs: 60_000,
    },
    readBody: false,
  });
  if (!mutation.ok) return mutation.response;

  const { access, idempotencyKey, profile, requestId } = mutation;

  try {
    if (requestExceedsUploadLimit(request)) {
      throw new MarketplaceServiceError(
        "marketplace_payment_proof_invalid",
        "Payment proof is invalid.",
        413,
      );
    }
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("multipart/form-data")) {
      throw new MarketplaceServiceError(
        "marketplace_payment_proof_invalid",
        "Payment proof is invalid.",
        415,
      );
    }

    const { pendingOrderId } = await ctx.params;
    const account = await getMarketplaceAccountForProfile(profile, access.admin);
    const pendingOrder = await getBuyerPendingPaymentOrder({
      pendingOrderId,
      account,
    });
    assertPendingOrderAcceptsProof(pendingOrder);

    const form = await request.formData();
    const slipFile = getPaymentProofFile(form);
    const magicCheck = await verifyImageMagicBytes(slipFile);
    if (!magicCheck.ok) {
      throw new MarketplaceServiceError(
        "marketplace_payment_proof_invalid",
        magicCheck.error,
        400,
      );
    }
    if (!allowedSlipTypes.has(magicCheck.contentType)) {
      throw new MarketplaceServiceError(
        "marketplace_payment_proof_invalid",
        "Payment proof is invalid.",
        400,
      );
    }

    const slipBuffer = await slipFile.arrayBuffer();
    const fileSha256 = sha256Hex(slipBuffer);
    const fileDuplicate = await findCorePaymentSlipDuplicate({
      column: "file_sha256",
      value: fileSha256,
      pendingOrderId,
      requestId,
    });
    let duplicateLookupFailed = fileDuplicate.failed;
    let coreDuplicateSlipId = fileDuplicate.duplicateSlipId;
    let coreDuplicateSource: CoreDuplicateColumn | null =
      coreDuplicateSlipId ? "file_sha256" : null;
    const fileName = cleanFileName(slipFile.name);
    const extension = extensionForVerifiedImage(magicCheck.contentType);
    const storageSafeIdempotencyKey = cleanFileName(idempotencyKey);
    const storagePath = [
      profile.profileId,
      pendingOrderId,
      `${storageSafeIdempotencyKey}-${fileSha256.slice(0, 12)}-${fileName}.${extension}`,
    ].join("/");

    const supabase = createMarketplaceSupabaseClient();
    const { error: uploadError } = await supabase.storage
      .from(proofBucketName)
      .upload(storagePath, slipFile, {
        contentType: magicCheck.contentType,
        upsert: false,
      });
    const uploadedProofNow = !uploadError;
    if (uploadError && !storageObjectAlreadyExists(uploadError)) {
      throw new MarketplaceServiceError(
        "marketplace_payment_proof_invalid",
        "Payment proof could not be stored.",
        500,
        uploadError.message,
      );
    }

    const verification = coreDuplicateSlipId
      ? {
          status: "duplicate" as const,
          providerCode: "LOCAL_CORE_DUPLICATE",
          providerMessage:
            "This slip was already used on another approved payment.",
          providerResponse: {
            source: "core_payment_slips",
            duplicateSlipId: coreDuplicateSlipId,
            duplicateSource: coreDuplicateSource,
          },
          referenceId: null,
          decodedQrHash: null,
        }
      : await verifySlipWithSlip2Go(
          new File([slipBuffer], slipFile.name, {
            type: magicCheck.contentType,
          }),
          {
            amountThb: Number(pendingOrder.buyer_total_satang ?? 0) / 100,
            promptPayId: process.env.SLIP2GO_PROMPTPAY_ID,
            bankName: process.env.SLIP2GO_BANK_NAME,
            bankAccountNumber: process.env.SLIP2GO_BANK_ACCOUNT_NUMBER,
            bankAccountName: process.env.SLIP2GO_BANK_ACCOUNT_NAME,
          },
        ).catch((error: unknown) => {
          console.warn(
            "marketplace_slip_verification_failed_before_provider_response",
            {
              pendingOrderId,
              requestId,
              message: error instanceof Error ? error.message : String(error),
            },
          );
          return createSlip2GoProviderError(
            "Slip verification failed before provider response.",
          );
        });

    if (!coreDuplicateSlipId && !duplicateLookupFailed) {
      const referenceDuplicate = verification.referenceId
        ? await findCorePaymentSlipDuplicate({
            column: "slip2go_reference_id",
            value: verification.referenceId,
            pendingOrderId,
            requestId,
          })
        : { failed: false, duplicateSlipId: null };
      const qrDuplicate =
        !referenceDuplicate.duplicateSlipId && verification.decodedQrHash
          ? await findCorePaymentSlipDuplicate({
              column: "decoded_qr_hash",
              value: verification.decodedQrHash,
              pendingOrderId,
              requestId,
            })
          : { failed: false, duplicateSlipId: null };

      duplicateLookupFailed =
        referenceDuplicate.failed || qrDuplicate.failed;
      coreDuplicateSlipId =
        referenceDuplicate.duplicateSlipId ?? qrDuplicate.duplicateSlipId;
      coreDuplicateSource = referenceDuplicate.duplicateSlipId
        ? "slip2go_reference_id"
        : qrDuplicate.duplicateSlipId
          ? "decoded_qr_hash"
          : null;
    }

    const verificationStatus = coreDuplicateSlipId
      ? "duplicate"
      : duplicateLookupFailed
        ? "provider_error"
        : verification.status;
    const providerCode = coreDuplicateSlipId
      ? "LOCAL_CORE_DUPLICATE"
      : verification.providerCode;
    const providerMessage = coreDuplicateSlipId
      ? "This slip was already used on another approved payment."
      : duplicateLookupFailed
        ? "Slip verified, but duplicate recheck failed. Admin review required."
        : verification.providerMessage;
    const providerResponse = coreDuplicateSlipId
      ? {
          source: "core_payment_slips",
          duplicateSlipId: coreDuplicateSlipId,
          duplicateSource: coreDuplicateSource,
          slip2go: verification.providerResponse,
        }
      : duplicateLookupFailed
        ? {
            source: "core_payment_slips_duplicate_check_failed",
            slip2go: verification.providerResponse,
          }
        : verification.providerResponse;

    try {
      const proof = await submitMarketplacePaymentProof({
        pendingOrderId,
        profile,
        account,
        requestId,
        idempotencyKey,
        requestHash: await mutation.requestHashForTargetBody(
          `payment_proof.submit.${pendingOrder.listing_source}`,
          pendingOrderId,
          JSON.stringify({
            contentType: magicCheck.contentType,
            fileSha256,
            fileSizeBytes: slipFile.size,
          }),
        ),
        fileSha256,
        fileSizeBytes: slipFile.size,
        contentType: magicCheck.contentType,
        proofStoragePath: storagePath,
        verificationStatus,
        providerCode,
        providerMessage,
        providerResponse,
        referenceId: verification.referenceId,
        decodedQrHash: verification.decodedQrHash,
      });

      return jsonNoStore({
        ok: true,
        request_id: requestId,
        proof,
      });
    } catch (error) {
      if (uploadedProofNow) {
        await supabase.storage.from(proofBucketName).remove([storagePath]);
      }
      throw error;
    }
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
