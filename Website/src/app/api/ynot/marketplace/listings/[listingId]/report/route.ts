import { getMarketplaceAccountForProfile } from "@/lib/marketplace/account-bridge";
import { reportMarketplaceListing } from "@/lib/marketplace/listing-reports";
import { prepareMarketplaceMutation } from "@/lib/marketplace/mutation-guard";
import { marketplaceErrorResponse } from "@/lib/marketplace/route-guards";
import { MarketplaceServiceError } from "@/lib/marketplace/supabase-adapter";

export const dynamic = "force-dynamic";

type RouteParams = {
  params: Promise<{ listingId: string }>;
};

const REPORT_REASON_CODES = new Set([
  "fake_or_cert_mismatch",
  "stolen_photos",
  "wrong_item",
  "pricing_abuse",
  "other",
]);

const MAX_REASON_NOTE_LENGTH = 1000;

export async function POST(request: Request, { params }: RouteParams) {
  const mutation = await prepareMarketplaceMutation(request, {
    method: "POST",
    accessMode: "customer",
    rateLimit: {
      key: "ynot:marketplace:listings:report",
      limit: 5,
      windowMs: 60_000,
    },
    allowedFields: ["reasonCode", "reasonNote"],
  });
  if (!mutation.ok) return mutation.response;

  const { access, body, profile, requestId } = mutation;

  const reasonCode = String(body.reasonCode ?? "");
  if (!REPORT_REASON_CODES.has(reasonCode)) {
    return Response.json(
      {
        error: "Invalid report reason.",
        code: "marketplace_report_reason_invalid",
        request_id: requestId,
      },
      { status: 400 },
    );
  }
  const reasonNote =
    body.reasonNote == null
      ? null
      : String(body.reasonNote).trim().slice(0, MAX_REASON_NOTE_LENGTH);

  try {
    const { listingId } = await params;
    const account = await getMarketplaceAccountForProfile(profile, access.admin);
    if (!account) {
      throw new MarketplaceServiceError(
        "marketplace_account_required",
        "Marketplace account is required.",
        400,
      );
    }
    const report = await reportMarketplaceListing({
      listingId,
      reporterAccountId: account.accountId,
      reasonCode: reasonCode as
        | "fake_or_cert_mismatch"
        | "stolen_photos"
        | "wrong_item"
        | "pricing_abuse"
        | "other",
      reasonNote,
    });
    return Response.json({ ok: true, request_id: requestId, report });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
