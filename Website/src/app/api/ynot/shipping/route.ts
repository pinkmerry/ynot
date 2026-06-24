import { getCloudflareContext } from "@opennextjs/cloudflare";

import { requestPreviewShipping } from "@/features/ynot/local-preview-rewards";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { isDevAuthAllowed } from "@/lib/security/dev-auth";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import {
  isAddressActionToken,
  resolveAddressActionToken,
} from "@/lib/ynot/address-action-tokens";
import { isCollectionItemActionToken } from "@/lib/ynot/collection-action-tokens";
import {
  guardRewardActionRequest,
  isRewardActionUuid,
  normalizeRewardIdempotencyKey,
  normalizeRewardQuoteToken,
  normalizeRewardSelectionMode,
  normalizeSelectedRewardActionTokens,
  resolveSelectedCollectionItemActionTokens,
  shippingRewardActionErrorMessage,
  type RewardSelectionMode,
} from "@/lib/ynot/reward-action-guard";
import {
  presentShippingLegacyResult,
  presentShippingProgress,
  presentShippingQuote,
} from "@/lib/ynot/reward-action-presenters";

export const dynamic = "force-dynamic";

const MAX_SELECTED_SHIPPING_ITEMS = 10_000;

type ShippingIntent = "quote" | "start" | "legacy";

type ShippingBody = {
  intent?: unknown;
  selectionMode?: unknown;
  addressId?: unknown;
  collectionItemIds?: unknown;
  quoteToken?: unknown;
  note?: unknown;
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
type ShippingQueueBinding = {
  send(body: unknown, options?: { delaySeconds?: number }): Promise<unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeShippingIntent(value: unknown): ShippingIntent | null {
  if (value === undefined || value === null || value === "") {
    return "legacy";
  }
  if (value === "quote" || value === "start" || value === "legacy") {
    return value;
  }
  return null;
}

function normalizeAddressActionToken(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return isAddressActionToken(trimmed) ? trimmed : "";
}

function normalizeCollectionItemActionTokens(
  value: unknown,
  selectionMode: RewardSelectionMode,
) {
  return normalizeSelectedRewardActionTokens({
    value,
    selectionMode,
    maxSelected: MAX_SELECTED_SHIPPING_ITEMS,
    emptyError: "Select at least one card.",
    tooManyError: `Use Request all eligible shipping for more than ${MAX_SELECTED_SHIPPING_ITEMS.toLocaleString()} cards.`,
    invalidError: "Choose valid collection items to ship.",
    duplicateError: "Each card can only be selected once.",
    isActionToken: isCollectionItemActionToken,
  });
}

function shippingErrorResponse(error: SupabaseCompatError, status = 409) {
  return Response.json(
    { error: shippingRewardActionErrorMessage(error.message) },
    { status },
  );
}

function isInvalidSelectedCollectionActionTokenError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.includes("collection_action_tokens_invalid")
  );
}

function shouldContinueShipping(raw: unknown) {
  const value = isRecord(raw) ? raw : {};
  if (value.completed === true || value.status === "submitted") return false;
  if (value.shouldContinue === true) return true;
  const preparedCount = Number(value.preparedCount);
  const itemCount = Number(value.itemCount);
  return (
    Number.isFinite(preparedCount) &&
    Number.isFinite(itemCount) &&
    preparedCount < itemCount
  );
}

