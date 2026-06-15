import { getAdminUserDetail, normalizeAdminUser360Query } from "@/features/ynot/data";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type UserDetailRouteContext = {
  // RouteContext<"/api/ynot/admin/users/[profileId]/detail">
  params: Promise<{ profileId: string }>;
};

export async function GET(
  request: Request,
  ctx: UserDetailRouteContext,
) {
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
    "ynot:admin:user360:read",
    { limit: 120, windowMs: 60_000 },
    admin.profileId,
  );
  if (limited) return limited;

  const { profileId } = await ctx.params;
  if (!UUID_RE.test(profileId)) {
    return Response.json({ error: "Invalid profile id." }, { status: 400 });
  }

  const url = new URL(request.url);
  const detailQuery = normalizeAdminUser360Query({
    section: url.searchParams.get("section") ?? "overview",
    page: url.searchParams.get("page") ?? "1",
    pageSize: url.searchParams.get("pageSize") ?? "100",
  });
  const detail = await getAdminUserDetail(profileId, detailQuery);
  if (!detail) {
    return Response.json({ error: "User was not found." }, { status: 404 });
  }

  const response = Response.json({ result: detail });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
