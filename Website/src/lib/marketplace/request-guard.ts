import "server-only";

import { MarketplaceServiceError } from "./supabase-adapter";

const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9._:-]{8,200}$/;
const MAX_MARKETPLACE_JSON_BODY_BYTES = 4096;

export function marketplaceIdempotencyKey(request: Request) {
  const value = (
    request.headers.get("idempotency-key") ??
    request.headers.get("x-idempotency-key") ??
    ""
  ).trim();

  if (!IDEMPOTENCY_KEY_RE.test(value)) {
    throw new MarketplaceServiceError(
      "marketplace_idempotency_key_invalid",
      "A valid idempotency key is required.",
      400,
    );
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export async function readMarketplaceJsonBody(
  request: Request,
  allowedFields: readonly string[],
) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  const contentLength = request.headers.get("content-length");
  if (
    contentLength &&
    Number.isFinite(Number(contentLength)) &&
    Number(contentLength) > MAX_MARKETPLACE_JSON_BODY_BYTES
  ) {
    throw new MarketplaceServiceError(
      "marketplace_body_too_large",
      "Marketplace mutation body is too large.",
      413,
    );
  }

  if (contentType && !contentType.includes("application/json")) {
    throw new MarketplaceServiceError(
      "marketplace_json_required",
      "Marketplace mutation body must be JSON.",
      415,
    );
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_MARKETPLACE_JSON_BODY_BYTES) {
    throw new MarketplaceServiceError(
      "marketplace_body_too_large",
      "Marketplace mutation body is too large.",
      413,
    );
  }

  const trimmed = raw.trim();
  if (!trimmed) return { body: {}, canonicalBody: "{}" };

  if (!contentType.includes("application/json")) {
    throw new MarketplaceServiceError(
      "marketplace_json_required",
      "Marketplace mutation body must be JSON.",
      415,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new MarketplaceServiceError(
      "marketplace_malformed_json",
      "Marketplace mutation body is malformed.",
      400,
    );
  }

  if (!isRecord(parsed)) {
    throw new MarketplaceServiceError(
      "marketplace_body_invalid",
      "Marketplace mutation body must be an object.",
      400,
    );
  }

  const allowed = new Set(allowedFields);
  const unknown = Object.keys(parsed).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new MarketplaceServiceError(
      "marketplace_unexpected_fields",
      "Marketplace mutation body contains unsupported fields.",
      400,
    );
  }

  return {
    body: parsed,
    canonicalBody: JSON.stringify(
      Object.fromEntries(
        Object.entries(parsed).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ),
    ),
  };
}

export async function marketplaceRequestHash(input: {
  command: string;
  profileId: string;
  canonicalBody: string;
}) {
  const material = [
    input.command,
    input.profileId,
    input.canonicalBody,
  ].join("\n");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(material),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
