import "server-only";

import { createHmac } from "node:crypto";

import { dedicatedActionTokenSecret } from "@/lib/security/action-token-secret";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

const COLLECTION_ITEM_ACTION_TOKEN_RE = /^ci_[A-Za-z0-9_-]{43}$/;
const MAX_RESOLVABLE_COLLECTION_ITEMS = 10_000;

function collectionActionTokenSecret() {
  return dedicatedActionTokenSecret("YNOT_COLLECTION_ACTION_TOKEN_SECRET");
}

function collectionTokenPayload(profileId: string, collectionItemId: string) {
  return `${profileId}:${collectionItemId}`;
}

async function collectionTokenSignature(payload: string) {
  return createHmac("sha256", collectionActionTokenSecret())
    .update(payload)
    .digest("base64url");
}

export async function collectionItemActionToken(
  profileId: string,
  collectionItemId: string,
) {
  const signature = await collectionTokenSignature(
    collectionTokenPayload(profileId, collectionItemId),
  );
  return `ci_${signature}`;
}

export function isCollectionItemActionToken(value: string) {
  return COLLECTION_ITEM_ACTION_TOKEN_RE.test(value);
}

export async function resolveCollectionItemActionTokens(
  profileId: string,
  tokens: string[],
) {
  if (!profileId || !tokens.length) return [];
  if (
    new Set(tokens).size !== tokens.length ||
    tokens.some((token) => !isCollectionItemActionToken(token))
  ) {
    return [];
  }

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("collection_items")
    .select("id")
    .eq("profile_id", profileId)
    .eq("status", "owned")
    .range(0, MAX_RESOLVABLE_COLLECTION_ITEMS - 1);
  if (error) throw error;

  const idByToken = new Map<string, string>();
  for (const item of data ?? []) {
    idByToken.set(await collectionItemActionToken(profileId, item.id), item.id);
  }

  const resolvedIds: string[] = [];
  for (const token of tokens) {
    const collectionItemId = idByToken.get(token);
    if (!collectionItemId) return [];
    resolvedIds.push(collectionItemId);
  }
  return resolvedIds;
}
