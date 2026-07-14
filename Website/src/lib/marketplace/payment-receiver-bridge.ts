import {
  MARKETPLACE_AUTH_BRIDGE_HEADER,
  type MarketplaceInternalBridgeConfig,
} from "../auth/marketplace-bridge-config.ts";
import {
  marketplaceReceiverFromBridgePayload,
  type MarketplaceReceiver,
} from "./payment-receiver.ts";

type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export async function fetchMarketplaceReceiverViaBridge(
  config: MarketplaceInternalBridgeConfig,
  fetchImpl: FetchImplementation = fetch,
  onNonOk?: (status: number) => void,
): Promise<MarketplaceReceiver | null> {
  const response = await fetchImpl(config.url, {
    method: "GET",
    cache: "no-store",
    redirect: "manual",
    headers: {
      accept: "application/json",
      [MARKETPLACE_AUTH_BRIDGE_HEADER]: config.secret,
    },
  });
  if (!response.ok) {
    onNonOk?.(response.status);
    return null;
  }

  return marketplaceReceiverFromBridgePayload(await response.json());
}

type MarketplaceReceiverRuntimeInput = {
  marketplaceRuntime: boolean;
  loadBridgeReceiver: () => Promise<MarketplaceReceiver | null>;
  loadCoreReceiver: () => Promise<MarketplaceReceiver | null>;
  fallbackReceiver: () => MarketplaceReceiver;
  onLookupError?: (error: unknown) => void;
};

export async function resolveMarketplaceReceiverForRuntime({
  marketplaceRuntime,
  loadBridgeReceiver,
  loadCoreReceiver,
  fallbackReceiver,
  onLookupError,
}: MarketplaceReceiverRuntimeInput): Promise<MarketplaceReceiver> {
  try {
    const receiver = marketplaceRuntime
      ? await loadBridgeReceiver()
      : await loadCoreReceiver();
    return receiver ?? fallbackReceiver();
  } catch (error) {
    onLookupError?.(error);
    return fallbackReceiver();
  }
}
