import "server-only";

import { createHmac } from "node:crypto";

import { createServiceSupabaseClient } from "@/lib/supabase/server";

const IDENTITY_ACTION_TOKEN_RE = /^ui_[A-Za-z0-9_-]{43}$/;
const IDENTITY_ACTION_TOKEN_SECRET_ENV_KEYS = [
  "YNOT_IDENTITY_ACTION_TOKEN_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
  "AUTH_SECRET",
  "NEXTAUTH_SECRET",
] as const;

function identityActionTokenSecret() {
  for (const key of IDENTITY_ACTION_TOKEN_SECRET_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  throw new Error("Missing server-only identity action token secret.");
}

function identityTokenPayload(profileId: string, identityId: string) {
  return `${profileId}:${identityId}`;
}

async function identityTokenSignature(payload: string) {
  return createHmac("sha256", identityActionTokenSecret())
    .update(payload)
    .digest("base64url");
}

export async function identityActionToken(
  profileId: string,
  identityId: string,
) {
  const signature = await identityTokenSignature(
    identityTokenPayload(profileId, identityId),
  );
  return `ui_${signature}`;
}

export function isIdentityActionToken(value: string) {
  return IDENTITY_ACTION_TOKEN_RE.test(value);
}

export async function resolveIdentityActionToken(
  profileId: string,
  token: string,
) {
  if (!profileId || !isIdentityActionToken(token)) return null;
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("user_identities")
    .select("id")
    .eq("profile_id", profileId);
  if (error) throw error;

  for (const identity of data ?? []) {
    if ((await identityActionToken(profileId, identity.id)) === token) {
      return identity.id;
    }
  }
  return null;
}
