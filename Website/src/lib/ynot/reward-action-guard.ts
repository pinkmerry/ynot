import "server-only";

import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { requireVerifiedAnchor } from "@/lib/auth/verified-anchor";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { enforceSameOriginMutation } from "@/lib/security/same-origin";
import { resolveCollectionItemActionTokens } from "@/lib/ynot/collection-action-tokens";

export type RewardSelectionMode = "selected" | "all_eligible";

type CurrentProfileSession = NonNullable<
  Awaited<ReturnType<typeof resolveCurrentProfile>>
>;
type GuardedRewardActionSession = CurrentProfileSession & { profileId: string };

type GuardRewardActionOptions = {
  scope: string;
  limit: number;
  windowMs: number;
};

type GuardRewardActionResult =
  | { response: Response; session?: never }
  | { response?: undefined; session: GuardedRewardActionSession };

const IDEMPOTENCY_KEY_RE = /^[a-zA-Z0-9:_-]{1,120}$/;
const REWARD_ACTION_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function guardRewardActionRequest(
  request: Request,
  options: GuardRewardActionOptions,
): Promise<GuardRewardActionResult> {
  const crossOrigin = enforceSameOriginMutation(request);
  if (crossOrigin) return { response: crossOrigin };

  const session = await resolveCurrentProfile();
  if (!session?.profileId) {
    return {
      response: Response.json({ error: "Login is required." }, { status: 401 }),
    };
  }
  const blocked = await requireVerifiedAnchor(session);
  if (blocked) return { response: blocked };

  const limited = await enforceRateLimit(
    request,
    options.scope,
    { limit: options.limit, windowMs: options.windowMs },
    session.profileId,
  );
  if (limited) return { response: limited };

  return { session: session as GuardedRewardActionSession };
}

export function isRewardActionUuid(value: string) {
  return REWARD_ACTION_UUID_RE.test(value);
}

export function normalizeRewardSelectionMode(
  value: unknown,
): RewardSelectionMode {
  return value === "all_eligible" ? "all_eligible" : "selected";
}

export function normalizeRewardQuoteToken(
  value: unknown,
  expiredMessage: string,
) {
  const token = typeof value === "string" ? value.trim() : "";
  if (!isRewardActionUuid(token)) {
    return { token: null, error: expiredMessage };
  }
  return { token, error: null };
}

export function normalizeRewardIdempotencyKey(
  value: unknown,
  options: { trimString?: boolean } = {},
) {
  if (value === undefined || value === null || value === "") {
    return { key: crypto.randomUUID(), error: null };
  }
  if (typeof value !== "string") {
    return { key: null, error: "Invalid idempotency key." };
  }

  const key = options.trimString ? value.trim() : value;
  if (options.trimString && !key) {
    return { key: crypto.randomUUID(), error: null };
  }
  if (!IDEMPOTENCY_KEY_RE.test(key)) {
    return { key: null, error: "Invalid idempotency key." };
  }
  return { key, error: null };
}

export function normalizeSelectedRewardActionTokens(options: {
  value: unknown;
  selectionMode: RewardSelectionMode;
  maxSelected: number;
  emptyError: string;
  tooManyError: string;
  invalidError: string;
  duplicateError: string;
  isActionToken: (value: string) => boolean;
}) {
  if (options.selectionMode === "all_eligible") {
    return { tokens: [] as string[], error: null, status: 200 };
  }

  if (!Array.isArray(options.value) || options.value.length === 0) {
    return {
      error: options.emptyError,
      status: 400,
      tokens: [] as string[],
    };
  }
  if (options.value.length > options.maxSelected) {
    return {
      error: options.tooManyError,
      status: 400,
      tokens: [] as string[],
    };
  }

  const tokens = options.value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim());
  if (
    tokens.length !== options.value.length ||
    tokens.some((item) => !options.isActionToken(item))
  ) {
    return {
      tokens,
      error: options.invalidError,
      status: 400,
    };
  }
  if (new Set(tokens).size !== tokens.length) {
    return {
      tokens,
      error: options.duplicateError,
      status: 400,
    };
  }

  return { tokens, error: null, status: 200 };
}

export async function resolveSelectedCollectionItemActionTokens(
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

export function conversionRewardActionErrorMessage(message?: string) {
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
    message.includes("reward_conversion_quote_expired") ||
    message.includes("quote_token")
  ) {
    return "Conversion quote expired. Please try again.";
  }
  if (
    message.includes("collection_items_not_convertible") ||
    message.includes("reward_conversion_quote_changed")
  ) {
    return "Some selected rewards are no longer eligible. Refresh and select eligible rewards only.";
  }
  if (message.includes("reward_conversion_active_exists")) {
    return "Your previous conversion is still running.";
  }
  if (message.includes("shipping_request_active_blocks_conversion")) {
    return "Your shipping request is still preparing. Please wait until it finishes before converting rewards.";
  }
  return "Could not convert these rewards. Please refresh and try again.";
}

export function shippingRewardActionErrorMessage(message?: string) {
  if (!message) return "Could not request shipping. Please refresh and try again.";
  if (message.includes("profile_required")) return "Login is required.";
  if (message.includes("collection_items_required")) {
    return "Select at least one card.";
  }
  if (
    message.includes("shipping_minimum_coin_value_required") ||
    message.includes("shipping_minimum_not_met")
  ) {
    return "A total of 1,000 coins or more in selected cards is required for shipping.";
  }
  if (message.includes("valid_shipping_address_required")) {
    return "Complete your recipient name, phone, and full shipping address before requesting shipping.";
  }
  if (message.includes("duplicate_collection_items")) {
    return "Each card can only be selected once.";
  }
  if (
    message.includes("collection_item_not_shippable") ||
    message.includes("shipping_quote_changed")
  ) {
    return "One or more cards are no longer available for shipping.";
  }
  if (message.includes("shipping_quote_expired") || message.includes("quote_token")) {
    return "Shipping quote expired. Please try again.";
  }
  if (message.includes("shipping_request_active_exists")) {
    return "Your previous shipping request is still preparing.";
  }
  if (
    message.includes("reward_conversion_active_exists") ||
    message.includes("reward_conversion_active_blocks_shipping")
  ) {
    return "Your previous conversion is still running.";
  }
  return "Could not request shipping. Please refresh and try again.";
}
