import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/types";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type IdentityRow = Database["public"]["Tables"]["user_identities"]["Row"];
type IdentityInsert = Database["public"]["Tables"]["user_identities"]["Insert"];

export type VerifiedLineIdentity = {
  lineUserId: string;
  displayName: string;
  pictureUrl?: string | null;
  email?: string | null;
  channelId: string;
  source: "line_id_token" | "line_oauth_callback";
};

export type LineLinkResult =
  | {
      status: "linked";
      profileId: string;
      lineUserId: string;
      displayName: string;
    }
  | {
      status: "merge_required";
      profileId: string;
      lineUserId: string;
      displayName: string;
      mergeRequestId: string;
      sourceProfileId: string;
      targetProfileId: string;
    }
  // Returned when the caller has no active session AND the LINE token's email
  // already belongs to an existing profile. We refuse to create a new LINE
  // profile silently — that would leave a zombie account behind. The caller
  // should send the user to sign in with email/Google first, then come back
  // to connect LINE explicitly.
  | {
      status: "login_required";
      lineUserId: string;
      displayName: string;
      emailHint: string;
    };

function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 1) return "your email";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visible = local.length <= 2 ? local : local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(1, local.length - visible.length))}@${domain}`;
}

function normalizeEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() || null;
}

function lineMetadata(identity: VerifiedLineIdentity): Json {
  return {
    source: identity.source,
    channelId: identity.channelId,
  };
}

function identityReviewRiskSummary({
  conflict,
  identityId,
  lineUserId,
  email,
}: {
  conflict: string;
  identityId?: string | null;
  lineUserId: string;
  email?: string | null;
}): Json {
  return {
    mode: "identity_review_only",
    conflict,
    provider: "line",
    providerSubject: lineUserId,
    identityId: identityId ?? null,
    email: email ?? null,
  } as Json;
}

async function activeProfileById(profileId: string): Promise<ProfileRow | null> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", profileId)
    .eq("profile_status", "active")
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function identityByLineSubject(lineUserId: string): Promise<IdentityRow | null> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("user_identities")
    .select("*")
    .eq("provider", "line")
    .eq("provider_subject", lineUserId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function profileByVerifiedEmail(email: string | null): Promise<ProfileRow | null> {
  if (!email) return null;
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("email", email)
    .eq("profile_status", "active")
    .limit(2);
  if (error) throw error;
  return data?.length === 1 ? data[0] : null;
}

async function createMergeRequest(
  sourceProfileId: string,
  targetProfileId: string,
  requestedByProfileId: string | null,
  details: {
    conflict: string;
    identityId?: string | null;
    lineUserId: string;
    email?: string | null;
  },
) {
  const supabase = createServiceSupabaseClient();
  const { data: existing, error: existingError } = await supabase
    .from("account_merge_requests")
    .select("id")
    .eq("source_profile_id", sourceProfileId)
    .eq("target_profile_id", targetProfileId)
    .eq("status", "pending")
    .limit(1);
  if (existingError) throw existingError;
  if (existing?.[0]) {
    const { error: updateError } = await supabase
      .from("account_merge_requests")
      .update({
        risk_summary: identityReviewRiskSummary(details),
      })
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
      reason: "LINE identity already belongs to another profile; admin review required before linking.",
      risk_summary: identityReviewRiskSummary(details),
    })
    .select("id")
    .single();
  if (insertError) throw insertError;

  await supabase.from("account_merge_events").insert({
    merge_request_id: mergeRequest.id,
    event_type: "created",
    actor_profile_id: requestedByProfileId,
    metadata: {
      sourceProfileId,
      targetProfileId,
      reason: "LINE connect conflict",
      mode: "identity_review_only",
    } as Json,
  });

  return mergeRequest.id;
}

async function attachLineToProfile(identity: VerifiedLineIdentity, profile: ProfileRow): Promise<LineLinkResult> {
  const supabase = createServiceSupabaseClient();
  const email = normalizeEmail(identity.email);
  const displayName = identity.displayName || profile.display_name || profile.line_display_name || "LINE Customer";
  const existingIdentity = await identityByLineSubject(identity.lineUserId);

  if (existingIdentity && existingIdentity.profile_id !== profile.id) {
    const mergeRequestId = await createMergeRequest(
      existingIdentity.profile_id,
      profile.id,
      profile.id,
      {
        conflict: "line_subject_already_linked",
        identityId: existingIdentity.id,
        lineUserId: identity.lineUserId,
        email,
      },
    );
    return {
      status: "merge_required",
      profileId: profile.id,
      lineUserId: identity.lineUserId,
      displayName,
      mergeRequestId,
      sourceProfileId: existingIdentity.profile_id,
      targetProfileId: profile.id,
    };
  }

  const { data: updatedProfile, error: profileError } = await supabase
    .from("profiles")
    .update({
      line_user_id: identity.lineUserId,
      line_display_name: displayName,
      line_picture_url: identity.pictureUrl ?? null,
      display_name: profile.display_name ?? displayName,
      avatar_url: profile.avatar_url ?? identity.pictureUrl ?? null,
      email: profile.email ?? email,
      profile_status: "active",
      last_seen_at: new Date().toISOString(),
    })
    .eq("id", profile.id)
    .select("id,line_user_id,display_name,line_display_name")
    .single();
  if (profileError) throw profileError;

  const identityRow: IdentityInsert = {
    profile_id: profile.id,
    auth_user_id: profile.auth_user_id,
    provider: "line",
    provider_subject: identity.lineUserId,
    email,
    email_verified: Boolean(email),
    display_name: displayName,
    avatar_url: identity.pictureUrl ?? null,
    metadata: lineMetadata(identity),
    last_seen_at: new Date().toISOString(),
  };

  const { error: identityError } = existingIdentity
    ? await supabase
        .from("user_identities")
        .update({
          auth_user_id: identityRow.auth_user_id ?? null,
          email: identityRow.email ?? null,
          email_verified: identityRow.email_verified ?? false,
          display_name: identityRow.display_name ?? null,
          avatar_url: identityRow.avatar_url ?? null,
          metadata: identityRow.metadata ?? ({} as Json),
          last_seen_at: identityRow.last_seen_at ?? new Date().toISOString(),
        })
        .eq("id", existingIdentity.id)
    : await supabase.from("user_identities").insert(identityRow);
  if (identityError) throw identityError;

  return {
    status: "linked",
    profileId: updatedProfile.id,
    lineUserId: updatedProfile.line_user_id ?? identity.lineUserId,
    displayName: updatedProfile.display_name ?? updatedProfile.line_display_name ?? displayName,
  };
}

async function createLineProfile(identity: VerifiedLineIdentity): Promise<LineLinkResult> {
  const supabase = createServiceSupabaseClient();
  const email = normalizeEmail(identity.email);
  const displayName = identity.displayName || "LINE Customer";
  const { data: profile, error } = await supabase
    .from("profiles")
    .upsert(
      {
        line_user_id: identity.lineUserId,
        line_display_name: displayName,
        line_picture_url: identity.pictureUrl ?? null,
        display_name: displayName,
        avatar_url: identity.pictureUrl ?? null,
        email,
        profile_status: "active",
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "line_user_id" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return attachLineToProfile(identity, profile);
}

export async function linkLineIdentity(identity: VerifiedLineIdentity, targetProfileId?: string | null): Promise<LineLinkResult> {
  if (!identity.lineUserId) throw new Error("line_user_id_required");

  const existingIdentity = await identityByLineSubject(identity.lineUserId);

  if (targetProfileId) {
    const targetProfile = await activeProfileById(targetProfileId);
    if (!targetProfile) throw new Error("target_profile_not_found");

    if (targetProfile.line_user_id && targetProfile.line_user_id !== identity.lineUserId) {
      throw new Error("target_profile_already_has_line");
    }

    if (existingIdentity && existingIdentity.profile_id !== targetProfileId) {
      const mergeRequestId = await createMergeRequest(
        existingIdentity.profile_id,
        targetProfileId,
        targetProfileId,
        {
          conflict: "line_subject_already_linked",
          identityId: existingIdentity.id,
          lineUserId: identity.lineUserId,
          email: normalizeEmail(identity.email),
        },
      );
      return {
        status: "merge_required",
        profileId: targetProfileId,
        lineUserId: identity.lineUserId,
        displayName: identity.displayName,
        mergeRequestId,
        sourceProfileId: existingIdentity.profile_id,
        targetProfileId,
      };
    }

    return attachLineToProfile(identity, targetProfile);
  }

  if (existingIdentity) {
    const profile = await activeProfileById(existingIdentity.profile_id);
    if (profile) return attachLineToProfile(identity, profile);
  }

  const normalizedEmail = normalizeEmail(identity.email);
  const emailProfile = await profileByVerifiedEmail(normalizedEmail);

  // If LINE returned an email that already belongs to an existing profile and
  // the user has no active session, refuse to create a new LINE-only profile.
  // The previous behaviour created a zombie P_line + a merge request, then
  // sent the user to admin review. The user had no way to recover on their
  // own. Now: send them to the existing account's sign-in path.
  if (emailProfile && emailProfile.line_user_id !== identity.lineUserId) {
    return {
      status: "login_required",
      lineUserId: identity.lineUserId,
      displayName: identity.displayName,
      emailHint: normalizedEmail ? maskEmail(normalizedEmail) : "your email",
    };
  }

  if (emailProfile?.line_user_id === identity.lineUserId) {
    return attachLineToProfile(identity, emailProfile);
  }

  // Genuine first-time LINE-only signup: no existing identity, no matching
  // email profile, no active session. Create a fresh LINE profile.
  return createLineProfile(identity);
}
