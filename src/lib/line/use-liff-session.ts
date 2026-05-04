"use client";

import { useCallback, useEffect, useState } from "react";

type LiffProfile = {
  lineUserId: string;
  displayName: string;
  pictureUrl?: string;
  isAdmin?: boolean;
  adminRole?: "owner" | "admin" | "staff" | null;
};

type LiffSessionState = {
  status: "loading" | "ready" | "authenticated" | "error";
  profile: LiffProfile | null;
  error: string | null;
  login: () => Promise<void>;
  logout: () => void;
};

const liffId = process.env.NEXT_PUBLIC_LINE_LIFF_ID;
const primarySiteUrl = "https://www.ynottcg.com";

async function clearServerSession() {
  try {
    await fetch("/api/line/session", { method: "DELETE", cache: "no-store" });
  } catch {
    // A stale server cookie should never block the client from logging out.
  }
}

function getLiffRedirectUri() {
  if (typeof window === "undefined") return primarySiteUrl;

  const currentUrl = new URL(window.location.href);

  if (currentUrl.hostname === "localhost" || currentUrl.hostname === "127.0.0.1") {
    return currentUrl.href;
  }

  const primaryUrl = new URL(primarySiteUrl);
  currentUrl.protocol = primaryUrl.protocol;
  currentUrl.host = primaryUrl.host;
  return currentUrl.href;
}

export function useLiffSession(): LiffSessionState {
  const [status, setStatus] = useState<LiffSessionState["status"]>("loading");
  const [profile, setProfile] = useState<LiffProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async () => {
    if (!liffId) {
      setError("LINE LIFF ID is not configured.");
      setStatus("ready");
      return;
    }

    const { default: liff } = await import("@line/liff");
    await liff.init({ liffId, withLoginOnExternalBrowser: true });

    if (!liff.isLoggedIn()) {
      liff.login({ redirectUri: getLiffRedirectUri() });
    }
  }, []);

  const logout = useCallback(() => {
    void (async () => {
      try {
        const { default: liff } = await import("@line/liff");
        if (liff.isLoggedIn()) liff.logout();
      } finally {
        await clearServerSession();
        setProfile(null);
        setStatus("ready");
      }
    })();
  }, []);

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        if (!liffId) {
          setStatus("ready");
          return;
        }

        const { default: liff } = await import("@line/liff");
        await liff.init({ liffId, withLoginOnExternalBrowser: true });

        if (!active) return;

        if (!liff.isLoggedIn()) {
          await clearServerSession();
          if (!active) return;
          setProfile(null);
          setStatus("ready");
          return;
        }

        const idToken = liff.getIDToken();
        if (!idToken) {
          await clearServerSession();
          if (!active) return;
          setProfile(null);
          setStatus("ready");
          setError("LINE LIFF is missing the openid scope.");
          return;
        }

        const response = await fetch("/api/line/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ idToken }),
        });

        if (!response.ok) {
          await clearServerSession();
          throw new Error("LINE token verification failed.");
        }

        const session = (await response.json()) as LiffProfile;
        if (!active) return;

        setProfile(session);
        setStatus("authenticated");
      } catch (reason) {
        if (!active) return;
        setProfile(null);
        setError(reason instanceof Error ? reason.message : "LINE LIFF initialization failed.");
        setStatus("error");
      }
    }

    void initialize();

    return () => {
      active = false;
    };
  }, []);

  return { status, profile, error, login, logout };
}
