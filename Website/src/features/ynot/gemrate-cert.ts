// GemRate cert-lookup response parsing. Ported/adapted from the reference
// inventory app so a PSA (or BGS/CGC/SGC) cert number can auto-fill the
// catalog form. Pure functions — the network call lives in the API route.

export type GemRateProductDraft = {
  productName: string | null;
  brandName: string | null;
  languageName: string | null;
  setName: string | null;
  modelCode: string | null;
  variant: string | null;
  releaseYear: number | null;
};

export type GemRateCertLookup = {
  gemrateId: string | null;
  popTotal: number | null;
  popGrade: number | null;
  gemRate: number | null;
  grade: string | null;
  productDraft: GemRateProductDraft | null;
};

export function normalizeGrader(grader: string | null): string {
  const value = grader?.trim().toLowerCase();
  if (!value) return "";
  if (value.includes("psa")) return "psa";
  if (value.includes("bgs") || value.includes("beckett")) return "bgs";
  if (value.includes("cgc")) return "cgc";
  if (value.includes("sgc")) return "sgc";
  return value.replace(/[^a-z0-9]/g, "");
}

const normalizeKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, "");

function findValue(value: unknown, keys: string[]): unknown {
  const targets = new Set(keys.map(normalizeKey));
  const seen = new Set<unknown>();
  const queue: unknown[] = [value];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    for (const [key, child] of Object.entries(current)) {
      if (targets.has(normalizeKey(key))) return child;
      if (child && typeof child === "object") queue.push(child);
    }
  }

  return null;
}

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/[,%]/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const toStringValue = (value: unknown): string | null => {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
};

const toYear = (value: unknown): number | null => {
  const number = toNumber(value);
  if (number && number >= 1900 && number <= 2100) return Math.trunc(number);
  const text = toStringValue(value);
  const match = text?.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
};

