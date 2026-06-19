import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

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
const MAX_SELECTED_CONVERT_ITEMS = 10_000;

type ConversionSelectionMode = "selected" | "all_eligible";
type ConversionIntent = "quote" | "start";

type ConversionBody = {
  intent?: unknown;
  selectionMode?: unknown;
  collectionItemIds?: unknown;
  quoteToken?: unknown;
  idempotencyKey?: unknown;
};

type SupabaseCompatError = { message: string };
type SupabaseCompatResult<T = unknown> = {
  data: T;
  error: SupabaseCompatError | null;
};
type SupabaseCompatClient = {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<SupabaseCompatResult<unknown>>;
};

type ConversionQueueBinding = {
  send(body: unknown, options?: { delaySeconds?: number }): Promise<unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(
    value,
  );
}

function normalizeConversionIntent(value: unknown): ConversionIntent | null {
  if (value === undefined || value === null || value === "") return null;
  return value === "quote" || value === "start" ? value : null;
}

function normalizeSelectionMode(value: unknown): ConversionSelectionMode {
  return value === "all_eligible" ? "all_eligible" : "selected";
}

function normalizeQuoteToken(value: unknown) {
  const token = typeof value === "string" ? value.trim() : "";
  if (!isUuid(token)) {
    return { token: null, error: "Conversion quote expired. Please try again." };
  }
  return { token, error: null };
}

