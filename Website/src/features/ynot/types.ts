export type YnotViewer = {
  authenticated: boolean;
  profileId?: string;
  displayName: string;
  authSource?: "supabase" | "line";
  isAdmin: boolean;
  adminRole?: "owner" | "admin" | "staff" | null;
};

export type YnotCampaign = {
  id: string;
  slug: string;
  status: "draft" | "live" | "closed" | "archived";
  titleTh: string;
  titleEn: string;
  series: "one_piece" | "pokemon";
  priceThb: number;
  costCoins: number;
  mode: "slot_pick" | "instant_gacha";
  visibility: "public" | "hidden" | "private";
  totalSlots: number;
  startsAt: string | null;
  endsAt: string | null;
  remainingSlots?: number;
  categoryLabel?: string;
  heroLabel?: string;
  displayTags?: string[];
  demo?: boolean;
};

export type YnotPaymentMethod = {
  id: string;
  code: string;
  type: "bank_transfer" | "promptpay_qr";
  displayName: string;
  bankName?: string | null;
  accountName?: string | null;
  accountNumber?: string | null;
  promptpayId?: string | null;
  qrImagePath?: string | null;
  instructions?: string | null;
};

export type YnotWallet = {
  balanceCoins: number;
  version: number;
};

export type YnotTopUp = {
  id: string;
  publicCode: string;
  profileId: string;
  amountThb: number;
  coinAmount: number;
  status: "pending_slip" | "pending_review" | "approved" | "rejected" | "cancelled" | "expired";
  adminNote?: string | null;
  customerNote?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
};

export type YnotCollectionItem = {
  id: string;
  cardId: string;
  cardName: string;
  cardCode?: string | null;
  imageUrl?: string | null;
  status: "owned" | "locked" | "exchange_requested" | "exchanged" | "shipping_requested" | "shipped" | "void";
  serialNo?: string | null;
  acquiredAt: string;
};

export type YnotExchangeOrder = {
  id: string;
  publicCode: string;
  status: "draft" | "submitted" | "approved" | "rejected" | "completed" | "cancelled";
  requestedCoinValue: number;
  approvedCoinValue?: number | null;
  createdAt: string;
  adminNote?: string | null;
};

export type YnotShippingRequest = {
  id: string;
  publicCode: string;
  status: "draft" | "submitted" | "packing" | "shipped" | "delivered" | "cancelled";
  trackingProvider?: string | null;
  trackingNumber?: string | null;
  createdAt: string;
  adminNote?: string | null;
};

export type YnotAddress = {
  id: string;
  label: string;
  recipientName?: string | null;
  phone?: string | null;
  addressLine1: string;
  district?: string | null;
  province?: string | null;
  postalCode?: string | null;
  isDefault: boolean;
};

export type YnotRankingRow = {
  rank: number;
  displayName: string;
  value: number;
  metric: string;
};

export type YnotPrizePoolItem = {
  id: string;
  campaignId: string;
  campaignSlug: string;
  campaignTitle: string;
  cardId: string;
  cardName: string;
  tier: "normal" | "high";
  rank: number;
  valueThb?: number | null;
  tone?: "red" | "gold" | "blue" | "green" | "rose" | "violet" | null;
};

export type YnotDashboardData = {
  configured: boolean;
  viewer: YnotViewer;
  campaigns: YnotCampaign[];
  paymentMethods: YnotPaymentMethod[];
  wallet: YnotWallet;
  topUps: YnotTopUp[];
  collection: YnotCollectionItem[];
  exchanges: YnotExchangeOrder[];
  shipping: YnotShippingRequest[];
  addresses: YnotAddress[];
  rankings: YnotRankingRow[];
  adminTopUps: YnotTopUp[];
};
