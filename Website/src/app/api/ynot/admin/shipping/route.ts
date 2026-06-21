import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { enforceSameOriginMutation } from "@/lib/security/same-origin";
import {
  adminErrorResponse,
  adminRouteErrorLog,
  safeMappedAdminErrorResponse,
} from "@/lib/ynot/admin-api-errors";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const adminShippingErrorMap = {
  shipping_request_not_found: {
    code: "shipping_request_not_found",
    error: "Shipping request not found.",
    status: 404,
  },
  invalid_shipping_transition: {
    code: "invalid_shipping_transition",
    error: "This shipping status change is not allowed.",
    status: 409,
  },
  shipping_tracking_required: {
    code: "shipping_tracking_required",
    error: "Carrier and tracking number are required for shipped requests.",
    status: 400,
  },
  active_admin_required: {
    code: "active_admin_required",
    error: "Active admin access is required.",
    status: 403,
  },
} as const;

function adminShippingErrorMessage(error: unknown) {
  return safeMappedAdminErrorResponse(error, adminShippingErrorMap, {
    code: "shipping_update_failed",
    error: "Could not update shipping request.",
    status: 500,
  });
}

type ShippingStatus = Exclude<Database["public"]["Tables"]["shipping_requests"]["Row"]["status"], "draft">;
const statuses = new Set<ShippingStatus>([
  "preparing",
  "submitted",
  "packing",
  "ready_for_pickup",
  "picked_up",
  "shipped",
  "delivered",
  "cancelled",
]);

function isShippingStatus(value: unknown): value is ShippingStatus {
  return typeof value === "string" && statuses.has(value as ShippingStatus);
}

export async function PATCH(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const crossOrigin = enforceSameOriginMutation(request);
  if (crossOrigin) return crossOrigin;
  const admin = await resolveAdminSession();
  if (!admin) return Response.json({ error: "Admin access is required." }, { status: 403 });
  const limited = await enforceRateLimit(request, "ynot:admin:shipping", { limit: 60, windowMs: 60_000 }, admin.profileId);
  if (limited) return limited;
  const body = await request.json().catch(() => null) as { shippingRequestId?: unknown; status?: unknown; trackingProvider?: unknown; trackingNumber?: unknown; note?: unknown } | null;
  const shippingRequestId = typeof body?.shippingRequestId === "string" ? body.shippingRequestId : "";
  const status = isShippingStatus(body?.status) ? body.status : null;
  if (!shippingRequestId || !status) return Response.json({ error: "shippingRequestId and valid status are required." }, { status: 400 });
  if (status === "preparing") {
    return Response.json(
      { error: "Preparing shipping requests are not admin-actionable yet." },
      { status: 409 },
    );
  }
  if (!UUID_RE.test(shippingRequestId)) {
    return adminErrorResponse("invalid_shipping_request", "Invalid shipping request.", 400);
  }
  const trackingProvider =
    typeof body?.trackingProvider === "string"
      ? body.trackingProvider.trim().slice(0, 120)
      : "";
  const trackingNumber =
    typeof body?.trackingNumber === "string"
      ? body.trackingNumber.trim().slice(0, 120)
      : "";
  if (
    status === "shipped" &&
    (!trackingProvider || !trackingNumber)
  ) {
    return Response.json(
      {
        error:
          "Tracking provider and tracking number are required before marking a shipment shipped.",
      },
      { status: 400 },
    );
  }
  const adminNote = typeof body?.note === "string" ? body.note.slice(0, 500) : null;
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.rpc("update_shipping_request_status", {
    p_shipping_request_id: shippingRequestId,
    p_admin_id: admin.adminId,
    p_status: status,
    p_tracking_provider: trackingProvider || null,
    p_tracking_number: trackingNumber || null,
    p_admin_note: adminNote,
  });
  if (error) {
    adminRouteErrorLog("admin shipping status update failed", error, {
      adminId: admin.adminId,
      shippingRequestId,
      status,
    });
    return adminShippingErrorMessage(error);
  }
  return Response.json({ ok: true, result: data });
}
