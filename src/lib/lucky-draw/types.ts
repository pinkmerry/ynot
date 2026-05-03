export type Lang = "th" | "en";
export type OrderStatus = "pending" | "approved" | "picked" | "rejected";

export type DrawConfig = {
  titleTh: string;
  titleEn: string;
  series: "One Piece" | "Pokemon";
  price: number;
  totalSlots: number;
  facebookUrl: string;
  youtubeUrl: string;
  promptPay: string;
  qrImageUrl: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
};

export type FeaturedCard = {
  id?: string;
  name: string;
  grade: string;
  series: "One Piece" | "Pokemon";
  tone: "red" | "gold" | "blue" | "green" | "rose" | "violet";
  photoUrl?: string;
};

export type ChaseCard = FeaturedCard & {
  rank: number;
  value: number;
  subtitle: string;
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
  slots: number[];
  createdAt: string;
};

export type LuckyDrawState = {
  draw: DrawConfig;
  orders: Order[];
  featuredCards?: FeaturedCard[];
  chaseCards?: ChaseCard[];
};
