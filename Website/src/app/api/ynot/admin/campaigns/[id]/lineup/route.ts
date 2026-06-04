import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { getAdminCampaignPrizeLineup } from "@/features/ynot/data";

export const dynamic = "force-dynamic";

// Admin prize lineup for one campaign, fetched client-side by the pack editor so
// the (potentially heavy) live-pack lineup load runs in its own request with a
// fresh Cloudflare Worker subrequest budget instead of being starved by the
// editor page's dashboard slice.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  }
  const admin = await resolveAdminSession();
  if (!admin) {
    return Response.json({ error: "Admin access is required." }, { status: 403 });
  }
  const limited = await enforceRateLimit(
    request,
    "ynot:admin:campaign-lineup",
    { limit: 120, windowMs: 60_000 },
    admin.profileId,
  );
  if (limited) return limited;
  const { id } = await params;
  const prizeLineup = await getAdminCampaignPrizeLineup(id);
  return Response.json({ prizeLineup });
}
