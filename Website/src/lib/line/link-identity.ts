import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/types";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type IdentityRow = Database["public"]["Tables"]["user_identities"]["Row"];

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
    };

function normalizeEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() || null;
}

function lineMetadata(identity: VerifiedLineIdentity): Json {
  return {
    source: identity.source,
    channelId: identity.channelId,
  };
}

async function activeProfileById(profileId: string): Promise<ProfileRow | null> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", profileId)
    .neq("profile_status", "disabled")
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

async function createMergeRequest(sourceProfileId: string, targetProfileId: string, requestedByProfileId: string | null) {
  const supabase = createServiceSupabaseClient();
  const { data: existing, error: existingError } = await supabase
    .from("account_merge_requests")
    .select("id")
    .eq("source_profile_id", sourceProfileId)
    .eq("target_profile_id", targetProfileId)
    .eq("status", "pending")
    .limit(1);
  if (existingError) throw existingError;
  if (existing?.[0]) return existing[0].id;

  const { data: mergeRequest, error: insertError } = await supabase
    .from("account_merge_requests")
    .insert({
      requested_by_profile_id: requestedByProfileId,
      source_profile_id: sourceProfileId,
      target_profile_id: targetProfileId,
      reason: "LINE identity already belongs to another profile; admin review required before merge.",
      risk_summary: {
        conflict: "line_subject_already_linked",
      } as Json,
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
    } as Json,
  });

  return mergeRequest.id;
}

async function attachLineToProfile(identity: VerifiedLineIdentity, profile: ProfileRow): Promise<LineLinkResult> {
  const supabase = createServiceSupabaseClient();
  const email = normalizeEmail(identity.email);
  const displayName = identity.displayName || profile.display_name || profile.line_display_name || "LINE Customer";

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

  const { error: identityError } = await supabase.from("user_identities").upsert(
    {
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
    },
    { onConflict: "provider,provider_subject" },
  );
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
      const mergeRequestId = await createMergeRequest(existingIdentity.profile_id, targetProfileId, targetProfileId);
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

  const emailProfile = await profileByVerifiedEmail(normalizeEmail(identity.email));
  if (emailProfile && (!emailProfile.line_user_id || emailProfile.line_user_id === identity.lineUserId)) {
    return attachLineToProfile(identity, emailProfile);
  }

  return createLineProfile(identity);
}
