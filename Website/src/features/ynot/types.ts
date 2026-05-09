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
  sortOrder?: number;
  startsAt: string | null;
  endsAt: string | null;
  createdAt?: string;
  remainingSlots?: number;
  totalPrizeUnits?: number;
  availablePrizeUnits?: number;
  awardedPrizeUnits?: number;
  voidPrizeUnits?: number;
  categoryLabel?: string;
  categoryIds?: string[];
  categorySlugs?: string[];
  isTest?: boolean;
  heroLabel?: string;
  displayTags?: string[];
  demo?: boolean;
};

export type YnotCategory = {
  id: string;
  slug: string;
  nameTh: string;
  nameEn: string;
  description?: string | null;
  imageUrl?: string | null;
  icon?: string | null;
  legacySeries?: "one_piece" | "pokemon" | null;
  sortOrder: number;
  isActive: boolean;
  isTest: boolean;
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
  totalUnits: number;
  availableUnits: number;
  awardedUnits: number;
  voidUnits: number;
};


export type YnotDataIssue = {
  label: string;
  message: string;
  recordedAt: string;
};

export type YnotPlatformHealthCheck = {
  key: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
};

export type YnotPlatformHealth = {
  generatedAt: string;
  checks: YnotPlatformHealthCheck[];
};

export type YnotDashboardData = {
  configured: boolean;
  viewer: YnotViewer;
  campaigns: YnotCampaign[];
  categories: YnotCategory[];
  paymentMethods: YnotPaymentMethod[];
  wallet: YnotWallet;
  topUps: YnotTopUp[];
  collection: YnotCollectionItem[];
  exchanges: YnotExchangeOrder[];
  shipping: YnotShippingRequest[];
  addresses: YnotAddress[];
  rankings: YnotRankingRow[];
  adminTopUps: YnotTopUp[];
  platformHealth?: YnotPlatformHealth;
  dataIssues: YnotDataIssue[];
};

export type HomeSeriesFilter = "all" | YnotCampaign["series"];
export type HomeTagFilter = "all" | "new" | "psa10";
export type HomeSortOption = "recommended" | "latest" | "coins-desc" | "coins-asc";
export type HomeFilterState = {
  series: HomeSeriesFilter;
  tag: HomeTagFilter;
  sort: HomeSortOption;
};
