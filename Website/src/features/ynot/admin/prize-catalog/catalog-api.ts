// Typed fetch wrappers for the existing admin routes the Prize Catalog uses.
// Every mutating route here enforces same-origin server-side; we send
// credentials + JSON and surface structured error codes to the UI.

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

async function fetchJson<T>(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body: unknown,
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: "Network error — please retry." };
  }
  const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || payload?.ok === false) {
    return {
      ok: false,
      // Routes use `error`; some 409s (e.g. CARD_ALREADY_EXISTS) use `message`.
      error: String(payload?.error ?? payload?.message ?? "Request failed."),
      code: typeof payload?.code === "string" ? payload.code : undefined,
    };
  }
  return { ok: true, data: (payload ?? {}) as T };
}

const postJson = <T>(url: string, body: unknown) => fetchJson<T>(url, "POST", body);
const sendJson = <T>(url: string, method: "PATCH" | "DELETE", body: unknown) =>
  fetchJson<T>(url, method, body);

// ---- Main SKU (cards) ----
export type MainSkuInput = {
  cardId?: string;
  modelCode?: string;
  cardNumber?: string;
  name: string;
  series?: string; // "Pokemon" | "One Piece" | custom brand
  releaseYear?: number | string;
  cardSet?: string;
  catalogCategory?: string; // "Single Cards" | "Sealed Boxes" | "Sealed Packs" | custom
  prizeCategory?: string;
  imageUrl?: string;
  imageStoragePath?: string;
  confirmOverwrite?: boolean;
};
export const createMainSku = (input: MainSkuInput) =>
  postJson<{ card: unknown }>("/api/ynot/admin/cards", input);
export const updateMainSku = (input: MainSkuInput & { cardId: string }) =>
  sendJson<{ card: unknown }>("/api/ynot/admin/cards", "PATCH", input);
export const deleteMainSku = (cardId: string) =>
  sendJson<{ cardId: string }>("/api/ynot/admin/cards", "DELETE", { cardId });

// ---- Stock (card_stock_units) ----
export type StockAdjustInput = {
  cardId: string;
  quantityDelta: number; // +add / -archive; cert requires +1
  reason?: string;
  stockSkuId?: string; // required when adding (delta>0)
  stockUnitGroupKey?: string; // required when removing without a sub-SKU id
  condition?: "sealed" | "raw" | "graded";
  grade?: string;
  gradingService?: "psa" | "bgs" | "cgc" | "other";
  certNumber?: string;
  gemrateId?: string;
  imageUrl?: string;
  imageStoragePath?: string;
};
export const adjustCardStock = (input: StockAdjustInput) =>
  postJson<{ stock: unknown }>("/api/ynot/admin/card-stock", input);

// ---- Sub-SKU (stock_skus) + box→pack ----
export type StockSkuInput = {
  stockSkuId?: string;
  cardId?: string;
  sku: string;
  label: string;
  unitKind?: "card" | "pack" | "box" | "other";
  imageUrl?: string;
  imageStoragePath?: string;
  childStockSkuId?: string; // box → which pack
  childQuantity?: number; // packs per box
  clearConversionRule?: boolean;
};
export const upsertStockSku = (input: StockSkuInput) =>
  postJson<{ stockSku: unknown }>("/api/ynot/admin/stock-skus", input);
export const openStockContainer = (input: {
  parentStockSkuId: string;
  quantity: number;
  note?: string;
}) => postJson<{ result: unknown }>("/api/ynot/admin/stock-skus/open-container", input);

// ---- GemRate cert lookup (the real "PSA lookup") ----
export type CertLookup = {
  name?: string;
  series?: string;
  set?: string;
  year?: number;
  number?: string;
  grade?: string;
  gemrateId?: string;
};
export const lookupCert = (cert: string, grader: "psa" | "bgs" | "cgc" | "other") =>
  postJson<{ lookup: CertLookup }>("/api/ynot/admin/gemrate-cert", { cert, grader });

// ---- Image upload ----
// Response shape verified against POST /api/lucky-draw/admin/card-image/route.ts:
// returns { imageUrl: data.publicUrl, storagePath: path }
export async function uploadCardImage(
  file: File,
): Promise<ApiResult<{ url: string; storagePath?: string }>> {
  const form = new FormData();
  form.append("file", file);
  let res: Response;
  try {
    res = await fetch("/api/lucky-draw/admin/card-image", {
      method: "POST",
      credentials: "same-origin",
      body: form,
    });
  } catch {
    return { ok: false, error: "Upload failed — please retry." };
  }
  const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) return { ok: false, error: String(payload?.error ?? "Upload failed.") };
  return {
    ok: true,
    data: {
      // Primary field is `imageUrl` (verified in route.ts); fall back to `url` defensively.
      url: String(payload?.imageUrl ?? payload?.url ?? ""),
      storagePath:
        typeof payload?.storagePath === "string"
          ? payload.storagePath
          : typeof payload?.imageStoragePath === "string"
            ? payload.imageStoragePath
            : undefined,
    },
  };
}
