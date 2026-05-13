import "server-only";

import type { User, UserIdentity } from "@supabase/supabase-js";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/types";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type SupportedProvider = "email" | "google" | "line";

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function identityData(identity: UserIdentity | undefined) {
  return (identity?.identity_data ?? {}) as Record<string, unknown>;
}

function displayNameFor(user: User) {
  const primaryIdentity = user.identities?.[0];
  const data = identityData(primaryIdentity);
  return (
    stringValue(data.full_name) ??
    stringValue(data.name) ??
    stringValue(data.user_name) ??
    stringValue(user.user_metadata?.full_name) ??
    stringValue(user.user_metadata?.name) ??
    user.email ??
    "YNot Customer"
  );
}

function avatarUrlFor(user: User) {
  const primaryIdentity = user.identities?.[0];
  const data = identityData(primaryIdentity);
  return (
    stringValue(data.avatar_url) ??
    stringValue(data.picture) ??
    stringValue(user.user_metadata?.avatar_url)
  );
}

function providerSubject(identity: UserIdentity, fallbackEmail: string | null) {
  const data = identityData(identity);
  return (
    stringValue(data.sub) ??
    (identity.provider === "email" ? fallbackEmail : null) ??
    stringValue(identity.id)
  );
}

function supportedProvider(provider: string): SupportedProvider | null {
  if (provider === "email" || provider === "google" || provider === "line")
    return provider;
  return null;
}

async function syncUserIdentities(user: User, profileId: string) {
  const supabase = createServiceSupabaseClient();
  const email = user.email?.toLowerCase() ?? null;
  const identities = user.identities ?? [];
  const rows: Database["public"]["Tables"]["user_identities"]["Insert"][] = [];

  if (email) {
    rows.push({
      profile_id: profileId,
      auth_user_id: user.id,
      provider: "email",
      provider_subject: email,
      email,
      email_verified: Boolean(user.email_confirmed_at),
      display_name: displayNameFor(user),
      avatar_url: avatarUrlFor(user),
      metadata: { source: "supabase_auth_user" } as Json,
      last_seen_at: new Date().toISOString(),
    });
  }

  for (const identity of identities) {
    const provider = supportedProvider(identity.provider);
    if (!provider || provider === "email") continue;

    const subject = providerSubject(identity, email);
    if (!subject) continue;
    const data = identityData(identity);

    rows.push({
      profile_id: profileId,
      auth_user_id: user.id,
      provider,
      provider_subject: subject,
      email,
      email_verified: Boolean(user.email_confirmed_at),
      display_name:
        stringValue(data.full_name) ??
        stringValue(data.name) ??
        displayNameFor(user),
      avatar_url:
        stringValue(data.avatar_url) ??
        stringValue(data.picture) ??
        avatarUrlFor(user),
      metadata: {
        source: "supabase_auth_identity",
        identityId: identity.id,
      } as Json,
      last_seen_at: new Date().toISOString(),
    });
  }

  if (!rows.length) return;

  const { error } = await supabase.from("user_identities").upsert(rows, {
    onConflict: "provider,provider_subject",
  });

  if (error) throw error;
}

async function markProfileIdentitiesForAuthUser(
  profileId: string,
  authUserId: string,
) {
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase
    .from("user_identities")
    .update({
      auth_user_id: authUserId,
      last_seen_at: new Date().toISOString(),
    })
    .eq("profile_id", profileId)
    .is("auth_user_id", null);

  if (error) throw error;
}

