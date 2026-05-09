import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

type ShippingStatus = Exclude<Database["public"]["Tables"]["shipping_requests"]["Row"]["status"], "draft">;
const statuses = new Set<ShippingStatus>(["submitted", "packing", "shipped", "delivered", "cancelled"]);

function isShippingStatus(value: unknown): value is ShippingStatus {
  return typeof value === "string" && statuses.has(value as ShippingStatus);
}

export async function PATCH(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const admin = await resolveAdminSession();
  if (!admin) return Response.json({ error: "Admin access is required." }, { status: 403 });
  const limited = await enforceRateLimit(request, "ynot:admin:shipping", { limit: 60, windowMs: 60_000 }, admin.profileId);
  if (limited) return limited;
  const body = await request.json().catch(() => null) as { shippingRequestId?: unknown; status?: unknown; trackingProvider?: unknown; trackingNumber?: unknown; note?: unknown } | null;
  const shippingRequestId = typeof body?.shippingRequestId === "string" ? body.shippingRequestId : "";
  const status = isShippingStatus(body?.status) ? body.status : null;
  if (!shippingRequestId || !status) return Response.json({ error: "shippingRequestId and valid status are required." }, { status: 400 });
  const trackingProvider = typeof body?.trackingProvider === "string" ? body.trackingProvider.slice(0, 120) : null;
  const trackingNumber = typeof body?.trackingNumber === "string" ? body.trackingNumber.slice(0, 120) : null;
  const adminNote = typeof body?.note === "string" ? body.note.slice(0, 500) : null;
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.rpc("update_shipping_request_status", {
    p_shipping_request_id: shippingRequestId,
    p_admin_id: admin.adminId,
    p_status: status,
    p_tracking_provider: trackingProvider,
    p_tracking_number: trackingNumber,
    p_admin_note: adminNote,
  });
  if (error) return Response.json({ error: error.message }, { status: 409 });
  return Response.json({ ok: true, result: data });
}
