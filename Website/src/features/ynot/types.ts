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
  packCode?: string | null;
  // Last One Prize: optional bonus card for whoever opens the final pack.
  lastPrizeCardId?: string | null;
  lastPrizeStockUnitKey?: string | null;
  // Resolved view of the last prize (card name + sub-SKU image) for display.
  lastPrizePreview?: YnotLastPrizePreview | null;
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

export type YnotLastPrizePreview = {
  cardId: string;
  cardName: string;
  cardCode?: string | null;
  cardImageUrl?: string | null;
  stockLabel?: string | null;
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
  code?: string;
  type: "bank_transfer" | "promptpay_qr";
  displayName: string;
  bankName?: string | null;
  accountName?: string | null;
  accountNumber?: string | null;
  promptpayId?: string | null;
  qrImagePath?: string | null;
  instructions?: string | null;
  isActive?: boolean;
  sortOrder?: number;
};

export type YnotSlipVerificationStatus =
  | "unverified"
  | "valid"
  | "duplicate"
  | "fraud"
  | "not_found"
  | "amount_mismatch"
  | "receiver_mismatch"
  | "date_mismatch"
  | "provider_error"
  | "manual_review";

export type YnotWallet = {
  balanceCoins: number;
  version: number;
};

export type YnotTopUp = {
  id?: string;
  publicCode: string;
  profileId?: string;
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
  paymentMethod?: {
    id?: string;
    code?: YnotPaymentMethod["code"];
    type: YnotPaymentMethod["type"];
    displayName: YnotPaymentMethod["displayName"];
  } | null;
  slipVerification?: {
    id?: string;
    status: YnotSlipVerificationStatus;
    providerCode?: string | null;
    providerMessage?: string | null;
    verifiedAt?: string | null;
    uploadedAt?: string | null;
  } | null;
  createdAt: string;
  reviewedAt?: string | null;
};

export type YnotCollectionItem = {
  id: string;
  cardName: string;
  cardCode?: string | null;
  imageUrl?: string | null;
  bundleQuantity?: number;
  bundleIndex?: number;
  bundleGroupId?: string | null;
  bundleGroupItemIds?: string[];
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
  /** Identity of the specific won stock unit (overrides product-level grade). */
  cardCondition?: string | null;
  cardGradingService?: string | null;
  cardPrizeCategory?: string | null;
  cardSeries?: string | null;
  convertCoinValue?: number | null;
  convertExpiresAt?: string | null;
  sourceCampaignTitle?: string | null;
  sourceCampaignSlug?: string | null;
  sourcePrizeTier?: "rainbow" | "gold" | "silver" | "bronze" | null;
  sourcePrizeTierLabel?: string | null;
  sourcePrizeValueThb?: number | null;
  sourceOpenPosition?: number | null;
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

export type YnotShippingStatus =
  | "draft"
  | "submitted"
  | "packing"
  | "ready_for_pickup"
  | "picked_up"
  | "shipped"
  | "delivered"
  | "cancelled";

export type YnotShippingCustomer = {
  profileId: string;
  displayName: string;
  email?: string | null;
  lineDisplayName?: string | null;
  lineUserId?: string | null;
  phone?: string | null;
  status?: string | null;
  createdAt?: string | null;
  lastSeenAt?: string | null;
};

export type YnotShippingAddressSnapshot = {
  label?: string | null;
  recipientName?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  subdistrict?: string | null;
  district?: string | null;
  province?: string | null;
  postalCode?: string | null;
  country?: string | null;
  deliveryNote?: string | null;
};

export type YnotShippingItem = {
  cardName: string;
  cardCode?: string | null;
  imageUrl?: string | null;
  status?: YnotCollectionItem["status"] | null;
  serialNo?: string | null;
  acquiredAt?: string | null;
  sourceCampaignTitle?: string | null;
  sourceCampaignSlug?: string | null;
  sourceOpenCode?: string | null;
  sourceOpenPosition?: number | null;
  sourcePrizeTierLabel?: string | null;
  sourcePrizeValueThb?: number | null;
};

export type YnotShippingTimelineEvent = {
  id: string;
  eventType: string;
  label: string;
  createdAt: string;
  actorLabel?: string | null;
  previousStatus?: string | null;
  status?: string | null;
  trackingProvider?: string | null;
  trackingNumber?: string | null;
  note?: string | null;
};

export type YnotShippingRequest = {
  id: string;
  publicCode: string;
  profileId?: string;
  status: YnotShippingStatus;
  trackingProvider?: string | null;
  trackingNumber?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  customerNote?: string | null;
  adminNote?: string | null;
  shippingFeeCoins?: number;
  customer?: YnotShippingCustomer | null;
  addressSnapshot?: YnotShippingAddressSnapshot | null;
  items?: YnotShippingItem[];
  timeline?: YnotShippingTimelineEvent[];
};

export type YnotWalletLedgerEntry = {
  id: string;
  entryType: string;
  amountCoins: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceType?: string | null;
  createdAt: string;
};

export type YnotAdminUserDetail = {
  profile: YnotShippingCustomer & {
    fullName?: string | null;
    avatarUrl?: string | null;
    preferredLanguage?: "th" | "en" | string | null;
  };
  wallet: YnotWallet;
  addresses: YnotAddress[];
  collection: YnotCollectionItem[];
  gachaOpens: YnotGachaOpenHistory[];
  shipping: YnotShippingRequest[];
  topUps: YnotTopUp[];
  walletLedger: YnotWalletLedgerEntry[];
  auditTimeline: YnotShippingTimelineEvent[];
};

export type YnotGachaOpenReward = {
  id: string;
  cardName: string;
  cardCode?: string | null;
  imageUrl?: string | null;
  bundleQuantity?: number;
  displayTier?: "rainbow" | "gold" | "silver" | "bronze" | null;
  valueThb?: number | null;
  resultPosition: number;
};

export type YnotGachaOpenHistory = {
  id: string;
  publicCode: string;
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
  name: string;
  imageUrl: string | null;
  bundleQuantity?: number;
  displayTier: "rainbow" | "gold" | "silver" | "bronze";
  valueThb: number | null;
  position: number;
  isLastPrize?: boolean;
};

export type YnotGachaOpenResult = {
  status: "completed" | "reserved" | "failed" | string;
  openId: string;
  publicCode: string;
  costCoins?: number;
  items: YnotGachaOpenItem[];
  replayed?: boolean;
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
  tier?: "normal" | "high";
  rank: number;
  valueThb?: number | null;
  convertCoinValue?: number;
  bundleQuantity?: number;
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
  intendedStockUnitKey?: string | null;
  intendedStockSku?: string | null;
  intendedStockLabel?: string | null;
};

export type YnotAddress = {
  id: string;
  label: string;
  recipientName?: string | null;
  phone?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  subdistrict?: string | null;
  district?: string | null;
  province?: string | null;
  postalCode?: string | null;
  country?: string | null;
  deliveryNote?: string | null;
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
  bundleQuantity?: number;
  weight: number;
  unlockAtSoldPct: number;
  prizeCategory?: string;
  prizeCategoryLabel?: string;
  sourceType?: string;
  displayGroup?: string;
  displayTier?: string;
  displayTierLabel?: string;
  tierRank?: number;
  intendedStockUnitKey?: string | null;
  intendedStockSku?: string | null;
  intendedStockLabel?: string | null;
  stockUnitUsages?: Array<{
    groupKey: string;
    sku: string;
    label: string;
    totalUnits: number;
    availableUnits: number;
    awardedUnits: number;
    voidUnits: number;
  }>;
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
