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
    stringValue(data.full_name)
    ?? stringValue(data.name)
    ?? stringValue(data.user_name)
    ?? stringValue(user.user_metadata?.full_name)
    ?? stringValue(user.user_metadata?.name)
    ?? user.email
    ?? "YNot Customer"
  );
}

function avatarUrlFor(user: User) {
  const primaryIdentity = user.identities?.[0];
  const data = identityData(primaryIdentity);
  return stringValue(data.avatar_url) ?? stringValue(data.picture) ?? stringValue(user.user_metadata?.avatar_url);
}

function providerSubject(identity: UserIdentity, fallbackEmail: string | null) {
  const data = identityData(identity);
  return (
    stringValue(data.sub)
    ?? (identity.provider === "email" ? fallbackEmail : null)
    ?? stringValue(identity.id)
  );
}

function supportedProvider(provider: string): SupportedProvider | null {
  if (provider === "email" || provider === "google" || provider === "line") return provider;
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
      display_name: stringValue(data.full_name) ?? stringValue(data.name) ?? displayNameFor(user),
      avatar_url: stringValue(data.avatar_url) ?? stringValue(data.picture) ?? avatarUrlFor(user),
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

export async function ensureProfileForUser(user: User): Promise<ProfileRow> {
  const supabase = createServiceSupabaseClient();
  const now = new Date().toISOString();
  const email = user.email?.toLowerCase() ?? null;
  const displayName = displayNameFor(user);
  const avatarUrl = avatarUrlFor(user);

  const { data: existing, error: existingError } = await supabase
    .from("profiles")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing) {
    const { data: updated, error: updateError } = await supabase
      .from("profiles")
      .update({
        email,
        display_name: existing.display_name ?? displayName,
        avatar_url: existing.avatar_url ?? avatarUrl,
        profile_status: "active",
        last_seen_at: now,
      })
      .eq("id", existing.id)
      .select("*")
      .single();

    if (updateError) throw updateError;
    await syncUserIdentities(user, updated.id);
    return updated;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("profiles")
    .insert({
      auth_user_id: user.id,
      email,
      display_name: displayName,
      avatar_url: avatarUrl,
      profile_status: "active",
      preferred_language: "th",
      last_seen_at: now,
    })
    .select("*")
    .single();

  if (insertError) {
    const { data: raced, error: racedError } = await supabase
      .from("profiles")
      .select("*")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (racedError || !raced) throw insertError;
    await syncUserIdentities(user, raced.id);
    return raced;
  }

  await syncUserIdentities(user, inserted.id);
  return inserted;
}
