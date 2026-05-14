"use client";

import { useEffect } from "react";

const COLLAPSE_AFTER_PX = 80;
const SCROLL_DOWN_TRIGGER_PX = 1;
const SCROLL_UP_TRIGGER_PX = 1;
const BOTTOM_GUARD_PX = 120;

export function HeaderScrollEffect() {
  useEffect(() => {
    let lastY = Math.max(0, window.scrollY);
    let ticking = false;
    let collapsed = false;

    const setCollapsed = (value: boolean) => {
      if (collapsed === value) return;
      collapsed = value;
      document.documentElement.dataset.headerCollapsed = value ? "true" : "false";
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
    return () => {
      window.removeEventListener("scroll", onScroll);
      delete document.documentElement.dataset.headerCollapsed;
    };
  }, []);

  return null;
}
