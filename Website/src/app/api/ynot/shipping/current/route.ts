import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { presentShippingCurrent } from "@/lib/ynot/reward-action-presenters";

export const dynamic = "force-dynamic";

const currentShippingRateLimit = {
  scope: "ynot:shipping:current",
  limit: 60,
  windowMs: 60_000,
};

const activeShippingStatuses = ["preparing", "processing", "retry_required"] as const;

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
    currentShippingRateLimit.scope,
    { limit: currentShippingRateLimit.limit, windowMs: currentShippingRateLimit.windowMs },
    session.profileId,
  );
  if (limited) return limited;

  const supabase = createServiceSupabaseClient() as unknown as SupabaseCompatClient;
  const shippingSelect =
    "status,shipping_request_id,public_code,item_count,prepared_count,total_coin_value,updated_at,completed_at";

  const { data: activeShipping, error: activeError } = await supabase
    .from("shipping_request_jobs")
    .select(shippingSelect)
    .eq("profile_id", session.profileId)
    .in("status", [...activeShippingStatuses])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (activeError) {
    return Response.json(
      { error: "Could not load shipping status. Please try again." },
      { status: 409 },
    );
  }
  if (activeShipping) {
    return Response.json({ shipping: presentShippingCurrent(activeShipping) });
  }

  const { data: submittedShipping, error: submittedError } = await supabase
    .from("shipping_request_jobs")
    .select(shippingSelect)
    .eq("profile_id", session.profileId)
    .eq("status", "submitted")
    .order("completed_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (submittedError) {
    return Response.json(
      { error: "Could not load shipping status. Please try again." },
      { status: 409 },
    );
  }

  return Response.json({
    shipping: presentShippingCurrent(submittedShipping),
  });
}
