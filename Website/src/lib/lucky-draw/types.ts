export type Lang = "th" | "en";
export type OrderStatus = "pending" | "approved" | "picked" | "rejected";
export type DrawStatus = "draft" | "live" | "closed" | "archived";
export type SlipVerificationStatus =
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

export type DrawConfig = {
  slug: string;
  status: DrawStatus;
  titleTh: string;
  titleEn: string;
  series: "One Piece" | "Pokemon";
  price: number;
  totalSlots: number;
  orderCodePrefix: string;
  facebookUrl: string;
  youtubeUrl: string;
  promptPay: string;
  qrImageUrl: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
};

export type ProfileInfo = {
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  subdistrict: string;
  district: string;
  province: string;
  postalCode: string;
  country: string;
  deliveryNote: string;
};

export type FeaturedCard = {
  id?: string;
  catalogCardId?: string;
  code?: string;
  name: string;
  grade: string;
  series: string;
  prizeCategory?: string;
  photoUrl?: string;
  photoStoragePath?: string;
};

export type ChaseCard = FeaturedCard & {
  rank: number;
  value: number;
};

export type CardCatalogItem = Required<Pick<FeaturedCard, "catalogCardId">> &
  Omit<FeaturedCard, "catalogCardId"> & {
    modelCode?: string;
    cardNumber?: string | null;
    language?: string | null;
    releaseYear?: number | null;
    cardSet?: string | null;
    variant?: string | null;
    catalogCategory?: "single_cards" | "packs" | "boxes" | "cases" | "sets" | "supplies";
    condition?: "sealed" | "raw" | "graded";
    gradingService?: "psa" | "bgs" | "cgc" | "other" | null;
    certNumber?: string | null;
    gemrateId?: string | null;
    searchName?: string;
    searchCode?: string | null;
    isTest?: boolean;
    seedRunId?: string | null;
    assetSource?: string | null;
    assetLicense?: string | null;
    assetManifestKey?: string | null;
    stockTotal?: number;
    stockAvailable?: number;
    stockReserved?: number;
    stockAllocated?: number;
    stockArchived?: number;
    /** Individual graded / sealed / cert-bearing units (not plain raw bulk). */
    stockUnits?: Array<{
      id: string;
      condition: string;
      grade: string | null;
      gradingService: string | null;
      certNumber: string | null;
      gemrateId: string | null;
      imageUrl: string | null;
      status: string;
    }>;
    createdAt?: string;
    updatedAt?: string;
  };

export type Order = {
  id: string;
  lineName: string;
  quantity: number;
  amount: number;
  status: OrderStatus;
  slipName: string;
  slipProvider: "supabase" | "cloudinary" | "manual_line";
  hasSlipFile: boolean;
  slipVerificationStatus: SlipVerificationStatus;
  slipProviderCode: string | null;
  slipProviderMessage: string | null;
  slots: number[];
  createdAt: string;
};

export type LuckyDrawState = {
  draw: DrawConfig;
  orders: Order[];
  featuredCards?: FeaturedCard[];
  chaseCards?: ChaseCard[];
  cardCatalog?: CardCatalogItem[];
};
