import type { ChaseCard, DrawConfig, FeaturedCard, Order, ProfileInfo } from "@/lib/lucky-draw/types";
import type { DrawLifecycleAction, LuckyDrawApiResponse } from "../model";

export type ApiResult<T> = {
  response: Response;
  payload: T | null;
};

export type ApiErrorPayload = { error?: string };
export type ProfilePayload = { error?: string; displayName?: string; profile?: ProfileInfo };
export type CreateOrderPayload = { error?: string; order?: Order };
export type AdminSlipPayload = { error?: string; signedUrl?: string | null };
export type PickPayload = { error?: string; picks?: { slot_number?: number; slotNumber?: number }[] };
export type QrUploadPayload = { error?: string; qrImageUrl?: string };
export type CardImageUploadPayload = { error?: string; imageUrl?: string; storagePath?: string };

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<ApiResult<T>> {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | null;
  return { response, payload };
}

export function fetchLuckyDrawState() {
  return requestJson<LuckyDrawApiResponse>("/api/lucky-draw", { cache: "no-store" });
}

export function fetchProfileInfo() {
  return requestJson<ProfilePayload>("/api/lucky-draw/profile", { cache: "no-store" });
}

export function patchProfileInfo(profile: ProfileInfo) {
  return requestJson<ProfilePayload>("/api/lucky-draw/profile", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(profile),
  });
}

export function postLuckyDrawOrder(form: FormData) {
  return requestJson<CreateOrderPayload>("/api/lucky-draw", {
    method: "POST",
    body: form,
  });
}

export function fetchAdminSlip(orderId: string) {
  return requestJson<AdminSlipPayload>(`/api/lucky-draw/admin/slip?orderId=${encodeURIComponent(orderId)}`);
}

export function patchAdminOrder(body: { orderId: string; status?: Order["status"]; slots?: number[] }) {
  return requestJson<ApiErrorPayload>("/api/lucky-draw/admin/order", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function patchAdminDraw(body: { draw?: DrawConfig; featuredCards?: FeaturedCard[]; chaseCards?: ChaseCard[] }) {
  return requestJson<ApiErrorPayload>("/api/lucky-draw/admin/draw", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function postAdminDrawLifecycle(action: DrawLifecycleAction) {
  return requestJson<ApiErrorPayload>("/api/lucky-draw/admin/draw/lifecycle", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action }),
  });
}

export function postAdminQr(file: File) {
  const form = new FormData();
  form.set("file", file);
  return requestJson<QrUploadPayload>("/api/lucky-draw/admin/qr", {
    method: "POST",
    body: form,
  });
}

export function postAdminCardImage(file: File) {
  const form = new FormData();
  form.set("file", file);
  return requestJson<CardImageUploadPayload>("/api/lucky-draw/admin/card-image", {
    method: "POST",
    body: form,
  });
}

export function postCustomerPicks(orderId: string, slots: number[]) {
  return requestJson<PickPayload>("/api/lucky-draw/picks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderId, slots }),
  });
}
