import { revalidateTag } from "next/cache";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

function clean(value: unknown, max: number) {
  return typeof value === "string" && value.trim() ? value.trim().replace(/\s+/g, " ").slice(0, max) : null;
}

function cleanPath(value: unknown, max: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function cleanSortOrder(value: unknown) {
  const order = typeof value === "number" ? value : Number(value);
  return Number.isInteger(order) && order >= 0 && order <= 10_000 ? order : 100;
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const admin = await resolveAdminSession();
  if (!admin) return Response.json({ error: "Admin access is required." }, { status: 403 });
  const limited = await enforceRateLimit(request, "ynot:admin:payment-methods", { limit: 30, windowMs: 60_000 }, admin.profileId);
  if (limited) return limited;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const code = clean(body?.code, 60)?.toLowerCase().replace(/[^a-z0-9._-]+/g, "-") ?? null;
  const displayName = clean(body?.displayName, 120);
  const type = body?.type === "promptpay_qr" ? "promptpay_qr" : "bank_transfer";
  if (!code || !displayName) return Response.json({ error: "Code and display name are required." }, { status: 400 });
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("payment_methods")
    .upsert({
      code,
      type,
      display_name: displayName,
      bank_name: clean(body?.bankName, 120),
      account_name: clean(body?.accountName, 120),
      account_number: clean(body?.accountNumber, 80),
      promptpay_id: clean(body?.promptpayId, 80),
      qr_image_path: cleanPath(body?.qrImagePath, 1000),
      instructions: clean(body?.instructions, 500),
      sort_order: cleanSortOrder(body?.sortOrder),
      is_active: body?.isActive !== false,
    }, { onConflict: "code" })
    .select("*")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 409 });
  await supabase.from("audit_events").insert({ actor_admin_id: admin.adminId, event_type: "payment_method_upserted", metadata: { code, paymentMethodId: data.id } });
  revalidateTag("payment-methods", "max");
  return Response.json({ paymentMethod: data });
}
