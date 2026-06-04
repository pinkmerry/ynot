export type PublicStockUnitImageRow = {
  id?: string | null;
  image_url?: string | null;
};

export type PublicPrizeUnitImageRow = {
  id?: string | null;
  draw_round_prize_id?: string | null;
  gacha_open_item_id?: string | null;
  card_stock_unit_id?: string | null;
  status?: string | null;
};

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function publicSubSkuImageUrl(stockUnitImageUrl: unknown) {
  return cleanText(stockUnitImageUrl);
}

function stockUnitImageById(stockUnits: PublicStockUnitImageRow[]) {
  const out = new Map<string, string>();
  for (const stockUnit of stockUnits) {
    const id = cleanText(stockUnit.id);
    const imageUrl = cleanText(stockUnit.image_url);
    if (id && imageUrl && !out.has(id)) out.set(id, imageUrl);
  }
  return out;
}

export function stockImageUrlByPrizeUnitId(
  prizeUnits: PublicPrizeUnitImageRow[],
  stockUnits: PublicStockUnitImageRow[],
) {
  const stockImages = stockUnitImageById(stockUnits);
  const out = new Map<string, string>();
  for (const prizeUnit of prizeUnits) {
    if (prizeUnit.status === "void") continue;
    const prizeUnitId = cleanText(prizeUnit.id);
    const stockUnitId = cleanText(prizeUnit.card_stock_unit_id);
    const imageUrl = stockUnitId ? stockImages.get(stockUnitId) : null;
    if (prizeUnitId && imageUrl && !out.has(prizeUnitId)) {
      out.set(prizeUnitId, imageUrl);
    }
  }
  return out;
}

export function stockImageUrlByPrizeId(
  prizeUnits: PublicPrizeUnitImageRow[],
  stockUnits: PublicStockUnitImageRow[],
) {
  const stockImages = stockUnitImageById(stockUnits);
  const out = new Map<string, string>();
  for (const prizeUnit of prizeUnits) {
    if (prizeUnit.status === "void") continue;
    const prizeId = cleanText(prizeUnit.draw_round_prize_id);
    const stockUnitId = cleanText(prizeUnit.card_stock_unit_id);
    const imageUrl = stockUnitId ? stockImages.get(stockUnitId) : null;
    if (prizeId && imageUrl && !out.has(prizeId)) {
      out.set(prizeId, imageUrl);
    }
  }
  return out;
}

export function stockImageUrlByOpenItemId(
  prizeUnits: PublicPrizeUnitImageRow[],
  stockUnits: PublicStockUnitImageRow[],
) {
  const stockImages = stockUnitImageById(stockUnits);
  const out = new Map<string, string>();
  for (const prizeUnit of prizeUnits) {
    if (prizeUnit.status === "void") continue;
    const openItemId = cleanText(prizeUnit.gacha_open_item_id);
    const stockUnitId = cleanText(prizeUnit.card_stock_unit_id);
    const imageUrl = stockUnitId ? stockImages.get(stockUnitId) : null;
    if (openItemId && imageUrl && !out.has(openItemId)) {
      out.set(openItemId, imageUrl);
    }
  }
  return out;
}
