import type { YnotShippingRequest, YnotShippingStatus } from "./types";

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

export function ynotShippingStatusLabel(status: string) {
  return ynotShippingStatusLabels[status as YnotShippingStatus] ?? status.replaceAll("_", " ");
}

export function ynotShippingStatusCustomerLabel(status: string) {
  return ynotShippingStatusCustomerLabels[status as YnotShippingStatus] ?? status.replaceAll("_", " ");
}

export function isActiveYnotShippingStatus(status: YnotShippingStatus) {
  return activeShippingStatuses.has(status);
}

export function isFinalYnotShippingStatus(status: YnotShippingStatus) {
  return finalShippingStatuses.has(status);
}

export function ynotShippingTrackingLabel(
  request: Pick<YnotShippingRequest, "trackingProvider" | "trackingNumber" | "status">,
) {
  if (request.trackingProvider && request.trackingNumber) {
    return `${request.trackingProvider} | ${request.trackingNumber}`;
  }
  if (request.status === "ready_for_pickup") return "Pickup at shop";
  if (request.status === "picked_up") return "Picked up by user";
  return "Tracking not added yet";
}
