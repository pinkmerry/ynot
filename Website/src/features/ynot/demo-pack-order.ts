import type { YnotCampaign } from "./types";

/** Cookie name used to persist demo-mode sortOrder overrides for the
 *  storefront. Only relevant when Supabase isn't configured — production
 *  always reads sort_order straight from the database. */
export const DEMO_PACK_ORDER_COOKIE = "ynot_demo_pack_order";

/** Parse the cookie payload safely. Returns an empty record if the value is
 *  missing or malformed so callers never have to wrap it in try/catch. */
export function parseDemoPackOrderCookie(
  raw: string | undefined | null,
): Record<string, number> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: Record<string, number> = {};
      for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
        const num = Number(value);
        if (Number.isFinite(num)) out[id] = num;
      }
      return out;
    }
  } catch {
    /* fall through */
  }
  return {};
}

/** Apply cookie-based sortOrder overrides to a list of campaigns. Campaigns
 *  not present in the overrides keep their existing sortOrder. */
export function applyDemoPackOrderOverrides(
  campaigns: YnotCampaign[],
  overrides: Record<string, number>,
): YnotCampaign[] {
  if (!campaigns.length || !Object.keys(overrides).length) return campaigns;
  return campaigns.map((campaign) =>
    overrides[campaign.id] !== undefined
      ? { ...campaign, sortOrder: overrides[campaign.id] }
      : campaign,
  );
}

/** Cookie name used to persist archive operations on demo storefront packs
 *  (the hardcoded `featuredCampaigns` array). Archiving a real DB pack uses
 *  the Supabase row, but demo packs have synthetic ids that Postgres can't
 *  store — so we keep a client-side "hidden" list instead. */
export const DEMO_PACK_ARCHIVED_COOKIE = "ynot_demo_pack_archived";

/** Parse the archived-demo-id cookie. Accepts a JSON array of strings. */
export function parseDemoPackArchivedCookie(
  raw: string | undefined | null,
): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(
        parsed.filter((value): value is string => typeof value === "string"),
      );
    }
  } catch {
    /* fall through */
  }
  return new Set();
}

/** Remove campaigns whose id is listed in the archived set. */
export function filterArchivedDemoCampaigns(
  campaigns: YnotCampaign[],
  archived: Set<string>,
): YnotCampaign[] {
  if (!archived.size) return campaigns;
  return campaigns.filter((campaign) => !archived.has(campaign.id));
}

/** Cookie name that holds the ordered list of campaign ids the admin has
 *  promoted to the storefront "hero" row. Stored as a JSON array of
 *  strings so it doubles as both a membership set and an explicit order.
 *  This is intentionally separate from the database `sort_order` column
 *  so reordering packs inside a tier section never moves them in/out of
 *  the hero shelf. */
export const HERO_PACKS_COOKIE = "ynot_hero_packs";

export function parseHeroPacksCookie(
  raw: string | undefined | null,
): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (value): value is string =>
          typeof value === "string" && value.length > 0,
      );
    }
  } catch {
    /* fall through */
  }
  return [];
}
