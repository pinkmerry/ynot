"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { YnotCollectionItem, YnotGachaOpenHistory } from "./types";

type ProfileTabId = "collection" | "opening-history" | "reward-history";

type RewardHistoryItem = YnotGachaOpenHistory["rewards"][number] & {
  openCode: string;
  openedAt: string;
  campaignTitle: string;
};

const profileTabs: Array<{ id: ProfileTabId; label: string; eyebrow: string }> =
  [
    {
      id: "collection",
      label: "Collection",
      eyebrow: "Cards",
    },
    {
      id: "opening-history",
      label: "Opening history",
      eyebrow: "Packs",
    },
    {
      id: "reward-history",
      label: "Reward history",
      eyebrow: "Rewards",
    },
  ];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function ProfileRewardsTabs({
  collection,
  gachaOpens,
}: {
  collection: YnotCollectionItem[];
  gachaOpens: YnotGachaOpenHistory[];
}) {
  const [activeTab, setActiveTab] = useState<ProfileTabId>("collection");
  const rewardHistory = useMemo<RewardHistoryItem[]>(
    () =>
      gachaOpens
        .flatMap((open) =>
          open.rewards.map((reward) => ({
            ...reward,
            openCode: open.publicCode,
            openedAt: open.openedAt,
            campaignTitle: open.campaignTitle,
          })),
        )
        .slice(0, 8),
    [gachaOpens],
  );

  const counts: Record<ProfileTabId, number> = {
    collection: collection.length,
    "opening-history": gachaOpens.length,
    "reward-history": rewardHistory.length,
  };

  return (
    <section
      className="profile-tab-shell"
      id="profile-activity-tabs"
      aria-label="Profile activity"
    >
      <nav
        aria-label="Profile sections"
        className="profile-tab-menu"
        role="tablist"
      >
        {profileTabs.map((tab) => (
          <button
            key={tab.id}
            aria-controls={`profile-tab-panel-${tab.id}`}
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? "active" : ""}
            id={`profile-tab-${tab.id}`}
            role="tab"
            type="button"
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.eyebrow}</span>
            <strong>{tab.label}</strong>
            <em>{counts[tab.id].toLocaleString()}</em>
          </button>
        ))}
      </nav>

      <div
        aria-labelledby={`profile-tab-${activeTab}`}
        className="profile-tab-panel"
        id={`profile-tab-panel-${activeTab}`}
        role="tabpanel"
      >
        {activeTab === "collection" && (
          <section className="profile-shortcut-panel" id="collection-preview">
            <div className="profile-section-head profile-section-head-row">
              <div>
                <span>Collection</span>
                <strong>Your latest cards</strong>
              </div>
              <Link href="/collection">View all collection</Link>
            </div>
            {collection.length ? (
              <div className="profile-collection-preview-grid">
                {collection.slice(0, 8).map((item) => (
                  <Link
                    key={item.id}
                    className="profile-collection-card"
                    href="/collection"
                  >
                    <span>{item.cardCode ?? "CARD"}</span>
                    <strong>{item.cardName}</strong>
                    <em>
                      {item.status.replaceAll("_", " ")} ·{" "}
                      {formatDate(item.acquiredAt)}
                    </em>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="profile-empty-note">
                Your collection is empty. Open a pack to start collecting
                rewards.
              </div>
            )}
          </section>
        )}

        {activeTab === "opening-history" && (
          <section className="profile-panel" id="open-history">
            <div className="profile-section-head">
              <span>Opening history</span>
              <strong>Your pack opening timeline</strong>
            </div>
            {gachaOpens.length ? (
              <div className="profile-history-list">
                {gachaOpens.slice(0, 8).map((open) => (
                  <div key={open.id} className="profile-history-row">
                    <div>
                      <span>{open.publicCode}</span>
                      <strong>{open.campaignTitle}</strong>
                      <em>{formatDate(open.openedAt)}</em>
                    </div>
                    <div>
                      <b>{open.quantity}</b>
                      <small>{open.status}</small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="profile-empty-note">
                No opening history yet. Open your first pack to create history.
              </div>
            )}
          </section>
        )}

        {activeTab === "reward-history" && (
          <section className="profile-panel" id="reward-history">
            <div className="profile-section-head">
              <span>Reward history</span>
              <strong>Latest rewards from packs</strong>
            </div>
            {rewardHistory.length ? (
              <div className="profile-reward-list">
                {rewardHistory.map((reward) => (
                  <div key={reward.id} className="profile-reward-row">
                    <span>{reward.resultPosition}</span>
                    <div>
                      <strong>{reward.cardName}</strong>
                      <em>
                        {reward.tier ?? "reward"} · {reward.openCode} ·{" "}
                        {formatDate(reward.openedAt)}
                      </em>
                    </div>
                    <b>
                      {reward.valueThb
                        ? `฿${reward.valueThb.toLocaleString()}`
                        : "—"}
                    </b>
                  </div>
                ))}
              </div>
            ) : (
              <div className="profile-empty-note">
                Rewards will appear here after a successful pack opening.
              </div>
            )}
          </section>
        )}
      </div>
    </section>
  );
}
