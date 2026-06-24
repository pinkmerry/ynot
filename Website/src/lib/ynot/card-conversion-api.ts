import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

import {
  preparePreviewConversionQuote,
  startPreviewConversion,
} from "@/features/ynot/local-preview-rewards";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { isDevAuthAllowed } from "@/lib/security/dev-auth";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { isCollectionItemActionToken } from "@/lib/ynot/collection-action-tokens";
import {
  conversionRewardActionErrorMessage,
  guardRewardActionRequest,
  isRewardActionUuid,
  normalizeRewardIdempotencyKey,
  normalizeRewardQuoteToken,
  normalizeRewardSelectionMode,
  normalizeSelectedRewardActionTokens,
  resolveSelectedCollectionItemActionTokens,
  type RewardSelectionMode,
} from "@/lib/ynot/reward-action-guard";
import {
  presentConversionProgress,
  presentConversionQuote,
  presentConversionStartResult,
} from "@/lib/ynot/reward-action-presenters";

const MAX_SELECTED_CONVERT_ITEMS = 10_000;

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

function normalizeConversionIntent(value: unknown): ConversionIntent | null {
  if (value === undefined || value === null || value === "") return null;
  return value === "quote" || value === "start" ? value : null;
}

function normalizeCollectionItemActionTokens(
  value: unknown,
  selectionMode: RewardSelectionMode,
) {
  return normalizeSelectedRewardActionTokens({
    value,
    selectionMode,
    maxSelected: MAX_SELECTED_CONVERT_ITEMS,
    emptyError: "No rewards selected",
    tooManyError: `Use Select all eligible rewards to convert for more than ${MAX_SELECTED_CONVERT_ITEMS.toLocaleString()} rewards.`,
    invalidError: "Choose valid collection rewards to convert.",
    duplicateError: "Each reward can only be selected once.",
    isActionToken: isCollectionItemActionToken,
  });
}

function conversionErrorResponse(error: SupabaseCompatError, status = 409) {
  return Response.json(
    { error: conversionRewardActionErrorMessage(error.message) },
    { status },
  );
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
  if (typeof conversionId !== "string" || !isRewardActionUuid(conversionId)) return;
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
  return resolveSelectedCollectionItemActionTokens(
    profileId,
    tokens,
  );
}

async function quoteRewardConversion(
  supabase: SupabaseCompatClient,
  profileId: string,
  selectionMode: RewardSelectionMode,
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

  const guarded = await guardRewardActionRequest(
    request,
    { scope: "ynot:convert:submit", limit: 20, windowMs: 60_000 },
  );
  if (guarded.response) return guarded.response;
  const { session } = guarded;

  const body = (await request.json().catch(() => null)) as ConversionBody | null;
  const intent = normalizeConversionIntent(body?.intent);
  if (!intent) {
    return Response.json(
      { error: "Choose rewards first, then confirm conversion." },
      { status: 400 },
    );
  }

  const { key: idempotencyKey, error: keyError } = normalizeRewardIdempotencyKey(
    body?.idempotencyKey,
  );
  if (keyError || !idempotencyKey) {
    return Response.json(
      { error: keyError ?? "Invalid idempotency key." },
      { status: 400 },
    );
  }

  if (intent === "start") {
    const { token: quoteToken, error: quoteTokenError } = normalizeRewardQuoteToken(
      body?.quoteToken,
      "Conversion quote expired. Please try again.",
    );
    if (quoteTokenError || !quoteToken) {
      return Response.json(
        { error: quoteTokenError ?? "Conversion quote expired. Please try again." },
        { status: 400 },
      );
    }

    if (
      isDevAuthAllowed() &&
      session.authUserId === "preview-user"
    ) {
      try {
        const started = startPreviewConversion({
          profileId: session.profileId,
          quoteToken,
        });
        if (!started) throw new Error("reward_conversion_quote_expired");
        return Response.json({
          conversion: presentConversionProgress(started),
          result: presentConversionStartResult(started),
        });
      } catch (error) {
        return conversionErrorResponse(
          {
            message:
              error instanceof Error
                ? error.message
                : "reward_conversion_quote_expired",
          },
        );
      }
    }

    const supabase = createServiceSupabaseClient() as unknown as SupabaseCompatClient;
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
      conversion: presentConversionProgress(started),
      result: presentConversionStartResult(started),
    });
  }

  const selectionMode = normalizeRewardSelectionMode(body?.selectionMode);
  const {
    tokens: collectionItemTokens,
    error: itemError,
    status,
  } = normalizeCollectionItemActionTokens(body?.collectionItemIds, selectionMode);
  if (itemError) return Response.json({ error: itemError }, { status });

  if (
    isDevAuthAllowed() &&
    session.authUserId === "preview-user"
  ) {
    try {
      const quote = preparePreviewConversionQuote({
        collectionItemIds: collectionItemTokens,
        profileId: session.profileId,
        selectionMode,
      });
      if (!quote) throw new Error("collection_items_not_convertible");
      const publicQuote = presentConversionQuote(quote);
      return Response.json({ quote: publicQuote });
    } catch (error) {
      return conversionErrorResponse(
        {
          message:
            error instanceof Error
              ? error.message
              : "collection_items_not_convertible",
        },
      );
    }
  }

  const supabase = createServiceSupabaseClient() as unknown as SupabaseCompatClient;
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

  const publicQuote = presentConversionQuote(quote);
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
