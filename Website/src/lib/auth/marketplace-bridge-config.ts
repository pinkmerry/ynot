export const MARKETPLACE_AUTH_BRIDGE_HEADER =
  "x-ynot-marketplace-auth" as const;
export const MARKETPLACE_PAYMENT_RECEIVER_BRIDGE_PATH =
  "/api/internal/marketplace/payment-receiver" as const;

const MARKETPLACE_PRODUCTION_BRIDGE_ORIGIN =
  "https://www.ynotopen.com" as const;
const LOCAL_BRIDGE_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export type MarketplaceInternalBridgeConfig = {
  url: string;
  secret: string;
};

type BridgeUrlInput = {
  rawUrl: string | null;
  nodeEnv: string | undefined;
};

export function validatedMarketplaceAuthBridgeUrl({
  rawUrl,
  nodeEnv,
}: BridgeUrlInput) {
  if (!rawUrl) return null;

  try {
    const url = new URL(rawUrl);
    if (url.username || url.password) return null;

    if (nodeEnv === "production") {
      if (url.origin !== MARKETPLACE_PRODUCTION_BRIDGE_ORIGIN) return null;
    } else if (
      !LOCAL_BRIDGE_HOSTS.has(url.hostname) ||
      (url.protocol !== "http:" && url.protocol !== "https:")
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export function buildMarketplacePaymentReceiverBridgeConfig({
  rawUrl,
  secret,
  nodeEnv,
}: BridgeUrlInput & { secret: string | null }): MarketplaceInternalBridgeConfig | null {
  if (!secret) return null;
  const baseUrl = validatedMarketplaceAuthBridgeUrl({ rawUrl, nodeEnv });
  if (!baseUrl) return null;

  const url = new URL(baseUrl);
  url.pathname = MARKETPLACE_PAYMENT_RECEIVER_BRIDGE_PATH;
  url.search = "";
  url.hash = "";
  return { secret, url: url.toString() };
}
