import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";

import { dedicatedActionTokenSecret } from "@/lib/security/action-token-secret";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

const LEGACY_COLLECTION_ITEM_ACTION_TOKEN_RE = /^ci_[A-Za-z0-9_-]{43}$/;
const SEALED_COLLECTION_ITEM_ACTION_TOKEN_RE = /^ci2_[A-Za-z0-9_-]{80,120}$/;
const MAX_LEGACY_RESOLVABLE_COLLECTION_ITEMS = 10_000;
const COLLECTION_ITEM_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function collectionActionTokenSecret() {
  return dedicatedActionTokenSecret("YNOT_COLLECTION_ACTION_TOKEN_SECRET");
}

function collectionActionTokenKey() {
  return createHash("sha256").update(collectionActionTokenSecret()).digest();
}

function collectionTokenPayload(profileId: string, collectionItemId: string) {
  return `${profileId}:${collectionItemId}`;
}

async function legacyCollectionTokenSignature(payload: string) {
  return createHmac("sha256", collectionActionTokenSecret())
    .update(payload)
    .digest("base64url");
}

async function legacyCollectionItemActionToken(
  profileId: string,
  collectionItemId: string,
) {
  const signature = await legacyCollectionTokenSignature(
    collectionTokenPayload(profileId, collectionItemId),
  );
  return `ci_${signature}`;
}

export async function collectionItemActionToken(
  profileId: string,
  collectionItemId: string,
) {
  if (!COLLECTION_ITEM_ID_RE.test(collectionItemId)) {
    throw new Error("invalid_collection_item_id");
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", collectionActionTokenKey(), iv);
  cipher.setAAD(Buffer.from(profileId));
  const encrypted = Buffer.concat([
    cipher.update(collectionItemId, "utf8"),
    cipher.final(),
  ]);
  const sealed = Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
  return `ci2_${sealed.toString("base64url")}`;
}

function decryptCollectionItemActionToken(profileId: string, token: string) {
  if (!SEALED_COLLECTION_ITEM_ACTION_TOKEN_RE.test(token)) return null;
  try {
    const sealed = Buffer.from(token.slice(4), "base64url");
    if (sealed.length <= 28) return null;
    const iv = sealed.subarray(0, 12);
    const tag = sealed.subarray(12, 28);
    const encrypted = sealed.subarray(28);
    const decipher = createDecipheriv(
      "aes-256-gcm",
      collectionActionTokenKey(),
      iv,
    );
    decipher.setAAD(Buffer.from(profileId));
    decipher.setAuthTag(tag);
    const collectionItemId = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8");
    return COLLECTION_ITEM_ID_RE.test(collectionItemId) ? collectionItemId : null;
  } catch {
    return null;
  }
}

export function isCollectionItemActionToken(value: string) {
  return (
    SEALED_COLLECTION_ITEM_ACTION_TOKEN_RE.test(value) ||
    LEGACY_COLLECTION_ITEM_ACTION_TOKEN_RE.test(value)
  );
}

async function resolveSealedCollectionItemActionTokens(
  profileId: string,
  tokens: string[],
) {
  const idByToken = new Map<string, string>();
  for (const token of tokens) {
    const collectionItemId = decryptCollectionItemActionToken(profileId, token);
    if (!collectionItemId) continue;
    idByToken.set(token, collectionItemId);
  }
  return idByToken;
}

async function resolveLegacyCollectionItemActionTokens(
  profileId: string,
  tokens: string[],
) {
  if (!tokens.length) return new Map<string, string>();

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("collection_items")
    .select("id")
    .eq("profile_id", profileId)
    .eq("status", "owned")
    .range(0, MAX_LEGACY_RESOLVABLE_COLLECTION_ITEMS - 1);
  if (error) throw error;

  const requested = new Set(tokens);
  const resolved = new Map<string, string>();
  for (const item of data ?? []) {
    const token = await legacyCollectionItemActionToken(profileId, item.id);
    if (requested.has(token)) {
      resolved.set(token, item.id);
    }
  }
  return resolved;
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

  const resolved = await resolveSealedCollectionItemActionTokens(
    profileId,
    tokens,
  );
  const unresolvedTokens = tokens.filter((token) => !resolved.has(token));
  const legacyTokens = unresolvedTokens.filter((token) =>
    LEGACY_COLLECTION_ITEM_ACTION_TOKEN_RE.test(token),
  );

  if (legacyTokens.length) {
    const legacyResolved = await resolveLegacyCollectionItemActionTokens(
      profileId,
      legacyTokens,
    );
    for (const [token, collectionItemId] of legacyResolved) {
      resolved.set(token, collectionItemId);
    }
  }

  const resolvedIds: string[] = [];
  for (const token of tokens) {
    const collectionItemId = resolved.get(token);
    if (!collectionItemId) return [];
    resolvedIds.push(collectionItemId);
  }
  if (new Set(resolvedIds).size !== resolvedIds.length) return [];
  return resolvedIds;
}
