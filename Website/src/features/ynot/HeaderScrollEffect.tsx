"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const COLLAPSE_AFTER_PX = 80;
const SCROLL_DOWN_TRIGGER_PX = 1;
const SCROLL_UP_TRIGGER_PX = 1;
const BOTTOM_GUARD_PX = 120;
const AT_TOP_ENTER_PX = 2;
const AT_TOP_EXIT_PX = 14;

export function HeaderScrollEffect() {
  const pathname = usePathname();

  useEffect(() => {
    const isHome = pathname === "/";
    document.documentElement.dataset.ynotRouteHome = isHome ? "true" : "false";

    let lastY = Math.max(0, window.scrollY);
    let ticking = false;
    let collapsed = false;
    let atTop = false;

    const setCollapsed = (value: boolean) => {
      if (collapsed === value) return;
      collapsed = value;
      document.documentElement.dataset.headerCollapsed = value ? "true" : "false";
    };

    const setAtTop = (value: boolean) => {
      if (atTop === value) return;
      atTop = value;
      document.documentElement.dataset.headerAtTop = value ? "true" : "false";
    };

    const apply = () => {
      ticking = false;
      const y = Math.max(0, window.scrollY);
      const max = Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight,
      );
      const nearBottom = max > 0 && y >= max - BOTTOM_GUARD_PX;
      const diff = y - lastY;

      setAtTop(atTop ? y <= AT_TOP_EXIT_PX : y <= AT_TOP_ENTER_PX);

      if (y < COLLAPSE_AFTER_PX) {
        setCollapsed(false);
      } else if (nearBottom) {
        // Freeze state near the bottom to avoid bounce-back jitter.
      } else if (diff > SCROLL_DOWN_TRIGGER_PX) {
        setCollapsed(true);
      } else if (diff < -SCROLL_UP_TRIGGER_PX) {
        setCollapsed(false);
      }

      lastY = y;
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(apply);
      }
    };

    apply();
    window.addEventListener("scroll", onScroll, { passive: true });

    // Measure the storefront header height and publish it as a CSS custom
    // property so the mobile drawer can anchor itself directly below the
    // brand bar. Re-measure whenever the header resizes (e.g. collapses on
    // scroll) using a ResizeObserver.
    const header = document.querySelector<HTMLElement>(".storefront-header");
    let resizeObserver: ResizeObserver | null = null;
    const publishHeight = () => {
      if (!header) return;
      const rect = header.getBoundingClientRect();
      document.documentElement.style.setProperty(
        "--ynot-header-height",
        `${Math.round(rect.height)}px`,
      );
    };
    if (header) {
      publishHeight();
      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(publishHeight);
        resizeObserver.observe(header);
      }
      window.addEventListener("resize", publishHeight);
    }

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", publishHeight);
      resizeObserver?.disconnect();
      document.documentElement.style.removeProperty("--ynot-header-height");
      delete document.documentElement.dataset.headerCollapsed;
      delete document.documentElement.dataset.headerAtTop;
      delete document.documentElement.dataset.ynotRouteHome;
    };
  }, [pathname]);

  return null;
}
