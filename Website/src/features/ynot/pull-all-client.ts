export type PullAllQuote = {
  costPerReward: number;
  expiresAt: string;
  packTitle: string;
  startToken: string;
  targetRewards: number;
  totalCostCoins: number;
};

export type PullAllStartedSession = {
  publicCode: string;
  status: string;
  totalCostCoins: number;
  totalPurchasedRewards: number;
};

export class PullAllRequestError extends Error {
  payload: unknown;
  status: number;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "PullAllRequestError";
    this.payload = payload;
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function requestErrorMessage(payload: unknown) {
  if (!isRecord(payload)) return "Request failed.";
  return (
    stringValue(payload.error) ||
    stringValue(payload.message) ||
    stringValue(payload.code) ||
    "Request failed."
  );
}

async function requestPullAllJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new PullAllRequestError(
      requestErrorMessage(payload),
      response.status,
      payload,
    );
  }
  return payload;
}

export async function preparePullAllQuote(campaignId: string) {
  const payload = await requestPullAllJson("/api/ynot/gacha/bulk-open/quote", {
    campaignId,
  });
  const quote = isRecord(payload) && isRecord(payload.quote) ? payload.quote : {};
  const startToken =
    stringValue(quote.startToken) || stringValue(quote.token);
  const targetRewards = numberValue(quote.targetRewards);
  const totalCostCoins = numberValue(quote.totalCostCoins);
  const costPerReward = numberValue(quote.costPerReward);
  const expiresAt = stringValue(quote.expiresAt);
  const packTitle =
    isRecord(quote.pack) && stringValue(quote.pack.title)
      ? stringValue(quote.pack.title)
      : "Pack";

  if (
    !startToken ||
    targetRewards === null ||
    targetRewards < 1 ||
    totalCostCoins === null ||
    totalCostCoins < 1 ||
    costPerReward === null ||
    costPerReward < 1 ||
    !expiresAt
  ) {
    throw new PullAllRequestError(
      "Could not prepare Pull All. Please try again.",
      409,
      payload,
    );
  }

  return {
    costPerReward: Math.floor(costPerReward),
    expiresAt,
    packTitle,
    startToken,
    targetRewards: Math.floor(targetRewards),
    totalCostCoins: Math.floor(totalCostCoins),
  } satisfies PullAllQuote;
}

export async function startPullAllSession(startToken: string) {
  const payload = await requestPullAllJson("/api/ynot/gacha/bulk-open/start", {
    startToken,
  });
  const session =
    isRecord(payload) && isRecord(payload.session) ? payload.session : {};
  const publicCode = stringValue(session.publicCode);
  const status = stringValue(session.status);
  const totalPurchasedRewards = numberValue(session.totalPurchasedRewards);
  const totalCostCoins = numberValue(session.totalCostCoins);

  if (
    !publicCode ||
    !status ||
    totalPurchasedRewards === null ||
    totalCostCoins === null
  ) {
    throw new PullAllRequestError(
      "Pull All started, but its status could not be loaded.",
      202,
      payload,
    );
  }

  return {
    publicCode,
    status,
    totalCostCoins: Math.floor(totalCostCoins),
    totalPurchasedRewards: Math.floor(totalPurchasedRewards),
  } satisfies PullAllStartedSession;
}

export function pullAllClientErrorMessage(error: unknown) {
  if (error instanceof PullAllRequestError) return error.message;
  return error instanceof Error
    ? error.message
    : "Could not start Pull All. Please try again.";
}
