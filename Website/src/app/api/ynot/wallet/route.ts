import { randomUUID } from "node:crypto";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { requireVerifiedAnchor } from "@/lib/auth/verified-anchor";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import { createSlip2GoProviderError, sha256Hex, verifySlipWithSlip2Go } from "@/lib/slip2go/client";
import { getPaymentMethods, getTopUps, getWallet } from "@/features/ynot/data";
import { toTopUp } from "@/features/ynot/data";
import { getTopUpPackage } from "@/features/ynot/top-up-packages";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { enforceSameOriginMutation } from "@/lib/security/same-origin";
import { allowedSlipTypes, maxSlipBytes, verifyImageMagicBytes } from "@/lib/uploads/magic-bytes";

export const dynamic = "force-dynamic";

const slipBucketName = "payment-slips";

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

function cleanFileName(name: string) {
  return name.trim().replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 120) || "payment-slip";
}

export async function GET() {
  if (!isSupabaseConfigured()) return jsonNoStore({ error: "Supabase is not configured." }, { status: 503 });
  const session = await resolveCurrentProfile();
  if (!session?.profileId) return jsonNoStore({ error: "Login is required." }, { status: 401 });
  const [wallet, topUps, paymentMethods] = await Promise.all([
    getWallet(session.profileId),
    getTopUps(session.profileId),
    getPaymentMethods(),
  ]);
  return jsonNoStore({ wallet, topUps, paymentMethods });
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return jsonNoStore({ error: "Supabase is not configured." }, { status: 503 });
  const crossOrigin = enforceSameOriginMutation(request);
  if (crossOrigin) return crossOrigin;
  const session = await resolveCurrentProfile();
  if (!session?.profileId) return jsonNoStore({ error: "Login is required." }, { status: 401 });
  const blocked = await requireVerifiedAnchor(session);
  if (blocked) return blocked;
  const limited = await enforceRateLimit(request, "ynot:wallet:top-up", { limit: 6, windowMs: 60_000 }, session.profileId);
  if (limited) return limited;

  // Reject oversize uploads BEFORE buffering. The body-level magic-byte check
  // below still runs as the authoritative ceiling, but content-length lets us
  // bail out without spending Worker memory on a 100 MB tarball. We allow a
  // little headroom over maxSlipBytes for multipart envelope overhead.
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxSlipBytes + 64 * 1024) {
    return jsonNoStore({ error: "Slip must be 10 MB or smaller." }, { status: 413 });
  }

  const form = await request.formData();
  const paymentMethodId = String(form.get("paymentMethodId") ?? "").trim();
  const packageId = String(form.get("packageId") ?? "").trim();
  const topUpPackage = getTopUpPackage(packageId);
  const customerNote = typeof form.get("customerNote") === "string" ? String(form.get("customerNote")).trim().slice(0, 500) : null;
  const fileValue = form.get("slip");
  const slipFile = fileValue instanceof File && fileValue.size > 0 ? fileValue : null;

  if (!paymentMethodId) return jsonNoStore({ error: "Payment method is required." }, { status: 400 });
  if (!topUpPackage) return jsonNoStore({ error: "Invalid top-up package." }, { status: 400 });
  if (!slipFile) return jsonNoStore({ error: "Transfer slip upload is required." }, { status: 400 });
  if (!allowedSlipTypes.has(slipFile.type)) return jsonNoStore({ error: "Slip must be JPG, PNG, or WEBP." }, { status: 400 });
  if (slipFile.size > maxSlipBytes) return jsonNoStore({ error: "Slip must be 10 MB or smaller." }, { status: 400 });
  const magicCheck = await verifyImageMagicBytes(slipFile);
  if (!magicCheck.ok) return jsonNoStore({ error: magicCheck.error }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  const { data: paymentMethod, error: methodError } = await supabase
    .from("payment_methods")
    .select("id,is_active,type,bank_name,account_name,account_number,promptpay_id")
    .eq("id", paymentMethodId)
    .eq("is_active", true)
    .maybeSingle();
  if (methodError) throw methodError;
  if (!paymentMethod) return jsonNoStore({ error: "Payment method is not active." }, { status: 400 });

  const slipBuffer = await slipFile.arrayBuffer();
  const slipHash = sha256Hex(slipBuffer);
  // Include 'manual_review' alongside 'valid' so slips that landed in
  // manual_review state (e.g. flows that admit slips without provider data)
  // also block re-upload of the same image. The DB-side guard in
  // approve_top_up_request is the authoritative gate; this just widens the
  // operator-visible duplicate signal at upload time.
  const { data: localDuplicateSlip, error: localDuplicateError } = await supabase
    .from("payment_slips")
    .select("id")
    .eq("file_sha256", slipHash)
    .in("verification_status", ["valid", "manual_review"])
    .order("verified_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (localDuplicateError) throw localDuplicateError;

  const idempotencyKey = randomUUID();
  const { data: topUp, error: topUpError } = await supabase
    .from("top_up_requests")
    .insert({
      profile_id: session.profileId,
      payment_method_id: paymentMethodId,
      amount_thb: topUpPackage.amountThb,
      coin_amount: topUpPackage.coins,
      status: "pending_review",
      submitted_at: new Date().toISOString(),
      customer_note: customerNote,
      idempotency_key: idempotencyKey,
    })
    .select("*")
    .single();
  if (topUpError) throw topUpError;

  const filePath = `topups/${session.profileId}/${topUp.id}/${Date.now()}-${cleanFileName(slipFile.name)}`;
  const { error: uploadError } = await supabase.storage.from(slipBucketName).upload(filePath, slipFile, { contentType: magicCheck.contentType, upsert: false });
  if (uploadError) {
    await supabase.from("top_up_requests").delete().eq("id", topUp.id);
    return jsonNoStore({ error: uploadError.message }, { status: 500 });
  }

  const initialProviderResponse: Json = localDuplicateSlip
    ? { source: "local_file_hash", duplicateSlipId: localDuplicateSlip.id }
    : { source: "manual_top_up_upload" };
  const { data: slip, error: slipError } = await supabase.from("payment_slips").insert({
    top_up_request_id: topUp.id,
    storage_provider: "supabase",
    file_path: filePath,
    original_filename: slipFile.name,
    file_sha256: slipHash,
    verification_status: localDuplicateSlip ? "duplicate" : "unverified",
    provider_code: localDuplicateSlip ? "LOCAL_DUPLICATE" : null,
    provider_message: localDuplicateSlip ? "This slip image was already used on another approved payment." : null,
    provider_response: initialProviderResponse,
    duplicate_of_slip_id: localDuplicateSlip?.id ?? null,
    verified_at: localDuplicateSlip ? new Date().toISOString() : null,
  }).select("*").single();
  if (slipError) {
    await supabase.storage.from(slipBucketName).remove([filePath]);
    await supabase.from("top_up_requests").delete().eq("id", topUp.id);
    throw slipError;
  }

  if (!localDuplicateSlip) {
    const verificationFile = new File([slipBuffer], slipFile.name, {
      type: magicCheck.contentType,
    });
    const verification = await verifySlipWithSlip2Go(verificationFile, {
      amountThb: topUpPackage.amountThb,
      promptPayId: paymentMethod.promptpay_id,
      bankName: paymentMethod.bank_name,
      bankAccountNumber: paymentMethod.account_number,
      bankAccountName: paymentMethod.account_name,
    }).catch((error: unknown) => {
      console.warn("wallet_slip_verification_failed_before_provider_response", {
        topUpPublicCode: topUp.public_code,
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
      // Same widening as the file-hash lookup above: 'manual_review' slips
      // count as already-used for the operator-visible duplicate signal.
      const { data: duplicateSlip, error: duplicateSlipError } = await supabase
        .from("payment_slips")
        .select("id")
        .in("verification_status", ["valid", "manual_review"])
        .neq("id", slip.id)
        .or(duplicateFilters.join(","))
        .limit(1)
        .maybeSingle();

      if (duplicateSlipError) {
        duplicateLookupFailed = true;
        console.warn("wallet_slip_verification_duplicate_lookup_failed", {
          topUpPublicCode: topUp.public_code,
          paymentSlipId: slip.id,
          message: duplicateSlipError.message,
        });
      }
      duplicateOfSlipId = duplicateSlip?.id ?? null;
    }

    const finalStatus = duplicateLookupFailed
      ? "provider_error"
      : duplicateOfSlipId
        ? "duplicate"
        : verification.status;
    const finalProviderMessage = duplicateLookupFailed
      ? "Slip verified, but duplicate recheck failed. Admin review required."
      : duplicateOfSlipId
        ? "This slip was already used on another approved payment."
        : verification.providerMessage;

    const { error: verifiedSlipError } = await supabase
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
      .eq("id", slip.id);

    if (verifiedSlipError) {
      console.warn("wallet_slip_verification_update_failed", {
        topUpPublicCode: topUp.public_code,
        paymentSlipId: slip.id,
        message: verifiedSlipError.message,
      });
    }
  }

  await supabase.from("audit_events").insert({
    actor_profile_id: session.profileId,
    event_type: "top_up_submitted",
    top_up_request_id: topUp.id,
    metadata: {
      public_code: topUp.public_code,
      amount_thb: topUpPackage.amountThb,
      coin_amount: topUpPackage.coins,
      package_id: topUpPackage.id,
    },
  });

  return jsonNoStore({ topUp: toTopUp(topUp) }, { status: 201 });
}
