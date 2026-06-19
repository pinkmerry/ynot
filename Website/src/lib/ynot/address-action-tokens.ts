import "server-only";

import { createHmac } from "node:crypto";

import { dedicatedActionTokenSecret } from "@/lib/security/action-token-secret";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

const ADDRESS_ACTION_TOKEN_RE = /^ua_[A-Za-z0-9_-]{43}$/;

function addressActionTokenSecret() {
  return dedicatedActionTokenSecret("YNOT_ADDRESS_ACTION_TOKEN_SECRET");
}

function addressTokenPayload(profileId: string, addressId: string) {
  return `${profileId}:${addressId}`;
}

async function addressTokenSignature(payload: string) {
  return createHmac("sha256", addressActionTokenSecret())
    .update(payload)
    .digest("base64url");
}

export async function addressActionToken(profileId: string, addressId: string) {
  const signature = await addressTokenSignature(
    addressTokenPayload(profileId, addressId),
  );
  return `ua_${signature}`;
}

export function isAddressActionToken(value: string) {
  return ADDRESS_ACTION_TOKEN_RE.test(value);
}

export async function resolveAddressActionToken(
  profileId: string,
  token: string,
) {
  if (!profileId || !isAddressActionToken(token)) return null;
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("user_addresses")
    .select("id")
    .eq("profile_id", profileId);
  if (error) throw error;

  for (const address of data ?? []) {
    if ((await addressActionToken(profileId, address.id)) === token) {
      return address.id;
    }
  }
  return null;
}
