"use client";

import { useEffect, useState } from "react";

import { AdminCategoryForm } from "@/features/ynot/client";
import { AdminCategoryManager } from "@/features/ynot/components";
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

export function AdminCategoryWorkspace({
  campaigns,
  initialCategories,
}: AdminCategoryWorkspaceProps) {
  const [categories, setCategories] = useState(() =>
    sortAdminCategories(initialCategories),
  );

  useEffect(() => {
    setCategories(sortAdminCategories(initialCategories));
  }, [initialCategories]);

  function handleCategorySaved(category: YnotCategory) {
    setCategories((current) => {
      const withoutSaved = current.filter(
        (item) => item.id !== category.id && item.slug !== category.slug,
      );
      return sortAdminCategories([...withoutSaved, category]);
    });
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
