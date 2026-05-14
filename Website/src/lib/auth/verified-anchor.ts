import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { ResolvedProfileSession } from "@/lib/auth/resolve-current-profile";

const FLAG_NAME = "REQUIRE_VERIFIED_ANCHOR_FOR_PAID_ACTIONS";

function flagEnabled() {
  const v = process.env[FLAG_NAME]?.trim().toLowerCase();
  // default ON in production, OFF locally so dev can still test paid flows
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return process.env.NODE_ENV === "production";
}

export async function requireVerifiedAnchor(
  session: ResolvedProfileSession,
): Promise<Response | null> {
  if (!flagEnabled()) return null;

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("email_verified_at,phone_verified_at,line_user_id")
    .eq("id", session.profileId)
    .maybeSingle();

  // Pre-migration schema returns 42703 — fail open so paid actions don't break
  // before Phase 1 has been applied to the database.
  if (error && error.code !== "42703") throw error;
  // LINE accounts are SMS-verified by LINE itself at signup time, so a linked
  // line_user_id is treated as a sufficient anchor for paid actions.
  const verified =
    data?.email_verified_at || data?.phone_verified_at || data?.line_user_id;
  if (verified) return null;

  return Response.json(
    {
      error: "Please verify your email before continuing.",
      code: "verified_anchor_required",
      action: { type: "redirect", href: "/complete-profile" },
    },
    {
      status: 403,
      headers: { "cache-control": "no-store" },
    },
  );
}
