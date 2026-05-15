"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * After a filter change preserves scroll (via <Link scroll={false}>), users
 * who were scrolled deep into the page might end up past the new (shorter)
 * content. This component snaps them back to the top of the campaign-grid
 * section, but ONLY when their current scroll position is below the grid's
 * bottom edge — otherwise position is preserved as expected.
 *
 * Mounted on the home page next to the grid.
 */
export function FilterScrollGuard() {
  const pathname = usePathname();
  const params = useSearchParams();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (pathname !== "/") return;

    const raf = window.requestAnimationFrame(() => {
      const grid =
        document.querySelector<HTMLElement>(".campaign-grid") ||
        document.querySelector<HTMLElement>(".home-pack-board");
      if (!grid) return;

      const rect = grid.getBoundingClientRect();
      const gridTop = rect.top + window.scrollY;
      const gridBottom = gridTop + rect.height;
      const viewportBottom = window.scrollY + window.innerHeight;

      // If the user is now scrolled past the grid's bottom edge (content
      // shrank under them), bring them back to the top of the grid.
      if (window.scrollY > gridBottom || viewportBottom > gridBottom + 200) {
        window.scrollTo({
          top: Math.max(0, gridTop - 80),
          behavior: "smooth",
        });
      }
    });

    return () => window.cancelAnimationFrame(raf);
  }, [pathname, params]);

  return null;
}
