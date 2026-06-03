import { randomUUID } from "node:crypto";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { requireVerifiedAnchor } from "@/lib/auth/verified-anchor";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import type { SlipVerificationStatus } from "@/lib/lucky-draw/types";
import { createSlip2GoProviderError, sha256Hex, verifySlipWithSlip2Go } from "@/lib/slip2go/client";
import { findLiveDuplicateSlip } from "@/lib/slip2go/dedup";
import { getPaymentMethods, getTopUps, getWallet, publicPaymentMethods, publicTopUp } from "@/features/ynot/data";
import { toTopUp } from "@/features/ynot/data";
import { getTopUpPackage } from "@/features/ynot/top-up-packages";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { enforceSameOriginMutation } from "@/lib/security/same-origin";
import { allowedSlipTypes, maxSlipBytes, verifyImageMagicBytes } from "@/lib/uploads/magic-bytes";
import {
  canAutoApproveVerifiedSlip,
  canAutoRejectVerifiedSlip,
  emitTopUpApprovalRiskAlerts,
  resolveAutoTopUpAdmin,
} from "@/lib/ynot/top-up-approval";
import { resolvePaymentMethodActionToken } from "@/lib/ynot/payment-method-action-tokens";

export const dynamic = "force-dynamic";

const slipBucketName = "payment-slips";
const minCustomTopUpThb = 1;
const maxCustomTopUpThb = 20_000;

type ResolvedTopUpAmount = {
  amountThb: number;
  coins: number;
  packageId: string | null;
};

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

function cleanFileName(name: string) {
  return name.trim().replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 120) || "payment-slip";
}

function formString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function resolveTopUpAmount(form: FormData): { value: ResolvedTopUpAmount } | { error: string } {
  const packageId = formString(form.get("packageId"));
  const customAmountRaw = formString(form.get("customAmountThb"));
  if (packageId && customAmountRaw) {
    return { error: "Choose either a package or a custom top-up amount, not both." };
  }

  if (packageId) {
    const topUpPackage = getTopUpPackage(packageId);
    if (!topUpPackage) return { error: "Invalid top-up package." };
    return {
      value: {
        amountThb: topUpPackage.amountThb,
        coins: topUpPackage.coins,
        packageId: topUpPackage.id,
      },
    };
  }

  if (!customAmountRaw) {
    return { error: "Choose a top-up package or enter a custom amount." };
  }
  if (!/^\d+$/.test(customAmountRaw)) {
    return { error: "Custom top-up amount must be a whole baht amount." };
  }

  const amountThb = Number(customAmountRaw);
  if (
    !Number.isSafeInteger(amountThb) ||
    amountThb < minCustomTopUpThb ||
    amountThb > maxCustomTopUpThb
  ) {
    return { error: `Custom top-up amount must be between ฿${minCustomTopUpThb} and ฿${maxCustomTopUpThb.toLocaleString()}.` };
  }

  return { value: { amountThb, coins: amountThb, packageId: null } };
}

