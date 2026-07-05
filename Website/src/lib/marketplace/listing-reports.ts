import "server-only";

import {
  createMarketplaceSupabaseClient,
  marketplaceRpcError,
} from "./supabase-adapter";

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
    p_listing_id: input.listingId,
    p_reporter_account_id: input.reporterAccountId,
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
      p_report_id: input.reportId,
      p_resolution: input.resolution,
      p_admin_profile_id: input.adminProfileId,
      p_resolution_note: input.resolutionNote ?? null,
    },
  );
  if (result.error) throw marketplaceRpcError(result.error);
  return result.data as MarketplaceListingReportRow;
}
