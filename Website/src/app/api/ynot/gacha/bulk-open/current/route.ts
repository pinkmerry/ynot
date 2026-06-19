import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import {
  bulkOpenActiveStatuses,
  toPublicBulkOpenSessionSummary,
} from "@/features/ynot/bulk-open";

export const dynamic = "force-dynamic";

const bulkOpenCurrentRateLimit = {
  scope: "ynot:gacha:bulk-open:current",
  limit: 60,
  windowMs: 60_000,
};

type SupabaseCompatError = { message: string };
type SupabaseCompatResult<T = unknown> = {
  data: T;
  error: SupabaseCompatError | null;
};
type SupabaseCompatQuery<T = unknown> = {
  eq(column: string, value: unknown): SupabaseCompatQuery<T>;
  in(column: string, values: readonly unknown[]): SupabaseCompatQuery<T>;
  is(column: string, value: unknown): SupabaseCompatQuery<T>;
  limit(count: number): SupabaseCompatQuery<T>;
  maybeSingle(): Promise<SupabaseCompatResult<T | null>>;
  order(
    column: string,
    options?: { ascending?: boolean },
  ): SupabaseCompatQuery<T>;
  select(columns: string): SupabaseCompatQuery<T>;
};
type SupabaseCompatClient = {
  from(table: string): SupabaseCompatQuery<unknown>;
};

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  }
  const session = await resolveCurrentProfile();
  if (!session?.profileId) {
    return Response.json({ error: "Login is required." }, { status: 401 });
  }
  const limited = await enforceRateLimit(
    request,
    bulkOpenCurrentRateLimit.scope,
    { limit: bulkOpenCurrentRateLimit.limit, windowMs: bulkOpenCurrentRateLimit.windowMs },
    session.profileId,
  );
  if (limited) return limited;

  const supabase = createServiceSupabaseClient() as unknown as SupabaseCompatClient;
  const sessionSelect =
    "public_code,status,target_slots,processed_slots,open_items_awarded,collection_items_created,total_cost_coins,highlight_rewards_public";

  const { data: activeSession, error: activeError } = await supabase
    .from("gacha_bulk_open_sessions")
    .select(sessionSelect)
    .eq("profile_id", session.profileId)
    .in("status", [...bulkOpenActiveStatuses])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (activeError) {
    return Response.json(
      { error: "Could not load Pull All status. Please try again." },
      { status: 409 },
    );
  }
  if (activeSession) {
    return Response.json({
      session: toPublicBulkOpenSessionSummary(activeSession),
    });
  }

  const { data: unseenCompletedSession, error: completedError } = await supabase
    .from("gacha_bulk_open_sessions")
    .select(sessionSelect)
    .eq("profile_id", session.profileId)
    .eq("status", "completed")
    .is("highlights_seen_at", null)
    .order("completed_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (completedError) {
    return Response.json(
      { error: "Could not load Pull All status. Please try again." },
      { status: 409 },
    );
  }

  return Response.json({
    session: toPublicBulkOpenSessionSummary(unseenCompletedSession),
  });
}
