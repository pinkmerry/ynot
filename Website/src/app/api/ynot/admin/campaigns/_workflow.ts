import "server-only";

import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import {
  AuthorizationError,
  authErrorResponse,
  requireAdminOrOwner,
  requireOwner,
} from "@/lib/auth/require-role";
import type { ResolvedAdminSession } from "@/lib/auth/resolve-current-profile";

type Role = "owner" | "admin";

type RpcResult = { error: { message: string } | null; data?: unknown };

type RpcCall = (
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  admin: ResolvedAdminSession,
  body: Record<string, unknown>,
) => PromiseLike<RpcResult>;

export type WorkflowEndpointOptions = {
  /** Required role; "owner" enforces owner-only */
  role: Role;
  /** Rate-limit bucket key */
  rateBucket: string;
  /** RPC invocation */
  invoke: RpcCall;
};

/**
 * Map known Postgres error messages from workflow RPCs to HTTP statuses.
 * RPCs raise stable codes; anything else is a 500.
 */
function statusForRpcError(message: string): number {
  switch (message) {
    case "campaign_not_found":
      return 404;
    case "invalid_state":
    case "rejection_reason_required":
    case "invalid_spin_mode":
    case "invalid_spin_config_bands_required":
    case "invalid_spin_config_band_missing_fields":
    case "invalid_spin_config_unlock_pct_range":
    case "no_prizes_with_weight":
    case "no_available_prize_units":
    case "campaign_locked":
      return 409;
    case "forbidden_role":
    case "not_draft_owner":
    case "admin_inactive":
      return 403;
    case "admin_not_found":
      return 401;
    default:
      return 500;
  }
}

export async function handleWorkflow(
  request: Request,
  options: WorkflowEndpointOptions,
): Promise<Response> {
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  let admin: ResolvedAdminSession;
  try {
    admin = options.role === "owner" ? await requireOwner() : await requireAdminOrOwner();
  } catch (error) {
    const response = authErrorResponse(error);
    if (response) return response;
    throw error;
  }

  const limited = await enforceRateLimit(
    request,
    `ynot:admin:campaigns:${options.rateBucket}`,
    { limit: 60, windowMs: 60_000 },
    admin.profileId,
  );
  if (limited) return limited;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const supabase = createServiceSupabaseClient();

  try {
    const { error, data } = await options.invoke(supabase, admin, body);
    if (error) {
      return Response.json({ error: error.message }, { status: statusForRpcError(error.message) });
    }
    return Response.json({ ok: true, result: data ?? null });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return Response.json(
        { error: error.code, message: error.message },
        { status: error.status },
      );
    }
    return Response.json(
      { error: "internal_error", message: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export function readString(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}
