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
  approvalStatus?: YnotApprovalStatus;
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
  approvalRequestedAt?: string | null;
  approvedAt?: string | null;
  approvalNotes?: string | null;
  logicMode?: YnotRandomLogicMode;
  remainingSlots?: number;
  totalPrizeUnits?: number;
  availablePrizeUnits?: number;
  eligiblePrizeUnits?: number;
  initialEligiblePrizeUnits?: number;
  awardedPrizeUnits?: number;
  voidPrizeUnits?: number;
  readinessBlockers?: string[];
  openable?: boolean;
  soldOut?: boolean;
  adminRemoved?: boolean;
  categoryLabel?: string;
  categoryIds?: string[];
  categorySlugs?: string[];
  isTest?: boolean;
  heroLabel?: string;
  displayTags?: string[];
  openQuantityOptions?: number[];
  prizeLineup?: YnotPrizePreview[];
  convertDeadlineDays?: number | null;
  demo?: boolean;
};

export type YnotApprovalStatus =
  | "not_submitted"
  | "pending_review"
  | "approved"
  | "rejected"
  | "changes_requested";

export type YnotRandomLogicMode =
  | "pure_random"
  | "weighted_templates"
  | "inventory_gated";

export type YnotOwnerApprovalRequest = {
  id: string;
  campaign: YnotCampaign;
  approvalStatus: YnotApprovalStatus;
  logicMode: YnotRandomLogicMode;
  requestedByLabel: string;
  requestedAt: string;
  soldPct: number;
  notificationLabel: string;
  summary: string[];
  mock?: boolean;
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
  status:
    | "pending_slip"
    | "pending_review"
    | "approved"
    | "rejected"
    | "cancelled"
    | "expired";
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
  status:
    | "owned"
    | "locked"
    | "exchange_requested"
    | "exchanged"
    | "shipping_requested"
    | "shipped"
    | "void";
  serialNo?: string | null;
  acquiredAt: string;
  cardGrade?: string | null;
  cardPrizeCategory?: string | null;
  cardSeries?: string | null;
  convertCoinValue?: number | null;
  convertExpiresAt?: string | null;
  sourceCampaignTitle?: string | null;
  sourceCampaignSlug?: string | null;
};

export type YnotExchangeOrder = {
  id: string;
  publicCode: string;
  status:
    | "draft"
    | "submitted"
    | "approved"
    | "rejected"
    | "completed"
    | "cancelled";
  requestedCoinValue: number;
  approvedCoinValue?: number | null;
  createdAt: string;
  adminNote?: string | null;
};

export type YnotShippingRequest = {
  id: string;
  publicCode: string;
  status:
    | "draft"
    | "submitted"
    | "packing"
    | "shipped"
    | "delivered"
    | "cancelled";
  trackingProvider?: string | null;
  trackingNumber?: string | null;
  createdAt: string;
  adminNote?: string | null;
};

export type YnotGachaOpenReward = {
  id: string;
  cardName: string;
  cardCode?: string | null;
  tier?: string | null;
  valueThb?: number | null;
  resultPosition: number;
};

export type YnotGachaOpenHistory = {
  id: string;
  publicCode: string;
  campaignId: string;
  campaignSlug?: string | null;
  campaignTitle: string;
  costCoins: number;
  quantity: number;
  status: "reserved" | "completed" | "failed" | "refunded";
  openedAt: string;
  createdAt: string;
  rewards: YnotGachaOpenReward[];
};

export type YnotGachaOpenItem = {
  cardId: string;
  name: string;
  imageUrl: string | null;
  tier: "normal" | "high" | string;
  displayTier: "rainbow" | "gold" | "silver" | "bronze";
  valueThb: number | null;
  position: number;
  prizeUnitId?: string | null;
};

export type YnotGachaOpenResult = {
  status: "completed" | "reserved" | "failed" | string;
  openId: string;
  publicCode: string;
  costCoins?: number;
  logicMode?: string;
  items: YnotGachaOpenItem[];
  replayed?: boolean;
  remaining?: Record<string, unknown> | null;
};

export type YnotTierAnimation = {
  tier: "bronze" | "silver" | "gold" | "rainbow";
  videoUrl: string | null;
  posterUrl: string | null;
  soundUrl: string | null;
  durationMs: number;
  isActive: boolean;
};

export type YnotPrizePreview = {
  id: string;
  cardId?: string;
  cardCode?: string | null;
  cardGrade?: string | null;
  cardImageUrl?: string | null;
  cardImageStoragePath?: string | null;
  cardPrizeCategory?: string | null;
  cardName: string;
  tier: "normal" | "high";
  rank: number;
  valueThb?: number | null;
  convertCoinValue?: number;
  plannedQuantity?: number;
  availableUnits?: number;
  totalUnits?: number;
  weight?: number;
  unlockAtSoldPct?: number;
  prizeCategory?: string;
  prizeCategoryLabel?: string;
  sourceType?: string;
  displayGroup?: string;
  displayTier?: string;
  displayTierLabel?: string;
  tierRank?: number;
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
  cardCode?: string | null;
  cardGrade?: string | null;
  cardImageUrl?: string | null;
  cardImageStoragePath?: string | null;
  cardPrizeCategory?: string | null;
  tier: "normal" | "high";
  rank: number;
  valueThb?: number | null;
  convertCoinValue?: number;
  weight: number;
  unlockAtSoldPct: number;
  prizeCategory?: string;
  prizeCategoryLabel?: string;
  sourceType?: string;
  displayGroup?: string;
  displayTier?: string;
  displayTierLabel?: string;
  tierRank?: number;
  plannedQuantity: number;
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
  gachaOpens: YnotGachaOpenHistory[];
  collection: YnotCollectionItem[];
  exchanges: YnotExchangeOrder[];
  shipping: YnotShippingRequest[];
  addresses: YnotAddress[];
  rankings: YnotRankingRow[];
  adminTopUps: YnotTopUp[];
  ownerApprovalRequests: YnotOwnerApprovalRequest[];
  platformHealth?: YnotPlatformHealth;
  dataIssues: YnotDataIssue[];
};

export type HomeSeriesFilter =
  | "all"
  | YnotCampaign["series"]
  | "football"
  | "basketball"
  | "soccer"
  | "baseball"
  | "magical"
  | "super"
  | "multi_sport";
export type HomeTagFilter = "all" | "new" | "psa10";
export type HomeSortOption =
  | "recommended"
  | "latest"
  | "coins-desc"
  | "coins-asc";
export type HomeFilterState = {
  series: HomeSeriesFilter;
  tag: HomeTagFilter;
  sort: HomeSortOption;
};
