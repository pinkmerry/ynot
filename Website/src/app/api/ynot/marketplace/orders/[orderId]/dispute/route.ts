import { getMarketplaceAccountForProfile } from "@/lib/marketplace/account-bridge";
import { openBuyerRefundRequest } from "@/lib/marketplace/disputes";
import { prepareMarketplaceMutation } from "@/lib/marketplace/mutation-guard";
import { marketplaceErrorResponse } from "@/lib/marketplace/route-guards";
import { MarketplaceServiceError } from "@/lib/marketplace/supabase-adapter";

export const dynamic = "force-dynamic";

type RouteParams = {
  params: Promise<{ orderId: string }>;
};

const MIN_REASON_LENGTH = 10;
const MAX_REASON_LENGTH = 1000;

export async function POST(request: Request, { params }: RouteParams) {
  const mutation = await prepareMarketplaceMutation(request, {
    method: "POST",
    accessMode: "customer",
    rateLimit: {
      key: "ynot:marketplace:orders:dispute",
      limit: 3,
      windowMs: 60_000,
    },
    allowedFields: ["reason"],
  });
  if (!mutation.ok) return mutation.response;

  const { access, body, profile, requestId } = mutation;

  const reason = String(body.reason ?? "").trim();
  if (reason.length < MIN_REASON_LENGTH || reason.length > MAX_REASON_LENGTH) {
    return Response.json(
      {
        error: "Invalid dispute reason.",
        code: "marketplace_dispute_reason_invalid",
        request_id: requestId,
      },
      { status: 400 },
    );
  }

  try {
    const { orderId } = await params;
    const account = await getMarketplaceAccountForProfile(profile, access.admin);
    if (!account) {
      throw new MarketplaceServiceError(
        "marketplace_account_required",
        "Marketplace account is required.",
        400,
      );
    }
    const dispute = await openBuyerRefundRequest({
      orderId,
      accountId: account.accountId,
      reason,
      buyerYnotProfileId: profile.profileId,
    });
    return Response.json({ ok: true, request_id: requestId, dispute });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
