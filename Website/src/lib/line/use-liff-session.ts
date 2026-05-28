"use client";

import { useCallback, useEffect, useState } from "react";

type LiffProfile = {
  profileId: string;
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
const primaryLiffUrl = "https://liff.ynotopen.com";
const websiteHosts = new Set(["ynotopen.com", "www.ynotopen.com"]);
type LiffClient = Awaited<typeof import("@line/liff")>["default"];

function redirectWebsiteHostToLiff() {
  if (typeof window === "undefined") return false;

  const currentUrl = new URL(window.location.href);
  if (!websiteHosts.has(currentUrl.hostname)) return false;

  const liffUrl = new URL(primaryLiffUrl);
  currentUrl.protocol = liffUrl.protocol;
  currentUrl.host = liffUrl.host;
  currentUrl.search = "";
  currentUrl.hash = "";
  window.location.replace(currentUrl.href);
  return true;
}

async function clearServerSession() {
  try {
    await fetch("/api/line/session", { method: "DELETE", cache: "no-store" });
  } catch {
    // A stale server cookie should never block the client from logging out.
  }
}

function getLiffRedirectUri() {
  if (typeof window === "undefined") return primaryLiffUrl;

  const currentUrl = new URL(window.location.href);
  currentUrl.search = "";
  currentUrl.hash = "";

  if (currentUrl.hostname === "localhost" || currentUrl.hostname === "127.0.0.1") {
    return currentUrl.href;
  }

  if (websiteHosts.has(currentUrl.hostname)) {
    const liffUrl = new URL(primaryLiffUrl);
    currentUrl.protocol = liffUrl.protocol;
    currentUrl.host = liffUrl.host;
  }

  return currentUrl.href;
}

function openLiffUrl() {
  if (!liffId || typeof window === "undefined") return;
  window.location.href = `https://liff.line.me/${liffId}`;
}

async function syncServerSession(liff: LiffClient) {
  const idToken = liff.getIDToken();
  if (!idToken) {
    await clearServerSession();
    throw new Error("LINE LIFF is missing the openid scope.");
  }

  const response = await fetch("/api/line/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken }),
  });

  type LiffSessionResponse = LiffProfile & {
    error?: string;
    code?: "line_already_linked" | "line_email_belongs_to_existing_account";
    emailHint?: string;
  };
  const session = (await response.json().catch(() => null)) as LiffSessionResponse | null;
  if (!response.ok || !session?.profileId) {
    await clearServerSession();
    // The server already produced a friendly message; surface it verbatim so
    // the LIFF UI can render it without re-mapping codes here.
    throw new Error(session?.error ?? "LINE connection could not be saved.");
  }

  return session;
}

export function useLiffSession(): LiffSessionState {
  const [status, setStatus] = useState<LiffSessionState["status"]>("loading");
  const [profile, setProfile] = useState<LiffProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async () => {
    if (redirectWebsiteHostToLiff()) return;

    try {
      if (!liffId) {
        setError("LINE LIFF ID is not configured.");
        setStatus("ready");
        return;
      }

      setError(null);
      setStatus("loading");
      const { default: liff } = await import("@line/liff");
      await liff.init({ liffId, withLoginOnExternalBrowser: true });

      if (!liff.isLoggedIn()) {
        liff.login({ redirectUri: getLiffRedirectUri() });
        return;
      }

      const session = await syncServerSession(liff);
      setProfile(session);
      setStatus("authenticated");
    } catch (reason) {
      setProfile(null);
      setError(reason instanceof Error ? reason.message : "LINE connection failed.");
      setStatus("error");
      openLiffUrl();
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
        if (redirectWebsiteHostToLiff()) return;

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

        const session = await syncServerSession(liff);
        if (!active) return;

        setProfile(session);
        setError(null);
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
