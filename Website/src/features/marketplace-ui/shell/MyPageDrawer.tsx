"use client";

import Link from "next/link";
import { useEffect } from "react";
import { MpBadge } from "../shared/MpPrimitives";
import { MpIcon } from "../shared/MpIcon";
import { formatNumber } from "../shared/money";

/**
 * Slide-in "My page" account drawer — visuals ported from the design
 * prototype's MyPageDrawer (/Users/pinkmerry/Downloads/ynott/project/
 * marketplace-proto-1.jsx:61-125), rewired to the real signed-in viewer,
 * wallet balance, and bag summary instead of the prototype's mock state.
 *
 * Rendered via next/dynamic({ ssr: false }) from MyPageTrigger.tsx since the
 * drawer is interaction-gated (opens on avatar click) and shouldn't ship in
 * the marketplace route's first-load bundle.
 */

export interface MyPageDrawerProps {
  open: boolean;
  onClose: () => void;
  displayName: string;
  balanceCoins: number;
  isAdmin: boolean;
  pendingActionCount: number;
  signOutAction: (formData: FormData) => void | Promise<void>;
}

export function MyPageDrawer({
  open,
  onClose,
  displayName,
  balanceCoins,
  isAdmin,
  pendingActionCount,
  signOutAction,
}: MyPageDrawerProps) {
  // Escape closes the drawer, mirroring the storefront's existing
  // store-profile-drawer keyboard behavior.
  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose]);

  return (
    <>
      <div
        className="mp-drawer-backdrop"
        data-open={open}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className="mp-drawer"
        data-open={open}
        role="dialog"
        aria-modal="true"
        aria-label="My page"
        aria-hidden={!open}
      >
        <div className="mp-row">
          <span className="mp-eyebrow">My page</span>
          <span className="mp-spacer" />
          <button
            type="button"
            className="mp-icon-btn mp-drawer-close"
            onClick={onClose}
            aria-label="Close my page"
          >
            <MpIcon name="x" size={16} />
          </button>
        </div>

        <div className="mp-row mp-drawer-identity">
          <span className="mp-drawer-identity-avatar">
            <MpIcon name="user" size={22} />
          </span>
          <div className="mp-stack mp-drawer-identity-text">
            <span className="mp-drawer-identity-name">{displayName}</span>
            <Link
              href="/profile/personal-info"
              className="mp-drawer-identity-edit"
              onClick={onClose}
            >
              Edit profile
            </Link>
          </div>
        </div>

        <div className="mp-stack mp-drawer-balance">
          <span className="mp-drawer-balance-label">Balance</span>
          <div className="mp-row">
            <span className="mp-row mp-drawer-balance-coin">
              <span className="mp-coin" aria-hidden="true" />
              <span>Coins</span>
            </span>
            <span className="mp-spacer" />
            <span className="mp-mono mp-drawer-balance-value">
              {formatNumber(balanceCoins)}
            </span>
            <Link
              href="/wallet"
              className="mp-drawer-topup"
              aria-label="Top up coins"
              onClick={onClose}
            >
              <MpIcon name="plus" size={15} strokeWidth={2.4} />
            </Link>
          </div>
        </div>

        <hr className="mp-hairline mp-drawer-hairline" />

        <nav className="mp-stack mp-drawer-nav" aria-label="My page">
          <Link href="/marketplace/orders" className="mp-drawer-link" onClick={onClose}>
            My buying &amp; selling
            {pendingActionCount > 0 ? (
              <MpBadge kind="sold">
                {pendingActionCount} action{pendingActionCount === 1 ? "" : "s"}
              </MpBadge>
            ) : null}
          </Link>
          <Link href="/wallet" className="mp-drawer-link" onClick={onClose}>
            Wallet
          </Link>
          <Link href="/profile/personal-info" className="mp-drawer-link" onClick={onClose}>
            Personal info
          </Link>
          <Link href="/collection" className="mp-drawer-link" onClick={onClose}>
            Card history
          </Link>
          {isAdmin ? (
            <Link href="/admin/marketplace" className="mp-drawer-link" onClick={onClose}>
              Admin console
            </Link>
          ) : null}
        </nav>

        <span className="mp-spacer" />

        <div className="mp-stack mp-drawer-foot">
          <form action={signOutAction}>
            <button type="submit" className="mp-drawer-link mp-drawer-logout">
              Log out
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
