"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { signOutAction } from "@/features/auth/actions";
import { CoinPip, Ico, formatCoins } from "./Icons";
import { ToastProvider, useToast } from "./UiKit";

import "./theme.css";

export type ShellViewer = {
  displayName: string;
  email?: string;
  vipTier?: string | null;
  authenticated: boolean;
};

export type ShellProps = {
  viewer: ShellViewer;
  balanceCoins: number;
  collectionCount: number;
  children: ReactNode;
};

function TopBar({
  viewer,
  balanceCoins,
  collectionCount,
}: {
  viewer: ShellViewer;
  balanceCoins: number;
  collectionCount: number;
}) {
  const { toast } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname() ?? "/";

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (
        menuRef.current &&
        e.target instanceof Node &&
        !menuRef.current.contains(e.target)
      ) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const initial = (viewer.displayName || "Y").charAt(0).toUpperCase();
  const isYpack = pathname === "/" || pathname.startsWith("/packs");
  const menuItems: {
    href: string;
    label: string;
    icon: Parameters<typeof Ico>[0]["name"];
    sub: string;
  }[] = [
    {
      href: "/wallet",
      label: "Wallet",
      icon: "coin",
      sub: `${formatCoins(balanceCoins)} coins`,
    },
    {
      href: "/profile",
      label: "Card history",
      icon: "history",
      sub: `${collectionCount} cards`,
    },
    {
      href: "/profile/personal-info",
      label: "Personal info",
      icon: "user",
      sub: viewer.email ?? "—",
    },
  ];

  return (
    <header className="cr-topbar">
      <div className="cr-topbar-left">
        <Link href="/packs" className="cr-brand">
          <span className="cr-brand-y">Y</span>
          <span className="cr-brand-name">YNOTT</span>
        </Link>
        <nav className="cr-topbar-nav" aria-label="Main">
          <Link href="/packs" className={isYpack ? "active" : ""}>
            Y-Packs
          </Link>
          <Link
            href="/marketplace"
            className={pathname.startsWith("/marketplace") ? "active" : ""}
          >
            Marketplace
          </Link>
        </nav>
      </div>
      <div className="cr-topbar-right">
        <Link
          href="/wallet"
          className="cr-coin-pill"
          aria-label={`Balance ${formatCoins(balanceCoins)} coins. Open wallet.`}
        >
          <span className="dot" aria-hidden />
          <span className="cr-tnum">{formatCoins(balanceCoins)}</span>
          <Ico name="plus" size={12} />
        </Link>
        <button
          type="button"
          className="cr-icon-btn"
          aria-label="Notifications"
          onClick={() => toast("info", "No new notifications")}
        >
          <Ico name="bell" size={16} />
        </button>
        <div className="cr-menu-wrap" ref={menuRef}>
          <button
            type="button"
            className={`cr-avatar-btn ${menuOpen ? "active" : ""}`}
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span className="cr-avatar-sm">{initial}</span>
            <Ico name="chev-d" size={12} />
          </button>
          {menuOpen && (
            <div className="cr-menu" role="menu">
              <div className="cr-menu-head">
                <span className="cr-avatar-lg">{initial}</span>
                <div>
                  <strong>{viewer.displayName}</strong>
                  <small>{viewer.email ?? "—"}</small>
                  {viewer.vipTier && (
                    <span
                      className="cr-pill cr-pill-mint"
                      style={{ marginTop: 6 }}
                    >
                      VIP · {viewer.vipTier}
                    </span>
                  )}
                </div>
              </div>
              <div className="cr-menu-list">
                {menuItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="cr-menu-item"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                  >
                    <span className="ico">
                      <Ico name={item.icon} size={16} />
                    </span>
                    <span
                      className="cr-stack"
                      style={{ gap: 0, flex: 1, textAlign: "left" }}
                    >
                      <strong>{item.label}</strong>
                      <small className="cr-mute">{item.sub}</small>
                    </span>
                    <Ico name="chev-r" size={14} />
                  </Link>
                ))}
              </div>
              <div className="cr-menu-foot">
                <form action={signOutAction}>
                  <button
                    type="submit"
                    className="cr-menu-item subtle"
                    role="menuitem"
                    style={{ width: "100%" }}
                  >
                    <span className="ico">
                      <Ico name="logout" size={14} />
                    </span>
                    <span style={{ flex: 1, textAlign: "left" }}>Sign out</span>
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export function Shell({
  viewer,
  balanceCoins,
  collectionCount,
  children,
}: ShellProps) {
  return (
    <div className="cr-root">
      <ToastProvider>
        <div className="cr-app">
          <TopBar
            viewer={viewer}
            balanceCoins={balanceCoins}
            collectionCount={collectionCount}
          />
          {children}
        </div>
      </ToastProvider>
    </div>
  );
}

export { CoinPip, formatCoins };
