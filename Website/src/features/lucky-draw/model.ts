import { defaultDraw } from "@/lib/lucky-draw/defaults";
import type { CardCatalogItem, ChaseCard, DrawConfig, DrawStatus, FeaturedCard, Lang, Order, OrderStatus, ProfileInfo, SlipVerificationStatus } from "@/lib/lucky-draw/types";

export type View = "home" | "checkout" | "pick" | "orders" | "profile" | "admin";
export type CardImageUploadResult = { imageUrl: string; storagePath?: string };
export type AdminRole = "owner" | "admin" | "staff";
export type DrawLifecycleAction = "close_sales" | "create_next" | "publish_next" | "reopen_sales";

export const copy = {
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
    reconnectLine: "เชื่อม LINE อีกครั้ง",
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
    reconnectLine: "Reconnect LINE",
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

export const storageKey = "lucky-draw-mvp-v2";

export const emptyProfileInfo: ProfileInfo = {
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

export const defaultFeaturedCards: FeaturedCard[] = [
  { id: "poster-ace", name: "Portgas D. Ace", grade: "PSA 10", series: "One Piece" },
  { id: "poster-luffy", name: "Monkey D. Luffy", grade: "PSA 10", series: "One Piece" },
  { id: "poster-zoro", name: "Roronoa Zoro", grade: "BGS 10", series: "One Piece" },
  { id: "poster-shanks", name: "Shanks Alt Art", grade: "BGS 10", series: "One Piece" },
  { id: "poster-nami", name: "Nami Parallel", grade: "PSA 10", series: "One Piece" },
  { id: "poster-boa", name: "Boa Hancock", grade: "PSA 10", series: "One Piece" },
  { id: "poster-charizard", name: "Charizard ex", grade: "PSA 10", series: "Pokemon" },
  { id: "poster-pikachu", name: "Pikachu Promo", grade: "PSA 10", series: "Pokemon" },
  { id: "poster-lugia", name: "Lugia V", grade: "BGS 10", series: "Pokemon" },
  { id: "poster-rayleigh", name: "Rayleigh SP", grade: "PSA 10", series: "One Piece" },
  { id: "poster-sabo", name: "Sabo Manga", grade: "PSA 10", series: "One Piece" },
  { id: "poster-mewtwo", name: "Mewtwo SAR", grade: "BGS 10", series: "Pokemon" },
];

export const defaultChaseCards: ChaseCard[] = [
  {
    rank: 1,
    id: "chase-ace",
    name: "Portgas D. Ace Alt Art",
    grade: "PSA 10",
    series: "One Piece",
    value: 85000,
  },
  {
    rank: 2,
    id: "chase-luffy",
    name: "Monkey D. Luffy Manga",
    grade: "PSA 10",
    series: "One Piece",
    value: 42000,
  },
  {
    rank: 3,
    id: "chase-shanks",
    name: "Shanks Alternate Art",
    grade: "BGS 10",
    series: "One Piece",
    value: 28000,
  },
];

export type SavedState = {
  lang?: Lang;
  draw?: DrawConfig;
  orders?: Order[];
  featuredCards?: FeaturedCard[];
  chaseCards?: ChaseCard[];
  cardCatalog?: CardCatalogItem[];
};

export type LuckyDrawApiResponse = {
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

export function readSavedState(): SavedState {
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

export function money(value: number) {
  return new Intl.NumberFormat("th-TH").format(value);
}

export function paymentDigits(value: string | undefined) {
  const digits = (value ?? "").replace(/\D+/g, "");
  return digits && !/^0+$/.test(digits) ? digits : "";
}

export function promptPayDisplay(value: string | undefined) {
  const digits = paymentDigits(value);
  if (digits.length === 11 && digits.startsWith("66")) return `0${digits.slice(2)}`;
  if (digits.length === 10 && digits.startsWith("0")) return digits;
  if (digits.length === 13 || digits.length === 15) return digits;
  return "";
}

export function normalizeOrderPrefixInput(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 16);
}

export function normalizeDrawConfig(draw: Partial<DrawConfig>): DrawConfig {
  return {
    ...defaultDraw,
    ...draw,
    orderCodePrefix: normalizeOrderPrefixInput(draw.orderCodePrefix ?? defaultDraw.orderCodePrefix) || defaultDraw.orderCodePrefix,
  };
}

export function orderLabel(status: OrderStatus, lang: Lang) {
  return copy[lang][status];
}

export function newCardId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function applyCatalogCard(card: FeaturedCard, catalogCard: CardCatalogItem): FeaturedCard {
  return {
    ...card,
    catalogCardId: catalogCard.catalogCardId,
    code: catalogCard.code,
    name: catalogCard.name,
    grade: catalogCard.grade,
    series: catalogCard.series,
    photoUrl: catalogCard.photoUrl,
    photoStoragePath: catalogCard.photoStoragePath,
  };
}

export function normalizeCardIdentityText(value: string | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function cardsShareCatalogIdentity(a: FeaturedCard, b: FeaturedCard) {
  if (a.catalogCardId && b.catalogCardId) return a.catalogCardId === b.catalogCardId;
  if (a.code?.trim() && b.code?.trim()) return normalizeCardIdentityText(a.code) === normalizeCardIdentityText(b.code);
  if (a.catalogCardId || b.catalogCardId || a.code?.trim() || b.code?.trim()) return false;
  const name = normalizeCardIdentityText(a.name);
  return name.length > 0 && name !== "new card" && name !== "new chase card" && name === normalizeCardIdentityText(b.name);
}

export function statusClass(status: OrderStatus) {
  if (status === "approved") return "border-emerald-400/35 bg-emerald-400/12 text-emerald-200";
  if (status === "picked") return "border-sky-400/35 bg-sky-400/12 text-sky-200";
  if (status === "rejected") return "border-rose-400/35 bg-rose-400/12 text-rose-200";
  return "border-amber-300/35 bg-amber-300/12 text-amber-100";
}

export function slipVerificationLabel(status: SlipVerificationStatus, lang: Lang) {
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

export function slipVerificationClass(status: SlipVerificationStatus) {
  if (status === "valid") return "border-emerald-400/35 bg-emerald-400/12 text-emerald-200";
  if (status === "provider_error" || status === "manual_review" || status === "unverified") {
    return "border-amber-300/35 bg-amber-300/12 text-amber-100";
  }
  return "border-rose-400/35 bg-rose-400/12 text-rose-200";
}

export function drawStatusLabel(status: DrawStatus, lang: Lang) {
  const t = copy[lang];
  if (status === "draft") return t.statusDraft;
  if (status === "closed") return t.statusClosed;
  if (status === "archived") return t.statusArchived;
  return t.statusLive;
}

export function drawStatusClass(status: DrawStatus) {
  if (status === "draft") return "border-sky-400/35 bg-sky-400/12 text-sky-100";
  if (status === "closed") return "border-amber-300/35 bg-amber-300/12 text-amber-100";
  if (status === "archived") return "border-white/10 bg-white/[0.04] text-[var(--muted)]";
  return "border-emerald-400/35 bg-emerald-400/12 text-emerald-100";
}
