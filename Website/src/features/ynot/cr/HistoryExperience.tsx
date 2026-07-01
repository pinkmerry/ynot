"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type {
  YnotAddress,
  YnotCollectionItem,
  YnotPublicPrizeDisplayTier,
  YnotViewer,
} from "../types";
import {
  isCompleteShippingAddress,
  missingShippingAddressFields,
} from "../address-utils";
import { useStoreLanguage } from "../StorePreferences";
import { I18nText, localized, type Language } from "../i18n";
import { BulkOpenBagStatus } from "./BulkOpenBagStatus";
import { CoinPip, Ico, formatCoins } from "./Icons";
import { Modal, PageHead, useToast } from "./UiKit";

type TabKey = "collection" | "marketplace" | "shipped" | "converted";
type RewardTabKey = Exclude<TabKey, "marketplace">;
type TierKey = YnotPublicPrizeDisplayTier;
type StatusKey = "owned" | "shipped" | "converted";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function statusBucket(status: YnotCollectionItem["status"]): StatusKey | null {
  if (status === "owned") return "owned";
  if (
    status === "shipped" ||
    status === "shipping_requested" ||
    status === "shipping_preparing"
  ) return "shipped";
  if (
    status === "exchanged" ||
    status === "exchange_requested" ||
    status === "converting"
  )
    return "converted";
  return null;
}

function deriveTier(item: YnotCollectionItem): TierKey {
  const sourceTier = item.sourcePrizeTier;
  if (item.sourceIsLastPrize || sourceTier === "last_prize") {
    return "last_prize";
  }
  if (
    sourceTier === "rainbow" ||
    sourceTier === "gold" ||
    sourceTier === "silver" ||
    sourceTier === "bronze"
  ) {
    return sourceTier;
  }
  const grade = (item.cardGrade ?? "").toLowerCase();
  const tier = (item.cardPrizeCategory ?? "").toLowerCase();
  if (grade.includes("rainbow") || tier.includes("rainbow")) return "rainbow";
  if (grade.includes("gold") || tier.includes("gold")) return "gold";
  if (grade.includes("silver") || tier.includes("silver")) return "silver";
  return "bronze";
}

function tierClassName(tier: TierKey): string {
  return tier === "last_prize" ? "last-prize" : tier;
}

function tierLabel(tier: TierKey, language: Language): string {
  if (tier === "last_prize") return "LAST PRIZE";
  if (language === "th") {
    if (tier === "rainbow") return "เรนโบว์";
    if (tier === "gold") return "โกลด์";
    if (tier === "silver") return "ซิลเวอร์";
    return "บรอนซ์";
  }
  return tier.toUpperCase();
}