const cleanCardNumber = (value: unknown): string | null => {
  const text = toStringValue(value);
  if (!text) return null;
  return text.replace(/^#/, "").trim() || null;
};

const cleanGrade = (value: unknown): string | null => {
  const text = toStringValue(value);
  if (!text) return null;
  if (/auth/i.test(text)) return "auth";
  const match = text.match(/\b(?:10|[1-9](?:\.5)?)\b/);
  return match?.[0] ?? text;
};

const firstUsefulString = (payload: unknown, keys: string[]): string | null => {
  const value = toStringValue(findValue(payload, keys));
  if (!value || value.toLowerCase() === "unknown") return null;
  return value;
};

const genericBrands = new Set([
  "card",
  "cards",
  "tcg",
  "trading card",
  "trading cards",
  "sports card",
  "sports cards",
]);

const normalizeDraftName = (name: string | null) => {
  if (!name) return { productName: null as string | null, descriptor: null as string | null };
  const parts = name.split("/").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return { productName: name, descriptor: null as string | null };

  const [first, ...rest] = parts;
  if (/^(full art|alternate art|alt art|special art|secret rare|promo)$/i.test(first)) {
    return { productName: rest.join(" / "), descriptor: first };
  }
  return { productName: name, descriptor: null as string | null };
};

const inferBrandName = (
  brandName: string | null,
  productName: string | null,
  setName: string | null,
): string | null => {
  const normalizedBrand = brandName?.trim().toLowerCase() ?? "";
  const haystack = [brandName, productName, setName].filter(Boolean).join(" ").toLowerCase();

  if (!brandName || genericBrands.has(normalizedBrand)) {
    if (haystack.includes("pokemon") || haystack.includes("pikachu")) return "Pokemon";
    if (haystack.includes("one piece")) return "One Piece";
    if (haystack.includes("dragon ball")) return "Dragon Ball";
    if (haystack.includes("yugioh") || haystack.includes("yu-gi-oh")) return "Yu-Gi-Oh!";
    return null;
  }
  return brandName;
};

const inferLanguageName = (...values: Array<string | null>): string | null => {
  const haystack = values.filter(Boolean).join(" ").toLowerCase();
  if (/\bjapanese\b|\bjp\b|\bjpn\b|日本|promo jp/.test(haystack)) return "Japanese";
  if (/\benglish\b|\ben\b|\beng\b/.test(haystack)) return "English";
  if (/\bkorean\b|\bkr\b|\bkor\b/.test(haystack)) return "Korean";
  if (/\bchinese\b|\bcn\b|\bchn\b/.test(haystack)) return "Chinese";
  return null;
};

const cleanPokemonSpecialBoxSet = (value: string | null): string | null => {
  if (!value) return null;
  if (!/special box/i.test(value)) return value;
  return value.replace(/^(?:mario|luigi)\s+/i, "").trim() || value;
};

const chooseSetName = (rawSetName: string | null, variant: string | null): string | null => {
  const variantSet = /(?:special box|starter deck|booster|promo pack|collection)/i.test(
    variant ?? "",
  )
    ? cleanPokemonSpecialBoxSet(variant)
    : null;
  return variantSet ?? rawSetName;
};

function extractProductDraft(payload: unknown): GemRateProductDraft | null {
  const rawProductName = firstUsefulString(payload, [
    "product_name",
    "productName",
    "card_name",
    "cardName",
    "subject",
    "player",
    "athlete",
    "character",
    "name",
  ]);
  const normalizedName = normalizeDraftName(rawProductName);
  const setName = firstUsefulString(payload, [
    "set_name",
    "setName",
    "set",
    "release",
    "product",
    "issue",
  ]);
  const modelCode = cleanCardNumber(
    findValue(payload, [
      "model_code",
      "modelCode",
      "card_number",
      "cardNumber",
      "card_no",
      "cardNo",
      "number",
    ]),
  );
  const variant = firstUsefulString(payload, [
    "variant",
    "parallel",
    "variation",
    "refractor",
    "insert",
    "rarity",
  ]);
  const rawBrandName = firstUsefulString(payload, [
    "brand",
    "game",
    "sport",
    "category",
    "license",
  ]);
  const releaseYear = toYear(findValue(payload, ["release_year", "releaseYear", "year"]));
  const productName = normalizedName.productName;
  const resolvedSetName = chooseSetName(setName, variant);
  const brandName = inferBrandName(rawBrandName, productName, resolvedSetName);
  const languageName = inferLanguageName(rawProductName, setName, variant);
  const normalizedVariant = normalizedName.descriptor ?? variant;

  if (!productName && !resolvedSetName && !modelCode) return null;

  return {
    productName,
    brandName,
    languageName,
    setName: resolvedSetName,
    modelCode,
    variant: normalizedVariant,
    releaseYear,
  };
}

export function extractGemRateLookup(payload: unknown): GemRateCertLookup {
  const popTotal = toNumber(
    findValue(payload, [
      "pop_total",
      "popTotal",
      "total_pop",
      "totalPop",
      "total_population",
      "population",
      "pop",
    ]),
  );
  const popGrade = toNumber(
    findValue(payload, [
      "pop_grade",
      "popGrade",
      "pop_at_grade",
      "popAtGrade",
      "grade_pop",
      "gradePop",
      "population_at_grade",
      "grade_population",
    ]),
  );
  const gemRate =
    popTotal && popTotal > 0 && popGrade !== null
      ? Math.round((popGrade / popTotal) * 10_000) / 100
      : null;
  const preferredId = toStringValue(
    findValue(payload, ["gemrate_id", "gemRateId", "gemrateid", "card_id", "cardId"]),
  );
  const fallbackId = toStringValue(findValue(payload, ["id"]));
  const grade = cleanGrade(findValue(payload, ["grade", "numeric_grade", "numericGrade"]));

  return {
    gemrateId: preferredId ?? fallbackId,
    popTotal,
    popGrade,
    gemRate,
    grade,
    productDraft: extractProductDraft(payload),
  };
}

export const GEMRATE_CERT_LOOKUP_URL =
  "https://foaaw4f13g.execute-api.us-east-1.amazonaws.com/v1/cert-lookup";

export function gemRateFindMessage(payload: unknown): string | null {
  return toStringValue(findValue(payload, ["message", "error", "detail"]));
}
