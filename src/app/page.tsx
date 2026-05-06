"use client";

import Image from "next/image";
import {
  BadgeCheck,
  Banknote,
  Boxes,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  CreditCard,
  ExternalLink,
  Eye,
  Globe2,
  Home,
  Languages,
  Loader2,
  Lock,
  LogIn,
  Play,
  QrCode,
  Radio,
  Search,
  Save,
  Settings,
  ShieldCheck,
  Sparkles,
  Ticket,
  Trash2,
  Upload,
  UserRound,
  Video,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useLiffSession } from "@/lib/line/use-liff-session";
import { defaultDraw, seedOrders } from "@/lib/lucky-draw/defaults";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { CardCatalogItem, ChaseCard, DrawConfig, DrawStatus, FeaturedCard, Lang, Order, OrderStatus, ProfileInfo, SlipVerificationStatus } from "@/lib/lucky-draw/types";

type View = "home" | "checkout" | "pick" | "orders" | "profile" | "admin";
type CardImageUploadResult = { imageUrl: string; storagePath?: string };
type AdminRole = "owner" | "admin" | "staff";
type DrawLifecycleAction = "close_sales" | "create_next" | "publish_next" | "reopen_sales";

const copy = {
  th: {
    appName: "Lucky Draw",
    tag: "จ่ายก่อน เลือกเลข แล้วลุ้นเปิดซองสด",
    liveNow: "ถ่ายทอดสด",
    lineReady: "พร้อมใช้งานบน LINE LIFF",
    browserReady: "ใช้งานได้ทุกอุปกรณ์",
    activeDraw: "รอบที่เปิดอยู่",
    watchStream: "ดูไลฟ์",
    openFacebook: "เปิด Facebook",
    openYoutube: "เปิด YouTube",
    buyNow: "ชำระเงิน",
    pickNumbers: "เลือกเลข",
    orders: "ออเดอร์",
    admin: "แอดมิน",
    profile: "โปรไฟล์",
    pricePerDraw: "ราคาต่อสิทธิ์",
    remaining: "เลขว่าง",
    sold: "ขายแล้ว",
    selected: "เลือกแล้ว",
    customer: "ลูกค้า",
    draws: "สิทธิ์",
    total: "รวม",
    payFirstTitle: "ชำระเงินก่อนเลือกเลข",
    payFirstBody: "เลือกจำนวนสิทธิ์ โอนเงิน อัปโหลดรูปสลิป ระบบจะตรวจอัตโนมัติและปลดล็อกการเลือกเลขเมื่อข้อมูลถูกต้อง",
    uploadSlip: "อัปโหลดสลิป",
    viewSlip: "ดูสลิป",
    manualSlip: "ส่งใน LINE / ตรวจด้วยมือ",
    createOrder: "ส่งออเดอร์",
    sendingOrder: "กำลังส่งออเดอร์",
    pending: "รอตรวจสลิป",
    approved: "อนุมัติแล้ว",
    picked: "เลือกเลขแล้ว",
    rejected: "ไม่ผ่าน",
    noOrders: "ยังไม่มีออเดอร์",
    approve: "อนุมัติ",
    reject: "ปฏิเสธ",
    save: "บันทึก",
    streamSettings: "ตั้งค่าลิงก์ไลฟ์",
    drawSettings: "ตั้งค่ารอบ",
    paymentSettings: "บัญชีรับเงิน",
    lineStatus: "จำลอง LINE Login",
    loginLine: "เข้าสู่ระบบ LINE",
    verifiedLine: "ยืนยัน LINE แล้ว",
    lockedPick: "เลขจะเลือกได้หลังแอดมินอนุมัติสลิป",
    chooseExact: "เลือกให้ครบตามจำนวนสิทธิ์",
    confirmPick: "ยืนยันเลข",
    savingPick: "กำลังบันทึกเลข",
    viewPicked: "ดูเลขที่เลือก",
    alreadyPicked: "บันทึกเลขแล้ว",
    openAdmin: "เปิดหน้าแอดมิน",
    searchOrder: "ค้นหาออเดอร์",
    pickedByAdmin: "แอดมินเลือกเลขให้ลูกค้า",
    manualPick: "เลือกเลขแทนลูกค้า",
    saved: "บันทึกแล้ว",
    currentPicks: "เลขที่เลือก",
    openPicks: "รอเลือกเลข",
    roundCards: "การ์ดรอบนี้",
    roundCardsSub: "ตัวอย่างการ์ดในรอบถัดไป",
    topRewards: "การ์ดมูลค่าสูง",
    showingCards: "แสดง",
    maxCards: "สูงสุด 20 ใบ",
    estValue: "มูลค่าประเมิน",
    moreCards: "ใบอื่น",
    cardSettings: "ตั้งค่าการ์ดในรอบ",
    posterCards: "การ์ดหน้าปก",
    topCards: "การ์ดมูลค่าสูง",
    addCard: "เพิ่มการ์ด",
    addPrizeCard: "เพิ่มการ์ดรางวัล",
    orderSlipDetail: "รายละเอียดออเดอร์ในสลิป (Prefix)",
    prizeTier: "ประเภทการ์ด",
    normalPrize: "การ์ดรางวัลปกติ",
    highTierPrize: "การ์ดมูลค่าสูง",
    cardCode: "รหัสการ์ด",
    savedCard: "เลือกจากคลังการ์ด",
    pickSavedCard: "ค้นหา / เลือกการ์ดที่เคยบันทึก",
    noSavedCards: "ยังไม่มีการ์ดที่บันทึก",
    uploadPhoto: "อัปโหลดรูป",
    remove: "ลบ",
    accountInfo: "ข้อมูลบัญชี",
    profileSettings: "จัดการข้อมูลส่วนตัว",
    displayName: "ชื่อ LINE",
    loginStatus: "สถานะเข้าสู่ระบบ",
    accessLevel: "สิทธิ์การใช้งาน",
    customerAccess: "ลูกค้า",
    adminAccess: "แอดมิน",
    language: "ภาษา",
    orderSummary: "สรุปออเดอร์",
    paidOrders: "ออเดอร์ที่อนุมัติ",
    pickedOrders: "ออเดอร์ที่เลือกเลขแล้ว",
    lineAccount: "บัญชี LINE",
    contactInfo: "ข้อมูลติดต่อ",
    shippingAddress: "ที่อยู่จัดส่ง",
    fullName: "ชื่อ-นามสกุล",
    phone: "เบอร์โทร",
    addressLine1: "ที่อยู่บรรทัด 1",
    addressLine2: "ที่อยู่บรรทัด 2",
    subdistrict: "ตำบล / แขวง",
    district: "อำเภอ / เขต",
    province: "จังหวัด",
    postalCode: "รหัสไปรษณีย์",
    country: "ประเทศ",
    deliveryNote: "หมายเหตุจัดส่ง",
    loginToEditProfile: "เข้าสู่ระบบ LINE เพื่อจัดการข้อมูลส่วนตัว",
    saveProfile: "บันทึกข้อมูลส่วนตัว",
    drawLifecycle: "จัดการรอบ",
    drawStatus: "สถานะรอบ",
    closeSales: "ปิดรับออเดอร์",
    reopenSales: "เปิดรับออเดอร์อีกครั้ง",
    createNextDraw: "สร้างรอบถัดไป",
    publishNextDraw: "เผยแพร่รอบถัดไป",
    statusDraft: "ฉบับร่าง",
    statusLive: "เปิดขาย",
    statusClosed: "ปิดรอบ",
    statusArchived: "เก็บประวัติ",
    pendingPayments: "รอตรวจชำระเงิน",
    awaitingPicks: "รอเลือกเลข",
  },
  en: {
    appName: "Lucky Draw",
    tag: "Pay first, pick numbers, watch the live reveal",
    liveNow: "Live now",
    lineReady: "LINE LIFF ready",
    browserReady: "Works on every device",
    activeDraw: "Active draw",
    watchStream: "Watch stream",
    openFacebook: "Open Facebook",
    openYoutube: "Open YouTube",
    buyNow: "Pay",
    pickNumbers: "Pick",
    orders: "Orders",
    admin: "Admin",
    profile: "Profile",
    pricePerDraw: "Price per draw",
    remaining: "Available",
    sold: "Sold",
    selected: "Selected",
    customer: "Customer",
    draws: "Draws",
    total: "Total",
    payFirstTitle: "Pay before choosing numbers",
    payFirstBody: "Choose draw quantity, transfer payment, upload a slip image, and the system will verify it before unlocking number picking.",
    uploadSlip: "Upload slip",
    viewSlip: "View slip",
    manualSlip: "Sent in LINE / manual check",
    createOrder: "Submit order",
    sendingOrder: "Submitting order",
    pending: "Pending review",
    approved: "Approved",
    picked: "Picked",
    rejected: "Rejected",
    noOrders: "No orders yet",
    approve: "Approve",
    reject: "Reject",
    save: "Save",
    streamSettings: "Stream links",
    drawSettings: "Draw settings",
    paymentSettings: "Payment account",
    lineStatus: "LINE Login demo",
    loginLine: "Login with LINE",
    verifiedLine: "LINE verified",
    lockedPick: "Picking unlocks after admin approves the payment slip",
    chooseExact: "Choose exactly your approved draw quantity",
    confirmPick: "Confirm numbers",
    savingPick: "Saving numbers",
    viewPicked: "View numbers",
    alreadyPicked: "Numbers saved",
    openAdmin: "Open admin",
    searchOrder: "Search orders",
    pickedByAdmin: "Admin picked for customer",
    manualPick: "Pick for customer",
    saved: "Saved",
    currentPicks: "Picked numbers",
    openPicks: "Awaiting picks",
    roundCards: "This round's cards",
    roundCardsSub: "Preview cards for the next draw event",
    topRewards: "Top value cards",
    showingCards: "Showing",
    maxCards: "max 20 cards",
    estValue: "est. value",
    moreCards: "more",
    cardSettings: "Round card settings",
    posterCards: "Poster cards",
    topCards: "Top value cards",
    addCard: "Add card",
    addPrizeCard: "Add prize card",
    orderSlipDetail: "Order slip detail / order prefix",
    prizeTier: "Prize type",
    normalPrize: "Normal card prize",
    highTierPrize: "High tier card prize",
    cardCode: "Card code",
    savedCard: "Saved card",
    pickSavedCard: "Search / pick saved card",
    noSavedCards: "No saved cards yet",
    uploadPhoto: "Upload photo",
    remove: "Remove",
    accountInfo: "Account info",
    profileSettings: "Personal info management",
    displayName: "LINE name",
    loginStatus: "Login status",
    accessLevel: "Access level",
    customerAccess: "Customer",
    adminAccess: "Admin",
    language: "Language",
    orderSummary: "Order summary",
    paidOrders: "Approved orders",
    pickedOrders: "Picked orders",
    lineAccount: "LINE account",
    contactInfo: "Contact info",
    shippingAddress: "Shipping address",
    fullName: "Full name",
    phone: "Phone",
    addressLine1: "Address line 1",
    addressLine2: "Address line 2",
    subdistrict: "Subdistrict",
    district: "District",
    province: "Province",
    postalCode: "Postal code",
    country: "Country",
    deliveryNote: "Delivery note",
    loginToEditProfile: "Login with LINE to manage your personal info",
    saveProfile: "Save personal info",
    drawLifecycle: "Draw lifecycle",
    drawStatus: "Draw status",
    closeSales: "Close sales",
    reopenSales: "Reopen sales",
    createNextDraw: "Create next draw",
    publishNextDraw: "Publish next draw",
    statusDraft: "Draft",
    statusLive: "Live",
    statusClosed: "Closed",
    statusArchived: "Archived",
    pendingPayments: "Pending payments",
    awaitingPicks: "Awaiting picks",
  },
};

