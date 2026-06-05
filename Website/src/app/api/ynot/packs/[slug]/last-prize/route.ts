import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { getLastPrizePreviewForCampaign } from "@/features/ynot/data";

export const dynamic = "force-dynamic";

// Public Last One Prize preview for one pack, fetched client-side by the pack
// detail page so the (card + sub-SKU image) lookup runs in its own request with
// a fresh Cloudflare Worker subrequest budget instead of being starved by the
// detail page's heavier server load. Returns only public catalog data.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!isSupabaseConfigured()) {
    return Response.json({ lastPrizePreview: null });
  }
  const limited = await enforceRateLimit(request, "ynot:packs:last-prize", {
    limit: 120,
    windowMs: 60_000,
  });
  if (limited) return limited;
  const { slug } = await params;
  const lastPrizePreview = await getLastPrizePreviewForCampaign(slug);
  return Response.json({ lastPrizePreview });
}
