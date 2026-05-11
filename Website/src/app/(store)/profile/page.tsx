import Link from "next/link";
import { PageHeader, YnotShell } from "@/features/ynot/components";
import { getYnotDashboardData } from "@/features/ynot/data";
import { ProfileRewardsTabs } from "@/features/ynot/ProfileRewardsTabs";
import { requireCurrentProfile } from "@/lib/auth/protected-route";

export const dynamic = "force-dynamic";

type ProfilePageProps = {
  searchParams?: Promise<{ error?: string; message?: string }>;
};

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  await requireCurrentProfile("/profile");
  const params = await searchParams;
  const data = await getYnotDashboardData();
  const liveCampaigns = data.campaigns
    .filter((campaign) => campaign.status === "live")
    .slice(0, 3);
  const ownedCards = data.collection.filter((item) => item.status === "owned");
  const rewardHistory = data.gachaOpens
    .flatMap((open) =>
      open.rewards.map((reward) => ({
        ...reward,
        openCode: open.publicCode,
        openedAt: open.openedAt,
        campaignTitle: open.campaignTitle,
      })),
    )
    .slice(0, 8);
  const openedPackCount = data.gachaOpens.reduce(
    (total, open) => total + open.quantity,
    0,
  );
  const openHref = liveCampaigns[0]
    ? `/gacha/${liveCampaigns[0].slug}/open`
    : "/";

  return (
    <YnotShell viewer={data.viewer}>
      <PageHeader
        eyebrow="09 · Profile · Packs & Rewards"
        title="My Profile"
        description="Your profile is now focused on opening packs, open history, reward history, and collection only. Personal details live on the separate Personal Info page."
        action={
          <Link
            className="gold-button rounded-2xl px-5 py-3 text-sm font-black"
            href={openHref}
          >
            Open pack
          </Link>
        }
      />

      {params?.error && (
        <p className="rounded-2xl border border-red-300/25 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-100">
          {params.error}
        </p>
      )}
      {params?.message && (
        <p className="rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-100">
          {params.message}
        </p>
      )}

      <div className="profile-dashboard profile-rewards-page">
        <section className="profile-command-card profile-rewards-hero">
          <div className="profile-command-identity">
            <span className="profile-command-avatar" aria-hidden="true">
              {data.viewer.displayName.charAt(0).toUpperCase()}
            </span>
            <div>
              <p className="profile-kicker">Pack profile</p>
              <h2>{data.viewer.displayName}</h2>
              <div className="profile-badge-row">
                <span>{openedPackCount.toLocaleString()} packs opened</span>
                <span>{ownedCards.length.toLocaleString()} owned cards</span>
              </div>
            </div>
          </div>
          <div className="profile-command-stats" aria-label="Pack summary">
            <Link href={openHref}>
              <span>Open pack</span>
              <strong>{liveCampaigns.length}</strong>
            </Link>
            <a href="#profile-activity-tabs">
              <span>History</span>
              <strong>{data.gachaOpens.length}</strong>
            </a>
            <a href="#profile-activity-tabs">
              <span>Rewards</span>
              <strong>{rewardHistory.length}</strong>
            </a>
            <a href="#profile-activity-tabs">
              <span>Collection</span>
              <strong>{data.collection.length}</strong>
            </a>
          </div>
        </section>

        <ProfileRewardsTabs
          collection={data.collection}
          gachaOpens={data.gachaOpens}
        />

        <section className="profile-shortcut-panel profile-open-packs">
          <div className="profile-section-head">
            <span>Opening pack</span>
            <strong>Continue opening live packs</strong>
          </div>
          {liveCampaigns.length ? (
            <div className="profile-pack-grid">
              {liveCampaigns.map((campaign) => (
                <Link
                  key={campaign.id}
                  className="profile-pack-card"
                  href={`/gacha/${campaign.slug}/open`}
                >
                  <span>{campaign.series === "pokemon" ? "PSA" : "OP"}</span>
                  <strong>{campaign.titleEn || campaign.titleTh}</strong>
                  <em>
                    {campaign.costCoins.toLocaleString()} coins ·{" "}
                    {campaign.remainingSlots ?? 0}/{campaign.totalSlots} left
                  </em>
                </Link>
              ))}
            </div>
          ) : (
            <div className="profile-empty-note">
              No live pack is available yet. Come back when an admin publishes
              the next pack.
            </div>
          )}
        </section>
      </div>
    </YnotShell>
  );
}