function cardSeries(item: YnotCollectionItem): string {
  return (item.cardSeries ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function seriesLabel(series: string): string {
  if (series === "pokemon") return "Pokemon";
  if (series === "one_piece") return "One Piece";
  return series.replace(/_/g, " ");
}

function statusLabel(bucket: StatusKey, language: Language): string {
  if (bucket === "owned") return language === "th" ? "ถืออยู่" : "Owned";
  if (bucket === "shipped") return language === "th" ? "จัดส่งแล้ว" : "Shipped";
  return language === "th" ? "แลกแล้ว" : "Converted";
}

function collectionDisplayCode(item: YnotCollectionItem, language: Language): string {
  return item.cardCode ??
    item.serialNo ??
    localized({ en: "Collection reward", th: "รางวัลในคอลเลกชัน" }, language);
}

type EnrichedItem = YnotCollectionItem & {
  bucket: StatusKey;
  tier: TierKey;
  series: string;
  acquiredLabel: string;
  sellValueCoins: number;
};

type ConvertSelectionMode = "selected" | "all_eligible";
type ShippingSelectionMode = "selected" | "all_eligible";

type ConvertQuote = {
  quoteToken: string;
  selectionMode: ConvertSelectionMode;
  itemCount: number;
  totalCoins: number;
  expiresAt: string | null;
};

type ConvertProgress = {
  id?: string;
  jobId?: string;
  status: string;
  itemCount: number;
  convertedCount: number;
  totalCoins: number;
  creditedTotalCoins: number;
  completed: boolean;
  failed: boolean;
  completedAt?: string;
  updatedAt?: string;
};

type ShippingQuote = {
  quoteToken: string;
  selectionMode: ShippingSelectionMode;
  itemCount: number;
  totalCoinValue: number;
  selectedCoinValue: number;
  minimumCoinValue: number;
  expiresAt: string | null;
  address: {
    label: string | null;
    recipientName: string | null;
    phone: string | null;
    summary: string | null;
  };
};

type ShippingProgress = {
  id?: string;
  jobId?: string;
  status: string;
  publicCode: string;
  itemCount: number;
  preparedCount: number;
  totalCoinValue: number;
  completed: boolean;
  completedAt?: string;
  updatedAt?: string;
};

type MarketplaceBagSummary = {
  accountId: string | null;
  ordersTotal: number;
  pendingPaymentOrders: number;
  paidOrders: number;
  refundOrders: number;
  sellerSubmissions: number;
  sellerListings: number;
  sellerPayouts: number;
};

function marketplaceSummaryFromPayload(payload: unknown): MarketplaceBagSummary | null {
  if (!isRecord(payload) || !isRecord(payload.summary)) return null;
  const summary = payload.summary;
  return {
    accountId: typeof summary.accountId === "string" ? summary.accountId : null,
    ordersTotal: numberFrom(summary.ordersTotal),
    pendingPaymentOrders: numberFrom(summary.pendingPaymentOrders),
    paidOrders: numberFrom(summary.paidOrders),
    refundOrders: numberFrom(summary.refundOrders),
    sellerSubmissions: numberFrom(summary.sellerSubmissions),
    sellerListings: numberFrom(summary.sellerListings),
    sellerPayouts: numberFrom(summary.sellerPayouts),
  };
}

function enrich(item: YnotCollectionItem, language: Language): EnrichedItem | null {
  const bucket = statusBucket(item.status);
  if (!bucket) return null;
  const tier = deriveTier(item);
  return {
    ...item,
    bucket,
    tier,
    series: cardSeries(item),
    acquiredLabel: new Date(item.acquiredAt).toLocaleDateString(language === "th" ? "th-TH" : "en-US"),
    sellValueCoins: item.convertCoinValue ?? 0,
  };
}

function isConvertibleReward(item: EnrichedItem) {
  if (item.bucket !== "owned") return false;
  if (!item.canConvert) return false;
  if ((item.sellValueCoins ?? 0) <= 0) return false;
  if (!item.convertExpiresAt) return true;
  const expiresAt = new Date(item.convertExpiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

function isShippableReward(item: EnrichedItem) {
  return item.bucket === "owned" && item.canShip;
}

function rewardPolicyLabel(item: EnrichedItem, language: Language) {
  if (item.fulfillmentPolicy === "ship_only") {
    return localized({ en: "Ship only", th: "จัดส่งเท่านั้น" }, language);
  }
  if (item.fulfillmentPolicy === "convert_only") {
    return localized({ en: "Sell only", th: "แลกเหรียญเท่านั้น" }, language);
  }
  return null;
}

function numberFrom(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) ? Math.max(0, Math.round(next)) : 0;
}

function quoteFromPayload(payload: unknown): ConvertQuote | null {
  if (!isRecord(payload) || !isRecord(payload.quote)) return null;
  const quote = payload.quote;
  const quoteToken = typeof quote.quoteToken === "string" ? quote.quoteToken : "";
  if (!quoteToken) return null;
  return {
    quoteToken,
    selectionMode:
      quote.selectionMode === "all_eligible" ? "all_eligible" : "selected",
    itemCount: numberFrom(quote.itemCount),
    totalCoins: numberFrom(quote.totalCoins),
    expiresAt: typeof quote.expiresAt === "string" ? quote.expiresAt : null,
  };
}

function quoteExpiresAtMs(quote: ConvertQuote | null) {
  if (!quote?.expiresAt) return null;
  const expiresAt = new Date(quote.expiresAt).getTime();
  return Number.isFinite(expiresAt) ? expiresAt : null;
}

function quoteIsExpired(quote: ConvertQuote | null) {
  const expiresAt = quoteExpiresAtMs(quote);
  return expiresAt !== null && expiresAt <= Date.now();
}

function shippingQuoteFromPayload(payload: unknown): ShippingQuote | null {
  if (!isRecord(payload) || !isRecord(payload.quote)) return null;
  const quote = payload.quote;
  const quoteToken = typeof quote.quoteToken === "string" ? quote.quoteToken : "";
  if (!quoteToken) return null;
  const address = isRecord(quote.address) ? quote.address : {};
  return {
    quoteToken,
    selectionMode:
      quote.selectionMode === "all_eligible" ? "all_eligible" : "selected",
    itemCount: numberFrom(quote.itemCount),
    totalCoinValue: numberFrom(quote.totalCoinValue),
    selectedCoinValue: numberFrom(quote.selectedCoinValue),
    minimumCoinValue: numberFrom(quote.minimumCoinValue),
    expiresAt: typeof quote.expiresAt === "string" ? quote.expiresAt : null,
    address: {
      label: typeof address.label === "string" ? address.label : null,
      recipientName:
        typeof address.recipientName === "string" ? address.recipientName : null,
      phone: typeof address.phone === "string" ? address.phone : null,
      summary: typeof address.summary === "string" ? address.summary : null,
    },
  };
}

function shippingQuoteExpiresAtMs(quote: ShippingQuote | null) {
  if (!quote?.expiresAt) return null;
  const expiresAt = new Date(quote.expiresAt).getTime();
  return Number.isFinite(expiresAt) ? expiresAt : null;
}

function shippingQuoteIsExpired(quote: ShippingQuote | null) {
  const expiresAt = shippingQuoteExpiresAtMs(quote);
  return expiresAt !== null && expiresAt <= Date.now();
}

function progressFromPayload(payload: unknown): ConvertProgress | null {
  if (!isRecord(payload) || !isRecord(payload.conversion)) return null;
  const conversion = payload.conversion;
  return {
    id: typeof conversion.id === "string" ? conversion.id : undefined,
    jobId: typeof conversion.jobId === "string" ? conversion.jobId : undefined,
    status: typeof conversion.status === "string" ? conversion.status : "pending",
    itemCount: numberFrom(conversion.itemCount),
    convertedCount: numberFrom(conversion.convertedCount),
    totalCoins: numberFrom(conversion.totalCoins),
    creditedTotalCoins: numberFrom(conversion.creditedTotalCoins),
    completed: conversion.completed === true,
    failed: conversion.failed === true || conversion.status === "failed",
    completedAt:
      typeof conversion.completedAt === "string" ? conversion.completedAt : undefined,
    updatedAt:
      typeof conversion.updatedAt === "string" ? conversion.updatedAt : undefined,
  };
}

function conversionIsTerminal(progress: ConvertProgress | null) {
  return Boolean(progress && (progress.completed || progress.failed));
}

function shippingProgressFromPayload(payload: unknown): ShippingProgress | null {
  if (!isRecord(payload) || !isRecord(payload.shipping)) return null;
  const shipping = payload.shipping;
  return {
    id: typeof shipping.id === "string" ? shipping.id : undefined,
    jobId: typeof shipping.jobId === "string" ? shipping.jobId : undefined,
    status: typeof shipping.status === "string" ? shipping.status : "preparing",
    publicCode: typeof shipping.publicCode === "string" ? shipping.publicCode : "",
    itemCount: numberFrom(shipping.itemCount),
    preparedCount: numberFrom(shipping.preparedCount),
    totalCoinValue: numberFrom(shipping.totalCoinValue),
    completed: shipping.completed === true,
    completedAt:
      typeof shipping.completedAt === "string" ? shipping.completedAt : undefined,
    updatedAt:
      typeof shipping.updatedAt === "string" ? shipping.updatedAt : undefined,
  };
}

export type HistoryExperienceProps = {
  collection: YnotCollectionItem[];
  addresses: YnotAddress[];
  viewerRole?: YnotViewer["adminRole"];
};

export function HistoryExperience({
  collection,
  addresses,
  viewerRole,
}: HistoryExperienceProps) {
  const { toast } = useToast();
  const language = useStoreLanguage();
  const router = useRouter();
  const [, startRefreshTransition] = useTransition();
  const refreshedConversionKeyRef = useRef("");
  const refreshedShippingKeyRef = useRef("");
  const showMarketplace = viewerRole === "owner";
  const [tab, setTab] = useState<TabKey>("collection");
  const [seriesFilter, setSeriesFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addressRows, setAddressRows] = useState(addresses);
  const [sellOpen, setSellOpen] = useState(false);
  const [sellMode, setSellMode] = useState<ConvertSelectionMode>("selected");
  const [sellQuote, setSellQuote] = useState<ConvertQuote | null>(null);
  const [sellProgress, setSellProgress] = useState<ConvertProgress | null>(null);
  const [sellPreparing, setSellPreparing] = useState(false);
  const [sellConfirming, setSellConfirming] = useState(false);
  const [, refreshQuoteClock] = useState(0);
  const [shipOpen, setShipOpen] = useState(false);
  const [shipMode, setShipMode] = useState<ShippingSelectionMode>("selected");
  const [shipAddressId, setShipAddressId] = useState("");
  const [shipQuote, setShipQuote] = useState<ShippingQuote | null>(null);
  const [shipProgress, setShipProgress] = useState<ShippingProgress | null>(null);
  const [shipPreparing, setShipPreparing] = useState(false);
  const [shipConfirming, setShipConfirming] = useState(false);
  const [marketplaceSummary, setMarketplaceSummary] =
    useState<MarketplaceBagSummary | null>(null);
  const [marketplaceSummaryState, setMarketplaceSummaryState] = useState<
    "idle" | "loading" | "ready" | "unavailable" | "error"
  >("idle");

  const enriched = useMemo(() => {
    const list: EnrichedItem[] = [];
    for (const item of collection) {
      const enrichedItem = enrich(item, language);
      if (enrichedItem) list.push(enrichedItem);
    }
    return list;
  }, [collection, language]);

  const byTab: Record<RewardTabKey, EnrichedItem[]> = useMemo(() => {
    return {
      collection: enriched.filter((c) => c.bucket === "owned"),
      shipped: enriched.filter((c) => c.bucket === "shipped"),
      converted: enriched.filter((c) => c.bucket === "converted"),
    };
  }, [enriched]);

  const visibleCards = useMemo(() => {
    if (tab === "marketplace") return [];
    return byTab[tab]
      .filter(
        (c) => seriesFilter === "all" || c.series === seriesFilter,
      )
      .filter((c) => {
        if (!search.trim()) return true;
        const needle = search.toLowerCase();
        return (
          c.cardName.toLowerCase().includes(needle) ||
          (c.cardCode ?? "").toLowerCase().includes(needle)
        );
      });
  }, [byTab, tab, seriesFilter, search]);

  const seriesOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of enriched) {
      if (item.series) set.add(item.series);
    }
    return Array.from(set).sort();
  }, [enriched]);

  function toggleSelect(id: string, bucket: StatusKey) {
    if (bucket !== "owned") {
      toast(
        "error",
        localized(
          {
            en: "Only owned cards can be selected for actions.",
            th: "เลือกได้เฉพาะการ์ดที่ยังถืออยู่เท่านั้น",
          },
          language,
        ),
      );
      return;
    }
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function handleAddressSaved(address: YnotAddress) {
    setAddressRows((current) => {
      const withoutCurrent = current
        .filter((row) => row.id !== address.id)
        .map((row) => (address.isDefault ? { ...row, isDefault: false } : row));
      return address.isDefault
        ? [address, ...withoutCurrent]
        : [...withoutCurrent, address];
    });
  }

  function selectAll() {
    const owned = visibleCards
      .filter((c) => c.bucket === "owned")
      .map((c) => c.id);
    setSelected(new Set(owned));
  }

  function selectAllConvertible() {
    const convertible = visibleCards
      .filter((card) => card.bucket === "owned" && isConvertibleReward(card))
      .map((card) => card.id);
    setSelected(new Set(convertible));
  }

  const selectedCards = enriched.filter((c) => selected.has(c.id) && c.bucket === "owned");
  const ownedShipCards = enriched.filter(isShippableReward);
  const selectedShippableCards = selectedCards.filter(isShippableReward);
  const selectedNonShippableCount = selectedCards.length - selectedShippableCards.length;
  const selectedConvertibleCards = selectedCards.filter(isConvertibleReward);
  const selectedNonConvertibleCount = selectedCards.length - selectedConvertibleCards.length;
  const sellTotal = selectedConvertibleCards.reduce(
    (sum, c) => sum + (c.sellValueCoins ?? 0),
    0,
  );
  const displayedSellCount = sellQuote?.itemCount ?? selectedCards.length;
  const displayedSellTotal = sellQuote?.totalCoins ?? sellTotal;
  const sellBusy = sellPreparing || sellConfirming;
  const sellQuoteExpired = quoteIsExpired(sellQuote);
  const shipActive = Boolean(shipProgress && !shipProgress.completed);
  const sellActive = Boolean(sellProgress && !conversionIsTerminal(sellProgress));
  const shipBusy = shipPreparing || shipConfirming;
  const shipQuoteExpired = shippingQuoteIsExpired(shipQuote);
  const displayedShipCards = selectedCards.length ? selectedShippableCards : ownedShipCards;
  const displayedShipCount = shipQuote?.itemCount ?? displayedShipCards.length;
  const displayedShipTotal = shipQuote?.selectedCoinValue ?? displayedShipCards.reduce(
    (sum, c) =>
      c.fulfillmentPolicy === "ship_or_convert"
        ? sum + (c.sellValueCoins ?? 0)
        : sum,
    0,
  );
  const marketplaceActivityCount =
    (marketplaceSummary?.ordersTotal ?? 0) +
    (marketplaceSummary?.pendingPaymentOrders ?? 0) +
    (marketplaceSummary?.sellerSubmissions ?? 0);

  const refreshCollectionRoute = useCallback(
    function refreshCollectionRoute(kind: "conversion" | "shipping", progress: ConvertProgress | ShippingProgress) {
      const identity =
        "publicCode" in progress && progress.publicCode
          ? progress.publicCode
          : progress.jobId ?? progress.id ?? "";
      const key = [
        kind,
        identity,
        progress.status,
        progress.completedAt ?? "",
        progress.updatedAt ?? "",
        progress.itemCount,
      ].join(":");
      const keyRef =
        kind === "conversion" ? refreshedConversionKeyRef : refreshedShippingKeyRef;
      if (keyRef.current === key) return;
      keyRef.current = key;
      startRefreshTransition(() => router.refresh());
    },
    [router, startRefreshTransition],
  );

  async function openSell(nextMode: ConvertSelectionMode) {
    if (shipActive) {
      toast(
        "error",
        localized(
          {
            en: "Finish the active shipping request before converting rewards.",
            th: "ทำคำขอจัดส่งที่กำลังดำเนินการให้เสร็จก่อนแลกรางวัลเป็นเหรียญ",
          },
          language,
        ),
      );
      return;
    }
    if (nextMode === "selected" && !selectedConvertibleCards.length) {
      toast("error", localized({ en: "No rewards selected", th: "ยังไม่ได้เลือกรางวัล" }, language));
      return;
    }
    if (nextMode === "selected" && selectedNonConvertibleCount > 0) {
      toast(
        "error",
        localized(
          {
            en: `Remove ${selectedNonConvertibleCount.toLocaleString()} non-convertible reward${selectedNonConvertibleCount === 1 ? "" : "s"} before converting.`,
            th: `นำของรางวัลที่แลกไม่ได้ออก ${selectedNonConvertibleCount.toLocaleString()} รายการก่อนแลกเหรียญ`,
          },
          language,
        ),
      );
      return;
    }
    setSellMode(nextMode);
    setSellQuote(null);
    setSellProgress(null);
    setSellOpen(true);
    setSellPreparing(true);
    try {
      const response = await fetch("/api/ynot/collection/convert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          nextMode === "all_eligible"
            ? { intent: "quote", selectionMode: "all_eligible" }
            : {
                intent: "quote",
                selectionMode: "selected",
                collectionItemIds: selectedConvertibleCards.map((card) => card.id),
              },
        ),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
            isRecord(payload) && typeof payload.error === "string"
              ? payload.error
            : localized(
                { en: "Conversion request failed.", th: "ส่งคำขอแลกเหรียญไม่สำเร็จ" },
                language,
              ),
        );
      }
      const quote = quoteFromPayload(payload);
      if (!quote || quote.itemCount === 0) {
        throw new Error(localized({ en: "No rewards selected", th: "ยังไม่ได้เลือกรางวัล" }, language));
      }
      setSellQuote(quote);
    } catch (error) {
      toast(
        "error",
        error instanceof Error
          ? error.message
          : localized(
              { en: "Conversion request failed.", th: "ส่งคำขอแลกเหรียญไม่สำเร็จ" },
              language,
            ),
      );
      setSellOpen(false);
    } finally {
      setSellPreparing(false);
    }
  }

  function submitSell() {
    if (shipActive) {
      toast(
        "error",
        localized(
          {
            en: "Finish the active shipping request before converting rewards.",
            th: "ทำคำขอจัดส่งที่กำลังดำเนินการให้เสร็จก่อนแลกรางวัลเป็นเหรียญ",
          },
          language,
        ),
      );
      return;
    }
    if (!sellQuote || sellConfirming) return;
    if (quoteIsExpired(sellQuote)) {
      toast(
        "info",
        localized(
          {
            en: "Conversion quote expired. Recalculating the latest total.",
            th: "ใบเสนอราคาแลกเหรียญหมดอายุ กำลังคำนวณยอดล่าสุด",
          },
          language,
        ),
      );
      void openSell(sellMode);
      return;
    }
    setSellConfirming(true);
    void (async () => {
      try {
        const response = await fetch("/api/ynot/collection/convert", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            intent: "start",
            quoteToken: sellQuote.quoteToken,
            idempotencyKey: crypto.randomUUID(),
          }),
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            isRecord(payload) && typeof payload.error === "string"
              ? payload.error
              : "Conversion request failed.";
          if (/expired/i.test(message)) {
            toast(
              "info",
              localized(
                {
                  en: "Conversion quote expired. Recalculating the latest total.",
                  th: "ใบเสนอราคาแลกเหรียญหมดอายุ กำลังคำนวณยอดล่าสุด",
                },
                language,
              ),
            );
            void openSell(sellMode);
            return;
          }
          if (/changed/i.test(message)) {
            toast(
              "info",
              localized(
                {
                  en: "Reward values changed. Recalculating the latest total.",
                  th: "มูลค่ารางวัลเปลี่ยนไป กำลังคำนวณยอดล่าสุด",
                },
                language,
              ),
            );
            void openSell(sellMode);
            return;
          }
          throw new Error(
            message,
          );
        }
        const progress = progressFromPayload(payload);
        if (!progress) {
          throw new Error(
            localized(
              { en: "Conversion request failed.", th: "ส่งคำขอแลกเหรียญไม่สำเร็จ" },
              language,
            ),
          );
        }
        setSellProgress(progress);
        if (conversionIsTerminal(progress)) {
          refreshCollectionRoute("conversion", progress);
        }
        clearSelection();
        if (progress.completed) {
          toast(
            "success",
            language === "th"
              ? `เพิ่ม ${formatCoins(progress.creditedTotalCoins)} เหรียญแล้ว`
              : `${formatCoins(progress.creditedTotalCoins)} coins credited.`,
          );
        }
      } catch (error) {
        toast(
          "error",
          error instanceof Error
            ? error.message
            : localized(
                { en: "Conversion request failed.", th: "ส่งคำขอแลกเหรียญไม่สำเร็จ" },
                language,
              ),
        );
      } finally {
        setSellConfirming(false);
      }
    })();
  }

  useEffect(() => {
    const expiresAt = quoteExpiresAtMs(sellQuote);
    if (expiresAt === null) return;
    const delayMs = Math.max(0, expiresAt - Date.now() + 250);
    const timer = window.setTimeout(() => {
      refreshQuoteClock((value) => value + 1);
    }, Math.min(delayMs, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [sellQuote]);

  useEffect(() => {
    const expiresAt = shippingQuoteExpiresAtMs(shipQuote);
    if (expiresAt === null) return;
    const delayMs = Math.max(0, expiresAt - Date.now() + 250);
    const timer = window.setTimeout(() => {
      refreshQuoteClock((value) => value + 1);
    }, Math.min(delayMs, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [shipQuote]);

  const shouldPollConversion =
    sellOpen && Boolean(sellProgress && !conversionIsTerminal(sellProgress));
  const shouldPollShipping =
    shipOpen && Boolean(shipProgress && !shipProgress.completed);

  useEffect(() => {
    if (!shouldPollConversion) return;
    let stopped = false;
    const refresh = async () => {
      try {
        const response = await fetch("/api/ynot/collection/convert/current", {
          method: "GET",
        });
        if (!response.ok) return;
        const payload: unknown = await response.json().catch(() => null);
        const progress = progressFromPayload(payload);
        if (progress && !stopped) {
          setSellProgress(progress);
          if (progress && conversionIsTerminal(progress)) {
            refreshCollectionRoute("conversion", progress);
          }
        }
      } catch {
        // The next refresh will try again.
      }
    };
    const timer = window.setInterval(refresh, 3000);
    void refresh();
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [refreshCollectionRoute, shouldPollConversion]);

  useEffect(() => {
    if (!shouldPollShipping) return;
    let stopped = false;
    const refresh = async () => {
      try {
        const response = await fetch("/api/ynot/shipping/current", {
          method: "GET",
        });
        if (!response.ok) return;
        const payload: unknown = await response.json().catch(() => null);
        const progress = shippingProgressFromPayload(payload);
        if (progress && !stopped) {
          setShipProgress(progress);
          if (progress && progress.completed) {
            refreshCollectionRoute("shipping", progress);
          }
        }
      } catch {
        // The next refresh will try again.
      }
    };
    const timer = window.setInterval(refresh, 5000);
    void refresh();
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [refreshCollectionRoute, shouldPollShipping]);

  useEffect(() => {
    let stopped = false;
    const loadCurrent = async () => {
      try {
        const response = await fetch("/api/ynot/collection/convert/current", {
          method: "GET",
        });
        if (!response.ok) return;
        const payload: unknown = await response.json().catch(() => null);
        const progress = progressFromPayload(payload);
        if (progress && !conversionIsTerminal(progress) && !stopped) {
          setSellProgress(progress);
        }
      } catch {
        // Status will refresh after the next user action.
      }
    };
    void loadCurrent();
    return () => {
      stopped = true;
    };
  }, []);

  useEffect(() => {
    let stopped = false;
    const loadCurrent = async () => {
      try {
        const response = await fetch("/api/ynot/shipping/current", {
          method: "GET",
        });
        if (!response.ok) return;
        const payload: unknown = await response.json().catch(() => null);
        const progress = shippingProgressFromPayload(payload);
        if (progress && !progress.completed && !stopped) {
          setShipProgress(progress);
        }
      } catch {
        // Status will refresh after the next user action.
      }
    };
    void loadCurrent();
    return () => {
      stopped = true;
    };
  }, []);

  useEffect(() => {
    if (!showMarketplace) {
      setMarketplaceSummary(null);
      setMarketplaceSummaryState("unavailable");
      return;
    }

    let stopped = false;
    const loadMarketplaceSummary = async () => {
      setMarketplaceSummaryState("loading");
      try {
        const response = await fetch("/api/marketplace/bag/summary", {
          cache: "no-store",
        });
        const payload: unknown = await response.json().catch(() => null);
        if (stopped) return;
        if (response.status === 403 || response.status === 503) {
          setMarketplaceSummary(null);
          setMarketplaceSummaryState("unavailable");
          return;
        }
        if (!response.ok) throw new Error("Marketplace summary failed.");
        setMarketplaceSummary(marketplaceSummaryFromPayload(payload));
        setMarketplaceSummaryState("ready");
      } catch {
        if (!stopped) {
          setMarketplaceSummary(null);
          setMarketplaceSummaryState("error");
        }
      }
    };
    void loadMarketplaceSummary();
    return () => {
      stopped = true;
    };
  }, [showMarketplace]);

  useEffect(() => {
    if (!showMarketplace && tab === "marketplace") {
      setTab("collection");
      clearSelection();
    }
  }, [showMarketplace, tab]);

  function toastSelectedNonShippable() {
    toast(
      "error",
      localized(
        {
          en: `Remove ${selectedNonShippableCount} non-shippable reward${
            selectedNonShippableCount === 1 ? "" : "s"
          } before requesting shipping.`,
          th: `นำรางวัลที่จัดส่งไม่ได้ออก ${selectedNonShippableCount} รายการก่อนขอจัดส่ง`,
        },
        language,
      ),
    );
  }

  function openShip(nextMode: ShippingSelectionMode) {
    if (shipActive) {
      setShipOpen(true);
      return;
    }
    if (sellActive) {
      toast(
        "error",
        localized(
          {
            en: "Finish the active conversion before requesting shipping.",
            th: "ทำรายการแลกเหรียญที่กำลังดำเนินการให้เสร็จก่อนขอจัดส่ง",
          },
          language,
        ),
      );
      setSellOpen(true);
      return;
    }
    if (nextMode === "selected" && !selectedCards.length) {
      toast(
        "error",
        localized(
          {
            en: "Select cards to ship or request all shippable rewards.",
            th: "เลือกการ์ดที่จะจัดส่ง หรือขอจัดส่งของรางวัลที่จัดส่งได้ทั้งหมด",
          },
          language,
        ),
      );
      return;
    }
    if (nextMode === "selected" && selectedNonShippableCount > 0) {
      toastSelectedNonShippable();
      return;
    }
    if (nextMode === "selected" && !selectedShippableCards.length) {
      toast("error", localized({ en: "No shippable rewards selected.", th: "ยังไม่ได้เลือกรางวัลที่จัดส่งได้" }, language));
      return;
    }
    if (nextMode === "all_eligible" && !ownedShipCards.length) {
      toast(
        "error",
        localized(
          {
            en: "No shippable rewards are ready for shipping.",
            th: "ยังไม่มีของรางวัลที่พร้อมจัดส่ง",
          },
          language,
        ),
      );
      return;
    }
    setShipMode(nextMode);
    setShipQuote(null);
    setShipProgress(null);
    setShipOpen(true);
  }

  async function quoteShip(addressId: string) {
    if (shipActive) {
      setShipOpen(true);
      return;
    }
    if (sellActive) {
      toast(
        "error",
        localized(
          {
            en: "Finish the active conversion before requesting shipping.",
            th: "ทำรายการแลกเหรียญที่กำลังดำเนินการให้เสร็จก่อนขอจัดส่ง",
          },
          language,
        ),
      );
      setSellOpen(true);
      return;
    }
    if (!addressId || shipPreparing) return;
    if (shipMode === "selected" && !selectedCards.length) {
      toast("error", localized({ en: "Select at least one card.", th: "เลือกการ์ดอย่างน้อย 1 ใบ" }, language));
      return;
    }
    if (shipMode === "selected" && selectedNonShippableCount > 0) {
      toastSelectedNonShippable();
      return;
    }
    if (shipMode === "selected" && !selectedShippableCards.length) {
      toast("error", localized({ en: "No shippable rewards selected.", th: "ยังไม่ได้เลือกรางวัลที่จัดส่งได้" }, language));
      return;
    }
    if (shipMode === "all_eligible" && !ownedShipCards.length) {
      toast("error", localized({ en: "No shippable rewards are ready for shipping.", th: "ยังไม่มีของรางวัลที่พร้อมจัดส่ง" }, language));
      return;
    }
    setShipAddressId(addressId);
    setShipQuote(null);
    setShipProgress(null);
    setShipPreparing(true);
    try {
      const response = await fetch("/api/ynot/shipping", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          shipMode === "all_eligible"
            ? {
                intent: "quote",
                selectionMode: "all_eligible",
                addressId,
              }
            : {
                intent: "quote",
                selectionMode: "selected",
                addressId,
                collectionItemIds: selectedShippableCards.map((card) => card.id),
              },
        ),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
            isRecord(payload) && typeof payload.error === "string"
              ? payload.error
            : localized(
                { en: "Shipping request failed.", th: "ส่งคำขอจัดส่งไม่สำเร็จ" },
                language,
              ),
        );
      }
      const quote = shippingQuoteFromPayload(payload);
      if (!quote || quote.itemCount === 0) {
        throw new Error(localized({ en: "No shippable rewards are ready for shipping.", th: "ยังไม่มีของรางวัลที่พร้อมจัดส่ง" }, language));
      }
      setShipQuote(quote);
    } catch (error) {
      toast(
        "error",
        error instanceof Error
          ? error.message
          : localized(
              { en: "Shipping request failed.", th: "ส่งคำขอจัดส่งไม่สำเร็จ" },
              language,
            ),
      );
    } finally {
      setShipPreparing(false);
    }
  }

  function submitShip() {
    if (shipActive) return;
    if (sellActive) {
      toast(
        "error",
        localized(
          {
            en: "Finish the active conversion before requesting shipping.",
            th: "ทำรายการแลกเหรียญที่กำลังดำเนินการให้เสร็จก่อนขอจัดส่ง",
          },
          language,
        ),
      );
      setSellOpen(true);
      return;
    }
    if (!shipQuote || shipConfirming) return;
    if (shippingQuoteIsExpired(shipQuote)) {
      toast(
        "info",
        localized(
          {
            en: "Shipping quote expired. Recalculating the latest request.",
            th: "ใบเสนอราคาจัดส่งหมดอายุ กำลังคำนวณคำขอล่าสุด",
          },
          language,
        ),
      );
      void quoteShip(shipAddressId);
      return;
    }
    setShipConfirming(true);
    void (async () => {
      try {
        const response = await fetch("/api/ynot/shipping", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            intent: "start",
            quoteToken: shipQuote.quoteToken,
            idempotencyKey: crypto.randomUUID(),
          }),
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            isRecord(payload) && typeof payload.error === "string"
              ? payload.error
              : "Shipping request failed.";
          if (/expired/i.test(message)) {
            toast(
              "info",
              localized(
                {
                  en: "Shipping quote expired. Recalculating the latest request.",
                  th: "ใบเสนอราคาจัดส่งหมดอายุ กำลังคำนวณคำขอล่าสุด",
                },
                language,
              ),
            );
            void quoteShip(shipAddressId);
            return;
          }
          throw new Error(message);
        }
        const progress = shippingProgressFromPayload(payload);
        if (!progress) {
          throw new Error(
            localized(
              { en: "Shipping request failed.", th: "ส่งคำขอจัดส่งไม่สำเร็จ" },
              language,
            ),
          );
        }
        setShipProgress(progress);
        if (progress.completed) {
          refreshCollectionRoute("shipping", progress);
        }
        clearSelection();
        if (progress.completed) {
          toast(
            "success",
            language === "th"
              ? `ส่งคำขอจัดส่ง ${progress.publicCode || ""} แล้ว`
              : `Shipping request ${progress.publicCode || ""} submitted.`,
          );
        }
      } catch (error) {
        toast(
          "error",
          error instanceof Error
            ? error.message
            : localized(
                { en: "Shipping request failed.", th: "ส่งคำขอจัดส่งไม่สำเร็จ" },
                language,
              ),
        );
      } finally {
        setShipConfirming(false);
      }
    })();
  }

  return (
    <div className="cr-page">
      <PageHead
        eyebrow={<I18nText en="Collection" th="คอลเลกชัน" />}
        title={<I18nText en="My collection" th="คอลเลกชันของฉัน" />}
        lead={<I18nText en="Cards you own, ship, or sell back to coins." th="การ์ดที่คุณถืออยู่ ขอจัดส่ง หรือแลกกลับเป็นเหรียญได้" />}
        actions={
          <Link className="cr-btn cr-btn-primary" href="/packs">
            <Ico name="sparkle" size={14} /> <I18nText en="Open another pack" th="เปิดแพ็กเพิ่ม" />
          </Link>
        }
      />

      <BulkOpenBagStatus />

      {sellProgress && !sellProgress.completed && !sellOpen ? (
        <div
          className="cr-section"
          style={{
            padding: "12px 16px",
            display: "grid",
            gap: 6,
          }}
        >
          <strong><I18nText en="Converting rewards to coins" th="กำลังแลกรางวัลเป็นเหรียญ" /></strong>
          <small className="cr-mute">
            {sellProgress.convertedCount} / {sellProgress.itemCount}{" "}
            {language === "th" ? "รางวัลที่แลกแล้ว" : "rewards converted"} ·{" "}
            {formatCoins(sellProgress.creditedTotalCoins)} /{" "}
            {formatCoins(sellProgress.totalCoins)}{" "}
            {language === "th" ? "เหรียญที่เพิ่มแล้ว" : "coins credited"}
          </small>
          <small className="cr-mute">
            <I18nText
              en="You can leave this page. We'll keep converting your selected rewards."
              th="คุณออกจากหน้านี้ได้ ระบบจะแลกรางวัลที่เลือกต่อให้"
            />
          </small>
        </div>
      ) : null}

      {shipProgress && !shipProgress.completed && !shipOpen ? (
        <div
          className="cr-section"
          style={{
            padding: "12px 16px",
            display: "grid",
            gap: 6,
          }}
        >
          <strong><I18nText en="Preparing shipping request" th="กำลังเตรียมคำขอจัดส่ง" /></strong>
          <small className="cr-mute">
            {shipProgress.preparedCount} / {shipProgress.itemCount}{" "}
            {language === "th" ? "การ์ดที่เตรียมแล้ว" : "cards prepared"}
          </small>
          <small className="cr-mute">
            <I18nText
              en="You can leave this page. We'll keep preparing your shipping request."
              th="คุณออกจากหน้านี้ได้ ระบบจะเตรียมคำขอจัดส่งต่อให้"
            />
          </small>
        </div>
      ) : null}

      <div className="cr-stack cr-collection-workspace">
          <div className="cr-tabs" role="tablist">
            <button
              type="button"
              className={`cr-tab ${tab === "collection" ? "active" : ""}`}
              onClick={() => {
                setTab("collection");
                clearSelection();
              }}
            >
              <I18nText en="My collection" th="คอลเลกชันของฉัน" />{" "}
              <span className="count">{byTab.collection.length}</span>
            </button>
            {showMarketplace ? (
              <button
                type="button"
                className={`cr-tab ${tab === "marketplace" ? "active" : ""}`}
                onClick={() => {
                  setTab("marketplace");
                  clearSelection();
                }}
              >
                <I18nText en="Marketplace" th="ตลาด" />{" "}
                <span className="count">{marketplaceActivityCount}</span>
              </button>
            ) : null}
            <button
              type="button"
              className={`cr-tab ${tab === "shipped" ? "active" : ""}`}
              onClick={() => {
                setTab("shipped");
                clearSelection();
              }}
            >
              <I18nText en="Shipped" th="จัดส่งแล้ว" />{" "}
              <span className="count">{byTab.shipped.length}</span>
            </button>
            <button
              type="button"
              className={`cr-tab ${tab === "converted" ? "active" : ""}`}
              onClick={() => {
                setTab("converted");
                clearSelection();
              }}
            >
              <I18nText en="Converted" th="แลกแล้ว" />{" "}
              <span className="count">{byTab.converted.length}</span>
            </button>
          </div>

          {tab !== "marketplace" ? (
          <div className="cr-toolbar" style={{ gap: 8 }}>
            <div className="cr-row" style={{ gap: 4 }}>
              <button
                type="button"
                className={`cr-btn cr-btn-sm ${
                  seriesFilter === "all" ? "cr-btn-primary" : "cr-btn-ghost"
                }`}
                onClick={() => setSeriesFilter("all")}
              >
                <I18nText en="All series" th="ทุกซีรีส์" />
              </button>
              {seriesOptions.map((series) => (
                <button
                  key={series}
                  type="button"
                  className={`cr-btn cr-btn-sm ${
                    seriesFilter === series ? "cr-btn-primary" : "cr-btn-ghost"
                  }`}
                  onClick={() => setSeriesFilter(series)}
                >
                  {seriesLabel(series)}
              </button>
            ))}
          </div>
            <span style={{ flex: 1 }} />
            <div className="cr-search" style={{ maxWidth: 220 }}>
              <Ico name="search" size={14} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={language === "th" ? "ค้นหาชื่อการ์ด..." : "Search card name..."}
                aria-label={language === "th" ? "ค้นหาการ์ด" : "Search cards"}
              />
            </div>
          </div>
          ) : null}

          {tab === "collection" && byTab.collection.length > 0 && (
            <div className="cr-row" style={{ gap: 10, padding: "0 4px" }}>
              <small className="cr-mute" style={{ fontSize: 12 }}>
                <I18nText en="Tap cards to select. Selected cards can be" th="แตะการ์ดเพื่อเลือก การ์ดที่เลือกสามารถ" />{" "}
                <strong style={{ color: "var(--cr-ink)" }}>
                  <I18nText en="sold for coins" th="แลกเป็นเหรียญ" />
                </strong>{" "}
                <I18nText en="or shipped to you." th="หรือขอจัดส่งถึงคุณได้" />
              </small>
              <span style={{ flex: 1 }} />
              <button
                type="button"
                className="cr-btn cr-btn-ghost cr-btn-sm"
                onClick={selectAll}
              >
                <I18nText en="Select visible owned" th="เลือกของที่เห็นทั้งหมด" />
              </button>
              <button
                type="button"
                className="cr-btn cr-btn-ghost cr-btn-sm"
                onClick={selectAllConvertible}
                disabled={sellBusy || shipActive}
              >
                <I18nText en="Select visible convertible" th="เลือกของที่แลกได้บนหน้านี้" />
              </button>
              <button
                type="button"
                className="cr-btn cr-btn-ghost cr-btn-sm"
                onClick={() => void openSell("all_eligible")}
                disabled={sellBusy || shipActive}
              >
                <I18nText en="Convert all eligible rewards" th="แลกของรางวัลที่เข้าเงื่อนไขทั้งหมด" />
              </button>
              <button
                type="button"
                className="cr-btn cr-btn-ghost cr-btn-sm"
                onClick={() => void openShip(selectedCards.length ? "selected" : "all_eligible")}
                disabled={shipBusy || sellActive || (!shipActive && !selectedCards.length && !ownedShipCards.length)}
              >
                {shipActive
                  ? localized({ en: "View shipping progress", th: "ดูความคืบหน้าจัดส่ง" }, language)
                  : localized({ en: "Request shipping", th: "ขอจัดส่ง" }, language)}
              </button>
              {selected.size > 0 && (
                <button
                  type="button"
                  className="cr-btn cr-btn-ghost cr-btn-sm"
                  onClick={clearSelection}
                >
                  <I18nText en="Clear" th="ล้าง" /> ({selected.size})
                </button>
              )}
            </div>
          )}

          {showMarketplace && tab === "marketplace" ? (
            <section className="cr-section" style={{ padding: 18 }}>
              <div className="cr-stack" style={{ gap: 14 }}>
                <div>
                  <strong style={{ display: "block", fontSize: 15 }}>
                    <I18nText en="Marketplace activity" th="กิจกรรมตลาด" />
                  </strong>
                  <small className="cr-mute">
                    <I18nText
                      en="Physical-money marketplace orders, seller submissions, listings, and payout activity live here. Gacha rewards stay in My collection."
                      th="คำสั่งซื้อเงินจริง รายการฝากขาย รายการขาย และสถานะจ่ายเงินของตลาดอยู่ที่นี่ รางวัลกาชายังอยู่ในคอลเลกชันของฉัน"
                    />
                  </small>
                </div>

                {marketplaceSummaryState === "loading" ||
                marketplaceSummaryState === "idle" ? (
                  <small className="cr-mute">
                    <I18nText en="Loading marketplace activity..." th="กำลังโหลดกิจกรรมตลาด..." />
                  </small>
                ) : null}

                {marketplaceSummaryState === "unavailable" ? (
                  <small className="cr-mute">
                    <I18nText
                      en="Marketplace activity is owner-only or unavailable in this environment."
                      th="กิจกรรมตลาดยังจำกัดเฉพาะเจ้าของหรือยังไม่พร้อมในสภาพแวดล้อมนี้"
                    />
                  </small>
                ) : null}

                {marketplaceSummaryState === "error" ? (
                  <small className="cr-mute">
                    <I18nText
                      en="Marketplace activity could not be loaded."
                      th="โหลดกิจกรรมตลาดไม่สำเร็จ"
                    />
                  </small>
                ) : null}

                {marketplaceSummary ? (
                  <div className="marketplace-bag-grid">
                    <div>
                      <span>{marketplaceSummary.ordersTotal}</span>
                      <small><I18nText en="Buyer orders" th="คำสั่งซื้อ" /></small>
                    </div>
                    <div>
                      <span>{marketplaceSummary.pendingPaymentOrders}</span>
                      <small><I18nText en="Pending payments" th="รอชำระเงิน" /></small>
                    </div>
                    <div>
                      <span>{marketplaceSummary.sellerSubmissions}</span>
                      <small><I18nText en="Seller submissions" th="รายการฝากขาย" /></small>
                    </div>
                    <div>
                      <span>{marketplaceSummary.sellerListings}</span>
                      <small><I18nText en="Seller listings" th="รายการที่ลงขาย" /></small>
                    </div>
                    <div>
                      <span>{marketplaceSummary.sellerPayouts}</span>
                      <small><I18nText en="Payout records" th="รายการจ่ายเงิน" /></small>
                    </div>
                    <div>
                      <span>{marketplaceSummary.refundOrders}</span>
                      <small><I18nText en="Refund states" th="สถานะคืนเงิน" /></small>
                    </div>
                  </div>
                ) : null}

                <div className="cr-row" style={{ gap: 8 }}>
                  <Link className="cr-btn cr-btn-primary" href="/marketplace/orders">
                    <I18nText en="View orders" th="ดูคำสั่งซื้อ" />
                  </Link>
                  <Link className="cr-btn" href="/marketplace/seller">
                    <I18nText en="Seller dashboard" th="แดชบอร์ดผู้ขาย" />
                  </Link>
                  <Link className="cr-btn" href="/marketplace">
                    <I18nText en="Browse marketplace" th="ดูตลาด" />
                  </Link>
                </div>
              </div>
            </section>
          ) : visibleCards.length === 0 ? (
            <div
              className="cr-section"
              style={{ padding: 60, textAlign: "center" }}
            >
              <strong
                style={{ display: "block", fontSize: 14, marginBottom: 6 }}
              >
                <I18nText en="Nothing here yet" th="ยังไม่มีรายการ" />
              </strong>
              <small className="cr-mute">
                {tab === "collection"
                  ? localized({ en: "Open a pack to start your collection.", th: "เปิดแพ็กเพื่อเริ่มคอลเลกชันของคุณ" }, language)
                  : tab === "shipped"
                    ? localized({ en: "Request shipping on owned cards to see them here.", th: "ขอจัดส่งการ์ดที่ถืออยู่เพื่อดูรายการที่นี่" }, language)
                    : localized({ en: "Sell owned cards back to coins to see them here.", th: "แลกการ์ดที่ถืออยู่เป็นเหรียญเพื่อดูรายการที่นี่" }, language)}
              </small>
              {tab === "collection" && (
                <Link
                  className="cr-btn cr-btn-primary"
                  href="/packs"
                  style={{ marginTop: 14 }}
                >
                  <Ico name="sparkle" size={14} /> <I18nText en="Open a pack" th="เปิดแพ็ก" />
                </Link>
              )}
            </div>
          ) : (
            <div
              className="cr-collection-grid"
              style={{ paddingBottom: selected.size > 0 ? 80 : 12 }}
            >
              {visibleCards.map((card) => (
                <CollectionTile
                  key={card.id}
                  card={card}
                  selected={selected.has(card.id)}
                  selectable={card.bucket === "owned"}
                  onToggle={() => toggleSelect(card.id, card.bucket)}
                />
              ))}
            </div>
          )}

          {selected.size > 0 && (
            <div className="cr-bulk-bar">
              <span className="count">{selected.size}</span>
              <span
                style={{ fontSize: 13, fontWeight: 600, opacity: 0.9 }}
              >
                {language === "th"
                  ? `เลือกแล้ว ${selected.size} ใบ`
                  : `card${selected.size === 1 ? "" : "s"} selected`}
              </span>
              <span style={{ fontSize: 12, opacity: 0.7 }}>
                · {language === "th" ? "มูลค่าแลก" : "sell value"}{" "}
                <strong style={{ opacity: 1 }}>
                  <CoinPip size={11} /> {formatCoins(sellTotal)}
                </strong>
              </span>
              <span style={{ flex: 1 }} />
              <button
                type="button"
                className="cr-btn cr-btn-sm"
                onClick={clearSelection}
              >
                <Ico name="x" size={12} /> <I18nText en="Clear" th="ล้าง" />
              </button>
              <button
                type="button"
                className="cr-btn cr-btn-sm"
                onClick={() => void openShip(selectedCards.length ? "selected" : "all_eligible")}
                disabled={shipBusy || sellActive || (!shipActive && !selectedCards.length && !ownedShipCards.length)}
              >
                <Ico name="truck" size={12} />{" "}
                {shipActive
                  ? localized({ en: "View shipping progress", th: "ดูความคืบหน้าจัดส่ง" }, language)
                  : localized({ en: "Request shipping", th: "ขอจัดส่ง" }, language)}
              </button>
              <button
                type="button"
                className="cr-btn cr-btn-mint cr-btn-sm"
                onClick={() => void openSell("selected")}
                disabled={!selectedConvertibleCards.length || selectedNonConvertibleCount > 0 || sellBusy || shipActive}
                title={
                  selectedNonConvertibleCount > 0
                    ? localized(
                        {
                          en: "Remove non-convertible rewards before converting.",
                          th: "นำของรางวัลที่แลกไม่ได้ออกก่อนแลกเหรียญ",
                        },
                        language,
                      )
                    : selectedConvertibleCards.length
                      ? undefined
                      : localized(
                        {
                          en: "Selected rewards cannot be converted to coins.",
                          th: "รางวัลที่เลือกไม่สามารถแลกเป็นเหรียญได้",
                        },
                        language,
                      )
                }
              >
                <Ico name="swap" size={12} />{" "}
                {language === "th"
                  ? `แลกเป็น ${formatCoins(sellTotal)} เหรียญ`
                  : `Sell for ${formatCoins(sellTotal)} coins`}
              </button>
            </div>
          )}
      </div>

      <Modal
        open={sellOpen}
        onClose={() => {
          if (!sellBusy) setSellOpen(false);
        }}
        eyebrow={<I18nText en="Confirm" th="ยืนยัน" />}
        title={
          sellProgress
            ? sellProgress.failed
              ? localized(
                  { en: "Conversion could not finish", th: "แลกเหรียญไม่สำเร็จทั้งหมด" },
                  language,
                )
              : localized(
                  { en: "Converting rewards to coins", th: "กำลังแลกรางวัลเป็นเหรียญ" },
                  language,
                )
            : language === "th"
              ? `แลก ${displayedSellCount} รางวัลเป็นเหรียญ?`
              : `Convert ${displayedSellCount} reward${
                  displayedSellCount === 1 ? "" : "s"
                } to coins?`
        }
        size="md"
        footer={
          sellProgress ? (
            <button
              type="button"
              className="cr-btn cr-btn-primary"
              onClick={() => setSellOpen(false)}
              disabled={sellConfirming}
            >
              {sellProgress.completed
                ? localized({ en: "Done", th: "เสร็จแล้ว" }, language)
                : localized({ en: "Close", th: "ปิด" }, language)}
            </button>
          ) : (
            <>
            <button
              type="button"
              className="cr-btn"
              onClick={() => setSellOpen(false)}
              disabled={sellBusy}
            >
              <I18nText en="Cancel" th="ยกเลิก" />
            </button>
            <button
              type="button"
              className="cr-btn cr-btn-gold"
              onClick={submitSell}
              disabled={sellBusy || !sellQuote}
            >
              <Ico name="check" size={14} />{" "}
              {sellBusy
                ? localized({ en: "Preparing...", th: "กำลังเตรียม..." }, language)
                : sellQuoteExpired
                  ? localized({ en: "Refresh total", th: "คำนวณยอดใหม่" }, language)
                  : language === "th"
                    ? `แลกเป็น ${formatCoins(displayedSellTotal)} เหรียญ`
                    : `Convert for ${formatCoins(displayedSellTotal)} coins`}
            </button>
          </>
          )
        }
      >
        <div className="cr-stack" style={{ gap: 14 }}>
          {sellProgress ? (
            <>
              <p className="cr-lead" style={{ margin: 0 }}>
                {sellProgress.failed
                  ? localized(
                      {
                        en: "Conversion stopped before every reward was converted.",
                        th: "การแลกหยุดก่อนแลกรางวัลครบทั้งหมด",
                      },
                      language,
                    )
                  : localized(
                      { en: "Converting rewards to coins", th: "กำลังแลกรางวัลเป็นเหรียญ" },
                      language,
                    )}
              </p>
              <div
                style={{
                  background: "var(--cr-mint-soft)",
                  padding: "12px 16px",
                  borderRadius: "var(--cr-r-md)",
                  display: "grid",
                  gap: 8,
                }}
              >
                <strong className="cr-tnum" style={{ color: "var(--cr-mint)" }}>
                  {sellProgress.convertedCount} / {sellProgress.itemCount}{" "}
                  {language === "th" ? "รางวัลที่แลกแล้ว" : "rewards converted"}
                </strong>
                <strong className="cr-tnum" style={{ color: "var(--cr-coin-ink)" }}>
                  <CoinPip size={14} /> {formatCoins(sellProgress.creditedTotalCoins)} /{" "}
                  {formatCoins(sellProgress.totalCoins)}{" "}
                  {language === "th" ? "เหรียญที่เพิ่มแล้ว" : "coins credited"}
                </strong>
                <small className="cr-mute">
                  {sellProgress.failed
                    ? localized(
                        {
                          en: "Credited coins remain in your wallet. Refresh your bag before converting the remaining eligible rewards.",
                          th: "เหรียญที่เพิ่มแล้วจะยังอยู่ในวอลเล็ต รีเฟรชกระเป๋าก่อนแลกรางวัลที่เหลือต่อ",
                        },
                        language,
                      )
                    : localized(
                        {
                          en: "You can leave this page. We'll keep converting your selected rewards.",
                          th: "คุณออกจากหน้านี้ได้ ระบบจะแลกรางวัลที่เลือกต่อให้",
                        },
                        language,
                      )}
                </small>
              </div>
            </>
          ) : (
            <>
              <p className="cr-lead" style={{ margin: 0 }}>
                <I18nText en="Converting rewards is" th="การแลกรางวัลเป็น" />{" "}
                <strong><I18nText en="permanent" th="การถาวร" /></strong>.{" "}
                <I18nText
                  en="Review the total before you confirm."
                  th="ตรวจสอบยอดรวมก่อนยืนยัน"
                />
              </p>
              {/* summary-only */}
              <div
                style={{
                  background: "var(--cr-mint-soft)",
                  padding: "12px 16px",
                  borderRadius: "var(--cr-r-md)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <span style={{ fontWeight: 700, color: "var(--cr-mint)" }}>
                  <I18nText en="You'll receive" th="คุณจะได้รับ" />
                </span>
                <strong
                  className="cr-tnum"
                  style={{ fontSize: 18, color: "var(--cr-mint)" }}
                >
                  <CoinPip size={14} />{" "}
                  {sellPreparing
                    ? localized({ en: "Calculating...", th: "กำลังคำนวณ..." }, language)
                    : language === "th"
                      ? `${formatCoins(displayedSellTotal)} เหรียญ`
                      : `${formatCoins(displayedSellTotal)} coins`}
                </strong>
              </div>
              <small className="cr-mute">
                {sellMode === "all_eligible"
                  ? localized(
                      {
                        en: "All eligible rewards in your Customer Bag will be included.",
                        th: "รางวัลที่เข้าเงื่อนไขทั้งหมดในกระเป๋าจะถูกรวมในรายการนี้",
                      },
                      language,
                    )
                  : language === "th"
                    ? `รวม ${displayedSellCount} รางวัลที่เลือก`
                    : `${displayedSellCount} selected reward${
                        displayedSellCount === 1 ? "" : "s"
                      } will be included.`}
              </small>
              {sellQuoteExpired ? (
                <small className="cr-mute">
                  <I18nText
                    en="Quote expired. Refresh the total before converting."
                    th="ใบเสนอราคาหมดอายุ คำนวณยอดใหม่ก่อนแลก"
                  />
                </small>
              ) : null}
            </>
          )}
        </div>
      </Modal>

      <ShipModal
        open={shipOpen}
        addresses={addressRows}
        cards={selectedCards}
        mode={shipMode}
        quote={shipQuote}
        progress={shipProgress}
        preparing={shipPreparing}
        confirming={shipConfirming}
        quoteExpired={shipQuoteExpired}
        displayedCount={displayedShipCount}
        displayedCoinValue={displayedShipTotal}
        onAddressSaved={handleAddressSaved}
        onClose={() => {
          if (!shipBusy) setShipOpen(false);
        }}
        onQuote={quoteShip}
        onConfirm={submitShip}
      />
    </div>
  );
}

function CollectionTile({
  card,
  selected,
  selectable,
  onToggle,
}: {
  card: EnrichedItem;
  selected: boolean;
  selectable: boolean;
  onToggle: () => void;
}) {
  const language = useStoreLanguage();
  const label =
    card.status === "converting"
      ? localized({ en: "Converting", th: "กำลังแลก" }, language)
      : statusLabel(card.bucket, language);
  const policyLabel = rewardPolicyLabel(card, language);
  return (
    <div
      className={`cr-coll-card ${selected ? "selected" : ""}`}
      data-disabled={!selectable}
      onClick={selectable ? onToggle : undefined}
      role={selectable ? "button" : undefined}
      tabIndex={selectable ? 0 : undefined}
      onKeyDown={(e) => {
        if (selectable && e.key === "Enter") onToggle();
      }}
    >
      <div className={`cr-coll-art ${tierClassName(card.tier)}`}>
        {card.imageUrl ? (
          <Image
            className="cr-coll-art-img"
            src={card.imageUrl}
            alt={card.cardName}
            fill
            sizes="(max-width: 760px) 45vw, 180px"
            unoptimized
          />
        ) : null}
        <span className="cr-coll-tier">{tierLabel(card.tier, language)}</span>
        <span className={`cr-coll-status ${card.bucket}`}>{label}</span>
        <span className="cr-coll-code">
          {collectionDisplayCode(card, language)}
        </span>
        {selectable && (
          <span className="cr-coll-check">
            {selected ? <Ico name="check" size={14} /> : <Ico name="plus" size={14} />}
          </span>
        )}
      </div>
      <div className="cr-coll-body">
        <strong>{card.cardName}</strong>
        {card.cardGrade ? (
          <small className="cr-mute" style={{ marginTop: 2 }}>
            {card.cardGrade}
          </small>
        ) : null}
        {policyLabel ? (
          <small className="cr-mute" style={{ marginTop: 2 }}>
            {policyLabel}
          </small>
        ) : null}
        {card.bucket === "owned" && card.canConvert && card.sellValueCoins > 0 && (
          <span className="price">
            <CoinPip size={10} />{" "}
            {language === "th"
              ? `แลกเป็น ${formatCoins(card.sellValueCoins)}`
              : `Sell for ${formatCoins(card.sellValueCoins)}`}
          </span>
        )}
        {card.bucket === "shipped" && (
          <small className="cr-mute" style={{ marginTop: 4 }}>
            {language === "th" ? "จัดส่งแล้ว" : "Shipped"} {card.acquiredLabel}
          </small>
        )}
        {card.status === "converting" && (
          <span className="price">
            <I18nText en="Converting to coins" th="กำลังแลกเป็นเหรียญ" />
          </span>
        )}
        {card.bucket === "converted" && card.status !== "converting" && card.sellValueCoins > 0 && (
          <span className="price">
            +{formatCoins(card.sellValueCoins)}{" "}
            {language === "th" ? "คืนแล้ว" : "returned"}
          </span>
        )}
      </div>
    </div>
  );
}

function ShipModal({
  open,
  addresses,
  cards,
  mode,
  quote,
  progress,
  preparing,
  confirming,
  quoteExpired,
  displayedCount,
  displayedCoinValue,
  onAddressSaved,
  onClose,
  onQuote,
  onConfirm,
}: {
  open: boolean;
  addresses: YnotAddress[];
  cards: EnrichedItem[];
  mode: ShippingSelectionMode;
  quote: ShippingQuote | null;
  progress: ShippingProgress | null;
  preparing: boolean;
  confirming: boolean;
  quoteExpired: boolean;
  displayedCount: number;
  displayedCoinValue: number;
  onAddressSaved: (address: YnotAddress) => void;
  onClose: () => void;
  onQuote: (addressId: string) => void;
  onConfirm: () => void;
}) {
  const language = useStoreLanguage();
  const defaultAddress =
    addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;
  const [addressId, setAddressId] = useState<string>(defaultAddress?.id ?? "");
  const [addingAddress, setAddingAddress] = useState(false);
  const [newAddress, setNewAddress] = useState({
    label: "Home",
    recipientName: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    subdistrict: "",
    district: "",
    province: "",
    postalCode: "",
    country: "Thailand",
    deliveryNote: "",
    isDefault: addresses.length === 0,
  });
  const [addressMessage, setAddressMessage] = useState("");
  const [addressSavePending, setAddressSavePending] = useState(false);
  const selectedAddress = addresses.find((address) => address.id === addressId);

  function updateAddressField(key: keyof typeof newAddress, value: string | boolean) {
    setNewAddress((current) => ({ ...current, [key]: value }));
  }

  async function saveAddress() {
    if (addressSavePending) return;
    setAddressMessage("");
    setAddressSavePending(true);
    try {
      const response = await fetch("/api/ynot/addresses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...newAddress,
          isDefault: addresses.length === 0 ? true : newAddress.isDefault,
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          isRecord(payload) && typeof payload.error === "string"
            ? payload.error
            : localized({ en: "Could not save address.", th: "บันทึกที่อยู่ไม่สำเร็จ" }, language),
        );
      }
      const address =
        isRecord(payload) && isRecord(payload.address)
          ? (payload.address as YnotAddress)
          : null;
      if (!address) {
        throw new Error(localized({ en: "Address could not be saved.", th: "บันทึกที่อยู่ไม่สำเร็จ" }, language));
      }
      onAddressSaved(address);
      setAddressId(address.id);
      setAddingAddress(false);
      setNewAddress({
        label: "Home",
        recipientName: "",
        phone: "",
        addressLine1: "",
        addressLine2: "",
        subdistrict: "",
        district: "",
        province: "",
        postalCode: "",
        country: "Thailand",
        deliveryNote: "",
        isDefault: false,
      });
      setAddressMessage(
        localized({ en: "Address saved and selected.", th: "บันทึกและเลือกที่อยู่นี้แล้ว" }, language),
      );
    } finally {
      setAddressSavePending(false);
    }
  }

  const busy = preparing || confirming;
  const confirmDisabled =
    addressSavePending || busy || !isCompleteShippingAddress(selectedAddress);

  function handleClose() {
    if (addressSavePending || busy) return;
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      eyebrow={<I18nText en="Confirm" th="ยืนยัน" />}
      title={
        progress
          ? progress.completed
            ? localized(
                { en: "Shipping request submitted", th: "ส่งคำขอจัดส่งแล้ว" },
                language,
              )
            : localized(
                { en: "Preparing shipping request", th: "กำลังเตรียมคำขอจัดส่ง" },
                language,
              )
          : quote
            ? language === "th"
              ? `ขอจัดส่งการ์ด ${displayedCount} ใบ?`
              : `Request shipping for ${displayedCount} card${displayedCount === 1 ? "" : "s"}?`
            : mode === "all_eligible"
            ? localized(
                  {
                    en: "Request shipping for all shippable rewards",
                    th: "ขอจัดส่งของรางวัลที่จัดส่งได้ทั้งหมด",
                  },
                  language,
                )
              : language === "th"
                ? `จัดส่งการ์ด ${cards.length} ใบไปยังที่อยู่ของคุณ`
                : `Ship ${cards.length} card${cards.length === 1 ? "" : "s"} to your address`
      }
      size="md"
      footer={
        progress ? (
          <button
            type="button"
            className="cr-btn cr-btn-primary"
            onClick={onClose}
            disabled={confirming}
          >
            {progress.completed
              ? localized({ en: "Done", th: "เสร็จแล้ว" }, language)
              : localized({ en: "Close", th: "ปิด" }, language)}
          </button>
        ) : (
          <>
          <button
            type="button"
            className="cr-btn"
            onClick={handleClose}
            disabled={addressSavePending || busy}
          >
            <I18nText en="Cancel" th="ยกเลิก" />
          </button>
          <button
            type="button"
            className="cr-btn cr-btn-primary"
            onClick={quote ? onConfirm : () => onQuote(addressId)}
            disabled={confirmDisabled || (quote ? false : !addressId)}
          >
            <Ico name="truck" size={14} />{" "}
            {preparing
              ? localized({ en: "Calculating...", th: "กำลังคำนวณ..." }, language)
              : confirming
                ? localized({ en: "Preparing...", th: "กำลังเตรียม..." }, language)
                : quote
                  ? quoteExpired
                    ? localized({ en: "Refresh request", th: "คำนวณคำขอใหม่" }, language)
                    : localized({ en: "Confirm request", th: "ยืนยันคำขอ" }, language)
                  : localized({ en: "Review shipping", th: "ตรวจสอบการจัดส่ง" }, language)}
          </button>
        </>
        )
      }
    >
      <div className="cr-stack" style={{ gap: 14 }}>
        {progress ? (
          <div
            style={{
              background: "var(--cr-mint-soft)",
              padding: "12px 16px",
              borderRadius: "var(--cr-r-md)",
              display: "grid",
              gap: 8,
            }}
          >
            <strong className="cr-tnum" style={{ color: "var(--cr-mint)" }}>
              {progress.preparedCount} / {progress.itemCount}{" "}
              {language === "th" ? "การ์ดที่เตรียมแล้ว" : "cards prepared"}
            </strong>
            <small className="cr-mute">
              {progress.completed ? (
                <I18nText
                  en="Completed selected rewards are attached to the shipping request."
                  th="รางวัลที่เลือกซึ่งเตรียมเสร็จแล้วถูกแนบกับคำขอจัดส่งนี้"
                />
              ) : (
                <I18nText
                  en="You can leave this page. We'll keep preparing your shipping request."
                  th="คุณออกจากหน้านี้ได้ ระบบจะเตรียมคำขอจัดส่งต่อให้"
                />
              )}
            </small>
          </div>
        ) : (
          <p className="cr-lead" style={{ margin: 0 }}>
            <I18nText
              en="Cards will leave your stash and arrive within 3-5 working days inside Thailand."
              th="การ์ดจะออกจากกระเป๋าของคุณและจัดส่งถึงในประเทศไทยภายใน 3-5 วันทำการ"
            />
          </p>
        )}

        {quote && !progress ? (
          <div
            style={{
              background: "var(--cr-mint-soft)",
              padding: "12px 16px",
              borderRadius: "var(--cr-r-md)",
              display: "grid",
              gap: 8,
            }}
          >
            <strong>
              {language === "th"
                ? `เลือกการ์ด ${displayedCount} ใบ`
                : `${displayedCount} card${displayedCount === 1 ? "" : "s"} selected`}
            </strong>
            <span className="cr-tnum">
              <CoinPip size={14} /> {formatCoins(displayedCoinValue)}{" "}
              {language === "th" ? "มูลค่าเหรียญ" : "coin value"}
            </span>
            <small className="cr-mute">
              {language === "th" ? "ขั้นต่ำที่ต้องมี:" : "Minimum required:"}{" "}
              {formatCoins(quote.minimumCoinValue)} {language === "th" ? "เหรียญ" : "coins"}
            </small>
            <small className="cr-mute">
              {language === "th" ? "จัดส่งไปที่" : "Ship to"}{" "}
              {quote.address.label ??
                localized({ en: "selected address", th: "ที่อยู่ที่เลือก" }, language)}
              {quote.address.recipientName ? ` | ${quote.address.recipientName}` : ""}
              {quote.address.summary ? ` | ${quote.address.summary}` : ""}
            </small>
            {quoteExpired ? (
              <small className="cr-mute">
                <I18nText
                  en="Quote expired. Refresh the request before confirming."
                  th="ใบเสนอราคาหมดอายุ คำนวณคำขอใหม่ก่อนยืนยัน"
                />
              </small>
            ) : null}
          </div>
        ) : null}

        {!progress ? <div className="cr-stack" style={{ gap: 10 }}>
          <div className="cr-row" style={{ gap: 10, alignItems: "center" }}>
            <span className="cr-eyebrow"><I18nText en="Ship to" th="จัดส่งไปที่" /></span>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              className="cr-btn cr-btn-primary cr-btn-sm"
              onClick={() => setAddingAddress((current) => !current)}
              disabled={busy || addressSavePending || Boolean(quote)}
            >
              <Ico name="plus" size={12} /> <I18nText en="Add a new address" th="เพิ่มที่อยู่ใหม่" />
            </button>
          </div>

          {addresses.length === 0 ? (
            <div
              style={{
                padding: 20,
                textAlign: "center",
                border: "1px dashed var(--cr-line-strong)",
                borderRadius: "var(--cr-r-md)",
                background: "var(--cr-paper-2)",
              }}
            >
              <strong style={{ display: "block", marginBottom: 6 }}>
                <I18nText en="No shipping address saved" th="ยังไม่มีที่อยู่จัดส่ง" />
              </strong>
              <small className="cr-mute">
                <I18nText
                  en="Add one here and it will be selected for this request."
                  th="เพิ่มที่อยู่นี้แล้วระบบจะเลือกให้คำขอนี้"
                />
              </small>
            </div>
          ) : (
            addresses.map((a) => {
              const missingFields = missingShippingAddressFields(a);
              const complete = missingFields.length === 0;
              return (
                <label
                  key={a.id}
                  className={`cr-addr-card ${addressId === a.id ? "default" : ""}`}
                  style={{
                    cursor: complete ? "pointer" : "not-allowed",
                    opacity: complete ? 1 : 0.62,
                  }}
                >
                  <input
                    type="radio"
                    name="ship-addr"
                    checked={addressId === a.id}
                    disabled={!complete || busy || addressSavePending || Boolean(quote)}
                    onChange={() => setAddressId(a.id)}
                    style={{ marginTop: 4 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h4>{a.label}</h4>
                    {a.recipientName && (
                      <div className="lines">
                        <strong style={{ color: "var(--cr-ink)" }}>
                          {a.recipientName}
                        </strong>
                        {a.phone ? ` · ${a.phone}` : ""}
                      </div>
                    )}
                    <div className="lines">{a.addressLine1}</div>
                    {a.addressLine2 && <div className="lines">{a.addressLine2}</div>}
                    <div className="lines">
                      {[a.subdistrict, a.district, a.province, a.postalCode]
                        .filter(Boolean)
                        .join(" ")}
                    </div>
                    {!complete && (
                      <small className="cr-mute">
                        {language === "th" ? "ขาดข้อมูล" : "Missing"} {missingFields.join(", ")}
                      </small>
                    )}
                    {a.deliveryNote && <small className="cr-mute">{a.deliveryNote}</small>}
                  </div>
                  {a.isDefault && (
                    <span className="cr-pill cr-pill-ink">
                      <I18nText en="Default" th="ค่าเริ่มต้น" />
                    </span>
                  )}
                </label>
              );
            })
          )}
        </div> : null}

          {!progress && addingAddress && (
            <div className="cr-section" style={{ padding: 14 }}>
              <div className="cr-grid-2">
                <label className="cr-field">
                  <span><I18nText en="Label" th="ชื่อที่อยู่" /></span>
                  <input value={newAddress.label} onChange={(e) => updateAddressField("label", e.target.value)} />
                </label>
                <label className="cr-field">
                  <span><I18nText en="Recipient name" th="ชื่อผู้รับ" /></span>
                  <input value={newAddress.recipientName} onChange={(e) => updateAddressField("recipientName", e.target.value)} />
                </label>
                <label className="cr-field">
                  <span><I18nText en="Phone" th="เบอร์โทร" /></span>
                  <input value={newAddress.phone} onChange={(e) => updateAddressField("phone", e.target.value)} />
                </label>
                <label className="cr-field cr-field-full">
                  <span><I18nText en="Address line 1" th="ที่อยู่บรรทัดที่ 1" /></span>
                  <input value={newAddress.addressLine1} onChange={(e) => updateAddressField("addressLine1", e.target.value)} />
                </label>
                <label className="cr-field cr-field-full">
                  <span><I18nText en="Address line 2" th="ที่อยู่บรรทัดที่ 2" /></span>
                  <input value={newAddress.addressLine2} onChange={(e) => updateAddressField("addressLine2", e.target.value)} />
                </label>
                <label className="cr-field">
                  <span><I18nText en="Subdistrict" th="แขวง/ตำบล" /></span>
                  <input value={newAddress.subdistrict} onChange={(e) => updateAddressField("subdistrict", e.target.value)} />
                </label>
                <label className="cr-field">
                  <span><I18nText en="District" th="เขต/อำเภอ" /></span>
                  <input value={newAddress.district} onChange={(e) => updateAddressField("district", e.target.value)} />
                </label>
                <label className="cr-field">
                  <span><I18nText en="Province" th="จังหวัด" /></span>
                  <input value={newAddress.province} onChange={(e) => updateAddressField("province", e.target.value)} />
                </label>
                <label className="cr-field">
                  <span><I18nText en="Postal code" th="รหัสไปรษณีย์" /></span>
                  <input value={newAddress.postalCode} onChange={(e) => updateAddressField("postalCode", e.target.value)} />
                </label>
                <label className="cr-field">
                  <span><I18nText en="Country" th="ประเทศ" /></span>
                  <input value={newAddress.country} onChange={(e) => updateAddressField("country", e.target.value)} />
                </label>
              </div>
              <label className="cr-row" style={{ gap: 8, marginTop: 10 }}>
                <input
                  type="checkbox"
                  checked={newAddress.isDefault}
                  disabled={addresses.length === 0 || addressSavePending}
                  onChange={(e) => updateAddressField("isDefault", e.target.checked)}
                />
                <span className="cr-mute">
                  <I18nText
                    en="Make this my default shipping address"
                    th="ตั้งเป็นที่อยู่จัดส่งเริ่มต้น"
                  />
                </span>
              </label>
              <div className="cr-row" style={{ gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
                <button
                  type="button"
                  className="cr-btn cr-btn-primary cr-btn-sm"
                  disabled={addressSavePending || busy}
                  onClick={() => {
                    void saveAddress().catch((error) => {
                      setAddressMessage(
                        error instanceof Error
                          ? error.message
                          : localized(
                              { en: "Could not save address.", th: "บันทึกที่อยู่ไม่สำเร็จ" },
                              language,
                            ),
                      );
                    });
                  }}
                >
                  {addressSavePending
                    ? localized({ en: "Saving...", th: "กำลังบันทึก..." }, language)
                    : localized(
                        {
                          en: "Save and use this address",
                          th: "บันทึกและใช้ที่อยู่นี้",
                        },
                        language,
                      )}
                </button>
              </div>
            </div>
          )}

          {addressMessage && <small className="cr-mute">{addressMessage}</small>}
        </div>
    </Modal>
  );
}
