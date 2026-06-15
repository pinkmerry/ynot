import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { getAdminUserDirectory } from "@/features/ynot/data";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { emitSecurityAlert } from "@/lib/security/alerts";

export const dynamic = "force-dynamic";

type UserAdminBody = {
  profileId?: unknown;
  role?: unknown;
  isActive?: unknown;
};

function text(value: unknown, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function adminRole(value: unknown) {
  if (value === "owner" || value === "admin" || value === "staff") return value;
  return null;
}

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return Response.json(
      { error: "Supabase is not configured." },
      { status: 503 },
    );
  }
  const admin = await resolveAdminSession();
  if (!admin) {
    return Response.json({ error: "Admin access is required." }, { status: 403 });
  }
  const limited = await enforceRateLimit(
    request,
    "ynot:admin:users:read",
    { limit: 120, windowMs: 60_000 },
    admin.profileId,
  );
  if (limited) return limited;

  const url = new URL(request.url);
  const result = await getAdminUserDirectory({
    q: url.searchParams.get("q") ?? "",
    role: url.searchParams.get("role") ?? "all",
    status: url.searchParams.get("status") ?? "all",
    page: url.searchParams.get("page") ?? "1",
    pageSize: url.searchParams.get("pageSize") ?? "50",
  });
  const response = Response.json({ result });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function PATCH(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const admin = await resolveAdminSession();
  if (!admin) return Response.json({ error: "Admin access is required." }, { status: 403 });
  const limited = await enforceRateLimit(request, "ynot:admin:users", { limit: 30, windowMs: 60_000 }, admin.profileId);
  if (limited) return limited;
  if (admin.adminRole !== "owner") {
    return Response.json({ error: "Only an owner can manage admin roles." }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as UserAdminBody | null;
  const profileId = text(body?.profileId);
  const role = adminRole(body?.role);
  const isActive = body?.isActive !== false;
  if (!profileId || !role) return Response.json({ error: "profileId and role are required." }, { status: 400 });
  if (profileId === admin.profileId && !isActive) return Response.json({ error: "You cannot deactivate your own admin access." }, { status: 409 });

  const supabase = createServiceSupabaseClient();

  // Load the target's current admin row before mutating so audit events can
  // report the previous role and active state.
  const { data: targetCurrent, error: targetLoadError } = await supabase
    .from("admin_users")
    .select("id,role,is_active")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (targetLoadError) return Response.json({ error: targetLoadError.message }, { status: 500 });

  const { error } = await supabase.from("admin_users").upsert(
    {
      profile_id: profileId,
      role,
      is_active: isActive,
    },
    { onConflict: "profile_id" },
  );
  if (error) return Response.json({ error: error.message }, { status: 409 });

  await supabase.from("audit_events").insert({
    actor_admin_id: admin.adminId,
    actor_profile_id: admin.profileId,
    event_type: "admin_role_updated",
    metadata: {
      targetProfileId: profileId,
      role,
      isActive,
      previousRole: targetCurrent?.role ?? null,
      previousIsActive: targetCurrent?.is_active ?? null,
    },
  });

  // Fire a security alert on every admin-role mutation. Owner grants and
  // deactivations are the highest-blast-radius events in the system; cheaper
  // to be noisy than to miss one.
  emitSecurityAlert({
    event:
      role === "owner" && targetCurrent?.role !== "owner"
        ? "owner_role_granted"
        : !isActive
          ? "admin_role_revoked"
          : "admin_role_granted",
    actor: {
      profileId: admin.profileId,
      adminId: admin.adminId,
      role: admin.adminRole,
    },
    target: { profileId },
    details: {
      newRole: role,
      isActive,
      previousRole: targetCurrent?.role ?? null,
      previousIsActive: targetCurrent?.is_active ?? null,
    },
  });

  return Response.json({ ok: true });
}