function normalizeCollectionItemActionTokens(
  value: unknown,
  selectionMode: ConversionSelectionMode,
) {
  if (selectionMode === "all_eligible") {
    return { tokens: [] as string[], error: null, status: 200 };
  }

  if (!Array.isArray(value) || value.length === 0) {
    return {
      error: "No rewards selected",
      status: 400,
      tokens: [] as string[],
    };
  }
  if (value.length > MAX_SELECTED_CONVERT_ITEMS) {
    return {
      error: `Select all eligible rewards for more than ${MAX_SELECTED_CONVERT_ITEMS.toLocaleString()} rewards.`,
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
      error: "Choose valid collection rewards to convert.",
      status: 400,
      tokens: [] as string[],
    };
  }
  if (new Set(tokens).size !== tokens.length) {
    return {
      error: "Each reward can only be selected once.",
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
    return "Could not convert these rewards. Please refresh and try again.";
  }
  if (message.includes("profile_required")) return "Login is required.";
  if (
    message.includes("collection_items_required") ||
    message.includes("no_convert_value")
  ) {
    return "No rewards selected";
  }
  if (message.includes("duplicate_collection_items")) {
    return "Each reward can only be selected once.";
  }
  if (
    message.includes("collection_items_not_convertible") ||
    message.includes("reward_conversion_quote_changed") ||
    message.includes("reward_conversion_quote_expired") ||
    message.includes("quote_token")
  ) {
    return "Reward values changed. Please refresh and try again.";
  }
  if (message.includes("reward_conversion_active_exists")) {
    return "Your previous conversion is still running.";
  }
  return "Could not convert these rewards. Please refresh and try again.";
}

function conversionErrorResponse(error: SupabaseCompatError, status = 409) {
  return Response.json(
    { error: conversionErrorMessage(error.message) },
    { status },
  );
}

function publicConversionResult(raw: unknown) {
  const value = isRecord(raw) ? raw : {};
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

function publicConversionQuoteResult(raw: unknown) {
  const value = isRecord(raw) ? raw : {};
  return {
    quoteToken: typeof value.quoteToken === "string" ? value.quoteToken : "",
    selectionMode:
      value.selectionMode === "all_eligible" ? "all_eligible" : "selected",
    itemCount: Number.isFinite(Number(value.itemCount))
      ? Math.max(0, Math.round(Number(value.itemCount)))
      : 0,
    totalCoins: Number.isFinite(Number(value.totalCoins))
      ? Math.max(0, Math.round(Number(value.totalCoins)))
      : 0,
    expiresAt: typeof value.expiresAt === "string" ? value.expiresAt : null,
  };
}

function shouldContinueConversion(raw: unknown) {
  const value = isRecord(raw) ? raw : {};
  if (value.completed === true || value.status === "completed") return false;
  if (value.shouldContinue === true) return true;
  const convertedCount = Number(value.convertedCount);
  const itemCount = Number(value.itemCount);
  return (
    Number.isFinite(convertedCount) &&
    Number.isFinite(itemCount) &&
    convertedCount < itemCount
  );
}

async function enqueueRewardConversion(conversionId: unknown) {
  if (typeof conversionId !== "string" || !isUuid(conversionId)) return;
  try {
    const cloudflare = await getCloudflareContext({ async: true });
    const queue = (cloudflare.env as { BULK_OPEN_QUEUE?: ConversionQueueBinding })
      .BULK_OPEN_QUEUE;
    if (!queue) return;
    await queue.send(
      {
        type: "reward_conversion_process",
        jobId: conversionId,
        attempt: 0,
      },
      { delaySeconds: 0 },
    );
  } catch (error) {
    console.warn("reward_conversion_enqueue_failed", {
      reason: error instanceof Error ? error.message.split(":").slice(0, 2).join(":") : "unknown",
    });
  }
}

async function resolveSelectedCollectionItems(
  profileId: string,
  tokens: string[],
) {
  if (!tokens.length) return [] as string[];
  const resolvedCollectionItemIds = await resolveCollectionItemActionTokens(
    profileId,
    tokens,
  );
  if (resolvedCollectionItemIds.length !== tokens.length) {
    throw new Error("collection_action_tokens_invalid");
  }
  return resolvedCollectionItemIds;
}

async function quoteRewardConversion(
  supabase: SupabaseCompatClient,
  profileId: string,
  selectionMode: ConversionSelectionMode,
  resolvedCollectionItemIds: string[],
  idempotencyKey?: string | null,
) {
  return supabase.rpc("prepare_reward_conversion_quote", {
    p_profile_id: profileId,
    p_selection_mode: selectionMode,
    p_collection_item_ids:
      selectionMode === "selected" ? resolvedCollectionItemIds : null,
    p_idempotency_key: idempotencyKey,
  });
}

async function startRewardConversion(
  supabase: SupabaseCompatClient,
  profileId: string,
  quoteToken: string,
  idempotencyKey?: string | null,
) {
  return supabase.rpc("start_reward_conversion", {
    p_profile_id: profileId,
    p_quote_token_id: quoteToken,
    p_idempotency_key: idempotencyKey,
  });
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
  const intent = normalizeConversionIntent(body?.intent);
  if (!intent) {
    return Response.json(
      { error: "Choose rewards first, then confirm conversion." },
      { status: 400 },
    );
  }

  const supabase = createServiceSupabaseClient() as unknown as SupabaseCompatClient;
  const { key: idempotencyKey, error: keyError } = normalizeIdempotencyKey(
    body?.idempotencyKey,
  );
  if (keyError || !idempotencyKey) {
    return Response.json(
      { error: keyError ?? "Invalid idempotency key." },
      { status: 400 },
    );
  }

  if (intent === "start") {
    const { token: quoteToken, error: quoteTokenError } = normalizeQuoteToken(
      body?.quoteToken,
    );
    if (quoteTokenError || !quoteToken) {
      return Response.json(
        { error: quoteTokenError ?? "Conversion quote expired. Please try again." },
        { status: 400 },
      );
    }

    const { data: started, error: startError } = await startRewardConversion(
      supabase,
      session.profileId,
      quoteToken,
      idempotencyKey,
    );
    if (startError) {
      return conversionErrorResponse(startError);
    }

    const startedRecord = isRecord(started) ? started : {};
    if (shouldContinueConversion(started)) {
      await enqueueRewardConversion(startedRecord.jobId);
    }

    return Response.json({
      conversion: publicConversionJobResult(started),
      result: publicConversionResult(started),
    });
  }

  const selectionMode = normalizeSelectionMode(body?.selectionMode);
  const {
    tokens: collectionItemTokens,
    error: itemError,
    status,
  } = normalizeCollectionItemActionTokens(body?.collectionItemIds, selectionMode);
  if (itemError) return Response.json({ error: itemError }, { status });

  let resolvedCollectionItemIds: string[];
  try {
    resolvedCollectionItemIds = await resolveSelectedCollectionItems(
      session.profileId,
      collectionItemTokens,
    );
  } catch (error) {
    console.error("Failed to resolve collection action tokens for conversion.", error);
    return Response.json(
      { error: "Could not convert these rewards. Please refresh and try again." },
      { status: 503 },
    );
  }

  const { data: quote, error: quoteError } = await quoteRewardConversion(
    supabase,
    session.profileId,
    selectionMode,
    resolvedCollectionItemIds,
    idempotencyKey,
  );
  if (quoteError) {
    return conversionErrorResponse(quoteError);
  }

  const publicQuote = publicConversionQuoteResult(quote);
  if (!publicQuote.quoteToken) {
    return Response.json(
      { error: "Conversion quote expired. Please try again." },
      { status: 409 },
    );
  }

  if (intent === "quote") {
    return Response.json({ quote: publicQuote });
  }
}

export function publicConversionJobResult(raw: unknown) {
  const value = isRecord(raw) ? raw : {};
  const status = typeof value.status === "string" ? value.status : "queued";
  const itemCount = Number.isFinite(Number(value.itemCount))
    ? Math.max(0, Math.round(Number(value.itemCount)))
    : 0;
  const convertedCount = Number.isFinite(Number(value.convertedCount))
    ? Math.max(0, Math.round(Number(value.convertedCount)))
    : 0;
  const totalCoins = Number.isFinite(Number(value.totalCoins))
    ? Math.max(0, Math.round(Number(value.totalCoins)))
    : 0;
  const creditedTotalCoins = Number.isFinite(Number(value.creditedTotalCoins))
    ? Math.max(0, Math.round(Number(value.creditedTotalCoins)))
    : 0;
  return {
    id: typeof value.jobId === "string" ? value.jobId : null,
    status,
    itemCount,
    convertedCount,
    totalCoins,
    creditedTotalCoins,
    completed: value.completed === true || status === "completed",
    replayed: value.replayed === true,
  };
}
