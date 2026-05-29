"use client";

import { useEffect } from "react";

/**
 * Auto-hides the window scrollbar on admin pages: the bar stays invisible at
 * rest and reveals a subtle rounded thumb while scrolling (removed ~700ms after
 * scrolling stops). Scoped by toggling a class on <html> only while an admin
 * page is mounted, so customer-facing pages keep the default scrollbar.
 */
export function AdminScrollbarAutoHide() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("admin-autohide-scroll");
    let timer: ReturnType<typeof setTimeout> | null = null;

    function onScroll() {
      root.classList.add("is-scrolling");
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => root.classList.remove("is-scrolling"), 700);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (timer) clearTimeout(timer);
      root.classList.remove("admin-autohide-scroll", "is-scrolling");
    };
  }, []);

  return null;
}
