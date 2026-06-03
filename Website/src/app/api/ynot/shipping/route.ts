import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { requireVerifiedAnchor } from "@/lib/auth/verified-anchor";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { enforceSameOriginMutation } from "@/lib/security/same-origin";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY_RE = /^[a-zA-Z0-9:_-]{1,120}$/;
const MAX_SHIPPING_ITEMS = 50;

type ShippingBody = {
  addressId?: unknown;
  collectionItemIds?: unknown;
  note?: unknown;
  idempotencyKey?: unknown;
};

function normalizeUuid(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return UUID_RE.test(trimmed) ? trimmed : "";
}

function normalizeCollectionItemIds(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    return {
      ids: [] as string[],
      error: "Select at least one card.",
      status: 400,
    };
  }

  const ids = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim());

  if (value.length > MAX_SHIPPING_ITEMS) {
    return {
      ids,
      error: `Ship up to ${MAX_SHIPPING_ITEMS} cards at a time.`,
      status: 400,
    };
  }
  if (ids.length !== value.length || ids.some((item) => !UUID_RE.test(item))) {
    return {
      ids,
      error: "Choose valid collection items to ship.",
      status: 400,
    };
  }
  if (new Set(ids).size !== ids.length) {
    return {
      ids,
      error: "Each card can only be selected once.",
      status: 400,
    };
  }

  return { ids, error: null, status: 200 };
}

function normalizeIdempotencyKey(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return { key: crypto.randomUUID(), error: null };
  }
  if (typeof value !== "string") {
    return { key: null, error: "Invalid idempotency key." };
  }
  const trimmed = value.trim();
  if (!trimmed) return { key: crypto.randomUUID(), error: null };
  if (!IDEMPOTENCY_KEY_RE.test(trimmed)) {
    return { key: null, error: "Invalid idempotency key." };
  }
  return { key: trimmed, error: null };
}

function shippingErrorMessage(message?: string) {
  if (!message) return "Could not request shipping. Please refresh and try again.";
  if (message.includes("profile_required")) return "Login is required.";
  if (message.includes("collection_items_required")) {
    return "Select at least one card.";
  }
  if (message.includes("valid_shipping_address_required")) {
    return "Choose a valid shipping address.";
  }
  if (message.includes("duplicate_collection_items")) {
    return "Each card can only be selected once.";
  }
  if (message.includes("collection_item_not_shippable")) {
    return "One or more cards are no longer available for shipping.";
  }
  return "Could not request shipping. Please refresh and try again.";
}

function publicShippingResult(raw: unknown) {
  const value =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const status = value.status;
  const publicCode = value.publicCode;
  const itemCount = value.itemCount;
  const replayed = value.replayed;
  return {
    status: typeof status === "string" ? status : "submitted",
    publicCode: typeof publicCode === "string" ? publicCode : "",
    itemCount: Number.isFinite(Number(itemCount))
      ? Math.max(0, Math.round(Number(itemCount)))
      : 0,
    replayed: replayed === true,
  };
}

export async function POST(request: Request) {
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
    "ynot:shipping:request",
    { limit: 20, windowMs: 60_000 },
    session.profileId,
  );
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as ShippingBody | null;
  const addressId = normalizeUuid(body?.addressId);
  const { ids: collectionItemIds, error: itemError, status } =
    normalizeCollectionItemIds(body?.collectionItemIds);
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 500) : null;
  const { key: idempotencyKey, error: keyError } = normalizeIdempotencyKey(
    body?.idempotencyKey,
  );

  if (!addressId) {
    return Response.json(
      { error: "Shipping address is required." },
      { status: 400 },
    );
  }
  if (itemError) return Response.json({ error: itemError }, { status });
  if (!collectionItemIds.length) {
    return Response.json(
      { error: "Select at least one card." },
      { status: 400 },
    );
  }
  if (!idempotencyKey) {
    return Response.json(
      { error: keyError ?? "Invalid idempotency key." },
      { status: 400 },
    );
  }
  if (keyError) return Response.json({ error: keyError }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.rpc("request_shipping_for_items", {
    p_profile_id: session.profileId,
    p_address_id: addressId,
    p_collection_item_ids: collectionItemIds,
    p_customer_note: note,
    p_idempotency_key: idempotencyKey,
  });
  if (error) {
    return Response.json(
      { error: shippingErrorMessage(error.message) },
      { status: 409 },
    );
  }
  return Response.json({ result: publicShippingResult(data) });
}
