import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { emitSecurityAlert } from "@/lib/security/alerts";
import type { Database } from "@/lib/supabase/types";
import type { SlipVerificationStatus } from "@/lib/lucky-draw/types";

type ServiceClient = SupabaseClient<Database>;

export const manualApprovableSlipStatuses = new Set<SlipVerificationStatus>([
  "valid",
  "manual_review",
]);
const autoApprovableSlipStatus: SlipVerificationStatus = "valid";

// Approvals at or above this THB threshold trigger a security alert. Set at
// 1000 THB so every Collector and Whale approval (the two highest packages
// at 1000 and 3000 THB respectively) lands in the security inbox.
const LARGE_TOP_UP_THB_THRESHOLD = 1000;

// Per-profile velocity: when the SAME profile gets approved this many
// top-ups (or more) inside the rolling window, fire a separate alert.
const PROFILE_VELOCITY_WINDOW_MS = 24 * 60 * 60 * 1000;
const PROFILE_VELOCITY_COUNT_THRESHOLD = 2;

export type ApprovalActor = {
  profileId?: string | null;
  adminId?: string | null;
  role?: string | null;
};

export type AutoApprovalAdmin = {
  id: string;
  profileId: string | null;
  role: "owner" | "admin" | "staff";
};

export function canAutoApproveVerifiedSlip({
  finalStatus,
  providerAutoApprove,
}: {
  finalStatus: SlipVerificationStatus;
  providerAutoApprove: boolean;
}) {
  return providerAutoApprove && finalStatus === autoApprovableSlipStatus;
}

export async function resolveAutoTopUpAdmin(
  supabase: ServiceClient,
): Promise<AutoApprovalAdmin | null> {
  const configuredAdminId = process.env.YNOT_AUTO_APPROVE_ADMIN_ID?.trim();
  if (configuredAdminId) {
    const { data, error } = await supabase
      .from("admin_users")
      .select("id,profile_id,role")
      .eq("id", configuredAdminId)
      .eq("is_active", true)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      console.warn("top_up_auto_approval_admin_not_found", configuredAdminId);
      return null;
    }

    return { id: data.id, profileId: data.profile_id, role: data.role };
  }

  const { data, error } = await supabase
    .from("admin_users")
    .select("id,profile_id,role")
    .eq("is_active", true)
    .in("role", ["owner", "admin", "staff"])
    .limit(25);

  if (error) throw error;
  const admins = data ?? [];
  const selected =
    admins.find((admin) => admin.role === "owner") ??
    admins.find((admin) => admin.role === "admin") ??
    admins.find((admin) => admin.role === "staff") ??
    null;

  return selected
    ? { id: selected.id, profileId: selected.profile_id, role: selected.role }
    : null;
}

export async function emitTopUpApprovalRiskAlerts(
  supabase: ServiceClient,
  {
    actor,
    topUpId,
    approvalMode,
  }: {
    actor: ApprovalActor;
    topUpId: string;
    approvalMode: "manual" | "slip2go_auto";
  },
) {
  const { data: approved } = await supabase
    .from("top_up_requests")
    .select("amount_thb,profile_id,public_code")
    .eq("id", topUpId)
    .maybeSingle();

  if (approved && Number(approved.amount_thb ?? 0) >= LARGE_TOP_UP_THB_THRESHOLD) {
    emitSecurityAlert({
      event: "top_up_approved_large",
      actor,
      target: { profileId: approved.profile_id },
      details: {
        publicCode: approved.public_code,
        amountThb: approved.amount_thb,
        threshold: LARGE_TOP_UP_THB_THRESHOLD,
        approvalMode,
      },
    });
  }

  if (!approved?.profile_id) return;

  const windowStart = new Date(
    Date.now() - PROFILE_VELOCITY_WINDOW_MS,
  ).toISOString();
  const { count: recentApprovals, error: velocityError } = await supabase
    .from("coin_ledger")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", approved.profile_id)
    .eq("entry_type", "top_up")
    .gte("created_at", windowStart);

  if (velocityError) {
    console.warn("top_up_velocity_lookup_failed", velocityError.message ?? "unknown");
    return;
  }

  if (
    typeof recentApprovals === "number" &&
    recentApprovals >= PROFILE_VELOCITY_COUNT_THRESHOLD
  ) {
    emitSecurityAlert({
      event: "top_up_velocity_unusual",
      actor,
      target: { profileId: approved.profile_id },
      details: {
        publicCode: approved.public_code,
        amountThb: approved.amount_thb,
        totalApprovalsLast24h: recentApprovals,
        windowHours: PROFILE_VELOCITY_WINDOW_MS / (60 * 60 * 1000),
        threshold: PROFILE_VELOCITY_COUNT_THRESHOLD,
        approvalMode,
      },
    });
  }
}
