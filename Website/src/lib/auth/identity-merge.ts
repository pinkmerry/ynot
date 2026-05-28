import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/types";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type IdentityRow = Database["public"]["Tables"]["user_identities"]["Row"];

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

async function emailIdentityFor(email: string): Promise<IdentityRow | null> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("user_identities")
    .select("*")
    .eq("provider", "email")
    .eq("provider_subject", email.trim().toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function createIdentityReviewRequest({
  sourceProfileId,
  targetProfileId,
  requestedByProfileId,
  reason,
  email,
  identityId,
}: {
  sourceProfileId: string;
  targetProfileId: string;
  requestedByProfileId: string;
  reason: string;
  email: string;
  identityId?: string | null;
}) {
  const supabase = createServiceSupabaseClient();
  const { data: existing, error: existingError } = await supabase
    .from("account_merge_requests")
    .select("id")
    .eq("source_profile_id", sourceProfileId)
    .eq("target_profile_id", targetProfileId)
    .eq("status", "pending")
    .limit(1);

  if (existingError) throw existingError;
  const riskSummary = {
    mode: "identity_review_only",
    conflict: "verified_email_matches_existing_profile",
    provider: "email",
    providerSubject: email,
    identityId: identityId ?? null,
    email,
  } as Json;

  if (existing?.[0]) {
    const { error: updateError } = await supabase
      .from("account_merge_requests")
      .update({ risk_summary: riskSummary })
      .eq("id", existing[0].id);
    if (updateError) throw updateError;
    return existing[0].id;
  }

  const { data: mergeRequest, error: insertError } = await supabase
    .from("account_merge_requests")
    .insert({
      requested_by_profile_id: requestedByProfileId,
      source_profile_id: sourceProfileId,
      target_profile_id: targetProfileId,
      reason,
      risk_summary: riskSummary,
    })
    .select("id")
    .single();
  if (insertError) throw insertError;

  await supabase.from("account_merge_events").insert({
    merge_request_id: mergeRequest.id,
    event_type: "created",
    actor_profile_id: requestedByProfileId,
    metadata: {
      mode: "identity_review_only",
      sourceProfileId,
      targetProfileId,
      reason,
      email,
    } as Json,
  });

  return mergeRequest.id;
}

export type EmailMatchOutcome =
  | { kind: "stamped"; profileId: string }
  | {
      kind: "review_required";
      profileId: string;
      reviewRequestId: string;
      sourceProfileId: string;
      targetProfileId: string;
    };

export async function resolveEmailAnchor(
  currentProfileId: string,
  email: string,
  reason: string,
): Promise<EmailMatchOutcome> {
  const target = await findVerifiedEmailProfile(email, currentProfileId);
  if (target && target.id !== currentProfileId) {
    const normalized = email.trim().toLowerCase();
    const identity = await emailIdentityFor(normalized);
    const reviewRequestId = await createIdentityReviewRequest({
      sourceProfileId: target.id,
      targetProfileId: currentProfileId,
      requestedByProfileId: currentProfileId,
      reason,
      email: normalized,
      identityId: identity?.id ?? null,
    });
    return {
      kind: "review_required",
      profileId: currentProfileId,
      reviewRequestId,
      sourceProfileId: target.id,
      targetProfileId: currentProfileId,
    };
  }
  await stampVerifiedEmail(currentProfileId, email);
  return { kind: "stamped", profileId: currentProfileId };
}
