"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { ComponentProps } from "react";

// Props are derived type-only from MyPageDrawer so this wrapper's static
// import graph never pulls in the drawer's runtime code (Link, MpBadge,
// MpIcon, formatNumber) — only the dynamic() call below does, and only
// once the avatar is clicked. Perf rule P2: interaction-gated UI should not
// ship in the marketplace route's first-load bundle.
type MyPageDrawerProps = ComponentProps<
  (typeof import("./MyPageDrawer"))["MyPageDrawer"]
>;

const MyPageDrawer = dynamic(
  () => import("./MyPageDrawer").then((mod) => ({ default: mod.MyPageDrawer })),
  { ssr: false },
);

export interface MyPageTriggerProps {
  displayName: string;
  avatarInitial: string;
  balanceCoins: number;
  isAdmin: boolean;
  pendingActionCount: number;
  signOutAction: MyPageDrawerProps["signOutAction"];
}

/**
 * Client island that owns the drawer's open/close state and renders the
 * avatar button. MarketTopbar (server component) renders this so the topbar
 * itself stays server-rendered while only this small trigger + the
 * dynamically-imported drawer body cross the client boundary.
 */
export function MyPageTrigger({
  displayName,
  avatarInitial,
  balanceCoins,
  isAdmin,
  pendingActionCount,
  signOutAction,
}: MyPageTriggerProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="mp-avatar mp-avatar-btn"
        onClick={() => setOpen(true)}
        aria-label={`Open my page for ${displayName}`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {avatarInitial}
      </button>
      <MyPageDrawer
        open={open}
        onClose={() => setOpen(false)}
        displayName={displayName}
        balanceCoins={balanceCoins}
        isAdmin={isAdmin}
        pendingActionCount={pendingActionCount}
        signOutAction={signOutAction}
      />
    </>
  );
}
