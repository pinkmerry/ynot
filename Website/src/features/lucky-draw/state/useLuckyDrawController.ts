"use client";

import { useEffect, useRef, useState } from "react";
import { useLiffSession } from "@/lib/line/use-liff-session";
import { defaultDraw, seedOrders } from "@/lib/lucky-draw/defaults";
import type { CardCatalogItem, ChaseCard, DrawConfig, FeaturedCard, Lang, Order, OrderStatus, ProfileInfo } from "@/lib/lucky-draw/types";
import {
  fetchAdminSlip,
  fetchLuckyDrawState,
  fetchProfileInfo,
  patchAdminDraw,
  patchAdminOrder,
  patchProfileInfo,
  postAdminCardImage,
  postAdminDrawLifecycle,
  postAdminQr,
  postCustomerPicks,
  postLuckyDrawOrder,
} from "../api/client";
import {
  copy,
  defaultChaseCards,
  defaultFeaturedCards,
  emptyProfileInfo,
  normalizeDrawConfig,
  readSavedState,
  storageKey,
} from "../model";
import type { AdminRole, DrawLifecycleAction, View } from "../model";
import { useLuckyDrawRealtime } from "../realtime/useLuckyDrawRealtime";
import { useLuckyDrawDerivedState } from "./useLuckyDrawDerivedState";

