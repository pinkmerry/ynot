import "server-only";

import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

type RateLimitOptions = {
  limit: number;
  windowMs: number;
  cost?: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

type RateLimitRpcResult = Promise<{
  data: unknown;
  error: { message?: string } | null;
}>;

type RateLimitRpcClient = {
  rpc: unknown;
};

type RateLimitRpcCaller = (
  name: string,
  args: Record<string, unknown>,
) => RateLimitRpcResult;

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 2000;

function envFlag(name: string) {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function now() {
  return Date.now();
}

function cleanup(currentTime: number) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= currentTime) buckets.delete(key);
  }
  if (buckets.size < MAX_BUCKETS) return;
  for (const key of buckets.keys()) {
    buckets.delete(key);
    if (buckets.size < MAX_BUCKETS) break;
  }
}

function requestIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || forwardedFor || "unknown-ip";
}

function normalizedRateLimitCost(options: RateLimitOptions) {
  const cost = Math.ceil(Number(options.cost ?? 1));
  return Number.isFinite(cost) && cost > 0 ? cost : 1;
}

function checkInMemoryRateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const currentTime = now();
  const cost = normalizedRateLimitCost(options);
  cleanup(currentTime);
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= currentTime) {
    const resetAt = currentTime + options.windowMs;
    buckets.set(key, { count: cost, resetAt });
    return {
      allowed: cost <= options.limit,
      remaining: Math.max(0, options.limit - cost),
      resetAt,
    };
  }

  if (existing.count + cost > options.limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += cost;
  return { allowed: true, remaining: Math.max(0, options.limit - existing.count), resetAt: existing.resetAt };
}

function parseSupabaseLimitResult(value: unknown, fallbackResetAt: number): RateLimitResult | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const allowed = record.allowed;
  const remaining = Number(record.remaining ?? 0);
  const resetAtRaw = record.resetAt;
  const resetAt = typeof resetAtRaw === "string" ? Date.parse(resetAtRaw) : Number(resetAtRaw);
  if (typeof allowed !== "boolean" || !Number.isFinite(remaining)) return null;
  return {
    allowed,
    remaining: Math.max(0, remaining),
    resetAt: Number.isFinite(resetAt) ? resetAt : fallbackResetAt,
  };
}

async function checkSupabaseRateLimit(key: string, options: RateLimitOptions): Promise<RateLimitResult> {
  return checkSupabaseRateLimitWithClient(
    createServiceSupabaseClient(),
    key,
    options,
  );
}

function isMarketplaceSupabaseRateLimitConfigured() {
  return Boolean(
    process.env.MARKETPLACE_SUPABASE_URL?.trim() &&
      process.env.MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

function createMarketplaceRateLimitClient() {
  const supabaseUrl = process.env.MARKETPLACE_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Marketplace Supabase rate-limit configuration");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function checkMarketplaceSupabaseRateLimit(
  key: string,
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  return checkSupabaseRateLimitWithClient(
    createMarketplaceRateLimitClient(),
    key,
    options,
  );
}

async function checkSupabaseRateLimitWithClient(
  supabase: RateLimitRpcClient,
  key: string,
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  const fallbackResetAt = now() + options.windowMs;
  const cost = normalizedRateLimitCost(options);
  const rpc = (supabase.rpc as RateLimitRpcCaller).bind(supabase);
  const { data, error } = await rpc("consume_api_rate_limit_weighted", {
    p_key: key,
    p_limit: options.limit,
    p_window_seconds: Math.max(1, Math.ceil(options.windowMs / 1000)),
    p_cost: cost,
  });
  if (error) throw error;
  return parseSupabaseLimitResult(data, fallbackResetAt) ?? { allowed: false, remaining: 0, resetAt: fallbackResetAt };
}

function responseFromResult(result: RateLimitResult) {
  if (result.allowed) return null;
  const retryAfter = Math.max(1, Math.ceil((result.resetAt - now()) / 1000));
  return Response.json(
    { error: "Too many requests. Please wait and try again.", retryAfterSeconds: retryAfter },
    {
      status: 429,
      headers: {
        "retry-after": String(retryAfter),
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": String(Math.ceil(result.resetAt / 1000)),
      },
    },
  );
}

export function rateLimitKey(request: Request, scope: string, subject?: string | null) {
  return `${scope}:${subject || requestIp(request)}`;
}

export async function enforceRateLimit(request: Request, scope: string, options: RateLimitOptions, subject?: string | null) {
  const key = rateLimitKey(request, scope, subject);
  const backend = process.env.RATE_LIMIT_BACKEND?.trim().toLowerCase();

  if (backend === "marketplace_supabase") {
    if (!isMarketplaceSupabaseRateLimitConfigured()) {
      return Response.json(
        { error: "Marketplace rate-limit backend is not configured." },
        { status: 503 },
      );
    }
    try {
      return responseFromResult(await checkMarketplaceSupabaseRateLimit(key, options));
    } catch (error) {
      console.warn(
        "marketplace_rate_limit_backend_unavailable",
        error instanceof Error ? error.message : String(error),
      );
      return Response.json(
        { error: "Rate-limit backend is unavailable." },
        { status: 503 },
      );
    }
  }

  if (backend === "supabase") {
    if (!isSupabaseConfigured()) {
      return Response.json({ error: "Supabase rate-limit backend is not configured." }, { status: 503 });
    }
    try {
      return responseFromResult(await checkSupabaseRateLimit(key, options));
    } catch (error) {
      console.warn(
        "rate_limit_backend_unavailable",
        error instanceof Error ? error.message : String(error),
      );
      return Response.json(
        { error: "Rate-limit backend is unavailable." },
        { status: 503 },
      );
    }
  }

  if (process.env.NODE_ENV === "production" && !envFlag("RATE_LIMIT_ALLOW_IN_MEMORY_PRODUCTION")) {
    return Response.json(
      { error: "Production rate-limit backend is not configured. Set RATE_LIMIT_BACKEND=supabase after applying the api_rate_limits migration." },
      { status: 503 },
    );
  }

  return responseFromResult(checkInMemoryRateLimit(key, options));
}
