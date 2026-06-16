import { revalidateTag } from "next/cache";
import { requireAdminRoleResponse } from "@/lib/auth/admin-role-guard";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { enforceSameOriginMutation } from "@/lib/security/same-origin";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import {
  adminErrorResponse,
  adminRouteErrorLog,
  safeMappedAdminErrorResponse,
} from "@/lib/ynot/admin-api-errors";
import type { YnotPaymentMethod } from "@/features/ynot/types";

export const dynamic = "force-dynamic";

type PaymentMethodRow = Database["public"]["Tables"]["payment_methods"]["Row"];

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

function toAdminPaymentMethod(row: PaymentMethodRow): YnotPaymentMethod {
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    displayName: row.display_name,
    bankName: row.bank_name,
    accountName: row.account_name,
    accountNumber: row.account_number,
    promptpayId: row.promptpay_id,
    qrImagePath: row.qr_image_path,
    instructions: row.instructions,
    isActive: row.is_active,
    sortOrder: row.sort_order,
  };
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return adminErrorResponse("supabase_not_configured", "Supabase is not configured.", 503);
  const crossOrigin = enforceSameOriginMutation(request);
  if (crossOrigin) return crossOrigin;
  const admin = await resolveAdminSession();
  if (!admin) return adminErrorResponse("admin_required", "Admin access is required.", 403);
  const roleFailure = requireAdminRoleResponse(admin, ["owner", "admin"]);
  if (roleFailure) return roleFailure;
  const limited = await enforceRateLimit(request, "ynot:admin:payment-methods", { limit: 30, windowMs: 60_000 }, admin.profileId);
  if (limited) return limited;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const code = clean(body?.code, 60)?.toLowerCase().replace(/[^a-z0-9._-]+/g, "-") ?? null;
  const displayName = clean(body?.displayName, 120);
  const type = body?.type === "promptpay_qr" ? "promptpay_qr" : "bank_transfer";
  if (!code || !displayName) return adminErrorResponse("payment_method_validation_failed", "Code and display name are required.", 400);
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
  if (error) {
    adminRouteErrorLog("admin payment method save failed", error, {
      adminId: admin.adminId,
      paymentMethodId: typeof body?.id === "string" ? body.id : null,
      code,
    });
    return safeMappedAdminErrorResponse(error, {}, {
      code: "payment_method_save_failed",
      error: "Could not save payment method.",
      status: 500,
    });
  }
  await supabase.from("audit_events").insert({ actor_admin_id: admin.adminId, event_type: "payment_method_upserted", metadata: { code, paymentMethodId: data.id } });
  revalidateTag("payment-methods", "max");
  return Response.json({ paymentMethod: toAdminPaymentMethod(data) });
}
