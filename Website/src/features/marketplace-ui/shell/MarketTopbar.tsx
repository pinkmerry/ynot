import Link from "next/link";
import { MpIcon } from "../shared/MpIcon";
import { formatNumber } from "../shared/money";
import { MyPageTrigger } from "./MyPageTrigger";

/**
 * Marketplace redesign topbar — visuals ported from the design prototype's
 * ProtoTopbar (/Users/pinkmerry/Downloads/ynott/project/
 * marketplace-proto-1.jsx:128-152), rewired to real nav hrefs, the real
 * admin session, the real wallet balance, and the real bag summary instead
 * of the prototype's mock `go()`/`toast()` handlers.
 *
 * Server component: only the avatar button + drawer (MyPageTrigger) cross
 * the client boundary. The prototype's notification icon-button is omitted
 * entirely — there is no notification backend behind it (see the
 * prototype's dead "Notifications" toast handler), so it would ship as a
 * non-functional control.
 */

export interface MarketTopbarProps {
  isAdmin: boolean;
  isAuthenticated: boolean;
  displayName: string;
  balanceCoins: number;
  pendingActionCount: number;
  signOutAction: (formData: FormData) => void | Promise<void>;
}

function avatarInitial(displayName: string) {
  const trimmed = displayName.trim();
  return trimmed ? trimmed[0]!.toUpperCase() : "?";
}

export function MarketTopbar({
  isAdmin,
  isAuthenticated,
  displayName,
  balanceCoins,
  pendingActionCount,
  signOutAction,
}: MarketTopbarProps) {
  return (
    <div className="mp-topbar">
      <div className="mp-row" style={{ gap: 26 }}>
        <nav className="mp-nav" aria-label="Main navigation">
          <Link href="/">Home</Link>
          <Link href="/ynot">Y-Pack</Link>
          <Link href="/marketplace" className="active">
            Marketplace
          </Link>
        </nav>
      </div>
      <Link href="/marketplace" className="mp-brand">
        YNOTT
      </Link>
      <div className="mp-row" style={{ gap: 12 }}>
        {isAdmin ? (
          <Link href="/admin/marketplace" className="mp-admin-link">
            <MpIcon name="shield" size={11} /> Admin console
          </Link>
        ) : null}
        {isAuthenticated ? (
          <span className="mp-coin-pill">
            <span className="mp-coin" aria-hidden="true" />
            {formatNumber(balanceCoins)}
          </span>
        ) : null}
        {isAuthenticated ? (
          <MyPageTrigger
            displayName={displayName}
            avatarInitial={avatarInitial(displayName)}
            balanceCoins={balanceCoins}
            isAdmin={isAdmin}
            pendingActionCount={pendingActionCount}
            signOutAction={signOutAction}
          />
        ) : (
          <Link href="/login" className="mp-btn">
            Log in
          </Link>
        )}
      </div>
    </div>
  );
}
