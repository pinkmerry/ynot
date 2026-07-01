"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export type MarketplaceCartSummaryView = {
  cartCount: number;
  watchlistCount: number;
  subtotalSatang: number;
  unavailableCount: number;
  currency: "THB";
  updatedAt: string | null;
};

type MarketplaceCartContextValue = {
  summary: MarketplaceCartSummaryView;
  drawerOpen: boolean;
  setSummary: (summary: MarketplaceCartSummaryView) => void;
  refreshCartSummary: () => Promise<void>;
  openCartDrawer: () => void;
  closeCartDrawer: () => void;
};

const EMPTY_SUMMARY: MarketplaceCartSummaryView = {
  cartCount: 0,
  watchlistCount: 0,
  subtotalSatang: 0,
  unavailableCount: 0,
  currency: "THB",
  updatedAt: null,
};

const MarketplaceCartContext =
  createContext<MarketplaceCartContextValue | null>(null);

function numeric(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeSummary(
  input: Partial<MarketplaceCartSummaryView> | null | undefined,
): MarketplaceCartSummaryView {
  return {
    cartCount: numeric(input?.cartCount),
    watchlistCount: numeric(input?.watchlistCount),
    subtotalSatang: numeric(input?.subtotalSatang),
    unavailableCount: numeric(input?.unavailableCount),
    currency: "THB",
    updatedAt: typeof input?.updatedAt === "string" ? input.updatedAt : null,
  };
}

export function MarketplaceCartProvider({
  children,
  initialSummary,
}: {
  children: ReactNode;
  initialSummary?: Partial<MarketplaceCartSummaryView> | null;
}) {
  const [summary, setSummaryState] = useState(() =>
    normalizeSummary(initialSummary ?? EMPTY_SUMMARY),
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  const setSummary = useCallback((next: MarketplaceCartSummaryView) => {
    setSummaryState(normalizeSummary(next));
  }, []);

  const refreshCartSummary = useCallback(async () => {
    const response = await fetch("/api/marketplace/cart/summary", {
      method: "GET",
      headers: { accept: "application/json" },
    });
    const result = (await response.json().catch(() => null)) as {
      summary?: MarketplaceCartSummaryView;
    } | null;
    if (!response.ok) {
      throw new Error("Could not refresh cart.");
    }
    setSummaryState(normalizeSummary(result?.summary));
  }, []);

  const value = useMemo(
    () => ({
      summary,
      drawerOpen,
      setSummary,
      refreshCartSummary,
      openCartDrawer: () => setDrawerOpen(true),
      closeCartDrawer: () => setDrawerOpen(false),
    }),
    [drawerOpen, refreshCartSummary, setSummary, summary],
  );

  return (
    <MarketplaceCartContext.Provider value={value}>
      {children}
    </MarketplaceCartContext.Provider>
  );
}

export function useMarketplaceCart() {
  const value = useContext(MarketplaceCartContext);
  if (!value) {
    throw new Error("useMarketplaceCart must be used inside MarketplaceCartProvider.");
  }
  return value;
}