const storageKey = "lucky-draw-mvp-v2";

const emptyProfileInfo: ProfileInfo = {
  fullName: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  subdistrict: "",
  district: "",
  province: "",
  postalCode: "",
  country: "Thailand",
  deliveryNote: "",
};

const defaultFeaturedCards: FeaturedCard[] = [
  { id: "poster-ace", name: "Portgas D. Ace", grade: "PSA 10", series: "One Piece", tone: "red" },
  { id: "poster-luffy", name: "Monkey D. Luffy", grade: "PSA 10", series: "One Piece", tone: "gold" },
  { id: "poster-zoro", name: "Roronoa Zoro", grade: "BGS 10", series: "One Piece", tone: "green" },
  { id: "poster-shanks", name: "Shanks Alt Art", grade: "BGS 10", series: "One Piece", tone: "rose" },
  { id: "poster-nami", name: "Nami Parallel", grade: "PSA 10", series: "One Piece", tone: "blue" },
  { id: "poster-boa", name: "Boa Hancock", grade: "PSA 10", series: "One Piece", tone: "violet" },
  { id: "poster-charizard", name: "Charizard ex", grade: "PSA 10", series: "Pokemon", tone: "red" },
  { id: "poster-pikachu", name: "Pikachu Promo", grade: "PSA 10", series: "Pokemon", tone: "gold" },
  { id: "poster-lugia", name: "Lugia V", grade: "BGS 10", series: "Pokemon", tone: "blue" },
  { id: "poster-rayleigh", name: "Rayleigh SP", grade: "PSA 10", series: "One Piece", tone: "green" },
  { id: "poster-sabo", name: "Sabo Manga", grade: "PSA 10", series: "One Piece", tone: "rose" },
  { id: "poster-mewtwo", name: "Mewtwo SAR", grade: "BGS 10", series: "Pokemon", tone: "violet" },
];

const defaultChaseCards: ChaseCard[] = [
  {
    rank: 1,
    id: "chase-ace",
    name: "Portgas D. Ace Alt Art",
    grade: "PSA 10",
    series: "One Piece",
    tone: "red",
    value: 85000,
  },
  {
    rank: 2,
    id: "chase-luffy",
    name: "Monkey D. Luffy Manga",
    grade: "PSA 10",
    series: "One Piece",
    tone: "gold",
    value: 42000,
  },
  {
    rank: 3,
    id: "chase-shanks",
    name: "Shanks Alternate Art",
    grade: "BGS 10",
    series: "One Piece",
    tone: "rose",
    value: 28000,
  },
];

type SavedState = {
  lang?: Lang;
  draw?: DrawConfig;
  orders?: Order[];
  featuredCards?: FeaturedCard[];
  chaseCards?: ChaseCard[];
  cardCatalog?: CardCatalogItem[];
};

type LuckyDrawApiResponse = {
  configured: boolean;
  viewer?: {
    displayName: string;
    isAdmin: boolean;
    adminRole: AdminRole | null;
  } | null;
  state: {
    draw: DrawConfig;
    orders: Order[];
    featuredCards?: FeaturedCard[];
    chaseCards?: ChaseCard[];
    cardCatalog?: CardCatalogItem[];
  };
};

function readSavedState(): SavedState {
  if (typeof window === "undefined") return {};
  const saved = window.localStorage.getItem(storageKey);
  if (!saved) return {};
  try {
    return JSON.parse(saved) as SavedState;
  } catch {
    window.localStorage.removeItem(storageKey);
    return {};
  }
}

function money(value: number) {
  return new Intl.NumberFormat("th-TH").format(value);
}

function paymentDigits(value: string | undefined) {
  const digits = (value ?? "").replace(/\D+/g, "");
  return digits && !/^0+$/.test(digits) ? digits : "";
}

function promptPayDisplay(value: string | undefined) {
  const digits = paymentDigits(value);
  if (digits.length === 11 && digits.startsWith("66")) return `0${digits.slice(2)}`;
  if (digits.length === 10 && digits.startsWith("0")) return digits;
  if (digits.length === 13 || digits.length === 15) return digits;
  return "";
}

function cleanOrderPrefixInput(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .slice(0, 16);
}

function normalizeOrderPrefixInput(value: string) {
  return cleanOrderPrefixInput(value).replace(/^-+|-+$/g, "");
}

function normalizeDrawConfig(draw: Partial<DrawConfig>): DrawConfig {
  return {
    ...defaultDraw,
    ...draw,
    orderCodePrefix: normalizeOrderPrefixInput(draw.orderCodePrefix ?? defaultDraw.orderCodePrefix) || defaultDraw.orderCodePrefix,
  };
}

function orderLabel(status: OrderStatus, lang: Lang) {
  return copy[lang][status];
}

function newCardId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function applyCatalogCard(card: FeaturedCard, catalogCard: CardCatalogItem): FeaturedCard {
  return {
    ...card,
    catalogCardId: catalogCard.catalogCardId,
    code: catalogCard.code,
    name: catalogCard.name,
    grade: catalogCard.grade,
    series: catalogCard.series,
    tone: catalogCard.tone,
    photoUrl: catalogCard.photoUrl,
    photoStoragePath: catalogCard.photoStoragePath,
  };
}

