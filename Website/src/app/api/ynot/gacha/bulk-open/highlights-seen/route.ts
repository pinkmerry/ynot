import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { requireVerifiedAnchor } from "@/lib/auth/verified-anchor";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { enforceSameOriginMutation } from "@/lib/security/same-origin";

export const dynamic = "force-dynamic";

const bulkOpenHighlightsSeenRateLimit = {
  scope: "ynot:gacha:bulk-open:highlights-seen",
  limit: 20,
  windowMs: 60_000,
};

type SupabaseCompatClient = {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  }
  const crossOrigin = enforceSameOriginMutation(request);
  if (crossOrigin) return crossOrigin;
  const session = await resolveCurrentProfile();
  if (!session?.profileId) {
    return Response.json({ error: "Login is required." }, { status: 401 });
  }
  const blocked = await requireVerifiedAnchor(session);
  if (blocked) return blocked;
  const limited = await enforceRateLimit(
    request,
    bulkOpenHighlightsSeenRateLimit.scope,
    {
      limit: bulkOpenHighlightsSeenRateLimit.limit,
      windowMs: bulkOpenHighlightsSeenRateLimit.windowMs,
    },
    session.profileId,
  );
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as { publicCode?: unknown } | null;
  const publicCode = typeof body?.publicCode === "string" ? body.publicCode.trim() : "";
  if (!/^BO-\d+$/.test(publicCode)) {
    return Response.json({ error: "Valid Pull All code is required." }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient() as unknown as SupabaseCompatClient;
  const { data, error } = await supabase.rpc("mark_bulk_open_highlights_seen", {
    p_profile_id: session.profileId,
    p_public_code: publicCode,
  });
  if (error) {
    return Response.json(
      { error: "Could not update Pull All highlights. Please try again." },
      { status: 409 },
    );
  }
  const result =
    data && typeof data === "object" ? (data as { ok?: unknown; updated?: unknown }) : null;
  if (result?.ok !== true) {
    return Response.json(
      { error: "Pull All highlights are not ready yet." },
      { status: 409 },
    );
  }

  return Response.json({ ok: true, updated: result.updated === true });
}
