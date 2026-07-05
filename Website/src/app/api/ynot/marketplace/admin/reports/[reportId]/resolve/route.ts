import { prepareMarketplaceMutation } from "@/lib/marketplace/mutation-guard";
import { resolveMarketplaceListingReport } from "@/lib/marketplace/listing-reports";
import { marketplaceErrorResponse } from "@/lib/marketplace/route-guards";
import { MarketplaceServiceError } from "@/lib/marketplace/supabase-adapter";

export const dynamic = "force-dynamic";

const VALID_RESOLUTIONS = new Set(["dismissed", "unlisted"]);

export async function POST(
  request: Request,
  ctx: { params: Promise<{ reportId: string }> },
) {
  const mutation = await prepareMarketplaceMutation(request, {
    method: "POST",
    rateLimit: {
      key: "ynot:marketplace:admin:reports:resolve",
      limit: 30,
      windowMs: 60_000,
    },
    allowedFields: ["resolution", "resolutionNote"],
  });
  if (!mutation.ok) return mutation.response;

  const { access, body, requestId } = mutation;

  if (!access.admin?.adminRole) {
    return Response.json(
      {
        error: "Marketplace admin access is required.",
        code: "marketplace_admin_required",
      },
      { status: 403 },
    );
  }

  try {
    if (!VALID_RESOLUTIONS.has(body.resolution as string)) {
      throw new MarketplaceServiceError(
        "marketplace_report_resolution_invalid",
        "Marketplace report resolution is invalid.",
        400,
      );
    }

    const resolutionNote =
      body.resolutionNote == null
        ? null
        : String(body.resolutionNote).trim().slice(0, 1000);

    const { reportId } = await ctx.params;
    const report = await resolveMarketplaceListingReport({
      reportId,
      resolution: String(body.resolution) as "dismissed" | "unlisted",
      adminProfileId: access.admin.profileId,
      resolutionNote,
    });

    return Response.json({ ok: true, request_id: requestId, report });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