function normalizeCardIdentityText(value: string | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function cardsShareCatalogIdentity(a: FeaturedCard, b: FeaturedCard) {
  if (a.catalogCardId && b.catalogCardId) return a.catalogCardId === b.catalogCardId;
  if (a.code?.trim() && b.code?.trim()) return normalizeCardIdentityText(a.code) === normalizeCardIdentityText(b.code);
  if (a.catalogCardId || b.catalogCardId || a.code?.trim() || b.code?.trim()) return false;
  const name = normalizeCardIdentityText(a.name);
  return name.length > 0 && name !== "new card" && name !== "new chase card" && name === normalizeCardIdentityText(b.name);
}

function statusClass(status: OrderStatus) {
  if (status === "approved") return "border-emerald-400/35 bg-emerald-400/12 text-emerald-200";
  if (status === "picked") return "border-sky-400/35 bg-sky-400/12 text-sky-200";
  if (status === "rejected") return "border-rose-400/35 bg-rose-400/12 text-rose-200";
  return "border-amber-300/35 bg-amber-300/12 text-amber-100";
}

function slipVerificationLabel(status: SlipVerificationStatus, lang: Lang) {
  const labels: Record<SlipVerificationStatus, { th: string; en: string }> = {
    unverified: { th: "ยังไม่ตรวจ API", en: "API not checked" },
    valid: { th: "สลิปถูกต้อง", en: "Slip verified" },
    duplicate: { th: "สลิปซ้ำ", en: "Duplicate slip" },
    fraud: { th: "สลิปปลอม", en: "Fraud slip" },
    not_found: { th: "ไม่พบสลิป", en: "Slip not found" },
    amount_mismatch: { th: "ยอดไม่ตรง", en: "Amount mismatch" },
    receiver_mismatch: { th: "บัญชีรับเงินไม่ตรง", en: "Receiver mismatch" },
    date_mismatch: { th: "เกิน 24 ชม.", en: "Older than 24h" },
    provider_error: { th: "API ใช้ไม่ได้", en: "API unavailable" },
    manual_review: { th: "ตรวจด้วยมือ", en: "Manual review" },
  };
  return labels[status][lang];
}

function slipVerificationClass(status: SlipVerificationStatus) {
  if (status === "valid") return "border-emerald-400/35 bg-emerald-400/12 text-emerald-200";
  if (status === "provider_error" || status === "manual_review" || status === "unverified") {
    return "border-amber-300/35 bg-amber-300/12 text-amber-100";
  }
  return "border-rose-400/35 bg-rose-400/12 text-rose-200";
}

function drawStatusLabel(status: DrawStatus, lang: Lang) {
  const t = copy[lang];
  if (status === "draft") return t.statusDraft;
  if (status === "closed") return t.statusClosed;
  if (status === "archived") return t.statusArchived;
  return t.statusLive;
}

function drawStatusClass(status: DrawStatus) {
  if (status === "draft") return "border-sky-400/35 bg-sky-400/12 text-sky-100";
  if (status === "closed") return "border-amber-300/35 bg-amber-300/12 text-amber-100";
  if (status === "archived") return "border-white/10 bg-white/[0.04] text-[var(--muted)]";
  return "border-emerald-400/35 bg-emerald-400/12 text-emerald-100";
}

export default function LuckyDrawApp() {
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
    }, 0);

    return () => window.clearTimeout(syncLiffState);
  }, [liffSession.profile, liffSession.status]);

  useEffect(() => {
    if (!hydrated || liffSession.status === "loading") return;
    refreshRef.current();
  }, [hydrated, liffSession.profile, liffSession.status]);

  useEffect(() => {
    if (!databaseReady) return;

    let channel: ReturnType<ReturnType<typeof createBrowserSupabaseClient>["channel"]> | null = null;
    try {
      const supabase = createBrowserSupabaseClient();
      channel = supabase
        .channel("lucky-draw-live-refresh")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "lucky_draw_realtime_events" },
          () => refreshRef.current(),
        )
        .subscribe();
    } catch {
      return;
    }

    return () => {
      if (channel) void channel.unsubscribe();
    };
  }, [databaseReady]);

  const takenSlots = useMemo(
    () => new Set(orders.flatMap((order) => order.slots)),
    [orders],
  );

  const activeOrder = orders.find((order) => order.id === activeOrderId);
  const remaining = draw.totalSlots - takenSlots.size;
  const progress = Math.round((takenSlots.size / draw.totalSlots) * 100);
  const filteredOrders = orders.filter((order) => {
    const text = `${order.id} ${order.lineName} ${order.status} ${order.slots.join(",")}`.toLowerCase();
    return text.includes(query.toLowerCase());
  });

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
    void liffSession.login();
  }

  async function refreshProfileInfo() {
    try {
      const response = await fetch("/api/lucky-draw/profile", { cache: "no-store" });
      if (response.status === 401) {
        setProfileInfo(emptyProfileInfo);
        setProfileLoaded(false);
        return;
      }
      if (!response.ok) return;

      const payload = (await response.json()) as { displayName?: string; profile: ProfileInfo };
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
      const response = await fetch("/api/lucky-draw/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(nextProfileInfo),
      });

      if (response.status === 401) {
        handleLineLogin();
        return false;
      }

      const payload = (await response.json().catch(() => null)) as { error?: string; displayName?: string; profile?: ProfileInfo } | null;
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
      const response = await fetch("/api/lucky-draw", { cache: "no-store" });
      if (!response.ok) return null;
      const payload = (await response.json()) as LuckyDrawApiResponse;
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
      handleLineLogin();
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

        const response = await fetch("/api/lucky-draw", {
          method: "POST",
          body: form,
        });

        if (response.status === 401) {
          handleLineLogin();
          return;
        }

        if (response.ok) {
          const payload = (await response.json()) as { order: Order };
          setOrders((current) => [payload.order, ...current.filter((order) => order.id !== payload.order.id)]);
          setActiveOrderId(payload.order.id);
          setSelectedSlots(payload.order.slots);
          setPaymentSlip(null);
          await refreshFromDatabase({ preferredActiveOrderId: payload.order.id });
          setView("orders");
          return;
        }

        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
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

    const response = await fetch(`/api/lucky-draw/admin/slip?orderId=${encodeURIComponent(id)}`);
    const payload = (await response.json().catch(() => null)) as { error?: string; signedUrl?: string | null } | null;
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

    const response = await fetch("/api/lucky-draw/admin/order", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: id, status }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
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

    const response = await fetch("/api/lucky-draw/admin/order", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: id, slots }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
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
      const response = await fetch("/api/lucky-draw/admin/draw", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draw: nextDraw }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
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

    const response = await fetch("/api/lucky-draw/admin/draw/lifecycle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });

    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
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
      const response = await fetch("/api/lucky-draw/admin/draw", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ featuredCards: nextFeaturedCards, chaseCards: nextChaseCards }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
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

    const form = new FormData();
    form.set("file", file);

    const response = await fetch("/api/lucky-draw/admin/qr", {
      method: "POST",
      body: form,
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setSyncError(payload?.error ?? "QR upload failed.");
      return "";
    }

    const payload = (await response.json()) as { qrImageUrl: string };
    setDraw((current) => ({ ...current, qrImageUrl: payload.qrImageUrl }));
    void refreshFromDatabase();
    return payload.qrImageUrl;
  }

  async function uploadCardImage(file: File) {
    if (!databaseReady) {
      return { imageUrl: URL.createObjectURL(file) };
    }

    const form = new FormData();
    form.set("file", file);

    const response = await fetch("/api/lucky-draw/admin/card-image", {
      method: "POST",
      body: form,
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setSyncError(payload?.error ?? "Card image upload failed.");
      return "";
    }

    const payload = (await response.json()) as { imageUrl: string; storagePath?: string };
    return payload;
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
        const response = await fetch("/api/lucky-draw/picks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ orderId, slots: nextSlots }),
        });

        const payload = (await response.json().catch(() => null)) as { error?: string; picks?: { slot_number?: number; slotNumber?: number }[] } | null;
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

  return (
    <main className="app-shell mobile-safe">
      <header className="glass sticky top-3 z-30 mb-4 grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-2 rounded-[22px] px-3 py-3">
        <button
          aria-label="Home"
          className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]"
          onClick={() => setView("home")}
        >
          <Sparkles className="h-5 w-5 text-[var(--gold)]" />
        </button>
        <div className="min-w-0 px-1 text-center sm:px-3">
          <p className="truncate text-base font-black tracking-wide text-[var(--gold)]">{t.appName}</p>
          <p className="truncate text-[11px] text-[var(--muted)]">{t.tag}</p>
        </div>
        <div className="flex min-w-0 justify-end">
          <button
            className="flex h-10 max-w-[76px] items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 text-xs font-bold"
            onClick={() => setLang(lang === "th" ? "en" : "th")}
          >
            <Languages className="h-4 w-4 shrink-0 text-[var(--gold)]" />
            {lang.toUpperCase()}
          </button>
        </div>
      </header>

      <div className={view === "admin" ? "grid min-w-0 gap-4" : "grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]"}>
        <section className="min-w-0 space-y-4">
          {syncError && (
            <div className="rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm font-bold text-amber-100">
              {syncError}
            </div>
          )}
          {view === "home" && (
            <HomeView
              draw={draw}
              lang={lang}
              lineVerified={lineVerified}
              remaining={remaining}
              progress={progress}
              sold={takenSlots.size}
              featuredCards={featuredCards}
              chaseCards={chaseCards}
              onLogin={handleLineLogin}
              onCheckout={() => setView("checkout")}
              onPick={() => openPickView()}
            />
          )}
          {view === "checkout" && (
            <CheckoutView
              draw={draw}
              lang={lang}
              lineName={lineName}
              lineVerified={lineVerified}
              quantity={quantity}
              slipName={slipName}
              slipPreviewUrl={slipPreviewUrl}
              isSubmitting={orderSubmitting}
              onLineName={setLineName}
              onQuantity={setQuantity}
              onSlip={setPaymentSlip}
              onSubmit={createOrder}
            />
          )}
          {view === "pick" && (
            <PickView
              draw={draw}
              lang={lang}
              orders={orders}
              activeOrderId={activeOrderId}
              selectedSlots={selectedSlots}
              takenSlots={takenSlots}
              isConfirming={pickSubmitting}
              onOrder={handlePickOrderChange}
              onSlot={toggleSlot}
              onConfirm={confirmSlots}
            />
          )}
          {view === "orders" && (
            <OrdersView
              lang={lang}
              orders={orders}
              query={query}
              filteredOrders={filteredOrders}
              onQuery={setQuery}
              onPick={(id) => {
                openPickView(id);
              }}
            />
          )}
          {view === "profile" && (
            <ProfileView
              lang={lang}
              lineName={lineName}
              lineVerified={lineVerified}
              isAdmin={isAdmin}
              adminRole={adminRole}
              orders={orders}
              profileInfo={profileInfo}
              profileLoaded={profileLoaded}
              profileSaving={profileSaving}
              onLogin={handleLineLogin}
              onLanguage={() => setLang(lang === "th" ? "en" : "th")}
              onSaveProfile={saveProfileInfo}
            />
          )}
          {view === "admin" && isAdmin && (
            <AdminView
              draw={draw}
              lang={lang}
              orders={orders}
              onDraw={saveDrawSettings}
              onDrawLifecycle={updateDrawLifecycle}
              onApprove={(id) => void updateOrderStatus(id, "approved")}
              onReject={(id) => void updateOrderStatus(id, "rejected")}
              onViewSlip={(id) => void viewPaymentSlip(id)}
              onAssignSlots={assignOrderSlots}
              onQrUpload={uploadPaymentQr}
              onCardImageUpload={uploadCardImage}
              featuredCards={featuredCards}
              chaseCards={chaseCards}
              cardCatalog={cardCatalog}
              onFeaturedCards={updateFeaturedCardDraft}
              onChaseCards={updateChaseCardDraft}
              onSaveCards={saveCardSettings}
            />
          )}
          {view === "admin" && !isAdmin && (
            <ProfileView
              lang={lang}
              lineName={lineName}
              lineVerified={lineVerified}
              isAdmin={isAdmin}
              adminRole={adminRole}
              orders={orders}
              profileInfo={profileInfo}
              profileLoaded={profileLoaded}
              profileSaving={profileSaving}
              onLogin={handleLineLogin}
              onLanguage={() => setLang(lang === "th" ? "en" : "th")}
              onSaveProfile={saveProfileInfo}
            />
          )}
        </section>

        <aside className={view === "admin" ? "hidden" : "hidden min-w-0 space-y-4 lg:block"}>
          <StatusPanel
            draw={draw}
            lang={lang}
            lineVerified={lineVerified}
            remaining={remaining}
            sold={takenSlots.size}
            orders={orders}
            onLogin={handleLineLogin}
            onProfile={() => setView("profile")}
            isAdmin={isAdmin}
            onAdmin={() => setView("admin")}
          />
        </aside>
      </div>

      <div className="bottom-nav-spacer" aria-hidden="true" />
      <BottomNav
        view={view}
        setView={(nextView) => {
          if (nextView === "pick") {
            openPickView();
            return;
          }
          setView(nextView);
        }}
        pending={orders.filter((o) => o.status === "pending").length}
        isAdmin={isAdmin}
      />
    </main>
  );
}

function HomeView({
  draw,
  lang,
  lineVerified,
  remaining,
  progress,
  sold,
  featuredCards,
  chaseCards,
  onLogin,
  onCheckout,
  onPick,
}: {
  draw: DrawConfig;
  lang: Lang;
  lineVerified: boolean;
  remaining: number;
  progress: number;
  sold: number;
  featuredCards: FeaturedCard[];
  chaseCards: ChaseCard[];
  onLogin: () => void;
  onCheckout: () => void;
  onPick: () => void;
}) {
  const t = copy[lang];
  const roundCards = [...chaseCards, ...featuredCards];
  return (
    <>
      <div className="glass overflow-hidden rounded-[28px]">
        <div className="relative w-full overflow-hidden bg-black aspect-video">
          {draw.youtubeUrl ? (
            <iframe
              className="absolute inset-0 h-full w-full"
              src={draw.youtubeUrl}
              title="Lucky Draw live stream"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : (
            <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_center,rgba(244,197,66,0.13),transparent_42%),linear-gradient(135deg,#13172a,#080912)] px-4 text-center">
              <div className="max-w-full">
                <Video className="mx-auto h-10 w-10 text-[var(--gold)]" />
                <p className="mt-3 text-lg font-black">{t.watchStream}</p>
                <p className="mx-auto mt-1 max-w-[26ch] text-wrap text-sm leading-snug text-[var(--muted)]">Add the YouTube embed URL in Admin</p>
              </div>
            </div>
          )}
          <div className={`absolute left-4 top-4 flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black uppercase text-white ${draw.status === "live" ? "bg-rose-500 status-live" : "bg-slate-700"}`}>
            <Radio className="h-3.5 w-3.5" />
            {draw.status === "live" ? t.liveNow : drawStatusLabel(draw.status, lang)}
          </div>
        </div>
        <div className="space-y-4 border-t border-white/10 bg-black/10 p-4 sm:p-5">
          <CardPoster lang={lang} cards={roundCards} onPick={onPick} />
        </div>
        <div className="p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Pill icon={<Video />} text={draw.series} />
            <Pill icon={<Globe2 />} text={t.browserReady} />
            <Pill icon={<ShieldCheck />} text={t.lineReady} />
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--gold)]">{t.activeDraw}</p>
          <h1 className="mt-2 text-3xl font-black leading-tight sm:text-5xl">
            {lang === "th" ? draw.titleTh : draw.titleEn}
          </h1>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Metric label={t.pricePerDraw} value={`${money(draw.price)} THB`} />
            <Metric label={t.remaining} value={`${remaining}/${draw.totalSlots}`} />
            <Metric label={t.sold} value={`${sold} (${progress}%)`} />
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-[linear-gradient(135deg,var(--gold-2),var(--gold))]" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button className="gold-button flex h-14 items-center justify-center gap-2 rounded-2xl font-black" disabled={draw.status !== "live"} onClick={onCheckout}>
              <CreditCard className="h-5 w-5" />
              {t.buyNow}
            </button>
            <button className="plain-button flex h-14 items-center justify-center gap-2 rounded-2xl font-black" onClick={onPick}>
              <Ticket className="h-5 w-5" />
              {t.pickNumbers}
            </button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <a className="plain-button flex h-12 items-center justify-center gap-2 rounded-2xl text-sm font-bold" href={draw.facebookUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
              {t.openFacebook}
            </a>
            <a className="plain-button flex h-12 items-center justify-center gap-2 rounded-2xl text-sm font-bold" href={draw.youtubeUrl ? draw.youtubeUrl.replace("/embed/", "/") : "#admin-stream"} target="_blank" rel="noreferrer">
              <Play className="h-4 w-4" />
              {t.openYoutube}
            </a>
          </div>
        </div>
      </div>

      <div className="soft-card rounded-[24px] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black">{t.lineStatus}</p>
            <p className="text-sm text-[var(--muted)]">{lineVerified ? t.verifiedLine : t.lineReady}</p>
          </div>
          <button className="plain-button flex h-11 items-center justify-center gap-2 rounded-2xl px-4 font-bold" onClick={onLogin}>
            {lineVerified ? <BadgeCheck className="h-4 w-4 text-emerald-300" /> : <LogIn className="h-4 w-4" />}
            {lineVerified ? t.verifiedLine : t.loginLine}
          </button>
        </div>
      </div>
    </>
  );
}

function CardPoster({ lang, cards, onPick }: { lang: Lang; cards: FeaturedCard[]; onPick: () => void }) {
  const t = copy[lang];
  const visibleCards = cards.slice(0, 20);
  return (
    <section className="poster-panel overflow-hidden rounded-[24px]">
      <div className="poster-heading">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[var(--gold)]">{t.roundCards}</p>
          <p className="mt-1 truncate text-xs text-[var(--muted)]">
            {t.roundCardsSub} · {t.showingCards} {visibleCards.length}/{cards.length} · {t.maxCards}
          </p>
        </div>
        <button className="text-xs font-black text-[var(--gold)]" onClick={onPick}>
          {t.pickNumbers}
        </button>
      </div>
      <div className={`poster-grid ${visibleCards.length > 12 ? "poster-grid-dense" : ""}`}>
        {visibleCards.map((card, index) => (
          <MiniCard key={`${card.name}-${index}`} card={card} />
        ))}
      </div>
    </section>
  );
}

function MiniCard({ card }: { card: FeaturedCard }) {
  return (
    <article className="mini-card">
      <div className="card-art-preview">
        <CardArtwork card={card} />
      </div>
      <div className="min-w-0 px-2 py-2">
        <p className="truncate text-[11px] font-bold text-white/85">
          <span className={`series-dot ${card.series === "Pokemon" ? "series-pokemon" : "series-one-piece"}`} />
          {card.name}
        </p>
      </div>
    </article>
  );
}

function CardArtwork({ card, compact }: { card: FeaturedCard; compact?: boolean }) {
  if (card.photoUrl) {
    return (
      <div className="relative h-full w-full bg-black">
        <Image
          className="object-cover"
          src={card.photoUrl}
          alt={card.name}
          fill
          sizes={compact ? "54px" : "120px"}
          unoptimized
        />
        <span className={`grade-chip ${card.grade.startsWith("BGS") ? "grade-bgs" : ""}`}>{card.grade}</span>
      </div>
    );
  }

  return (
    <div className={`card-art card-art-${card.tone} ${compact ? "card-art-fill" : ""}`}>
      <div className="card-art-shine" />
      <span className={`grade-chip ${card.grade.startsWith("BGS") ? "grade-bgs" : ""}`}>{card.grade}</span>
      <div className="card-art-symbol">
        <Ticket className={compact ? "h-4 w-4" : "h-6 w-6"} />
      </div>
      <div className="card-art-bottom" />
    </div>
  );
}

function CheckoutView({
  draw,
  lang,
  lineName,
  lineVerified,
  quantity,
  slipName,
  slipPreviewUrl,
  isSubmitting,
  onLineName,
  onQuantity,
  onSlip,
  onSubmit,
}: {
  draw: DrawConfig;
  lang: Lang;
  lineName: string;
  lineVerified: boolean;
  quantity: number;
  slipName: string;
  slipPreviewUrl: string;
  isSubmitting: boolean;
  onLineName: (value: string) => void;
  onQuantity: (value: number) => void;
  onSlip: (file: File | null) => void;
  onSubmit: () => void;
}) {
  const t = copy[lang];
  const cleanPromptPay = promptPayDisplay(draw.promptPay);
  return (
    <div className="glass rounded-[28px] p-4 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--gold)]">{t.buyNow}</p>
      <h2 className="mt-2 text-2xl font-black">{t.payFirstTitle}</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{t.payFirstBody}</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="block space-y-2">
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--muted)]">{t.customer}</span>
          <input
            className="h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 outline-none focus:border-[var(--gold)]"
            value={lineName}
            disabled={isSubmitting}
            onChange={(event) => onLineName(event.target.value)}
          />
        </label>
        <label className="block space-y-2">
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--muted)]">{t.draws}</span>
          <select
            className="h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 outline-none focus:border-[var(--gold)]"
            value={quantity}
            disabled={isSubmitting}
            onChange={(event) => onQuantity(Number(event.target.value))}
          >
            {[1, 2, 3, 4, 5, 6, 8, 10].map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="soft-card rounded-3xl p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-black">
            <QrCode className="h-4 w-4 text-[var(--gold)]" />
            {cleanPromptPay ? "PromptPay" : "Payment QR"}
          </div>
          <div className="relative grid aspect-square w-full place-items-center overflow-hidden rounded-2xl bg-white p-3 text-center text-slate-900">
            {draw.qrImageUrl ? (
              <div className="relative h-full w-full">
                <Image
                  className="rounded-xl object-contain"
                  src={draw.qrImageUrl}
                  alt="PromptPay QR"
                  fill
                  sizes="(max-width: 640px) calc(100vw - 112px), 280px"
                  unoptimized
                />
              </div>
            ) : (
            <div>
              <QrCode className="mx-auto h-20 w-20" />
              {cleanPromptPay && <p className="mt-3 text-sm font-black">{cleanPromptPay}</p>}
              <p className="text-xs text-slate-500">{money(quantity * draw.price)} THB</p>
            </div>
            )}
          </div>
          {draw.qrImageUrl && cleanPromptPay && (
            <div className="mt-3 text-center">
              <p className="text-sm font-black text-white">{cleanPromptPay}</p>
              <p className="text-xs text-[var(--muted)]">{money(quantity * draw.price)} THB</p>
            </div>
          )}
        </div>
        <div className="soft-card rounded-3xl p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-black">
            <Banknote className="h-4 w-4 text-[var(--gold)]" />
            {draw.bankName}
          </div>
          <dl className="space-y-3 text-sm">
            <Row label="Name" value={draw.accountName} />
            <Row label="Account" value={draw.accountNumber} />
            <Row label={t.total} value={`${money(quantity * draw.price)} THB`} strong />
          </dl>
        </div>
      </div>

      <label className={`mt-5 flex min-h-28 flex-col items-center justify-center rounded-3xl border border-dashed border-white/18 bg-white/[0.035] p-4 text-center ${isSubmitting ? "cursor-wait opacity-70" : "cursor-pointer"}`}>
        {slipPreviewUrl ? (
          <span className="relative block h-40 w-full overflow-hidden rounded-2xl border border-white/10 bg-black/20">
            <Image className="object-contain" src={slipPreviewUrl} alt={slipName || "Uploaded payment slip"} fill sizes="(max-width: 640px) calc(100vw - 64px), 360px" unoptimized />
          </span>
        ) : (
          <Upload className="h-6 w-6 text-[var(--gold)]" />
        )}
        <span className="mt-2 text-sm font-black">{slipName ? `${t.uploadSlip}: ${slipName}` : t.uploadSlip}</span>
        <span className="mt-1 text-xs text-[var(--muted)]">
          {slipName ? "Ready to submit" : "JPG, PNG, or WEBP"}
        </span>
        <input
          className="hidden"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={isSubmitting}
          onChange={(event) => onSlip(event.target.files?.[0] ?? null)}
        />
      </label>

      <button
        className="gold-button mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl font-black disabled:cursor-wait disabled:opacity-70"
        disabled={isSubmitting}
        aria-busy={isSubmitting}
        onClick={onSubmit}
      >
        {isSubmitting ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : lineVerified ? (
          <Check className="h-5 w-5" />
        ) : (
          <LogIn className="h-5 w-5" />
        )}
        {isSubmitting ? t.sendingOrder : lineVerified ? t.createOrder : t.loginLine}
      </button>
    </div>
  );
}

