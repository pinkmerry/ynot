import type { YnotShippingRequest, YnotShippingStatus } from "./types";
import type { Language } from "./i18n";

export const ynotShippingStatusLabels: Record<YnotShippingStatus, string> = {
  draft: "Draft",
  preparing: "Preparing",
  submitted: "Submitted",
  packing: "Packing",
  ready_for_pickup: "Ready for pickup",
  picked_up: "Picked up",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const ynotShippingStatusCustomerLabels: Record<YnotShippingStatus, string> = {
  draft: "Draft",
  preparing: "Preparing request",
  submitted: "Request submitted",
  packing: "Packing your reward",
  ready_for_pickup: "Ready for pickup",
  picked_up: "Picked up",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const ynotShippingStatusLabelsTh: Record<YnotShippingStatus, string> = {
  draft: "แบบร่าง",
  preparing: "กำลังเตรียม",
  submitted: "ส่งคำขอแล้ว",
  packing: "กำลังแพ็ก",
  ready_for_pickup: "พร้อมรับที่ร้าน",
  picked_up: "รับสินค้าแล้ว",
  shipped: "จัดส่งแล้ว",
  delivered: "ส่งสำเร็จ",
  cancelled: "ยกเลิกแล้ว",
};

export const ynotShippingStatusCustomerLabelsTh: Record<YnotShippingStatus, string> = {
  draft: "แบบร่าง",
  preparing: "กำลังเตรียมคำขอ",
  submitted: "ส่งคำขอแล้ว",
  packing: "กำลังแพ็กของรางวัล",
  ready_for_pickup: "พร้อมรับที่ร้าน",
  picked_up: "รับสินค้าแล้ว",
  shipped: "จัดส่งแล้ว",
  delivered: "ส่งสำเร็จ",
  cancelled: "ยกเลิกแล้ว",
};

const activeShippingStatuses = new Set<YnotShippingStatus>([
  "preparing",
  "submitted",
  "packing",
  "ready_for_pickup",
  "shipped",
]);

const finalShippingStatuses = new Set<YnotShippingStatus>([
  "delivered",
  "picked_up",
  "cancelled",
]);

export function ynotShippingStatusLabel(status: string, language: Language = "en") {
  const labels = language === "th" ? ynotShippingStatusLabelsTh : ynotShippingStatusLabels;
  return labels[status as YnotShippingStatus] ?? status.replaceAll("_", " ");
}

export function ynotShippingStatusCustomerLabel(status: string, language: Language = "en") {
  const labels =
    language === "th"
      ? ynotShippingStatusCustomerLabelsTh
      : ynotShippingStatusCustomerLabels;
  return labels[status as YnotShippingStatus] ?? status.replaceAll("_", " ");
}

export function isActiveYnotShippingStatus(status: YnotShippingStatus) {
  return activeShippingStatuses.has(status);
}

export function isFinalYnotShippingStatus(status: YnotShippingStatus) {
  return finalShippingStatuses.has(status);
}

export function ynotShippingTrackingLabel(
  request: Pick<YnotShippingRequest, "trackingProvider" | "trackingNumber" | "status">,
  language: Language = "en",
) {
  if (request.trackingProvider && request.trackingNumber) {
    return `${request.trackingProvider} | ${request.trackingNumber}`;
  }
  if (request.status === "ready_for_pickup") {
    return language === "th" ? "รับที่ร้าน" : "Pickup at shop";
  }
  if (request.status === "picked_up") {
    return language === "th" ? "ผู้ใช้รับสินค้าแล้ว" : "Picked up by user";
  }
  return language === "th" ? "ยังไม่มีเลขติดตาม" : "Tracking not added yet";
}
