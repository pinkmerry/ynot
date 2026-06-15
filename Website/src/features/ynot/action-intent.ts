export type YnotActionIntentKind = "topup" | "convert" | "shipping";

const actionIntentPrefixes: Record<YnotActionIntentKind, string> = {
  topup: "ynot-topup",
  convert: "ynot-convert",
  shipping: "ynot-shipping",
};

const uuidPattern =
  "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

const actionIntentPatterns: Record<YnotActionIntentKind, RegExp> = {
  topup: new RegExp(`^ynot-topup-${uuidPattern}$`, "i"),
  convert: new RegExp(`^ynot-convert-${uuidPattern}$`, "i"),
  shipping: new RegExp(`^ynot-shipping-${uuidPattern}$`, "i"),
};

function cleanIdempotencyPart(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export function createYnotActionIntentId(kind: YnotActionIntentKind) {
  return `${actionIntentPrefixes[kind]}-${crypto.randomUUID()}`;
}

export function normalizeYnotActionIntentId(
  kind: YnotActionIntentKind,
  value: unknown,
) {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return actionIntentPatterns[kind].test(clean) ? clean.toLowerCase() : null;
}

export function ynotActionIdempotencyKey(
  kind: YnotActionIntentKind,
  intentId: string | null,
  parts: unknown[] = [],
) {
  const normalized = normalizeYnotActionIntentId(kind, intentId);
  const safeIntent = normalized ?? createYnotActionIntentId(kind);
  const safeParts = parts.map(cleanIdempotencyPart).filter(Boolean);
  const prefix = actionIntentPrefixes[kind];
  return safeParts.length
    ? `${prefix}:${safeParts.join(":")}:${safeIntent}`
    : `${prefix}:${safeIntent}`;
}
