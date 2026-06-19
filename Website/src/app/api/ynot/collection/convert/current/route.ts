import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const currentConversionRateLimit = {
  scope: "ynot:convert:current",
  limit: 60,
  windowMs: 60_000,
};

const activeConversionStatuses = ["queued", "processing", "retry_required"] as const;

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function toPublicConversion(row: unknown) {
  if (!isRecord(row)) return null;
  const status = typeof row.status === "string" ? row.status : "queued";
  const itemCount = Number(row.item_count);
  const totalCoins = Number(row.total_coins);
  const convertedCount = Number(row.converted_count);
  const creditedTotalCoins = Number(row.credited_total_coins);
  return {
    status,
    itemCount: Number.isFinite(itemCount) ? Math.max(0, Math.round(itemCount)) : 0,
    totalCoins: Number.isFinite(totalCoins) ? Math.max(0, Math.round(totalCoins)) : 0,
    convertedCount: Number.isFinite(convertedCount)
      ? Math.max(0, Math.round(convertedCount))
      : 0,
    creditedTotalCoins: Number.isFinite(creditedTotalCoins)
      ? Math.max(0, Math.round(creditedTotalCoins))
      : 0,
    completed: status === "completed",
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
    completedAt: typeof row.completed_at === "string" ? row.completed_at : null,
  };
}

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
    return Response.json({ conversion: toPublicConversion(activeConversion) });
  }

  const { data: completedConversion, error: completedError } = await supabase
    .from("reward_conversion_jobs")
    .select(conversionSelect)
    .eq("profile_id", session.profileId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (completedError) {
    return Response.json(
      { error: "Could not load conversion status. Please try again." },
      { status: 409 },
    );
  }

  return Response.json({
    conversion: toPublicConversion(completedConversion),
  });
}
