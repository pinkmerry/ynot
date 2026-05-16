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
