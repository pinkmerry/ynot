import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

const statuses = new Set(["submitted", "packing", "shipped", "delivered", "cancelled"]);
type ShippingStatus = Database["public"]["Tables"]["shipping_requests"]["Row"]["status"];

export async function PATCH(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const admin = await resolveAdminSession();
  if (!admin) return Response.json({ error: "Admin access is required." }, { status: 403 });
  const body = await request.json().catch(() => null) as { shippingRequestId?: unknown; status?: unknown; trackingProvider?: unknown; trackingNumber?: unknown; note?: unknown } | null;
  const shippingRequestId = typeof body?.shippingRequestId === "string" ? body.shippingRequestId : "";
  const status = typeof body?.status === "string" && statuses.has(body.status) ? body.status as ShippingStatus : null;
  if (!shippingRequestId || !status) return Response.json({ error: "shippingRequestId and valid status are required." }, { status: 400 });
  const patch = {
    status,
    tracking_provider: typeof body?.trackingProvider === "string" ? body.trackingProvider.slice(0, 120) : null,
    tracking_number: typeof body?.trackingNumber === "string" ? body.trackingNumber.slice(0, 120) : null,
    admin_note: typeof body?.note === "string" ? body.note.slice(0, 500) : null,
  };
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase.from("shipping_requests").update(patch).eq("id", shippingRequestId);
  if (error) return Response.json({ error: error.message }, { status: 409 });
  if (status === "shipped" || status === "delivered" || status === "cancelled") {
    const { data: items } = await supabase.from("shipping_request_items").select("collection_item_id").eq("shipping_request_id", shippingRequestId);
    const ids = (items ?? []).map((item) => item.collection_item_id);
    if (ids.length) {
      await supabase
        .from("collection_items")
        .update({ status: status === "cancelled" ? "owned" : "shipped" })
        .in("id", ids);
    }
  }
  await supabase.from("audit_events").insert({ actor_admin_id: admin.adminId, event_type: "shipping_status_updated", shipping_request_id: shippingRequestId, metadata: patch });
  return Response.json({ ok: true });
}