function PickView({
  draw,
  lang,
  orders,
  activeOrderId,
  selectedSlots,
  takenSlots,
  isConfirming,
  onOrder,
  onSlot,
  onConfirm,
}: {
  draw: DrawConfig;
  lang: Lang;
  orders: Order[];
  activeOrderId: string;
  selectedSlots: number[];
  takenSlots: Set<number>;
  isConfirming: boolean;
  onOrder: (id: string) => void;
  onSlot: (slot: number) => void;
  onConfirm: () => void;
}) {
  const t = copy[lang];
  const pickableOrders = orders.filter((order) => order.status === "approved" || order.status === "picked");
  const activeOrder = orders.find((order) => order.id === activeOrderId);
  const alreadyPicked = activeOrder?.status === "picked";
  const canPick = activeOrder?.status === "approved" && !isConfirming;
  const slots = Array.from({ length: draw.totalSlots }, (_, index) => index + 1);
  const activeOrderSlots = new Set(activeOrder?.slots ?? []);
  const selectedCount = alreadyPicked ? activeOrder?.slots.length ?? 0 : selectedSlots.length;

  return (
    <div className="glass rounded-[28px] p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--gold)]">{t.pickNumbers}</p>
          <h2 className="mt-2 text-2xl font-black">{alreadyPicked ? t.alreadyPicked : canPick ? t.chooseExact : t.lockedPick}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {activeOrder
              ? `${activeOrder.id} · ${t.selected} ${selectedCount} / ${activeOrder.quantity}`
              : t.noOrders}
          </p>
        </div>
        <select
          className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4 outline-none focus:border-[var(--gold)]"
          value={activeOrderId}
          onChange={(event) => onOrder(event.target.value)}
        >
          {pickableOrders.length === 0 && <option value={activeOrderId}>{t.pending}</option>}
          {pickableOrders.map((order) => (
            <option key={order.id} value={order.id}>
              {order.id} · {order.lineName} · {order.quantity} {t.draws} · {orderLabel(order.status, lang)}
            </option>
          ))}
        </select>
      </div>

      <div className="slot-grid mt-5">
        {slots.map((slot) => {
          const owned = activeOrderSlots.has(slot);
          const taken = takenSlots.has(slot) && !owned;
          const picked = selectedSlots.includes(slot) || owned;
          return (
            <button
              key={slot}
              className={[
                "slot-button aspect-square rounded-2xl border text-sm font-black transition",
                taken ? "border-white/5 bg-black/35 text-white/20" : "",
                !taken && picked ? "border-[var(--gold)] bg-[var(--gold)] text-slate-950 shadow-[0_0_22px_rgba(244,197,66,0.35)]" : "",
                !taken && !picked ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200 hover:border-emerald-200" : "",
                !canPick && !taken ? "opacity-45" : "",
              ].join(" ")}
              disabled={taken || !canPick}
              onClick={() => onSlot(slot)}
            >
              {slot}
            </button>
          );
        })}
      </div>

      <button
        className="gold-button mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl font-black disabled:cursor-not-allowed disabled:opacity-70"
        disabled={!activeOrder || isConfirming || activeOrder.status !== "approved" || selectedSlots.length !== activeOrder.quantity}
        aria-busy={isConfirming}
        onClick={onConfirm}
      >
        {isConfirming ? <Loader2 className="h-5 w-5 animate-spin" /> : alreadyPicked ? <Check className="h-5 w-5" /> : <Ticket className="h-5 w-5" />}
        {isConfirming ? t.savingPick : alreadyPicked ? t.alreadyPicked : t.confirmPick}
      </button>
    </div>
  );
}

