import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { MpIcon } from "../shared/MpIcon";

/**
 * Marketplace admin console shell -- sidebar nav + content slot. Ported
 * from marketplace-admin-1.jsx's AdminShell (prototype:
 * /Users/pinkmerry/Downloads/ynott/project/marketplace-admin-1.jsx:23-42).
 *
 * The prototype drives the sidebar off client-side tab state
 * (tab/setTab, a single-page mock). This is a real multi-page admin
 * console: every nav item is a Link to its own route, and the caller
 * passes which one is active via the `active` prop -- server components
 * can't read the current pathname portably.
 */

export type AdminNavId =
  | "overview"
  | "orders"
  | "verify"
  | "listings"
  | "moderation"
  | "disputes"
  | "payouts"
  | "settings";

interface AdminNavItem {
  id: AdminNavId;
  label: string;
  href: string;
  icon: string;
  /**
   * True for nav areas that have no admin route at all yet (no folder
   * under src/app/admin/marketplace/). Rendered as a real Link pointing
   * at the future path anyway -- Next 404s until a later task builds the
   * screen, which is acceptable mid-phase -- with a small "Soon" tag.
   */
  soon?: boolean;
}

interface AdminNavGroup {
  label: string;
  items: AdminNavItem[];
}

// "Real" routes below already have a working detail page under their
// segment (orders/[orderId], seller-submissions/[submissionId],
// listings/[listingId]) even though the bare list page at the segment
// root ships in a later task -- that's what "leave them working, later
// tasks rebuild them" refers to. Moderation and disputes now have real
// routes too (ModerationScreen/DisputesScreen). Payouts/settings still
// have no admin/marketplace route at all yet, so those stay `soon`.
const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    label: "Marketplace",
    items: [
      { id: "overview", label: "Overview", href: "/admin/marketplace", icon: "home" },
      { id: "orders", label: "Orders & escrow", href: "/admin/marketplace/orders", icon: "bag" },
      { id: "verify", label: "Verification queue", href: "/admin/marketplace/seller-submissions", icon: "shield" },
      { id: "listings", label: "Listings", href: "/admin/marketplace/listings", icon: "store" },
      { id: "moderation", label: "Reported listings", href: "/admin/marketplace/moderation", icon: "filter" },
      { id: "disputes", label: "Disputes & refunds", href: "/admin/marketplace/disputes", icon: "swap" },
    ],
  },
  {
    label: "Money",
    items: [
      { id: "payouts", label: "Seller payouts", href: "/admin/marketplace/payouts", icon: "swap", soon: true },
    ],
  },
  {
    label: "Shop",
    items: [
      { id: "settings", label: "Fees & settings", href: "/admin/marketplace/settings", icon: "tag", soon: true },
    ],
  },
];

export interface AdminShellProps {
  active: AdminNavId;
  children: ReactNode;
}

export function AdminShell({ active, children }: AdminShellProps) {
  return (
    <div className="mpa-shell">
      <aside className="mpa-side">
        <span className="brand">
          YNOTT <small>MARKET ADMIN</small>
        </span>
        {ADMIN_NAV_GROUPS.map((group) => (
          <Fragment key={group.label}>
            <span className="grp">{group.label}</span>
            {group.items.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                prefetch={false}
                className={`mpa-nav-item${active === item.id ? " on" : ""}`}
              >
                <MpIcon name={item.icon} size={14} />
                {item.label}
                {item.soon ? <span className="n">Soon</span> : null}
              </Link>
            ))}
          </Fragment>
        ))}
        <span className="mpa-side-spacer" />
        <Link href="/marketplace" prefetch={false} className="mpa-nav-item">
          <MpIcon name="chev-l" size={14} />
          Back to marketplace
        </Link>
      </aside>
      <main className="mpa-main">{children}</main>
    </div>
  );
}
