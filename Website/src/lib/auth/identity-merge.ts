import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export async function findVerifiedEmailProfile(
  email: string,
  excludeProfileId?: string | null,
): Promise<ProfileRow | null> {
  const supabase = createServiceSupabaseClient();
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("email", normalized)
    .not("email_verified_at", "is", null)
    .eq("profile_status", "active")
    .limit(2);

  if (error) {
    if (error.code === "42703") return null; // column missing pre-migration
    throw error;
  }
  if (!data || data.length === 0) return null;
  if (data.length > 1) return null; // ambiguous — never auto-merge

  const candidate = data[0];
  if (excludeProfileId && candidate.id === excludeProfileId) return null;
  return candidate;
}

export async function stampVerifiedEmail(profileId: string, email: string) {
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      email: email.trim().toLowerCase(),
      email_verified_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    })
    .eq("id", profileId);
  if (error) throw error;
}

export async function mergeProfiles(
  sourceProfileId: string,
  targetProfileId: string,
  reason: string,
): Promise<{ targetProfileId: string }> {
  if (sourceProfileId === targetProfileId) return { targetProfileId };
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.rpc("link_identity_to_existing_profile", {
    p_source_profile_id: sourceProfileId,
    p_target_profile_id: targetProfileId,
    p_reason: reason,
  });
  if (error) throw error;
  return { targetProfileId: (data as string) ?? targetProfileId };
}

export type EmailMatchOutcome =
  | { kind: "stamped"; profileId: string }
  | { kind: "merged"; profileId: string; mergedFrom: string };

export async function resolveEmailAnchor(
  currentProfileId: string,
  email: string,
  reason: string,
): Promise<EmailMatchOutcome> {
  const target = await findVerifiedEmailProfile(email, currentProfileId);
  if (target && target.id !== currentProfileId) {
    const { targetProfileId } = await mergeProfiles(currentProfileId, target.id, reason);
    return { kind: "merged", profileId: targetProfileId, mergedFrom: currentProfileId };
  }
  await stampVerifiedEmail(currentProfileId, email);
  return { kind: "stamped", profileId: currentProfileId };
}