function OrdersView({
  lang,
  orders,
  query,
  filteredOrders,
  onQuery,
  onPick,
}: {
  lang: Lang;
  orders: Order[];
  query: string;
  filteredOrders: Order[];
  onQuery: (value: string) => void;
  onPick: (id: string) => void;
}) {
  const t = copy[lang];
  return (
    <div className="glass rounded-[28px] p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--gold)]">{t.orders}</p>
          <h2 className="mt-2 text-2xl font-black">{orders.length} Orders</h2>
        </div>
        <ClipboardList className="h-8 w-8 text-[var(--gold)]" />
      </div>
      <label className="mt-5 flex h-12 items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-4">
        <Search className="h-4 w-4 text-[var(--muted)]" />
        <input
          className="min-w-0 flex-1 bg-transparent outline-none"
          placeholder={t.searchOrder}
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
      </label>
      <div className="mt-5 space-y-3">
        {filteredOrders.length === 0 && <Empty text={t.noOrders} />}
        {filteredOrders.map((order) => (
          <OrderCard key={order.id} lang={lang} order={order} onPick={onPick} />
        ))}
      </div>
    </div>
  );
}

function ProfileView({
  lang,
  lineName,
  lineVerified,
  isAdmin,
  adminRole,
  orders,
  profileInfo,
  profileLoaded,
  profileSaving,
  onLogin,
  onLanguage,
  onSaveProfile,
}: {
  lang: Lang;
  lineName: string;
  lineVerified: boolean;
  isAdmin: boolean;
  adminRole: AdminRole | null;
  orders: Order[];
  profileInfo: ProfileInfo;
  profileLoaded: boolean;
  profileSaving: boolean;
  onLogin: () => void;
  onLanguage: () => void;
  onSaveProfile: (profileInfo: ProfileInfo) => Promise<boolean>;
}) {
  const t = copy[lang];
  const [draft, setDraft] = useState(profileInfo);
  const [draftDirty, setDraftDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const approvedCount = orders.filter((order) => order.status === "approved" || order.status === "picked").length;
  const pickedCount = orders.filter((order) => order.status === "picked").length;
  const profileName = profileInfo.fullName || profileInfo.phone || "-";

  useEffect(() => {
    if (draftDirty) return;
    const syncDraft = window.setTimeout(() => setDraft(profileInfo), 0);
    return () => window.clearTimeout(syncDraft);
  }, [draftDirty, profileInfo]);

  function updateProfileDraft(patch: Partial<ProfileInfo>) {
    setDraft((current) => ({ ...current, ...patch }));
    setDraftDirty(true);
  }

  async function saveProfileDraft() {
    const ok = await onSaveProfile(draft);
    if (!ok) return;
    setDraftDirty(false);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1400);
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-[28px] p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--gold)]">{t.profile}</p>
            <h2 className="mt-2 truncate text-2xl font-black">{t.lineAccount}</h2>
          </div>
          <UserRound className="h-8 w-8 shrink-0 text-[var(--gold)]" />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <InfoTile label={t.displayName} value={lineVerified ? lineName : "LINE Customer"} />
          <InfoTile label={t.loginStatus} value={lineVerified ? t.verifiedLine : t.loginLine} />
          <InfoTile label={t.accessLevel} value={isAdmin ? `${t.adminAccess}${adminRole ? ` / ${adminRole}` : ""}` : t.customerAccess} />
          <InfoTile label={t.contactInfo} value={profileLoaded ? profileName : "-"} />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button className="plain-button flex h-12 items-center justify-center gap-2 rounded-2xl px-4 font-bold" onClick={onLogin}>
            {lineVerified ? <BadgeCheck className="h-4 w-4 text-emerald-300" /> : <LogIn className="h-4 w-4" />}
            {lineVerified ? t.verifiedLine : t.loginLine}
          </button>
          <button className="plain-button flex h-12 items-center justify-center gap-2 rounded-2xl px-4 font-bold" onClick={onLanguage}>
            <Languages className="h-4 w-4 text-[var(--gold)]" />
            {t.language}: {lang.toUpperCase()}
          </button>
        </div>
      </div>

      {lineVerified ? (
        <div className="glass rounded-[28px] p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--gold)]">{t.profileSettings}</p>
              <h3 className="mt-2 text-lg font-black">{t.shippingAddress}</h3>
            </div>
            <button
              className="gold-button flex h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-black"
              disabled={profileSaving}
              onClick={() => void saveProfileDraft()}
            >
              <Save className="h-4 w-4" />
              {profileSaving ? "Saving..." : saved ? t.saved : t.saveProfile}
            </button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <TextField label={t.fullName} value={draft.fullName} onChange={(value) => updateProfileDraft({ fullName: value })} />
            <TextField label={t.phone} value={draft.phone} onChange={(value) => updateProfileDraft({ phone: value })} />
          </div>

          <div className="mt-3 grid gap-3">
            <TextField label={t.addressLine1} value={draft.addressLine1} onChange={(value) => updateProfileDraft({ addressLine1: value })} />
            <TextField label={t.addressLine2} value={draft.addressLine2} onChange={(value) => updateProfileDraft({ addressLine2: value })} />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <TextField label={t.subdistrict} value={draft.subdistrict} onChange={(value) => updateProfileDraft({ subdistrict: value })} />
            <TextField label={t.district} value={draft.district} onChange={(value) => updateProfileDraft({ district: value })} />
            <TextField label={t.province} value={draft.province} onChange={(value) => updateProfileDraft({ province: value })} />
            <TextField label={t.postalCode} value={draft.postalCode} onChange={(value) => updateProfileDraft({ postalCode: value })} />
            <TextField label={t.country} value={draft.country} onChange={(value) => updateProfileDraft({ country: value })} />
          </div>

          <div className="mt-3">
            <TextAreaField label={t.deliveryNote} value={draft.deliveryNote} onChange={(value) => updateProfileDraft({ deliveryNote: value })} />
          </div>
        </div>
      ) : (
        <div className="glass rounded-[28px] p-4 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--gold)]">{t.profileSettings}</p>
          <h3 className="mt-2 text-lg font-black">{t.loginToEditProfile}</h3>
          <button className="gold-button mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl font-black" onClick={onLogin}>
            <LogIn className="h-4 w-4" />
            {t.loginLine}
          </button>
        </div>
      )}

      <div className="glass rounded-[28px] p-4 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--gold)]">{t.orderSummary}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Metric label={t.orders} value={String(orders.length)} />
          <Metric label={t.paidOrders} value={String(approvedCount)} />
          <Metric label={t.pickedOrders} value={String(pickedCount)} />
        </div>
      </div>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="soft-card min-w-0 rounded-3xl p-4">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
      <p className="mt-2 truncate text-base font-black">{value}</p>
    </div>
  );
}

