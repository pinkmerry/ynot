import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { previewCurrentConversionForProfile } from "@/features/ynot/local-preview-rewards";
import { isDevAuthAllowed } from "@/lib/security/dev-auth";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { presentConversionCurrent } from "@/lib/ynot/reward-action-presenters";

export const dynamic = "force-dynamic";

const currentConversionRateLimit = {
  scope: "ynot:convert:current",
  limit: 60,
  windowMs: 60_000,
};

const activeConversionStatuses = ["queued", "processing", "retry_required"] as const;
const terminalConversionStatuses = ["completed", "failed"] as const;

type SupabaseCompatError = { message: string };
type SupabaseCompatResult<T = unknown> = {
  data: T;
  error: SupabaseCompatError | null;
};
type SupabaseCompatQuery<T = unknown> = {
  eq(column: string, value: unknown): SupabaseCompatQuery<T>;
  in(column: string, values: readonly unknown[]): SupabaseCompatQuery<T>;
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
    currentConversionRateLimit.scope,
    { limit: currentConversionRateLimit.limit, windowMs: currentConversionRateLimit.windowMs },
    session.profileId,
  );
  if (limited) return limited;

  if (
    isDevAuthAllowed() &&
    session.authUserId === "preview-user"
  ) {
    return Response.json({
      conversion: previewCurrentConversionForProfile(session.profileId),
    });
  }

  const supabase = createServiceSupabaseClient() as unknown as SupabaseCompatClient;
  const conversionSelect =
    "status,item_count,total_coins,converted_count,credited_total_coins,updated_at,completed_at";

  const { data: activeConversion, error: activeError } = await supabase
    .from("reward_conversion_jobs")
    .select(conversionSelect)
    .eq("profile_id", session.profileId)
    .in("status", [...activeConversionStatuses])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (activeError) {
    return Response.json(
      { error: "Could not load conversion status. Please try again." },
      { status: 409 },
    );
  }
  if (activeConversion) {
    return Response.json({ conversion: presentConversionCurrent(activeConversion) });
  }

  const { data: terminalConversion, error: terminalError } = await supabase
    .from("reward_conversion_jobs")
    .select(conversionSelect)
    .eq("profile_id", session.profileId)
    .in("status", [...terminalConversionStatuses])
    .order("completed_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (terminalError) {
    return Response.json(
      { error: "Could not load conversion status. Please try again." },
      { status: 409 },
    );
  }

  return Response.json({
    conversion: presentConversionCurrent(terminalConversion),
  });
}
