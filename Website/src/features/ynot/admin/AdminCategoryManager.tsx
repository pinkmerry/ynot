"use client";

import Link from "next/link";

import { AdminCategoryRowActions } from "@/features/ynot/StorefrontAdminControls";
import type { YnotCampaign, YnotCategory } from "@/features/ynot/types";

const fallbackCategoryCards = [
  {
    series: "pokemon",
    title: "Pokemon",
    subtitle: "PSA10, Japanese chase cards, sealed pack campaigns",
    accent: "⚡",
  },
  {
    series: "one_piece",
    title: "One Piece",
    subtitle: "Manga rare, leader parallel, treasure box campaigns",
    accent: "☠️",
  },
] as const;

export function AdminCategoryManager({
  campaigns,
  categories = [],
}: {
  campaigns: YnotCampaign[];
  categories?: YnotCategory[];
}) {
  const futureCategories = [
    {
      title: "Pop Mart",
      body: "Add only after the shared categories table is live for the website storefront.",
    },
    {
      title: "Hobby",
      body: "Use the same future contract for image, sort order, hide/show, and labels.",
    },
  ];

  const visibleCategories = categories.length
    ? categories
    : fallbackCategoryCards.map(
        (category) =>
          ({
            id: category.series,
            slug: category.series,
            nameTh: category.title,
            nameEn: category.title,
            description: category.subtitle,
            icon: category.accent,
            legacySeries: category.series,
            sortOrder: 0,
            isActive: true,
            isTest: false,
          }) satisfies YnotCategory,
      );

  return (
    <div className="admin-category-page">
      <section className="admin-category-intro soft-card">
        <div>
          <p className="admin-kicker">Category Manager</p>
          <h3>Active storefront categories</h3>
          <p>
            Categories now come from the shared database when the production
            readiness migration is applied. Pokemon and One Piece remain
            backward compatible through <strong>draw_rounds.series</strong>.
          </p>
        </div>
        <Link className="secondary-action compact" href="/admin/campaigns">
          Open Random Pack Studio
        </Link>
      </section>

      <section
        className="admin-clean-section"
        aria-labelledby="admin-active-categories-title"
      >
        <div className="admin-section-title">
          <span id="admin-active-categories-title">Active categories</span>
          <p>These are live-safe now and already used by customer filters.</p>
        </div>
        <div className="admin-category-list">
          {visibleCategories.map((category) => {
            const categoryCampaigns = campaigns.filter(
              (campaign) =>
                campaign.categoryIds?.includes(category.id) ||
                campaign.categorySlugs?.includes(category.slug) ||
                (category.legacySeries &&
                  campaign.series === category.legacySeries),
            );
            const publicLive = categoryCampaigns.filter(
              (campaign) =>
                campaign.status === "live" && campaign.visibility === "public",
            ).length;
            return (
              <article
                className="admin-category-clean-card soft-card"
                key={category.id}
              >
                <div className="admin-category-clean-icon" aria-hidden>
                  {category.icon ?? "✨"}
                </div>
                <div className="admin-category-clean-body">
                  <span>
                    {category.isActive ? "Active" : "Hidden"}
                    {category.isTest ? " · TEST" : ""}
                  </span>
                  <h3>{category.nameEn}</h3>
                  <p>{category.description ?? category.nameTh}</p>
                  <dl>
                    <div>
                      <dt>Total packs</dt>
                      <dd>{categoryCampaigns.length}</dd>
                    </div>
                    <div>
                      <dt>Live public</dt>
                      <dd>{publicLive}</dd>
                    </div>
                    <div>
                      <dt>DB value</dt>
                      <dd>
                        <code>{category.slug}</code>
                      </dd>
                    </div>
                  </dl>
                </div>
                <div className="admin-category-clean-actions">
                  <Link
                    className="secondary-action compact"
                    href={
                      category.legacySeries
                        ? `/packs?series=${category.legacySeries}`
                        : `/packs?category=${category.slug}`
                    }
                  >
                    Preview storefront
                  </Link>
                  <AdminCategoryRowActions
                    categoryId={category.id}
                    categoryName={category.nameEn || category.nameTh}
                    categorySlug={category.slug}
                    isLegacySeries={Boolean(category.legacySeries)}
                    packCount={categoryCampaigns.length}
                  />
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section
        className="admin-clean-section"
        aria-labelledby="admin-future-categories-title"
      >
        <div className="admin-section-title">
          <span id="admin-future-categories-title">Future categories</span>
          <p>
            The UI is ready for these, but saving them waits for the shared DB
            migration and API contract.
          </p>
        </div>
        <div className="admin-category-list compact">
          {futureCategories.map((category) => (
            <article className="admin-category-clean-card soft-card" key={category.title}>
              <div className="admin-category-clean-body">
                <span>Future</span>
                <h3>{category.title}</h3>
                <p>{category.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
