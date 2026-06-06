import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { getLivePackMonitor } from "@/features/ynot/data";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSupabaseConfigured()) {
    return Response.json(
      { error: "Supabase is not configured." },
      { status: 503 },
    );
  }
  const admin = await resolveAdminSession();
  if (!admin) {
    return Response.json(
      { error: "Admin access is required." },
      { status: 403 },
    );
  }
  const limited = await enforceRateLimit(
    request,
    "ynot:admin:live-pack-monitor",
    { limit: 30, windowMs: 60_000 },
    admin.profileId,
  );
  if (limited) return limited;
  const { id } = await params;
  const monitor = await getLivePackMonitor(id);
  if (!monitor) {
    return Response.json({ error: "Monitor data not found." }, { status: 404 });
  }
  return Response.json({ ok: true, monitor });
}