async function enqueueShippingRequestJob(jobId: unknown) {
  if (typeof jobId !== "string" || !isRewardActionUuid(jobId)) return;
  try {
    const cloudflare = await getCloudflareContext({ async: true });
    const queue = (cloudflare.env as { BULK_OPEN_QUEUE?: ShippingQueueBinding })
      .BULK_OPEN_QUEUE;
    if (!queue) return;
    await queue.send(
      {
        type: "shipping_request_process",
        jobId,
        attempt: 0,
      },
      { delaySeconds: 0 },
    );
  } catch (error) {
    console.warn("shipping_request_enqueue_failed", {
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

async function submitLegacyShippingFallback(
  supabase: SupabaseCompatClient,
  profileId: string,
  addressId: string,
  resolvedCollectionItemIds: string[],
  note: string | null,
  idempotencyKey: string,
) {
  return supabase.rpc("request_shipping_for_items", {
    p_profile_id: profileId,
    p_address_id: addressId,
    p_collection_item_ids: resolvedCollectionItemIds,
    p_customer_note: note,
    p_idempotency_key: idempotencyKey,
  });
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return Response.json(
      { error: "Supabase is not configured." },
      { status: 503 },
    );
  }

  const guarded = await guardRewardActionRequest(
    request,
    { scope: "ynot:shipping:request", limit: 20, windowMs: 60_000 },
  );
  if (guarded.response) return guarded.response;
  const { session } = guarded;

  const body = (await request.json().catch(() => null)) as ShippingBody | null;
  const intent = normalizeShippingIntent(body?.intent);
  if (!intent) {
    return Response.json(
      { error: "Review shipping first, then confirm the request." },
      { status: 400 },
    );
  }
  const { key: idempotencyKey, error: keyError } = normalizeRewardIdempotencyKey(
    body?.idempotencyKey,
    { trimString: true },
  );
  if (keyError || !idempotencyKey) {
    return Response.json(
      { error: keyError ?? "Invalid idempotency key." },
      { status: 400 },
    );
  }

  const supabase = createServiceSupabaseClient() as unknown as SupabaseCompatClient;
  if (intent === "start") {
    const { token: quoteToken, error: quoteTokenError } = normalizeRewardQuoteToken(
      body?.quoteToken,
      "Shipping quote expired. Please try again.",
    );
    if (quoteTokenError || !quoteToken) {
      return Response.json(
        { error: quoteTokenError ?? "Shipping quote expired. Please try again." },
        { status: 400 },
      );
    }
    const { data: started, error } = await supabase.rpc("start_shipping_request_job", {
      p_profile_id: session.profileId,
      p_quote_token_id: quoteToken,
      p_idempotency_key: idempotencyKey,
    });
    if (error) return shippingErrorResponse(error);
    const startedRecord = isRecord(started) ? started : {};
    if (shouldContinueShipping(started)) {
      await enqueueShippingRequestJob(startedRecord.jobId);
    }
    return Response.json({
      shipping: presentShippingProgress(started),
      result: presentShippingLegacyResult(started),
    });
  }

  const addressToken = normalizeAddressActionToken(body?.addressId);
  if (!addressToken) {
    return Response.json(
      { error: "Shipping address is required." },
      { status: 400 },
    );
  }
  const selectionMode = normalizeRewardSelectionMode(body?.selectionMode);
  const {
    tokens: collectionItemTokens,
    error: itemError,
    status,
  } = normalizeCollectionItemActionTokens(body?.collectionItemIds, selectionMode);
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 500) : null;
  if (itemError) return Response.json({ error: itemError }, { status });

  if (
    isDevAuthAllowed() &&
    session.authUserId === "preview-user"
  ) {
    try {
      const previewShipping = await requestPreviewShipping({
        addressId: addressToken,
        collectionItemIds: collectionItemTokens,
        idempotencyKey,
        note,
        profileId: session.profileId,
      });
      if (!previewShipping) throw new Error("collection_item_not_shippable");
      return Response.json({ result: presentShippingLegacyResult(previewShipping) });
    } catch (error) {
      return Response.json(
        {
          error: shippingRewardActionErrorMessage(
            error instanceof Error ? error.message : undefined,
          ),
        },
        { status: 409 },
      );
    }
  }

  let resolvedAddressId: string | null;
  try {
    resolvedAddressId = await resolveAddressActionToken(
      session.profileId,
      addressToken,
    );
  } catch (error) {
    console.error("Failed to resolve address action token for shipping.", error);
    return Response.json(
      { error: "Could not request shipping. Please refresh and try again." },
      { status: 503 },
    );
  }
  if (!resolvedAddressId) {
    return Response.json(
      { error: "Choose a valid shipping address." },
      { status: 400 },
    );
  }

  let resolvedCollectionItemIds: string[];
  try {
    resolvedCollectionItemIds = await resolveSelectedCollectionItems(
      session.profileId,
      collectionItemTokens,
    );
  } catch (error) {
    if (isInvalidSelectedCollectionActionTokenError(error)) {
      return Response.json(
        { error: "Choose valid collection items to ship." },
        { status: 400 },
      );
    }
    console.error("Failed to resolve collection action tokens for shipping.", error);
    return Response.json(
      { error: "Could not request shipping. Please refresh and try again." },
      { status: 503 },
    );
  }

  if (intent === "legacy") {
    if (selectionMode !== "selected" || !resolvedCollectionItemIds.length) {
      return Response.json({ error: "Select at least one card." }, { status: 400 });
    }
    const { data, error } = await submitLegacyShippingFallback(
      supabase,
      session.profileId,
      resolvedAddressId,
      resolvedCollectionItemIds,
      note,
      idempotencyKey,
    );
    if (error) return shippingErrorResponse(error);
    return Response.json({ result: presentShippingLegacyResult(data) });
  }

  const { data: quote, error: quoteError } = await supabase.rpc("prepare_shipping_request_quote", {
    p_profile_id: session.profileId,
    p_address_id: resolvedAddressId,
    p_selection_mode: selectionMode,
    p_collection_item_ids: selectionMode === "selected" ? resolvedCollectionItemIds : null,
    p_customer_note: note,
    p_idempotency_key: idempotencyKey,
  });
  if (quoteError) return shippingErrorResponse(quoteError);

  const publicQuote = presentShippingQuote(quote);
  if (!publicQuote.quoteToken || publicQuote.itemCount === 0) {
    return Response.json(
      { error: "Select at least one card." },
      { status: 409 },
    );
  }
  return Response.json({ quote: presentShippingQuote(quote) });
}