export function useLuckyDrawController() {
  const hydratedRef = useRef(false);
  const cardMutationRef = useRef(0);
  const cardDraftDirtyRef = useRef(false);
  const refreshRef = useRef<() => void>(() => {});
  const orderSubmitInFlightRef = useRef(false);
  const pickSubmitInFlightRef = useRef(false);
  const liffSession = useLiffSession();
  const [lang, setLang] = useState<Lang>("th");
  const [view, setView] = useState<View>("home");
  const [lineVerified, setLineVerified] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);
  const [draw, setDraw] = useState<DrawConfig>(defaultDraw);
  const [orders, setOrders] = useState<Order[]>(seedOrders);
  const [featuredCards, setFeaturedCards] = useState<FeaturedCard[]>(defaultFeaturedCards);
  const [chaseCards, setChaseCards] = useState<ChaseCard[]>(defaultChaseCards);
  const [cardCatalog, setCardCatalog] = useState<CardCatalogItem[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [slipName, setSlipName] = useState("");
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipPreviewUrl, setSlipPreviewUrl] = useState("");
  const slipPreviewUrlRef = useRef("");
  const [lineName, setLineName] = useState("LINE Customer");
  const [activeOrderId, setActiveOrderId] = useState("LD-1002");
  const [selectedSlots, setSelectedSlots] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  const [databaseReady, setDatabaseReady] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [profileInfo, setProfileInfo] = useState<ProfileInfo>(emptyProfileInfo);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [pickSubmitting, setPickSubmitting] = useState(false);
  const t = copy[lang];

  useEffect(() => {
    refreshRef.current = () => {
      void refreshFromDatabase();
    };
  });

  useEffect(() => {
    const saved = readSavedState();
    window.setTimeout(() => {
      if (saved.lang) setLang(saved.lang);
      if (saved.draw) setDraw(normalizeDrawConfig(saved.draw));
      if (saved.orders) setOrders(saved.orders);
      if (saved.featuredCards) setFeaturedCards(saved.featuredCards);
      if (saved.chaseCards) setChaseCards(saved.chaseCards);
      if (saved.cardCatalog) setCardCatalog(saved.cardCatalog);
      hydratedRef.current = true;
      setHydrated(true);
    }, 0);
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ lang, draw, orders, featuredCards, chaseCards, cardCatalog }),
    );
  }, [lang, draw, orders, featuredCards, chaseCards, cardCatalog]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [view]);

  useEffect(() => () => {
    if (slipPreviewUrlRef.current) URL.revokeObjectURL(slipPreviewUrlRef.current);
  }, []);

  useEffect(() => {
    const syncLiffState = window.setTimeout(() => {
      if (liffSession.status === "authenticated" && liffSession.profile) {
        setSyncError("");
        setLineVerified(true);
        setLineName(liffSession.profile.displayName);
        setIsAdmin(Boolean(liffSession.profile.isAdmin));
        setAdminRole(liffSession.profile.adminRole ?? null);
        if (!liffSession.profile.isAdmin) {
          setView((current) => (current === "admin" ? "profile" : current));
        }
        void refreshProfileInfo();
        refreshRef.current();
      }

      if (liffSession.status === "ready") {
        setLineVerified(false);
        setIsAdmin(false);
        setAdminRole(null);
        setProfileInfo(emptyProfileInfo);
        setProfileLoaded(false);
        setView((current) => (current === "admin" ? "profile" : current));
      }

      if (liffSession.status === "error") {
        setLineVerified(false);
        setIsAdmin(false);
        setAdminRole(null);
        setProfileInfo(emptyProfileInfo);
        setProfileLoaded(false);
        setSyncError(liffSession.error ?? "LINE connection failed.");
        setView((current) => (current === "admin" ? "profile" : current));
      }
    }, 0);

    return () => window.clearTimeout(syncLiffState);
  }, [liffSession.error, liffSession.profile, liffSession.status]);

  useEffect(() => {
    if (!hydrated || liffSession.status === "loading") return;
    refreshRef.current();
  }, [hydrated, liffSession.profile, liffSession.status]);

  useLuckyDrawRealtime(databaseReady, refreshRef);

  const { takenSlots, remaining, progress, filteredOrders } = useLuckyDrawDerivedState(draw, orders, query);
  const activeOrder = orders.find((order) => order.id === activeOrderId);

  function choosePickOrder(orderId?: string, sourceOrders = orders) {
    const pickableOrders = sourceOrders.filter((order) => order.status === "approved" || order.status === "picked");
    const nextOrder =
      (orderId ? pickableOrders.find((order) => order.id === orderId) : null)
      ?? pickableOrders.find((order) => order.status === "approved")
      ?? pickableOrders[0]
      ?? null;

    setActiveOrderId(nextOrder?.id ?? "");
    setSelectedSlots(nextOrder?.slots ?? []);
    return nextOrder;
  }

  function openPickView(orderId?: string) {
    choosePickOrder(orderId);
    setView("pick");
  }

  function handlePickOrderChange(orderId: string) {
    choosePickOrder(orderId);
  }

  function handleLineLogin() {
    setSyncError("");
    void liffSession.login();
  }

  async function refreshProfileInfo() {
    try {
      const { response, payload } = await fetchProfileInfo();
      if (response.status === 401) {
        setProfileInfo(emptyProfileInfo);
        setProfileLoaded(false);
        return;
      }
      if (!response.ok || !payload?.profile) return;

      if (payload.displayName) setLineName(payload.displayName);
      setProfileInfo({ ...emptyProfileInfo, ...payload.profile });
      setProfileLoaded(true);
    } catch {
      setSyncError("Profile sync is unavailable.");
    }
  }

  async function saveProfileInfo(nextProfileInfo: ProfileInfo) {
    setProfileSaving(true);
    setProfileInfo(nextProfileInfo);
    try {
      const { response, payload } = await patchProfileInfo(nextProfileInfo);

      if (response.status === 401) {
        window.location.href = "/login";
        return false;
      }

      if (!response.ok) {
        setSyncError(payload?.error ?? "Profile could not be saved.");
        await refreshProfileInfo();
        return false;
      }

      if (payload?.displayName) setLineName(payload.displayName);
      if (payload?.profile) setProfileInfo({ ...emptyProfileInfo, ...payload.profile });
      setProfileLoaded(true);
      return true;
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Profile could not be saved.");
      return false;
    } finally {
      setProfileSaving(false);
    }
  }

  async function refreshFromDatabase(options: { preferredActiveOrderId?: string } = {}) {
    const cardMutationVersion = cardMutationRef.current;
    try {
      const { response, payload } = await fetchLuckyDrawState();
      if (!response.ok || !payload) return null;
      setDatabaseReady(payload.configured);
      if (payload.configured) {
        if (payload.viewer) {
          setLineVerified(true);
          setLineName(payload.viewer.displayName);
          setIsAdmin(payload.viewer.isAdmin);
          setAdminRole(payload.viewer.adminRole);
          if (!payload.viewer.isAdmin && view === "admin") setView("profile");
          void refreshProfileInfo();
        } else {
          setLineVerified(false);
          setIsAdmin(false);
          setAdminRole(null);
          setProfileInfo(emptyProfileInfo);
          setProfileLoaded(false);
          if (view === "admin") setView("profile");
        }
        setDraw(payload.state.draw);
        const nextOrders = payload.state.orders;
        setOrders(nextOrders);
        if (!cardDraftDirtyRef.current && cardMutationVersion === cardMutationRef.current) {
          if (payload.state.featuredCards?.length) setFeaturedCards(payload.state.featuredCards);
          if (payload.state.chaseCards?.length) setChaseCards(payload.state.chaseCards);
          if (payload.state.cardCatalog) setCardCatalog(payload.state.cardCatalog);
        }
        const preferredActiveOrderId = options.preferredActiveOrderId ?? activeOrderId;
        const nextActiveOrder =
          nextOrders.find((order) => order.id === preferredActiveOrderId)
          ?? nextOrders.find((order) => order.status === "approved")
          ?? nextOrders.find((order) => order.status === "picked")
          ?? nextOrders[0]
          ?? null;
        setActiveOrderId(nextActiveOrder?.id ?? "");
        setSelectedSlots((current) => {
          if (!nextActiveOrder) return [];
          if (nextActiveOrder.status === "picked" || nextActiveOrder.slots.length) return nextActiveOrder.slots;
          const takenByOther = new Set(
            nextOrders
              .filter((order) => order.id !== nextActiveOrder.id)
              .flatMap((order) => order.slots),
          );
          return current.filter((slot) => !takenByOther.has(slot)).slice(0, nextActiveOrder.quantity);
        });
      }
      return payload;
    } catch {
      setSyncError("Database sync is unavailable. Using local demo data.");
      return null;
    }
  }

  function applyOrderPatch(id: string, patch: Partial<Order>) {
    setOrders((current) =>
      current.map((order) => (order.id === id ? { ...order, ...patch } : order)),
    );
  }

  function setPaymentSlip(file: File | null) {
    if (slipPreviewUrlRef.current) {
      URL.revokeObjectURL(slipPreviewUrlRef.current);
      slipPreviewUrlRef.current = "";
    }

    setSlipFile(file);
    setSlipName(file?.name ?? "");

    if (file?.type.startsWith("image/")) {
      const previewUrl = URL.createObjectURL(file);
      slipPreviewUrlRef.current = previewUrl;
      setSlipPreviewUrl(previewUrl);
      return;
    }

    setSlipPreviewUrl("");
  }

  async function createOrder() {
    if (!lineVerified) {
      window.location.href = "/login";
      return;
    }

    if (orderSubmitInFlightRef.current) return;
    orderSubmitInFlightRef.current = true;
    setOrderSubmitting(true);
    setSyncError("");

    try {
      if (databaseReady) {
        const form = new FormData();
        form.set("quantity", String(quantity));
        form.set("slipName", slipName || "manual-transfer");
        if (slipFile) form.set("slip", slipFile);

        const { response, payload } = await postLuckyDrawOrder(form);

        if (response.status === 401) {
          window.location.href = "/login";
          return;
        }

        if (response.ok) {
          if (!payload?.order) {
            setSyncError("Order response was missing order data.");
            return;
          }
          const createdOrder = payload.order;
          setOrders((current) => [createdOrder, ...current.filter((order) => order.id !== createdOrder.id)]);
          setActiveOrderId(createdOrder.id);
          setSelectedSlots(createdOrder.slots);
          setPaymentSlip(null);
          await refreshFromDatabase({ preferredActiveOrderId: createdOrder.id });
          setView("orders");
          return;
        }

        setSyncError(payload?.error ?? "Order could not be created in Supabase.");
        return;
      }

      const id = `LD-${Math.floor(1000 + Math.random() * 9000)}`;
      const next: Order = {
        id,
        lineName: lineName.trim() || "LINE Customer",
        quantity,
        amount: quantity * draw.price,
        status: "pending",
        slipName: slipName || "manual-transfer",
        slipProvider: "manual_line",
        hasSlipFile: false,
        slipVerificationStatus: "manual_review",
        slipProviderCode: null,
        slipProviderMessage: null,
        slots: [],
        createdAt: new Date().toISOString(),
      };
      setOrders((current) => [next, ...current]);
      setActiveOrderId(id);
      setSelectedSlots([]);
      setPaymentSlip(null);
      setView("orders");
    } finally {
      orderSubmitInFlightRef.current = false;
      setOrderSubmitting(false);
    }
  }

  async function viewPaymentSlip(id: string) {
    if (!databaseReady) {
      setSyncError("Slip preview is only available after database sync is ready.");
      return;
    }

    const { response, payload } = await fetchAdminSlip(id);
    if (!response.ok) {
      setSyncError(payload?.error ?? "Payment slip could not be opened.");
      return;
    }

    if (!payload?.signedUrl) {
      setSyncError("This order is marked for manual LINE slip checking.");
      return;
    }

    const opened = window.open(payload.signedUrl, "_blank", "noopener,noreferrer");
    if (!opened) window.location.href = payload.signedUrl;
  }

  async function updateOrderStatus(id: string, status: OrderStatus) {
    applyOrderPatch(id, { status });
    if (!databaseReady) return;

    const { response, payload } = await patchAdminOrder({ orderId: id, status });

    if (!response.ok) {
      setSyncError(payload?.error ?? "Admin order update failed.");
      void refreshFromDatabase();
      return;
    }

    void refreshFromDatabase();
  }

  async function assignOrderSlots(id: string, slots: number[]) {
    const order = orders.find((item) => item.id === id);
    if (!order) return;
    applyOrderPatch(id, {
      slots,
      status: slots.length === order.quantity ? "picked" : "approved",
    });

    if (!databaseReady) return;

    const { response, payload } = await patchAdminOrder({ orderId: id, slots });

    if (!response.ok) {
      setSyncError(payload?.error ?? "Admin slot assignment failed.");
      void refreshFromDatabase();
      return;
    }

    void refreshFromDatabase();
  }

  async function saveDrawSettings(nextDraw: DrawConfig) {
    setDraw(nextDraw);
    if (!databaseReady) return true;

    try {
      setSyncError("");
      const { response, payload } = await patchAdminDraw({ draw: nextDraw });

      if (!response.ok) {
        setSyncError(payload?.error ?? "Draw settings could not be saved.");
        await refreshFromDatabase();
        return false;
      }

      await refreshFromDatabase();
      return true;
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Draw settings could not be saved.");
      await refreshFromDatabase();
      return false;
    }
  }

  async function updateDrawLifecycle(action: DrawLifecycleAction) {
    if (!databaseReady) return false;

    const { response, payload } = await postAdminDrawLifecycle(action);
    if (!response.ok) {
      setSyncError(payload?.error ?? "Draw lifecycle could not be updated.");
      void refreshFromDatabase();
      return false;
    }

    await refreshFromDatabase();
    return true;
  }

  async function saveCardSettings(nextFeaturedCards: FeaturedCard[], nextChaseCards: ChaseCard[]) {
    cardMutationRef.current += 1;
    cardDraftDirtyRef.current = true;
    setFeaturedCards(nextFeaturedCards);
    setChaseCards(nextChaseCards);
    if (!databaseReady) {
      cardDraftDirtyRef.current = false;
      return true;
    }

    try {
      setSyncError("");
      const { response, payload } = await patchAdminDraw({ featuredCards: nextFeaturedCards, chaseCards: nextChaseCards });

      if (!response.ok) {
        setSyncError(payload?.error ?? "Card settings could not be saved.");
        // Don't call refreshFromDatabase here — keep the optimistic state so the user sees their changes
        cardDraftDirtyRef.current = false;
        return false;
      }

      // Keep dirty flag true during the refresh so refreshFromDatabase won't overwrite our new cards
      await refreshFromDatabase();
      cardDraftDirtyRef.current = false;
      return true;
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Card settings could not be saved.");
      cardDraftDirtyRef.current = false;
      return false;
    }
  }

  function updateFeaturedCardDraft(nextFeaturedCards: FeaturedCard[]) {
    cardDraftDirtyRef.current = true;
    cardMutationRef.current += 1;
    setFeaturedCards(nextFeaturedCards);
  }

  function updateChaseCardDraft(nextChaseCards: ChaseCard[]) {
    cardDraftDirtyRef.current = true;
    cardMutationRef.current += 1;
    setChaseCards(nextChaseCards);
  }

  async function uploadPaymentQr(file: File) {
    if (!databaseReady) {
      const localUrl = URL.createObjectURL(file);
      setDraw((current) => ({ ...current, qrImageUrl: localUrl }));
      return localUrl;
    }

    const { response, payload } = await postAdminQr(file);

    if (!response.ok) {
      setSyncError(payload?.error ?? "QR upload failed.");
      return "";
    }

    if (!payload?.qrImageUrl) {
      setSyncError("QR upload response was missing an image URL.");
      return "";
    }
    const qrImageUrl = payload.qrImageUrl;
    setDraw((current) => ({ ...current, qrImageUrl }));
    void refreshFromDatabase();
    return qrImageUrl;
  }

  async function uploadCardImage(file: File) {
    if (!databaseReady) {
      return { imageUrl: URL.createObjectURL(file) };
    }

    const { response, payload } = await postAdminCardImage(file);

    if (!response.ok) {
      setSyncError(payload?.error ?? "Card image upload failed.");
      return "";
    }

    if (!payload?.imageUrl) {
      setSyncError("Card image upload response was missing an image URL.");
      return "";
    }
    return { imageUrl: payload.imageUrl, storagePath: payload.storagePath };
  }

  function toggleSlot(slot: number) {
    if (!activeOrder || activeOrder.status !== "approved" || pickSubmitInFlightRef.current) return;
    const takenByOther = orders.some((order) => order.id !== activeOrder.id && order.slots.includes(slot));
    if (takenByOther) return;
    setSelectedSlots((current) => {
      if (current.includes(slot)) return current.filter((item) => item !== slot);
      if (current.length >= activeOrder.quantity) return current;
      return [...current, slot].sort((a, b) => a - b);
    });
  }

  async function confirmSlots() {
    if (!activeOrder || selectedSlots.length !== activeOrder.quantity) return;
    if (pickSubmitInFlightRef.current) return;

    const orderId = activeOrder.id;
    const nextSlots = [...selectedSlots].sort((a, b) => a - b);
    pickSubmitInFlightRef.current = true;
    setPickSubmitting(true);
    setSyncError("");

    try {
      let savedSlots = nextSlots;
      if (databaseReady) {
        const { response, payload } = await postCustomerPicks(orderId, nextSlots);
        if (!response.ok) {
          setSyncError(payload?.error ?? "Could not confirm selected numbers.");
          await refreshFromDatabase({ preferredActiveOrderId: orderId });
          return;
        }

        const providerSlots = payload?.picks
          ?.map((pick) => Number(pick.slot_number ?? pick.slotNumber))
          .filter((slot) => Number.isInteger(slot) && slot > 0)
          .sort((a, b) => a - b);
        if (providerSlots?.length) savedSlots = providerSlots;
      }

      applyOrderPatch(orderId, { slots: savedSlots, status: "picked" });
      setSelectedSlots(savedSlots);
      if (databaseReady) await refreshFromDatabase({ preferredActiveOrderId: orderId });
      setView("orders");
    } finally {
      pickSubmitInFlightRef.current = false;
      setPickSubmitting(false);
    }
  }


  return {
    lang,
    setLang,
    view,
    setView,
    lineVerified,
    isAdmin,
    adminRole,
    draw,
    orders,
    featuredCards,
    chaseCards,
    cardCatalog,
    quantity,
    setQuantity,
    slipName,
    slipPreviewUrl,
    lineName,
    setLineName,
    activeOrderId,
    selectedSlots,
    query,
    setQuery,
    syncError,
    profileInfo,
    profileLoaded,
    profileSaving,
    orderSubmitting,
    pickSubmitting,
    t,
    takenSlots,
    remaining,
    progress,
    filteredOrders,
    handleLineLogin,
    setPaymentSlip,
    createOrder,
    handlePickOrderChange,
    toggleSlot,
    confirmSlots,
    saveProfileInfo,
    saveDrawSettings,
    updateDrawLifecycle,
    updateOrderStatus,
    viewPaymentSlip,
    assignOrderSlots,
    uploadPaymentQr,
    uploadCardImage,
    updateFeaturedCardDraft,
    updateChaseCardDraft,
    saveCardSettings,
    openPickView,
  };
}
