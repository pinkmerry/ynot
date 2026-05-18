"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Sortable from "sortablejs";

/**
 * Pack reorder powered by SortableJS. We tried two flavours of native
 * drag-and-drop (HTML5 dragstart/drop and pointer events) but both
 * hit cross-browser quirks once Next/Link, anchors, and shrunk hit
 * targets were in the mix. SortableJS is a tiny vanilla library that
 * already abstracts away the painful bits — we just point it at the
 * featured row + the tier grids and trust it to fire onEnd with the
 * dropped item's id.
 */
export function PackDragDrop({ enabled = true }: { enabled?: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;

    const containers = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".packs-feature-row, .home-pack-board .campaign-grid",
      ),
    );
    if (!containers.length) return;

    const instances: Sortable[] = [];

    function isHeroContainer(container: HTMLElement) {
      return container.classList.contains("packs-feature-row");
    }

    async function postTierReorder(
      swaps: Array<{ id: string; sortOrder: number }>,
    ) {
      if (!swaps.length) return;
      try {
        await fetch("/api/ynot/admin/campaigns/reorder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ swaps }),
        });
      } finally {
        router.refresh();
      }
    }

    async function postHeroUpdate(
      payload:
        | { action: "add" | "remove"; id: string }
        | { ids: string[] },
    ) {
      try {
        await fetch("/api/ynot/admin/featured-packs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } finally {
        router.refresh();
      }
    }

    function collectHeroIds(container: HTMLElement): string[] {
      return Array.from(container.children)
        .filter(
          (el): el is HTMLElement =>
            el instanceof HTMLElement && !!el.dataset.packId,
        )
        .map((el) => el.dataset.packId!)
        .filter((id, index, all) => all.indexOf(id) === index);
    }

    function readSortOrder(el: HTMLElement | null): number | null {
      const raw = el?.dataset?.packSortOrder;
      if (!raw) return null;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    }

    function handleEnd(event: Sortable.SortableEvent) {
      const item = event.item;
      const id = item.dataset.packId;
      if (!id) return;
      const from = event.from as HTMLElement;
      const to = event.to as HTMLElement;

      // Hero and tier sections are persisted in completely separate
      // stores, so we route the drop result to the right endpoint based
      // on where the card landed.
      const heroDrop = isHeroContainer(to);
      const heroSource = isHeroContainer(from);

      if (heroDrop) {
        // Drop landed in the hero row — set the cookie to whatever ids
        // are currently in the row (preserves the visual order after
        // SortableJS finishes reorder).
        const ids = collectHeroIds(to);
        postHeroUpdate({ ids });
        return;
      }

      if (heroSource && !heroDrop) {
        // Card moved out of the hero row into a tier section — just
        // remove it from the hero cookie. Tier sort_order is untouched.
        postHeroUpdate({ action: "remove", id });
        return;
      }

      // Pure tier-to-tier reorder — swap the dropped card's sortOrder
      // with whichever neighbour it landed next to. Cards present in the
      // hero (and any other tiers) are NOT touched.
      const siblings = Array.from(to.children).filter(
        (el): el is HTMLElement =>
          el instanceof HTMLElement && !!el.dataset.packId,
      );
      const dropIndex = siblings.indexOf(item);
      const neighbour =
        siblings[dropIndex - 1] ?? siblings[dropIndex + 1] ?? null;
      const draggedSort = readSortOrder(item);
      const neighbourSort = readSortOrder(neighbour);
      if (
        neighbour &&
        draggedSort !== null &&
        neighbourSort !== null &&
        draggedSort !== neighbourSort
      ) {
        const nid = neighbour.dataset.packId;
        if (nid) {
          postTierReorder([
            { id, sortOrder: neighbourSort },
            { id: nid, sortOrder: draggedSort },
          ]);
        }
      }
    }

    for (const container of containers) {
      const sortable = Sortable.create(container, {
        group: { name: "ynot-packs", pull: true, put: true },
        animation: 150,
        ghostClass: "pack-sortable-ghost",
        chosenClass: "pack-sortable-chosen",
        dragClass: "pack-sortable-drag",
        filter:
          "button, a.pack-admin-edit, .pack-order-controls, .packs-feature-cta, .packs-feature-card--placeholder",
        preventOnFilter: false,
        // Items that can be dragged. The hero row wraps cards in
        // `.packs-feature-card-wrap[data-pack-id]` and the tier grid uses
        // `article.product-card[data-pack-id]` — both match this selector.
        draggable: "[data-pack-id]",
        onEnd: handleEnd,
      });
      instances.push(sortable);
    }

    return () => {
      for (const inst of instances) {
        inst.destroy();
      }
    };
  }, [enabled, router]);

  return null;
}
