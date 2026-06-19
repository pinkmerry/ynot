"use client";

import { useMemo, useState } from "react";

import { AdminCategoryManager } from "@/features/ynot/admin/AdminCategoryManager";
import { AdminCategoryForm } from "@/features/ynot/client";
import type { YnotCampaign, YnotCategory } from "@/features/ynot/types";
import { AdminCard, AdminCardHead } from "@/features/ynot/admin";

type AdminCategoryWorkspaceProps = {
  campaigns: YnotCampaign[];
  initialCategories: YnotCategory[];
};

function sortAdminCategories(categories: YnotCategory[]) {
  return [...categories].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.nameEn.localeCompare(b.nameEn),
  );
}

function mergeSavedCategory(
  categories: YnotCategory[],
  category: YnotCategory,
) {
  const withoutSaved = categories.filter(
    (item) => item.id !== category.id && item.slug !== category.slug,
  );
  return sortAdminCategories([...withoutSaved, category]);
}

export function AdminCategoryWorkspace({
  campaigns,
  initialCategories,
}: AdminCategoryWorkspaceProps) {
  const sortedInitialCategories = useMemo(
    () => sortAdminCategories(initialCategories),
    [initialCategories],
  );
  const [savedCategories, setSavedCategories] = useState<YnotCategory[]>([]);
  const categories = useMemo(
    () =>
      savedCategories.reduce(
        (current, category) => mergeSavedCategory(current, category),
        sortedInitialCategories,
      ),
    [savedCategories, sortedInitialCategories],
  );

  function handleCategorySaved(category: YnotCategory) {
    setSavedCategories((current) =>
      mergeSavedCategory(current, category),
    );
  }

  return (
    <>
      <AdminCard>
        <AdminCardHead label="Create" title="New category" />
        <div className="card-pad">
          <AdminCategoryForm
            categories={categories}
            onSaved={handleCategorySaved}
          />
        </div>
      </AdminCard>

      <AdminCard>
        <AdminCardHead label="Order" title="Display order on /packs" />
        <div className="card-pad">
          <AdminCategoryManager campaigns={campaigns} categories={categories} />
        </div>
      </AdminCard>
    </>
  );
}
