import "server-only";

import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { requireVerifiedAnchor } from "@/lib/auth/verified-anchor";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { enforceSameOriginMutation } from "@/lib/security/same-origin";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import {
  isCollectionItemActionToken,
  resolveCollectionItemActionTokens,
} from "@/lib/ynot/collection-action-tokens";

const IDEMPOTENCY_KEY_RE = /^[a-zA-Z0-9:_-]{1,120}$/;
const MAX_CONVERT_ITEMS = 50;

type ConversionBody = {
  collectionItemIds?: unknown;
  idempotencyKey?: unknown;
};

function normalizeCollectionItemActionTokens(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    return {
      error: "Select at least one card to convert.",
      status: 400,
      tokens: [] as string[],
    };
  }
  if (value.length > MAX_CONVERT_ITEMS) {
    return {
      error: `Convert up to ${MAX_CONVERT_ITEMS} cards at a time.`,
      status: 400,
      tokens: [] as string[],
    };
  }

  const tokens = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim());
  if (
    tokens.length !== value.length ||
    tokens.some((item) => !isCollectionItemActionToken(item))
  ) {
    return {
      error: "Choose valid collection items to convert.",
      status: 400,
      tokens: [] as string[],
    };
  }
  if (new Set(tokens).size !== tokens.length) {
    return {
      error: "Each card can only be selected once.",
      status: 400,
      tokens: [] as string[],
    };
  }

  return { tokens, error: null, status: 200 };
}

function normalizeIdempotencyKey(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return { key: crypto.randomUUID(), error: null };
  }
  if (typeof value !== "string" || !IDEMPOTENCY_KEY_RE.test(value)) {
    return { key: null, error: "Invalid idempotency key." };
  }
  return { key: value, error: null };
}

function conversionErrorMessage(message?: string) {
  if (!message) {
    return "Could not convert these cards. Please refresh and try again.";
  }
  if (message.includes("profile_required")) return "Login is required.";
  if (message.includes("collection_items_required")) {
    return "Select at least one card to convert.";
  }
  if (message.includes("duplicate_collection_items")) {
    return "Each card can only be selected once.";
  }
  if (
    message.includes("collection_items_not_convertible") ||
    message.includes("no_convert_value")
  ) {
    return "One or more cards are no longer convertible.";
  }
  return "Could not convert these cards. Please refresh and try again.";
}

function publicConversionResult(raw: unknown) {
  const value =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    status: typeof value.status === "string" ? value.status : "converted",
    totalCoins: Number.isFinite(Number(value.totalCoins))
      ? Math.max(0, Math.round(Number(value.totalCoins)))
      : 0,
    itemCount: Number.isFinite(Number(value.itemCount))
      ? Math.max(0, Math.round(Number(value.itemCount)))
      : 0,
    replayed: value.replayed === true,
  };
}

export async function handleCardConversionRequest(request: Request) {
  if (!isSupabaseConfigured()) {
    return Response.json(
      { error: "Supabase is not configured." },
      { status: 503 },
    );
  }

  const crossOrigin = enforceSameOriginMutation(request);
  if (crossOrigin) return crossOrigin;

  const session = await resolveCurrentProfile();
  if (!session?.profileId) {
    return Response.json({ error: "Login is required." }, { status: 401 });
  }
  const blocked = await requireVerifiedAnchor(session);
  if (blocked) return blocked;

  const limited = await enforceRateLimit(
    request,
    "ynot:convert:submit",
    { limit: 20, windowMs: 60_000 },
    session.profileId,
  );
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as ConversionBody | null;
  const {
    tokens: collectionItemTokens,
    error: itemError,
    status,
  } = normalizeCollectionItemActionTokens(body?.collectionItemIds);
  if (itemError) return Response.json({ error: itemError }, { status });

  const { key: idempotencyKey, error: keyError } = normalizeIdempotencyKey(
    body?.idempotencyKey,
  );
  if (keyError || !idempotencyKey) {
    return Response.json(
      { error: keyError ?? "Invalid idempotency key." },
      { status: 400 },
    );
  }

  let resolvedCollectionItemIds: string[];
  try {
    resolvedCollectionItemIds = await resolveCollectionItemActionTokens(
      session.profileId,
      collectionItemTokens,
    );
  } catch (error) {
    console.error("Failed to resolve collection action tokens for conversion.", error);
    return Response.json(
      { error: "Could not convert these cards. Please refresh and try again." },
      { status: 503 },
    );
  }
  if (resolvedCollectionItemIds.length !== collectionItemTokens.length) {
    return Response.json(
      { error: "Choose valid collection items to convert." },
      { status: 400 },
    );
  }

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.rpc("submit_card_conversion", {
    p_profile_id: session.profileId,
    p_collection_item_ids: resolvedCollectionItemIds,
    p_idempotency_key: idempotencyKey,
  });
  if (error) {
    return Response.json(
      { error: conversionErrorMessage(error.message) },
      { status: 409 },
    );
  }
  return Response.json({ result: publicConversionResult(data) });
}
