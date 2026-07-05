import "server-only";

import {
  createMarketplaceSupabaseClient,
  marketplaceRpcError,
  MarketplaceServiceError,
} from "./supabase-adapter";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertUuid(value: string, label: string) {
  if (!UUID_RE.test(value)) {
    throw new MarketplaceServiceError(
      `marketplace_${label}_invalid`,
      "Marketplace request is invalid.",
      400,
    );
  }
  return value.toLowerCase();
}

export type MarketplaceListingReportReasonCode =
  | "fake_or_cert_mismatch"
  | "stolen_photos"
  | "wrong_item"
  | "pricing_abuse"
  | "other";

export type MarketplaceListingReportState = "open" | "dismissed" | "unlisted";

export type MarketplaceListingReportRow = {
  id: string;
  listing_id: string;
  reporter_account_id: string;
  reason_code: MarketplaceListingReportReasonCode;
  reason_note: string | null;
  report_state: MarketplaceListingReportState;
  resolved_by_ynot_profile_id: string | null;
  resolution_note: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ReportMarketplaceListingInput = {
  listingId: string;
  reporterAccountId: string;
  reasonCode: MarketplaceListingReportReasonCode;
  reasonNote?: string | null;
};

export type ListMarketplaceListingReportsInput = {
  state?: MarketplaceListingReportState | null;
  limit?: number;
};

export type ResolveMarketplaceListingReportInput = {
  reportId: string;
  resolution: "dismissed" | "unlisted";
  adminProfileId: string;
  resolutionNote?: string | null;
};

export async function reportMarketplaceListing(
  input: ReportMarketplaceListingInput,
): Promise<MarketplaceListingReportRow> {
  const supabase = createMarketplaceSupabaseClient();
  const result = await supabase.rpc("marketplace_report_listing", {
    p_listing_id: assertUuid(input.listingId, "listing_id"),
    p_reporter_account_id: assertUuid(
      input.reporterAccountId,
      "reporter_account_id",
    ),
    p_reason_code: input.reasonCode,
    p_reason_note: input.reasonNote ?? null,
  });
  if (result.error) throw marketplaceRpcError(result.error);
  return result.data as MarketplaceListingReportRow;
}

export async function listMarketplaceListingReports(
  input: ListMarketplaceListingReportsInput = {},
): Promise<MarketplaceListingReportRow[]> {
  const supabase = createMarketplaceSupabaseClient();
  const result = await supabase.rpc("marketplace_admin_list_listing_reports", {
    p_state: input.state ?? "open",
    p_limit: input.limit ?? 100,
  });
  if (result.error) throw marketplaceRpcError(result.error);
  return (result.data ?? []) as MarketplaceListingReportRow[];
}

export async function resolveMarketplaceListingReport(
  input: ResolveMarketplaceListingReportInput,
): Promise<MarketplaceListingReportRow> {
  const supabase = createMarketplaceSupabaseClient();
  const result = await supabase.rpc(
    "marketplace_admin_resolve_listing_report",
    {
      p_report_id: assertUuid(input.reportId, "report_id"),
      p_resolution: input.resolution,
      p_admin_profile_id: assertUuid(input.adminProfileId, "admin_profile_id"),
      p_resolution_note: input.resolutionNote ?? null,
    },
  );
  if (result.error) throw marketplaceRpcError(result.error);
  return result.data as MarketplaceListingReportRow;
}
