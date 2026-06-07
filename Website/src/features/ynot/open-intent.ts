const openIntentPrefix = "ynot-open";
const openIntentPattern =
  /^ynot-open-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createOpenIntentId() {
  return `${openIntentPrefix}-${crypto.randomUUID()}`;
}

export function normalizeOpenIntentId(value: unknown) {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return openIntentPattern.test(clean) ? clean.toLowerCase() : null;
}

export function openIntentIdempotencyKey(
  intentId: string | null,
  campaignId: string,
  quantity: number,
) {
  const normalized = normalizeOpenIntentId(intentId);
  const safeCampaign = campaignId.trim().toLowerCase();
  const safeQuantity = Math.max(1, Math.round(Number(quantity) || 1));
  if (normalized) {
    return `${openIntentPrefix}:${safeCampaign}:${safeQuantity}:${normalized}`;
  }
  return `${openIntentPrefix}:${safeCampaign}:${safeQuantity}:${createOpenIntentId()}`;
}

export function stripOpenAutoStartUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (url.searchParams.get("auto") !== "1") return;
  url.searchParams.delete("auto");
  window.history.replaceState(window.history.state, "", url.toString());
}
