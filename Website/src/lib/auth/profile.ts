import "server-only";

import type { User, UserIdentity } from "@supabase/supabase-js";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/types";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type IdentityInsert = Database["public"]["Tables"]["user_identities"]["Insert"];
type IdentityRow = Database["public"]["Tables"]["user_identities"]["Row"];
type SupportedProvider = "email" | "google" | "line";
type IdentityReviewContext = {
  conflict: string;
  provider?: SupportedProvider | null;
  providerSubject?: string | null;
  identityId?: string | null;
  authUserId?: string | null;
  email?: string | null;
};

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

function reviewRiskSummary(context: IdentityReviewContext): Json {
  return {
    mode: "identity_review_only",
    conflict: context.conflict,
    provider: context.provider ?? null,
    providerSubject: context.providerSubject ?? null,
    identityId: context.identityId ?? null,
    authUserId: context.authUserId ?? null,
    email: context.email ?? null,
  } as Json;
}

function identityReviewContextForUser(
  user: User,
  conflict: string,
): IdentityReviewContext {
  const email = user.email?.toLowerCase() ?? null;
  const primary =
    user.identities?.find((identity) => supportedProvider(identity.provider)) ??
    user.identities?.[0];
  const provider = primary ? supportedProvider(primary.provider) : null;
  return {
    conflict,
    provider: provider ?? (email ? "email" : null),
    providerSubject: primary
      ? providerSubject(primary, email)
      : email,
    identityId: primary?.id ?? null,
    authUserId: user.id,
    email,
  };
}

async function writeIdentityRow(
  row: IdentityInsert,
  conflict: IdentityReviewContext,
) {
  const supabase = createServiceSupabaseClient();
  const { data: existing, error: existingError } = await supabase
    .from("user_identities")
    .select("id,profile_id,provider,provider_subject")
    .eq("provider", row.provider)
    .eq("provider_subject", row.provider_subject)
    .maybeSingle<Pick<IdentityRow, "id" | "profile_id" | "provider" | "provider_subject">>();

  if (existingError) throw existingError;

  if (existing && existing.profile_id !== row.profile_id) {
    await createAuthMergeRequest(
      existing.profile_id,
      row.profile_id,
      row.profile_id,
      "Auth identity already belongs to another profile; admin review required before linking.",
      {
        ...conflict,
        identityId: existing.id,
        provider: existing.provider,
        providerSubject: existing.provider_subject,
      },
    );
    return;
  }

  if (existing) {
    const { error } = await supabase
      .from("user_identities")
      .update({
        auth_user_id: row.auth_user_id ?? null,
        email: row.email ?? null,
        email_verified: row.email_verified ?? false,
        display_name: row.display_name ?? null,
        avatar_url: row.avatar_url ?? null,
        metadata: row.metadata ?? ({} as Json),
        last_seen_at: row.last_seen_at ?? new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("user_identities").insert(row);
  if (error) throw error;
}

async function syncUserIdentities(user: User, profileId: string) {
  const email = user.email?.toLowerCase() ?? null;
  const identities = user.identities ?? [];
  const rows: IdentityInsert[] = [];

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

  for (const row of rows) {
    await writeIdentityRow(row, {
      conflict: "auth_identity_already_linked_to_another_profile",
      provider: row.provider,
      providerSubject: row.provider_subject,
      authUserId: user.id,
      email: row.email ?? null,
    });
  }
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
  const { data: identity, error: identityError } = await supabase
    .from("user_identities")
    .select("profile_id")
    .eq("auth_user_id", authUserId)
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ profile_id: string }>();

  if (identityError) throw identityError;
  if (identity?.profile_id) {
    const identityProfile = await activeProfileById(identity.profile_id);
    if (identityProfile) return identityProfile;
    throw new Error("AUTH_PROFILE_NOT_ACTIVE");
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) throw error;
  if (data && data.profile_status !== "active") {
    throw new Error("AUTH_PROFILE_NOT_ACTIVE");
  }
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
    .eq("profile_status", "active")
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function createAuthMergeRequest(
  sourceProfileId: string,
  targetProfileId: string,
  requestedByProfileId: string | null,
  reason: string,
  context: IdentityReviewContext,
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
        risk_summary: reviewRiskSummary(context),
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
      reason,
      risk_summary: reviewRiskSummary(context),
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
      mode: "identity_review_only",
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
          existing.id,
          targetProfile.id,
          targetProfile.id,
          "Supabase Auth user already belongs to another profile; admin review required before linking.",
          identityReviewContextForUser(
            user,
            "supabase_auth_already_linked_to_another_profile",
          ),
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
            newProfile.id,
            targetProfile.id,
            targetProfile.id,
            "Target profile already has another Supabase Auth user; admin review required before linking.",
            identityReviewContextForUser(
              user,
              "target_profile_has_different_supabase_auth",
            ),
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

  return createProfileForSupabaseUser(user);
}