async function profileByAuthUserId(
  authUserId: string,
): Promise<ProfileRow | null> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function activeProfileById(
  profileId: string,
): Promise<ProfileRow | null> {
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

async function profileByVerifiedEmail(
  email: string | null,
): Promise<ProfileRow | null> {
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

async function createAuthMergeRequest(
  sourceProfileId: string,
  targetProfileId: string,
  requestedByProfileId: string | null,
  reason: string,
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
  if (existing?.[0]) return existing[0].id;

  const { data: mergeRequest, error: insertError } = await supabase
    .from("account_merge_requests")
    .insert({
      requested_by_profile_id: requestedByProfileId,
      source_profile_id: sourceProfileId,
      target_profile_id: targetProfileId,
      reason,
      risk_summary: {
        conflict: "supabase_auth_already_linked_to_another_profile",
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
      reason,
    } as Json,
  });

  return mergeRequest.id;
}

async function updateProfileForSupabaseUser(
  user: User,
  profile: ProfileRow,
): Promise<ProfileRow> {
  const supabase = createServiceSupabaseClient();
  const now = new Date().toISOString();
  const email = user.email?.toLowerCase() ?? null;
  const displayName = displayNameFor(user);
  const avatarUrl = avatarUrlFor(user);
  // Supabase only sets email_confirmed_at once the OTP/magiclink succeeds, so
  // we can trust it as the verified-anchor stamp on our profile.
  const emailVerifiedAt = user.email_confirmed_at
    ? new Date(user.email_confirmed_at).toISOString()
    : profile.email_verified_at ?? null;

  const { data: updated, error: updateError } = await supabase
    .from("profiles")
    .update({
      auth_user_id: user.id,
      email:
        profile.auth_user_id === user.id ? email : (profile.email ?? email),
      email_verified_at: emailVerifiedAt,
      display_name: profile.display_name ?? displayName,
      avatar_url: profile.avatar_url ?? avatarUrl,
      profile_status: "active",
      last_seen_at: now,
    })
    .eq("id", profile.id)
    .select("*")
    .single();

  if (updateError) throw updateError;
  await markProfileIdentitiesForAuthUser(updated.id, user.id);
  await syncUserIdentities(user, updated.id);
  return updated;
}

async function createProfileForSupabaseUser(user: User): Promise<ProfileRow> {
  const supabase = createServiceSupabaseClient();
  const now = new Date().toISOString();
  const email = user.email?.toLowerCase() ?? null;
  const displayName = displayNameFor(user);
  const avatarUrl = avatarUrlFor(user);
  const emailVerifiedAt = user.email_confirmed_at
    ? new Date(user.email_confirmed_at).toISOString()
    : null;

  const { data: inserted, error: insertError } = await supabase
    .from("profiles")
    .insert({
      auth_user_id: user.id,
      email,
      email_verified_at: emailVerifiedAt,
      display_name: displayName,
      avatar_url: avatarUrl,
      profile_status: "active",
      preferred_language: "th",
      last_seen_at: now,
    })
    .select("*")
    .single();

  if (insertError) {
    const raced = await profileByAuthUserId(user.id);
    const racedError = raced ? null : insertError;
    if (racedError || !raced) throw insertError;
    await syncUserIdentities(user, raced.id);
    return raced;
  }

  await syncUserIdentities(user, inserted.id);
  return inserted;
}

export async function ensureProfileForUser(
  user: User,
  targetProfileId?: string | null,
  opts?: { readOnly?: boolean },
): Promise<ProfileRow> {
  const existing = await profileByAuthUserId(user.id);

  // Read path: page navigations call this on every request. Skip the
  // last_seen_at UPDATE + identity UPSERT writes here. Real auth events
  // (login, signup, OAuth callback, OTP verify) pass readOnly=false.
  if (opts?.readOnly && existing && !targetProfileId) {
    return existing;
  }

  if (targetProfileId) {
    const targetProfile = await activeProfileById(targetProfileId);

    if (targetProfile) {
      if (existing && existing.id !== targetProfile.id) {
        await createAuthMergeRequest(
          targetProfile.id,
          existing.id,
          targetProfile.id,
          "Supabase Auth user already belongs to another profile; admin review required before merge.",
        );
        return updateProfileForSupabaseUser(user, existing);
      }

      if (
        targetProfile.auth_user_id &&
        targetProfile.auth_user_id !== user.id
      ) {
        const newProfile =
          existing ?? (await createProfileForSupabaseUser(user));
        if (newProfile.id !== targetProfile.id) {
          await createAuthMergeRequest(
            targetProfile.id,
            newProfile.id,
            targetProfile.id,
            "Target LINE profile already has another Supabase Auth user; admin review required before merge.",
          );
        }
        return updateProfileForSupabaseUser(user, newProfile);
      }

      return updateProfileForSupabaseUser(user, targetProfile);
    }
  }

  if (existing) {
    return updateProfileForSupabaseUser(user, existing);
  }

  const emailProfile = await profileByVerifiedEmail(
    user.email?.toLowerCase() ?? null,
  );
  if (
    emailProfile &&
    (!emailProfile.auth_user_id || emailProfile.auth_user_id === user.id)
  ) {
    return updateProfileForSupabaseUser(user, emailProfile);
  }

  return createProfileForSupabaseUser(user);
}
