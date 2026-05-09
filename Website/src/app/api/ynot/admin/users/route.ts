import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/security/rate-limit";

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

export async function PATCH(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const admin = await resolveAdminSession();
  if (!admin) return Response.json({ error: "Admin access is required." }, { status: 403 });
  const limited = await enforceRateLimit(request, "ynot:admin:users", { limit: 30, windowMs: 60_000 }, admin.profileId);
  if (limited) return limited;

  const body = await request.json().catch(() => null) as UserAdminBody | null;
  const profileId = text(body?.profileId);
  const role = adminRole(body?.role);
  const isActive = body?.isActive !== false;
  if (!profileId || !role) return Response.json({ error: "profileId and role are required." }, { status: 400 });
  if (role === "owner" && admin.adminRole !== "owner") return Response.json({ error: "Only an owner can grant owner role." }, { status: 403 });
  if (profileId === admin.profileId && !isActive) return Response.json({ error: "You cannot deactivate your own admin access." }, { status: 409 });

  const supabase = createServiceSupabaseClient();
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
    actor_profile_id: profileId,
    event_type: "admin_role_updated",
    metadata: { profileId, role, isActive },
  });

  return Response.json({ ok: true });
}