export async function GET() {
  if (!isSupabaseConfigured()) return jsonNoStore({ error: "Supabase is not configured." }, { status: 503 });
  const session = await resolveCurrentProfile();
  if (!session?.profileId) return jsonNoStore({ error: "Login is required." }, { status: 401 });
  const [wallet, topUps, paymentMethods] = await Promise.all([
    getWallet(session.profileId),
    getTopUps(session.profileId).then((topUps) => topUps.map(publicTopUp)),
    getPaymentMethods().then(publicPaymentMethods),
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
  const paymentMethodToken = String(form.get("paymentMethodId") ?? "").trim();
  const resolvedTopUp = resolveTopUpAmount(form);
  const customerNote = typeof form.get("customerNote") === "string" ? String(form.get("customerNote")).trim().slice(0, 500) : null;
  const fileValue = form.get("slip");
  const slipFile = fileValue instanceof File && fileValue.size > 0 ? fileValue : null;

  if (!paymentMethodToken) return jsonNoStore({ error: "Payment method is required." }, { status: 400 });
  if ("error" in resolvedTopUp) return jsonNoStore({ error: resolvedTopUp.error }, { status: 400 });
  if (!slipFile) return jsonNoStore({ error: "Transfer slip upload is required." }, { status: 400 });
  if (!allowedSlipTypes.has(slipFile.type)) return jsonNoStore({ error: "Slip must be JPG, PNG, or WEBP." }, { status: 400 });
  if (slipFile.size > maxSlipBytes) return jsonNoStore({ error: "Slip must be 10 MB or smaller." }, { status: 400 });
  const magicCheck = await verifyImageMagicBytes(slipFile);
  if (!magicCheck.ok) return jsonNoStore({ error: magicCheck.error }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  let paymentMethodId: string | null;
  try {
    paymentMethodId = await resolvePaymentMethodActionToken(paymentMethodToken);
  } catch (error) {
    console.warn("wallet_top_up_payment_method_token_resolve_failed", {
      profileId: session.profileId,
      message: error instanceof Error ? error.message : String(error),
    });
    return jsonNoStore(
      { error: "Could not start this top-up. Please refresh and try again." },
      { status: 503 },
    );
  }
  if (!paymentMethodId) {
    return jsonNoStore({ error: "Payment method is not active." }, { status: 400 });
  }

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
  // Step 1: pull every slip with this file hash whose verification status is
  // approvable. Step 2 filters out the ones whose parent top-up was rejected
  // / cancelled / expired — those slips are "released" for re-upload (e.g.
  // user's payment was rejected for a fixable reason and they retry with the
  // same image). The DB-side guard in approve_top_up_request is still the
  // authoritative money-flow gate; this just keeps the operator-visible
  // duplicate signal honest.
  const localDuplicateSlip = await findLiveDuplicateSlip(supabase, {
    column: "file_sha256",
    value: slipHash,
  });

  const idempotencyKey = randomUUID();
  const { data: topUp, error: topUpError } = await supabase
    .from("top_up_requests")
    .insert({
      profile_id: session.profileId,
      payment_method_id: paymentMethodId,
      amount_thb: resolvedTopUp.value.amountThb,
      coin_amount: resolvedTopUp.value.coins,
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
    console.warn("wallet_top_up_slip_upload_failed", {
      topUpPublicCode: topUp.public_code,
      message: uploadError.message,
    });
    return jsonNoStore(
      { error: "Could not upload this slip. Please try again." },
      { status: 500 },
    );
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

  await supabase.from("audit_events").insert({
    actor_profile_id: session.profileId,
    event_type: "top_up_submitted",
    top_up_request_id: topUp.id,
    metadata: {
      public_code: topUp.public_code,
      amount_thb: resolvedTopUp.value.amountThb,
      coin_amount: resolvedTopUp.value.coins,
      amount_source: resolvedTopUp.value.packageId ? "package" : "custom",
      package_id: resolvedTopUp.value.packageId,
    },
  });

  let responseTopUp = topUp;
  let autoApproved = false;
  let autoRejected = false;

  const autoRejectTopUpFromSlipCheck = async (finalStatus: SlipVerificationStatus) => {
    try {
      const autoAdmin = await resolveAutoTopUpAdmin(supabase);
      if (!autoAdmin) {
        console.warn("wallet_top_up_auto_rejection_skipped_no_admin", {
          topUpPublicCode: topUp.public_code,
          paymentSlipId: slip.id,
          finalStatus,
        });
        return;
      }

      const { error: rejectionError } = await supabase.rpc("reject_top_up_request", {
        p_top_up_request_id: topUp.id,
        p_admin_id: autoAdmin.id,
        p_admin_note: `Auto-rejected after Slip2Go returned ${finalStatus.replace(/_/g, " ")}. Customer needs to upload a matching slip.`,
      });

      if (rejectionError) {
        console.warn("wallet_top_up_auto_rejection_failed", {
          topUpPublicCode: topUp.public_code,
          paymentSlipId: slip.id,
          finalStatus,
          message: rejectionError.message,
        });
        return;
      }

      autoRejected = true;
      const { data: refreshedTopUp, error: refreshedTopUpError } = await supabase
        .from("top_up_requests")
        .select("*")
        .eq("id", topUp.id)
        .maybeSingle();
      if (refreshedTopUpError) {
        console.warn("wallet_top_up_auto_rejection_refresh_failed", {
          topUpPublicCode: topUp.public_code,
          message: refreshedTopUpError.message,
        });
      } else if (refreshedTopUp) {
        responseTopUp = refreshedTopUp;
      }
    } catch (error: unknown) {
      console.warn("wallet_top_up_auto_rejection_threw", {
        topUpPublicCode: topUp.public_code,
        paymentSlipId: slip.id,
        finalStatus,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  if (localDuplicateSlip) {
    await autoRejectTopUpFromSlipCheck("duplicate");
  } else {
    const verificationFile = new File([slipBuffer], slipFile.name, {
      type: magicCheck.contentType,
    });
    const verification = await verifySlipWithSlip2Go(verificationFile, {
      amountThb: resolvedTopUp.value.amountThb,
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

    // Reuse the same scoping helper so the slip2go reference / decoded-QR
    // dedup also ignores slips on rejected/cancelled/expired top-ups.
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
      console.warn("wallet_slip_verification_duplicate_lookup_failed", {
        topUpPublicCode: topUp.public_code,
        paymentSlipId: slip.id,
        message: error instanceof Error ? error.message : String(error),
      });
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
    } else if (
      canAutoApproveVerifiedSlip({
        finalStatus,
        providerAutoApprove: verification.autoApprove,
      })
    ) {
      try {
        const autoAdmin = await resolveAutoTopUpAdmin(supabase);
        if (!autoAdmin) {
          console.warn("wallet_top_up_auto_approval_skipped_no_admin", {
            topUpPublicCode: topUp.public_code,
            paymentSlipId: slip.id,
          });
        } else {
          const { error: approvalError } = await supabase.rpc("approve_top_up_request", {
            p_top_up_request_id: topUp.id,
            p_admin_id: autoAdmin.id,
            p_admin_note: "Auto-approved after Slip2Go verified amount, receiver, date, and duplicate checks.",
          });

          if (approvalError) {
            console.warn("wallet_top_up_auto_approval_failed", {
              topUpPublicCode: topUp.public_code,
              paymentSlipId: slip.id,
              message: approvalError.message,
            });
          } else {
            autoApproved = true;
            await emitTopUpApprovalRiskAlerts(supabase, {
              actor: {
                profileId: autoAdmin.profileId,
                adminId: autoAdmin.id,
                role: autoAdmin.role,
              },
              topUpId: topUp.id,
              approvalMode: "slip2go_auto",
            });

            const { data: refreshedTopUp, error: refreshedTopUpError } = await supabase
              .from("top_up_requests")
              .select("*")
              .eq("id", topUp.id)
              .maybeSingle();
            if (refreshedTopUpError) {
              console.warn("wallet_top_up_auto_approval_refresh_failed", {
                topUpPublicCode: topUp.public_code,
                message: refreshedTopUpError.message,
              });
            } else if (refreshedTopUp) {
              responseTopUp = refreshedTopUp;
            }
          }
        }
      } catch (error: unknown) {
        console.warn("wallet_top_up_auto_approval_threw", {
          topUpPublicCode: topUp.public_code,
          paymentSlipId: slip.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    } else if (canAutoRejectVerifiedSlip(finalStatus)) {
      await autoRejectTopUpFromSlipCheck(finalStatus);
    }
  }

  return jsonNoStore(
    { topUp: publicTopUp(toTopUp(responseTopUp)), autoApproved, autoRejected },
    { status: 201 },
  );
}
