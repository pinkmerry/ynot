"use client";

import { useEffect } from "react";
import type { MutableRefObject } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function useLuckyDrawRealtime(databaseReady: boolean, onRefreshRef: MutableRefObject<() => void>) {
  useEffect(() => {
    if (!databaseReady) return;

    let channel: ReturnType<ReturnType<typeof createBrowserSupabaseClient>["channel"]> | null = null;
    try {
      const supabase = createBrowserSupabaseClient();
      channel = supabase
        .channel("lucky-draw-live-refresh")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "lucky_draw_realtime_events" },
          () => onRefreshRef.current(),
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "app_realtime_events" },
          () => onRefreshRef.current(),
        )
        .subscribe();
    } catch {
      return;
    }

    return () => {
      if (channel) void channel.unsubscribe();
    };
  }, [databaseReady, onRefreshRef]);
}
