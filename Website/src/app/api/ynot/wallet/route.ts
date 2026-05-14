import { randomUUID } from "node:crypto";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { requireVerifiedAnchor } from "@/lib/auth/verified-anchor";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { sha256Hex } from "@/lib/slip2go/client";
import { getPaymentMethods, getTopUps, getWallet } from "@/features/ynot/data";
import { toTopUp } from "@/features/ynot/data";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const slipBucketName = "payment-slips";
const maxSlipBytes = 10 * 1024 * 1024;
const allowedSlipTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

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
  const session = await resolveCurrentProfile();
  if (!session?.profileId) return jsonNoStore({ error: "Login is required." }, { status: 401 });
  const blocked = await requireVerifiedAnchor(session);
  if (blocked) return blocked;
  const limited = await enforceRateLimit(request, "ynot:wallet:top-up", { limit: 6, windowMs: 60_000 }, session.profileId);
  if (limited) return limited;

  const form = await request.formData();
  const paymentMethodId = String(form.get("paymentMethodId") ?? "").trim();
  const amountThb = Number(form.get("amountThb"));
  const coinAmount = Number(form.get("coinAmount"));
  const customerNote = typeof form.get("customerNote") === "string" ? String(form.get("customerNote")).trim().slice(0, 500) : null;
  const fileValue = form.get("slip");
  const slipFile = fileValue instanceof File && fileValue.size > 0 ? fileValue : null;

  if (!paymentMethodId) return jsonNoStore({ error: "Payment method is required." }, { status: 400 });
  if (!Number.isInteger(amountThb) || amountThb <= 0 || amountThb > 1_000_000) return jsonNoStore({ error: "Invalid THB amount." }, { status: 400 });
  if (!Number.isInteger(coinAmount) || coinAmount <= 0 || coinAmount > 10_000_000) return jsonNoStore({ error: "Invalid coin amount." }, { status: 400 });
  if (!slipFile) return jsonNoStore({ error: "Transfer slip upload is required." }, { status: 400 });
  if (!allowedSlipTypes.has(slipFile.type)) return jsonNoStore({ error: "Slip must be JPG, PNG, or WEBP." }, { status: 400 });
  if (slipFile.size > maxSlipBytes) return jsonNoStore({ error: "Slip must be 10 MB or smaller." }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  const { data: paymentMethod, error: methodError } = await supabase
    .from("payment_methods")
    .select("id,is_active")
    .eq("id", paymentMethodId)
    .eq("is_active", true)
    .maybeSingle();
  if (methodError) throw methodError;
  if (!paymentMethod) return jsonNoStore({ error: "Payment method is not active." }, { status: 400 });

  const idempotencyKey = randomUUID();
  const { data: topUp, error: topUpError } = await supabase
    .from("top_up_requests")
    .insert({
      profile_id: session.profileId,
      payment_method_id: paymentMethodId,
      amount_thb: amountThb,
      coin_amount: coinAmount,
      status: "pending_review",
      submitted_at: new Date().toISOString(),
      customer_note: customerNote,
      idempotency_key: idempotencyKey,
    })
    .select("*")
    .single();
  if (topUpError) throw topUpError;

  const slipBuffer = await slipFile.arrayBuffer();
  const slipHash = sha256Hex(slipBuffer);
  const filePath = `topups/${session.profileId}/${topUp.id}/${Date.now()}-${cleanFileName(slipFile.name)}`;
  const { error: uploadError } = await supabase.storage.from(slipBucketName).upload(filePath, slipFile, { contentType: slipFile.type, upsert: false });
  if (uploadError) {
    await supabase.from("top_up_requests").delete().eq("id", topUp.id);
    return jsonNoStore({ error: uploadError.message }, { status: 500 });
  }

  const { error: slipError } = await supabase.from("payment_slips").insert({
    top_up_request_id: topUp.id,
    storage_provider: "supabase",
    file_path: filePath,
    original_filename: slipFile.name,
    file_sha256: slipHash,
    verification_status: "manual_review",
    provider_response: { source: "manual_top_up_upload" },
  });
  if (slipError) {
    await supabase.storage.from(slipBucketName).remove([filePath]);
    await supabase.from("top_up_requests").delete().eq("id", topUp.id);
    throw slipError;
  }

  await supabase.from("audit_events").insert({
    actor_profile_id: session.profileId,
    event_type: "top_up_submitted",
    top_up_request_id: topUp.id,
    metadata: { public_code: topUp.public_code, amount_thb: amountThb, coin_amount: coinAmount },
  });

  return jsonNoStore({ topUp: toTopUp(topUp) }, { status: 201 });
}
