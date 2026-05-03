import type { DrawConfig, Order } from "./types";

export const defaultDraw: DrawConfig = {
  titleTh: "กล่องสุ่ม One Piece Portgas Arc",
  titleEn: "One Piece Portgas Arc Lucky Draw",
  series: "One Piece",
  price: 5000,
  totalSlots: 66,
  orderCodePrefix: "LD",
  facebookUrl: "https://www.facebook.com/",
  youtubeUrl: "",
  promptPay: "081-234-5678",
  qrImageUrl: "",
  bankName: "Kasikorn Bank",
  accountName: "Lucky Draw Shop",
  accountNumber: "123-4-56789-0",
};

export const seedOrders: Order[] = [
  {
    id: "LD-1001",
    lineName: "Merry",
    quantity: 2,
    amount: 10000,
    status: "picked",
    slipName: "sample-slip.jpg",
    slipProvider: "manual_line",
    hasSlipFile: false,
    slots: [7, 21],
    createdAt: "2026-04-30T09:00:00.000Z",
  },
  {
    id: "LD-1002",
    lineName: "Customer A",
    quantity: 1,
    amount: 5000,
    status: "approved",
    slipName: "transfer.png",
    slipProvider: "manual_line",
    hasSlipFile: false,
    slots: [],
    createdAt: "2026-04-30T09:22:00.000Z",
  },
];
