"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Reads `?message=...` and `?error=...` query params from the URL and renders
 * a dismissible banner. After mount it clears those params from the URL so the
 * banner doesn't reappear when the user refreshes or navigates back. Designed
 * for redirect-target pages that ride success/failure messages from OAuth
 * callbacks (LINE, Google, email OTP).
 */
export function FlashBanner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Snapshot the initial flash values during the first render. Subsequent
  // re-renders (after we clear the URL params in the effect below) won't
  // re-read them, so the banner stays put until the user dismisses it.
  const [message, setMessage] = useState<string | null>(() =>
    searchParams.get("message"),
  );
  const [error, setError] = useState<string | null>(() =>
    searchParams.get("error"),
  );

  useEffect(() => {
    if (!searchParams.get("message") && !searchParams.get("error")) return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete("message");
    next.delete("error");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    // Only run on mount — we cleared the params, so subsequent renders are
    // guaranteed to not re-trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!message && !error) return null;

  return (
    <div
      role="status"
      className={
        error
          ? "mb-3 rounded-2xl border border-red-300/30 bg-red-400/10 px-4 py-3 text-sm font-semibold text-red-100"
          : "mb-3 rounded-2xl border border-emerald-300/30 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-100"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <span>{error ?? message}</span>
        <button
          type="button"
          aria-label="Dismiss"
          className="rounded-full px-2 py-0.5 text-xs font-bold opacity-80 hover:opacity-100"
          onClick={() => {
            setMessage(null);
            setError(null);
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