function AdminView({
  draw,
  lang,
  orders,
  featuredCards,
  chaseCards,
  cardCatalog,
  onDraw,
  onApprove,
  onReject,
  onViewSlip,
  onAssignSlots,
  onQrUpload,
  onCardImageUpload,
  onFeaturedCards,
  onChaseCards,
  onSaveCards,
  onDrawLifecycle,
}: {
  draw: DrawConfig;
  lang: Lang;
  orders: Order[];
  featuredCards: FeaturedCard[];
  chaseCards: ChaseCard[];
  cardCatalog: CardCatalogItem[];
  onDraw: (draw: DrawConfig) => Promise<boolean>;
  onDrawLifecycle: (action: DrawLifecycleAction) => Promise<boolean>;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onViewSlip: (id: string) => void;
  onAssignSlots: (id: string, slots: number[]) => void;
  onQrUpload: (file: File) => Promise<string>;
  onCardImageUpload: (file: File) => Promise<CardImageUploadResult | "">;
  onFeaturedCards: (cards: FeaturedCard[]) => void;
  onChaseCards: (cards: ChaseCard[]) => void;
  onSaveCards: (featuredCards: FeaturedCard[], chaseCards: ChaseCard[]) => Promise<boolean>;
}) {
  const t = copy[lang];
  const [draft, setDraft] = useState(draw);
  const [draftDirty, setDraftDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [qrUploading, setQrUploading] = useState(false);
  const pending = orders.filter((order) => order.status === "pending");
  const selectableOrders = orders.filter((order) => order.status === "approved" || order.status === "picked");
  const takenSlots = new Set(orders.flatMap((order) => order.slots));

  useEffect(() => {
    if (draftDirty) return;
    const syncDraft = window.setTimeout(() => setDraft(draw), 0);
    return () => window.clearTimeout(syncDraft);
  }, [draw, draftDirty]);

  function updateDraft(patch: Partial<DrawConfig>) {
    setDraft((current) => ({ ...current, ...patch }));
    setDraftDirty(true);
  }

  async function saveDraft() {
    const ok = await onDraw(draft);
    if (!ok) return;
    setDraftDirty(false);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1400);
  }

  async function handleQrUpload(file?: File) {
    if (!file) return;
    setQrUploading(true);
    const qrImageUrl = await onQrUpload(file);
    if (qrImageUrl) updateDraft({ qrImageUrl });
    setQrUploading(false);
  }

  return (
    <div className="space-y-4">
      <AdminLifecyclePanel
        draw={draw}
        lang={lang}
        orders={orders}
        onDrawLifecycle={onDrawLifecycle}
      />

      <div className="glass rounded-[28px] p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--gold)]">{t.admin}</p>
            <h2 className="mt-2 text-2xl font-black">{t.streamSettings}</h2>
          </div>
          <button className="gold-button flex h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-black" onClick={() => void saveDraft()}>
            <Save className="h-4 w-4" />
            {saved ? t.saved : t.save}
          </button>
        </div>
        <div className="mt-5 grid gap-3">
          <TextField label="Facebook Live URL" value={draft.facebookUrl} onChange={(value) => updateDraft({ facebookUrl: value })} />
          <TextField label="YouTube Embed URL" value={draft.youtubeUrl} onChange={(value) => updateDraft({ youtubeUrl: value })} />
        </div>
      </div>

      <div className="glass rounded-[28px] p-4 sm:p-6">
        <h3 className="text-lg font-black">{t.drawSettings}</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <TextField label="Title TH" value={draft.titleTh} onChange={(value) => updateDraft({ titleTh: value })} />
          <TextField label="Title EN" value={draft.titleEn} onChange={(value) => updateDraft({ titleEn: value })} />
          <NumberField label="Price" value={draft.price} onChange={(value) => updateDraft({ price: value })} />
          <NumberField label="Total Slots" value={draft.totalSlots} onChange={(value) => updateDraft({ totalSlots: value })} />
          <TextField
            label={t.orderSlipDetail}
            value={draft.orderCodePrefix}
            onChange={(value) => updateDraft({ orderCodePrefix: cleanOrderPrefixInput(value) })}
          />
        </div>
      </div>

      <div className="glass rounded-[28px] p-4 sm:p-6">
        <h3 className="text-lg font-black">{t.paymentSettings}</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <TextField label="PromptPay" value={draft.promptPay} onChange={(value) => updateDraft({ promptPay: value })} />
          <TextField label="Bank" value={draft.bankName} onChange={(value) => updateDraft({ bankName: value })} />
          <TextField label="Account Name" value={draft.accountName} onChange={(value) => updateDraft({ accountName: value })} />
          <TextField label="Account Number" value={draft.accountNumber} onChange={(value) => updateDraft({ accountNumber: value })} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[180px_1fr] sm:items-center">
          <div className="relative grid aspect-square w-full place-items-center overflow-hidden rounded-3xl bg-white p-3">
            {draft.qrImageUrl ? (
              <div className="relative h-full w-full">
                <Image
                  className="rounded-xl object-contain"
                  src={draft.qrImageUrl}
                  alt="Current payment QR"
                  fill
                  sizes="180px"
                  unoptimized
                />
              </div>
            ) : (
              <QrCode className="h-16 w-16 text-slate-900" />
            )}
          </div>
          <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-white/18 bg-white/[0.035] p-4 text-center">
            <Upload className="h-6 w-6 text-[var(--gold)]" />
            <span className="mt-2 text-sm font-black">{qrUploading ? "Uploading QR..." : "Upload payment QR"}</span>
            <span className="mt-1 text-xs text-[var(--muted)]">JPG, PNG, or WEBP · max 10 MB</span>
            <input
              className="hidden"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={qrUploading}
              onChange={(event) => void handleQrUpload(event.target.files?.[0])}
            />
          </label>
        </div>
      </div>

      <AdminSlotEditor
        draw={draft}
        lang={lang}
        orders={selectableOrders}
        takenSlots={takenSlots}
        onAssignSlots={onAssignSlots}
      />

      <AdminCardEditor
        lang={lang}
        featuredCards={featuredCards}
        chaseCards={chaseCards}
        cardCatalog={cardCatalog}
        onCardImageUpload={onCardImageUpload}
        onFeaturedCards={onFeaturedCards}
        onChaseCards={onChaseCards}
        onSaveCards={onSaveCards}
      />

      <div className="glass rounded-[28px] p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-black">{t.pending}</h3>
          <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-black text-amber-100">{pending.length}</span>
        </div>
        <div className="mt-4 space-y-3">
          {pending.length === 0 && <Empty text="No pending slips" />}
          {pending.map((order) => (
            <div key={order.id} className="soft-card rounded-3xl p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-black">{order.id} / {order.lineName}</p>
                  <p className="mt-1 break-words text-sm text-[var(--muted)]">
                    {order.quantity} draws / {money(order.amount)} THB / {order.hasSlipFile ? order.slipName : t.manualSlip}
                  </p>
                  <SlipVerificationBadge lang={lang} order={order} />
                  {order.slipProviderMessage && (
                    <p className="mt-1 max-w-xl break-words text-xs text-[var(--muted)]">{order.slipProviderMessage}</p>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 sm:flex sm:shrink-0">
                  <button
                    className="plain-button flex h-11 items-center justify-center gap-2 rounded-2xl px-3 text-sm font-bold sm:px-4"
                    disabled={!order.hasSlipFile}
                    onClick={() => onViewSlip(order.id)}
                  >
                    <ExternalLink className="h-4 w-4 text-sky-300" />
                    {t.viewSlip}
                  </button>
                  <button className="plain-button flex h-11 items-center justify-center gap-2 rounded-2xl px-3 text-sm font-bold sm:px-4" onClick={() => onApprove(order.id)}>
                    <Check className="h-4 w-4 text-emerald-300" />
                    {t.approve}
                  </button>
                  <button className="danger-button flex h-11 items-center justify-center gap-2 rounded-2xl px-3 text-sm font-bold sm:px-4" onClick={() => onReject(order.id)}>
                    <Lock className="h-4 w-4" />
                    {t.reject}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AdminLifecyclePanel({
  draw,
  lang,
  orders,
  onDrawLifecycle,
}: {
  draw: DrawConfig;
  lang: Lang;
  orders: Order[];
  onDrawLifecycle: (action: DrawLifecycleAction) => Promise<boolean>;
}) {
  const t = copy[lang];
  const [busyAction, setBusyAction] = useState<DrawLifecycleAction | "">("");
  const pendingCount = orders.filter((order) => order.status === "pending").length;
  const awaitingPickCount = orders.filter((order) => order.status === "approved").length;

  async function runAction(action: DrawLifecycleAction) {
    setBusyAction(action);
    try {
      await onDrawLifecycle(action);
    } finally {
      setBusyAction("");
    }
  }

  return (
    <div className="glass rounded-[28px] p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--gold)]">{t.drawLifecycle}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h2 className="min-w-0 truncate text-2xl font-black">{drawStatusLabel(draw.status, lang)}</h2>
            <span className={`rounded-full border px-3 py-1 text-xs font-black ${drawStatusClass(draw.status)}`}>
              {t.drawStatus}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
          <Metric label={t.pendingPayments} value={String(pendingCount)} />
          <Metric label={t.awaitingPicks} value={String(awaitingPickCount)} />
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {draw.status === "live" && (
          <button
            className="plain-button flex h-12 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-black"
            disabled={Boolean(busyAction)}
            onClick={() => void runAction("close_sales")}
          >
            <Lock className="h-4 w-4 text-amber-200" />
            {busyAction === "close_sales" ? "Working..." : t.closeSales}
          </button>
        )}

        {draw.status === "closed" && (
          <>
            <button
              className="plain-button flex h-12 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-black"
              disabled={Boolean(busyAction)}
              onClick={() => void runAction("reopen_sales")}
            >
              <Play className="h-4 w-4 text-emerald-200" />
              {busyAction === "reopen_sales" ? "Working..." : t.reopenSales}
            </button>
            <button
              className="gold-button flex h-12 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-black"
              disabled={Boolean(busyAction)}
              onClick={() => void runAction("create_next")}
            >
              <Sparkles className="h-4 w-4" />
              {busyAction === "create_next" ? "Working..." : t.createNextDraw}
            </button>
          </>
        )}

        {draw.status === "draft" && (
          <button
            className="gold-button flex h-12 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-black"
            disabled={Boolean(busyAction)}
            onClick={() => void runAction("publish_next")}
          >
            <Play className="h-4 w-4" />
            {busyAction === "publish_next" ? "Working..." : t.publishNextDraw}
          </button>
        )}
      </div>
    </div>
  );
}

function AdminCardEditor({
  lang,
  featuredCards,
  chaseCards,
  cardCatalog,
  onCardImageUpload,
  onFeaturedCards,
  onChaseCards,
  onSaveCards,
}: {
  lang: Lang;
  featuredCards: FeaturedCard[];
  chaseCards: ChaseCard[];
  cardCatalog: CardCatalogItem[];
  onCardImageUpload: (file: File) => Promise<CardImageUploadResult | "">;
  onFeaturedCards: (cards: FeaturedCard[]) => void;
  onChaseCards: (cards: ChaseCard[]) => void;
  onSaveCards: (featuredCards: FeaturedCard[], chaseCards: ChaseCard[]) => Promise<boolean>;
}) {
  const t = copy[lang];
  const [cardsSaved, setCardsSaved] = useState(false);
  const [cardsSaving, setCardsSaving] = useState(false);
  const [uploadingCardId, setUploadingCardId] = useState("");
  const [addTier, setAddTier] = useState<"normal" | "high">("normal");

  function updateFeatured(index: number, patch: Partial<FeaturedCard>) {
    const sourceCard = featuredCards[index];
    const nextFeaturedCards = featuredCards.map((card, cardIndex) =>
      cardIndex === index || cardsShareCatalogIdentity(card, sourceCard) ? { ...card, ...patch } : card,
    );
    const nextChaseCards = chaseCards.map((card) =>
      cardsShareCatalogIdentity(card, sourceCard) ? { ...card, ...patch } : card,
    );
    onFeaturedCards(nextFeaturedCards);
    onChaseCards(nextChaseCards);
  }

  function updateChase(index: number, patch: Partial<ChaseCard>) {
    const sourceCard = chaseCards[index];
    const sharedPatch: Partial<FeaturedCard> = {
      code: patch.code,
      name: patch.name,
      grade: patch.grade,
      series: patch.series,
      tone: patch.tone,
      photoUrl: patch.photoUrl,
      photoStoragePath: patch.photoStoragePath,
    };
    const nextFeaturedCards = featuredCards.map((card) =>
      cardsShareCatalogIdentity(card, sourceCard) ? { ...card, ...sharedPatch } : card,
    );
    const nextChaseCards = chaseCards.map((card, cardIndex) =>
      cardIndex === index ? { ...card, ...patch } : cardsShareCatalogIdentity(card, sourceCard) ? { ...card, ...sharedPatch } : card,
    );
    onFeaturedCards(nextFeaturedCards);
    onChaseCards(nextChaseCards);
  }

  function pickFeaturedCatalogCard(index: number, catalogCardId: string) {
    const catalogCard = cardCatalog.find((card) => card.catalogCardId === catalogCardId);
    if (!catalogCard) return;
    const sourceCard = featuredCards[index];
    const nextFeaturedCards = featuredCards.map((card, cardIndex) =>
      cardIndex === index || cardsShareCatalogIdentity(card, sourceCard) ? applyCatalogCard(card, catalogCard) : card,
    );
    const nextChaseCards = chaseCards.map((card) =>
      cardsShareCatalogIdentity(card, sourceCard) ? { ...card, ...applyCatalogCard(card, catalogCard) } : card,
    );
    onFeaturedCards(nextFeaturedCards);
    onChaseCards(nextChaseCards);
  }

  function pickChaseCatalogCard(index: number, catalogCardId: string) {
    const catalogCard = cardCatalog.find((card) => card.catalogCardId === catalogCardId);
    if (!catalogCard) return;
    const sourceCard = chaseCards[index];
    const nextFeaturedCards = featuredCards.map((card) =>
      cardsShareCatalogIdentity(card, sourceCard) ? applyCatalogCard(card, catalogCard) : card,
    );
    const nextChaseCards = chaseCards.map((card, cardIndex) =>
      cardIndex === index || cardsShareCatalogIdentity(card, sourceCard) ? { ...card, ...applyCatalogCard(card, catalogCard) } : card,
    );
    onFeaturedCards(nextFeaturedCards);
    onChaseCards(nextChaseCards);
  }

  function addFeatured() {
    onFeaturedCards([
      ...featuredCards,
      { id: newCardId("poster"), name: "New Card", grade: "PSA 10", series: "One Piece", tone: "gold" },
    ]);
  }

  function addChase() {
    const nextRank = chaseCards.length ? Math.max(...chaseCards.map((card) => card.rank)) + 1 : 1;
    const nextCard: ChaseCard = {
      rank: nextRank,
      id: newCardId("chase"),
      name: "New Chase Card",
      grade: "PSA 10",
      series: "One Piece",
      tone: "gold",
      value: 10000,
    };
    onChaseCards([...chaseCards, nextCard]);
  }

  function addPrizeCard() {
    if (addTier === "high") {
      addChase();
      return;
    }
    addFeatured();
  }

  async function saveCards() {
    setCardsSaving(true);
    const saved = await onSaveCards(featuredCards, chaseCards);
    setCardsSaving(false);
    if (saved) {
      setCardsSaved(true);
      window.setTimeout(() => setCardsSaved(false), 1400);
    }
  }

  async function uploadFeaturedImage(index: number, file?: File) {
    if (!file) return;
    const card = featuredCards[index];
    const cardId = card.id ?? `featured-${index}`;
    setUploadingCardId(cardId);
    try {
      const upload = await onCardImageUpload(file);
      if (upload) {
        const imagePatch = { photoUrl: upload.imageUrl, photoStoragePath: upload.storagePath };
        const nextFeaturedCards = featuredCards.map((item, cardIndex) =>
          cardIndex === index
            ? { ...item, id: item.id ?? newCardId("poster"), ...imagePatch }
            : cardsShareCatalogIdentity(item, card)
              ? { ...item, ...imagePatch }
              : item,
        );
        const nextChaseCards = chaseCards.map((item) =>
          cardsShareCatalogIdentity(item, card) ? { ...item, ...imagePatch } : item,
        );
        onFeaturedCards(nextFeaturedCards);
        onChaseCards(nextChaseCards);
        await onSaveCards(nextFeaturedCards, nextChaseCards);
      }
    } finally {
      setUploadingCardId("");
    }
  }

  async function uploadChaseImage(index: number, file?: File) {
    if (!file) return;
    const card = chaseCards[index];
    const cardId = card.id ?? `chase-${index}`;
    setUploadingCardId(cardId);
    try {
      const upload = await onCardImageUpload(file);
      if (upload) {
        const imagePatch = { photoUrl: upload.imageUrl, photoStoragePath: upload.storagePath };
        const nextFeaturedCards = featuredCards.map((item) =>
          cardsShareCatalogIdentity(item, card) ? { ...item, ...imagePatch } : item,
        );
        const nextChaseCards = chaseCards.map((item, cardIndex) =>
          cardIndex === index
            ? { ...item, id: item.id ?? newCardId("chase"), ...imagePatch }
            : cardsShareCatalogIdentity(item, card)
              ? { ...item, ...imagePatch }
              : item,
        );
        onFeaturedCards(nextFeaturedCards);
        onChaseCards(nextChaseCards);
        await onSaveCards(nextFeaturedCards, nextChaseCards);
      }
    } finally {
      setUploadingCardId("");
    }
  }

  return (
    <div className="glass rounded-[28px] p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--gold)]">{t.cardSettings}</p>
          <h3 className="mt-2 text-lg font-black">{t.addPrizeCard}</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">{featuredCards.length} {t.normalPrize} / {chaseCards.length} {t.highTierPrize}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[220px_auto] sm:items-end">
          <SelectField
            label={t.prizeTier}
            value={addTier}
            options={[
              { label: t.normalPrize, value: "normal" },
              { label: t.highTierPrize, value: "high" },
            ]}
            onChange={(value) => setAddTier(value === "high" ? "high" : "normal")}
          />
          <button className="plain-button flex h-12 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-bold" onClick={addPrizeCard}>
            <Sparkles className="h-4 w-4 text-[var(--gold)]" />
            {t.addCard}
          </button>
        </div>
      </div>

      <details className="admin-tier-panel mt-5" open>
        <summary className="block cursor-pointer outline-none">
          <div className="flex w-full min-w-0 items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-bold uppercase tracking-[0.2em] text-[var(--gold)]">{t.normalPrize}</span>
              <span className="mt-1 block truncate text-sm text-[var(--muted)]">{featuredCards.length} cards shown on Home</span>
            </span>
            <ChevronDown className="tier-chevron h-5 w-5 shrink-0" />
          </div>
        </summary>
        <div className="mt-3 grid gap-3">
          {featuredCards.map((card, index) => (
            <details key={card.id ?? `featured-${index}`} className="card-edit-panel">
              <summary className="block cursor-pointer outline-none">
                <div className="flex w-full min-w-0 items-center gap-3">
                  <span className="relative block h-16 w-12 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/25">
                    <CardArtwork card={card} compact />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-black">{index + 1}. {card.name}</span>
                    <span className="mt-1 block truncate text-xs text-[var(--muted)]">{card.grade} / {card.series}</span>
                  </span>
                  <ChevronDown className="tier-chevron h-4 w-4 shrink-0" />
                </div>
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-[96px_1fr_0.7fr_1fr] sm:items-end">
                <label className="upload-target group cursor-pointer">
                  <span className="relative block aspect-[3/4] overflow-hidden rounded-2xl border border-white/10 bg-black/25">
                    <CardArtwork card={card} compact />
                  </span>
                  <span className="mt-2 flex h-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-xs font-black text-[var(--gold)]">
                    {uploadingCardId === (card.id ?? `featured-${index}`) ? "Uploading..." : t.uploadPhoto}
                  </span>
                  <input
                    className="hidden"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => void uploadFeaturedImage(index, event.target.files?.[0])}
                  />
                </label>
                <CardCatalogSelect
                  label={t.savedCard}
                  cards={cardCatalog}
                  emptyLabel={t.noSavedCards}
                  promptLabel={t.pickSavedCard}
                  onSelect={(catalogCardId) => pickFeaturedCatalogCard(index, catalogCardId)}
                />
                <TextField label={t.cardCode} value={card.code ?? ""} onChange={(value) => updateFeatured(index, { code: value })} />
                <TextField label={`Card ${index + 1}`} value={card.name} onChange={(value) => updateFeatured(index, { name: value })} />
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-[0.7fr_0.7fr_0.7fr_auto] sm:items-end">
                <TextField label="Grade" value={card.grade} onChange={(value) => updateFeatured(index, { grade: value })} />
                <SelectField
                  label="Series"
                  value={card.series}
                  options={["One Piece", "Pokemon"]}
                  onChange={(value) => updateFeatured(index, { series: value as FeaturedCard["series"] })}
                />
                <SelectField
                  label="Color"
                  value={card.tone}
                  options={["red", "gold", "blue", "green", "rose", "violet"]}
                  onChange={(value) => updateFeatured(index, { tone: value as FeaturedCard["tone"] })}
                />
                <button
                  className="danger-button flex h-12 items-center justify-center gap-2 rounded-2xl px-3 text-sm font-bold"
                  disabled={featuredCards.length <= 1}
                  onClick={() => onFeaturedCards(featuredCards.filter((_, cardIndex) => cardIndex !== index))}
                >
                  <Trash2 className="h-4 w-4" />
                  {t.remove}
                </button>
              </div>
            </details>
          ))}
        </div>
      </details>

      <details className="admin-tier-panel mt-4" open>
        <summary className="block cursor-pointer outline-none">
          <div className="flex w-full min-w-0 items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-bold uppercase tracking-[0.2em] text-[var(--gold)]">{t.highTierPrize}</span>
              <span className="mt-1 block truncate text-sm text-[var(--muted)]">{chaseCards.length} cards shown as top value prizes</span>
            </span>
            <ChevronDown className="tier-chevron h-5 w-5 shrink-0" />
          </div>
        </summary>
        <div className="mt-3 grid gap-3">
          {chaseCards.map((card, index) => (
            <details key={card.id ?? `chase-${index}`} className="card-edit-panel">
              <summary>
                <span className="relative block h-16 w-12 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/25">
                  <CardArtwork card={card} compact />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black">#{card.rank} {card.name}</span>
                  <span className="mt-1 block truncate text-xs text-[var(--muted)]">฿{money(card.value)} / {card.grade}</span>
                </span>
                <ChevronDown className="tier-chevron h-4 w-4" />
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-[96px_0.45fr_0.8fr_1fr_1fr] sm:items-end">
                <label className="upload-target group cursor-pointer">
                  <span className="relative block aspect-[3/4] overflow-hidden rounded-2xl border border-white/10 bg-black/25">
                    <CardArtwork card={card} compact />
                  </span>
                  <span className="mt-2 flex h-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-xs font-black text-[var(--gold)]">
                    {uploadingCardId === (card.id ?? `chase-${index}`) ? "Uploading..." : t.uploadPhoto}
                  </span>
                  <input
                    className="hidden"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => void uploadChaseImage(index, event.target.files?.[0])}
                  />
                </label>
                <NumberField label="Rank" value={card.rank} onChange={(value) => updateChase(index, { rank: Math.max(value, 1) })} />
                <CardCatalogSelect
                  label={t.savedCard}
                  cards={cardCatalog}
                  emptyLabel={t.noSavedCards}
                  promptLabel={t.pickSavedCard}
                  onSelect={(catalogCardId) => pickChaseCatalogCard(index, catalogCardId)}
                />
                <TextField label={t.cardCode} value={card.code ?? ""} onChange={(value) => updateChase(index, { code: value })} />
                <TextField label="Card" value={card.name} onChange={(value) => updateChase(index, { name: value })} />
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-[0.65fr_auto] sm:items-end">
                <NumberField label="Value THB" value={card.value} onChange={(value) => updateChase(index, { value })} />
                <button
                  className="danger-button flex h-12 items-center justify-center gap-2 rounded-2xl px-3 text-sm font-bold"
                  disabled={chaseCards.length <= 1}
                  onClick={() => onChaseCards(chaseCards.filter((_, cardIndex) => cardIndex !== index))}
                >
                  <Trash2 className="h-4 w-4" />
                  {t.remove}
                </button>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <TextField label="Grade" value={card.grade} onChange={(value) => updateChase(index, { grade: value })} />
                <SelectField
                  label="Series"
                  value={card.series}
                  options={["One Piece", "Pokemon"]}
                  onChange={(value) => updateChase(index, { series: value as FeaturedCard["series"] })}
                />
                <SelectField
                  label="Color"
                  value={card.tone}
                  options={["red", "gold", "blue", "green", "rose", "violet"]}
                  onChange={(value) => updateChase(index, { tone: value as FeaturedCard["tone"] })}
                />
              </div>
            </details>
          ))}
        </div>
      </details>
      <button
        className="gold-button mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-black"
        disabled={cardsSaving}
        onClick={() => void saveCards()}
      >
        <Save className="h-4 w-4" />
        {cardsSaving ? "Saving..." : cardsSaved ? t.saved : t.save}
      </button>
    </div>
  );
}

function AdminSlotEditor({
  draw,
  lang,
  orders,
  takenSlots,
  onAssignSlots,
}: {
  draw: DrawConfig;
  lang: Lang;
  orders: Order[];
  takenSlots: Set<number>;
  onAssignSlots: (id: string, slots: number[]) => void;
}) {
  const t = copy[lang];
  const [orderId, setOrderId] = useState(orders[0]?.id ?? "");
  const activeOrder = orders.find((order) => order.id === orderId) ?? orders[0];
  const slots = Array.from({ length: draw.totalSlots }, (_, index) => index + 1);

  function toggleAdminSlot(slot: number) {
    if (!activeOrder) return;
    const owned = activeOrder.slots.includes(slot);
    const unavailable = takenSlots.has(slot) && !owned;
    if (unavailable) return;

    const nextSlots = owned
      ? activeOrder.slots.filter((item) => item !== slot)
      : [...activeOrder.slots, slot].sort((a, b) => a - b);

    if (nextSlots.length > activeOrder.quantity) return;
    onAssignSlots(activeOrder.id, nextSlots);
  }

  return (
    <div className="glass rounded-[28px] p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--gold)]">{t.manualPick}</p>
          <h3 className="mt-2 text-lg font-black">{t.pickedByAdmin}</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {activeOrder
              ? `${activeOrder.id} · ${activeOrder.lineName} · ${activeOrder.slots.length}/${activeOrder.quantity}`
              : t.openPicks}
          </p>
        </div>
        <select
          className="h-12 w-full min-w-0 rounded-2xl border border-white/10 bg-black/25 px-4 outline-none focus:border-[var(--gold)] sm:w-auto"
          value={activeOrder?.id ?? ""}
          onChange={(event) => setOrderId(event.target.value)}
        >
          {orders.length === 0 && <option value="">{t.openPicks}</option>}
          {orders.map((order) => (
            <option key={order.id} value={order.id}>
              {order.id} · {order.lineName}
            </option>
          ))}
        </select>
      </div>

      {activeOrder ? (
        <>
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-[var(--muted)]">
            {t.currentPicks}:{" "}
            <span className="font-black text-[var(--gold)]">
              {activeOrder.slots.length ? activeOrder.slots.join(", ") : "-"}
            </span>
          </div>
          <div className="slot-grid mt-4">
            {slots.map((slot) => {
              const owned = activeOrder.slots.includes(slot);
              const unavailable = takenSlots.has(slot) && !owned;
              return (
                <button
                  key={slot}
                  className={[
                    "slot-button aspect-square rounded-2xl border text-sm font-black transition",
                    unavailable ? "border-white/5 bg-black/35 text-white/20" : "",
                    owned ? "border-[var(--gold)] bg-[var(--gold)] text-slate-950 shadow-[0_0_22px_rgba(244,197,66,0.35)]" : "",
                    !owned && !unavailable ? "border-sky-300/25 bg-sky-300/10 text-sky-100 hover:border-sky-200" : "",
                  ].join(" ")}
                  disabled={unavailable}
                  onClick={() => toggleAdminSlot(slot)}
                >
                  {slot}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="mt-4">
          <Empty text={t.openPicks} />
        </div>
      )}
    </div>
  );
}

function StatusPanel({
  draw,
  lang,
  lineVerified,
  remaining,
  sold,
  orders,
  onLogin,
  onProfile,
  isAdmin,
  onAdmin,
}: {
  draw: DrawConfig;
  lang: Lang;
  lineVerified: boolean;
  remaining: number;
  sold: number;
  orders: Order[];
  onLogin: () => void;
  onProfile: () => void;
  isAdmin: boolean;
  onAdmin: () => void;
}) {
  const t = copy[lang];
  return (
    <>
      <div className="glass rounded-[28px] p-5">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--gold)]">Control</p>
        <button className="plain-button mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl font-black" onClick={onLogin}>
          <UserRound className="h-4 w-4" />
          {lineVerified ? t.verifiedLine : t.loginLine}
        </button>
        <button className="plain-button mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl font-black" onClick={onProfile}>
          <UserRound className="h-4 w-4" />
          {t.profile}
        </button>
        {isAdmin && (
          <button className="plain-button mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl font-black" onClick={onAdmin}>
            <Settings className="h-4 w-4" />
            {t.openAdmin}
          </button>
        )}
      </div>
      <div className="glass rounded-[28px] p-5">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--gold)]">Snapshot</p>
        <div className="mt-4 space-y-3">
          <Row label={t.pricePerDraw} value={`${money(draw.price)} THB`} strong />
          <Row label={t.remaining} value={String(remaining)} strong />
          <Row label={t.sold} value={String(sold)} strong />
          <Row label={t.orders} value={String(orders.length)} strong />
        </div>
      </div>
    </>
  );
}

function BottomNav({ view, setView, pending, isAdmin }: { view: View; setView: (view: View) => void; pending: number; isAdmin: boolean }) {
  const items: Array<{ view: View; icon: React.ReactNode; label: string; badge?: number }> = [
    { view: "home", icon: <Home className="h-5 w-5" />, label: "Home" },
    { view: "checkout", icon: <CreditCard className="h-5 w-5" />, label: "Pay" },
    { view: "pick", icon: <Ticket className="h-5 w-5" />, label: "Pick" },
    { view: "orders", icon: <ClipboardList className="h-5 w-5" />, label: "Orders" },
    { view: "profile", icon: <UserRound className="h-5 w-5" />, label: "Profile" },
    ...(isAdmin ? [{ view: "admin" as const, icon: <Settings className="h-5 w-5" />, label: "Admin", badge: pending }] : []),
  ];
  return (
    <nav
      className="bottom-nav-shell fixed left-1/2 z-40 grid w-[calc(100%-24px)] max-w-[640px] -translate-x-1/2 rounded-[24px] border border-white/10 bg-[#10111f]/95 p-2 shadow-2xl backdrop-blur"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item) => (
        <button
          key={item.view}
          className={[
            "relative flex h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-bold transition",
            view === item.view ? "bg-[var(--gold)] text-slate-950" : "text-[var(--muted)] hover:bg-white/[0.05] hover:text-white",
          ].join(" ")}
          onClick={() => setView(item.view)}
        >
          {item.icon}
          {item.label}
          {!!item.badge && (
            <span className="absolute right-2 top-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] text-white">
              {item.badge}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}

function Pill({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs font-bold text-white/85">
      <span className="[&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:text-[var(--gold)]">{icon}</span>
      {text}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="soft-card rounded-3xl p-4">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-xl font-black">{value}</p>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className={strong ? "font-black text-[var(--gold)]" : "font-bold"}>{value}</dd>
    </div>
  );
}

function SlipVerificationBadge({ lang, order }: { lang: Lang; order: Order }) {
  if (order.slipProvider === "manual_line" && order.slipVerificationStatus === "manual_review") {
    return null;
  }

  return (
    <span className={`mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-black ${slipVerificationClass(order.slipVerificationStatus)}`}>
      <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{slipVerificationLabel(order.slipVerificationStatus, lang)}</span>
      {order.slipProviderCode && <span className="font-mono opacity-75">{order.slipProviderCode}</span>}
    </span>
  );
}

function OrderCard({ lang, order, onPick }: { lang: Lang; order: Order; onPick: (id: string) => void }) {
  const t = copy[lang];
  const canPick = order.status === "approved";
  const canViewPicked = order.status === "picked";
  return (
    <article className="soft-card rounded-3xl p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-black">{order.id}</p>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${statusClass(order.status)}`}>
              {orderLabel(order.status, lang)}
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {order.lineName} / {order.quantity} {t.draws} / {money(order.amount)} THB
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {order.slots.length
              ? `${t.selected}: ${order.slots.join(", ")}`
              : `${t.uploadSlip}: ${order.hasSlipFile ? order.slipName : t.manualSlip}`}
          </p>
          <SlipVerificationBadge lang={lang} order={order} />
        </div>
        <button
          className="plain-button flex h-11 items-center justify-center gap-2 rounded-2xl px-4 font-bold"
          disabled={!canPick && !canViewPicked}
          onClick={() => onPick(order.id)}
        >
          {canPick ? <ChevronRight className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {canPick ? t.pickNumbers : canViewPicked ? t.viewPicked : orderLabel(order.status, lang)}
        </button>
      </div>
    </article>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = useId();
  return (
    <label className="block space-y-2" htmlFor={id}>
      <span className="block text-xs font-bold uppercase tracking-[0.18em] text-[var(--muted)]">{label}</span>
      <input
        id={id}
        className="h-12 w-full min-w-0 rounded-2xl border border-white/10 bg-black/25 px-4 outline-none focus:border-[var(--gold)]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = useId();
  return (
    <label className="block space-y-2" htmlFor={id}>
      <span className="block text-xs font-bold uppercase tracking-[0.18em] text-[var(--muted)]">{label}</span>
      <textarea
        id={id}
        className="min-h-24 w-full min-w-0 resize-y rounded-2xl border border-white/10 bg-black/25 px-4 py-3 outline-none focus:border-[var(--gold)]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<string | { label: string; value: string }>;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <label className="block space-y-2" htmlFor={id}>
      <span className="block text-xs font-bold uppercase tracking-[0.18em] text-[var(--muted)]">{label}</span>
      <select
        id={id}
        className="h-12 w-full min-w-0 rounded-2xl border border-white/10 bg-black/25 px-4 outline-none focus:border-[var(--gold)]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={typeof option === "string" ? option : option.value} value={typeof option === "string" ? option : option.value}>
            {typeof option === "string" ? option : option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function CardCatalogSelect({
  label,
  cards,
  emptyLabel,
  promptLabel,
  onSelect,
}: {
  label: string;
  cards: CardCatalogItem[];
  emptyLabel: string;
  promptLabel: string;
  onSelect: (catalogCardId: string) => void;
}) {
  const options = [
    { label: cards.length ? promptLabel : emptyLabel, value: "" },
    ...cards.map((card) => ({
      label: `${card.code ? `${card.code} · ` : ""}${card.name} · ${card.grade} · ${card.series}`,
      value: card.catalogCardId,
    })),
  ];

  return (
    <SelectField
      label={label}
      value=""
      options={options}
      onChange={(value) => {
        if (value) onSelect(value);
      }}
    />
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const id = useId();
  return (
    <label className="block space-y-2" htmlFor={id}>
      <span className="block text-xs font-bold uppercase tracking-[0.18em] text-[var(--muted)]">{label}</span>
      <input
        id={id}
        className="h-12 w-full min-w-0 rounded-2xl border border-white/10 bg-black/25 px-4 outline-none focus:border-[var(--gold)]"
        min={1}
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="grid min-h-32 place-items-center rounded-3xl border border-dashed border-white/14 bg-white/[0.03] text-center text-sm text-[var(--muted)]">
      <div>
        <Boxes className="mx-auto mb-2 h-6 w-6 text-white/35" />
        {text}
      </div>
    </div>
  );
}
