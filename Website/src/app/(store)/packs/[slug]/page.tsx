import Link from "next/link";
import { Shell } from "@/features/ynot/cr/Shell";
import { PackDetailExperience } from "@/features/ynot/cr/PackDetailExperience";
import { PageHead } from "@/features/ynot/cr/UiKit";
import { YnotShell } from "@/features/ynot/components";
import { getCampaign, getYnotDashboardSlice } from "@/features/ynot/data";

export const dynamic = "force-dynamic";

export default async function PackDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [{ slug }, data] = await Promise.all([
    params,
    getYnotDashboardSlice({
      wallet: true,
    }),
  ]);
  const campaign = await getCampaign(slug, {
    allowTestForCurrentViewer: true,
    viewer: data.viewer,
  });

  return (
    <YnotShell viewer={data.viewer} walletBalance={data.wallet.balanceCoins}>
      <Shell>
        {campaign ? (
          <PackDetailExperience
            campaign={campaign}
            balanceCoins={data.wallet.balanceCoins}
          />
        ) : (
          <div className="cr-page">
            <PageHead
              title="Pack not found"
              lead="This pack may have been removed or doesn't exist yet."
              back={{ href: "/packs" }}
            />
            <div
              className="cr-section"
              style={{ padding: 40, textAlign: "center" }}
            >
              <strong style={{ display: "block", fontSize: 14, marginBottom: 8 }}>
                No pack matches that link
              </strong>
              <small
                className="cr-mute"
                style={{ display: "block", marginBottom: 18 }}
              >
                Browse all live Y-Packs from the main list.
              </small>
              <Link className="cr-btn cr-btn-primary" href="/packs">
                Back to Y-Packs
              </Link>
            </div>
          </div>
        )}
      </Shell>
    </YnotShell>
  );
}
