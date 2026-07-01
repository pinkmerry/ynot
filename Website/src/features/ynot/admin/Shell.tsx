import Link from "next/link";
import type { ReactNode } from "react";
import { AdminIcon, type AdminIconName } from "./Icon";
import { AdminScrollbarAutoHide } from "./AdminScrollbarAutoHide";
import type { YnotViewer } from "../types";

type NavItem = {
  href: string;
  label: string;
  icon: AdminIconName;
  kbd?: string;
  badge?: number;
};

type AdminSurface = "gacha" | "marketplace";

const GACHA_NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Overview",
    items: [{ href: "/admin", label: "Dashboard", icon: "grid", kbd: "G D" }],
  },
  {
    group: "Pack studio",
    items: [
      { href: "/admin/campaigns", label: "Random packs", icon: "stack", kbd: "G P" },
      { href: "/admin/prizes", label: "Prize catalog", icon: "gift", kbd: "G C" },
      { href: "/admin/categories", label: "Categories", icon: "tag" },
      { href: "/admin/tier-animations", label: "Tier animations", icon: "sparkles" },
    ],
  },
  {
    group: "Operations",
    items: [
      { href: "/admin/top-ups", label: "Top-ups", icon: "coin" },
      { href: "/admin/shipping", label: "Shipping", icon: "truck" },
    ],
  },
  {
    group: "People",
    items: [
      { href: "/admin/users", label: "Users", icon: "users" },
      { href: "/admin/rankings", label: "Rankings", icon: "trophy" },
    ],
  },
  {
    group: "Platform",
    items: [
      { href: "/admin/settings", label: "Settings", icon: "sliders" },
      { href: "/admin/audit", label: "Audit log", icon: "shield" },
      { href: "/admin/health", label: "Health", icon: "pulse" },
    ],
  },
];

const MARKETPLACE_NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Marketplace",
    items: [
      { href: "/admin/marketplace", label: "Ops dashboard", icon: "grid", kbd: "M D" },
      { href: "/admin/marketplace#orders", label: "Order review", icon: "coin" },
      { href: "/admin/marketplace#sell-requests", label: "Sell requests", icon: "upload" },
      { href: "/admin/marketplace#payouts", label: "Seller payouts", icon: "swap" },
      { href: "/admin/marketplace#reconciliation", label: "Reconciliation", icon: "shield" },
    ],
  },
  {
    group: "Customer ops",
    items: [
      { href: "/admin/users", label: "Customers", icon: "users" },
      { href: "/admin/shipping", label: "Shipping", icon: "truck" },
    ],
  },
  {
    group: "Platform",
    items: [
      { href: "/admin/audit", label: "Audit log", icon: "shield" },
      { href: "/admin/health", label: "Health", icon: "pulse" },
      { href: "/admin/settings", label: "Settings", icon: "sliders" },
    ],
  },
];

const GACHA_PUBLIC_TOP_MENU = [
  { href: "/", label: "Home page", primary: true },
  { href: "/packs", label: "Y-Packs", primary: false },
  { href: "/marketplace", label: "Marketplace", primary: false },
] as const;

const MARKETPLACE_PUBLIC_TOP_MENU = [
  { href: "/marketplace", label: "Marketplace", primary: true },
  { href: "/marketplace/seller", label: "Seller desk", primary: false },
  { href: "/", label: "Home page", primary: false },
] as const;

function surfaceNav(surface: AdminSurface) {
  return surface === "marketplace" ? MARKETPLACE_NAV : GACHA_NAV;
}

function surfaceTopMenu(surface: AdminSurface, isOwner: boolean) {
  const items = surface === "marketplace"
    ? MARKETPLACE_PUBLIC_TOP_MENU
    : GACHA_PUBLIC_TOP_MENU;
  return items.filter((item) => isOwner || !item.href.startsWith("/marketplace"));
}

function Sidebar({
  active,
  viewer,
  badges,
  surface,
}: {
  active: string;
  viewer: YnotViewer;
  badges?: Partial<Record<string, number>>;
  surface: AdminSurface;
}) {
  const initials =
    (viewer.displayName ?? "U")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0])
      .join("")
      .toUpperCase() || "U";
  const nav = surfaceNav(surface);
  const brandHref = surface === "marketplace" ? "/admin/marketplace" : "/admin";
  const brandName = surface === "marketplace" ? "YNOT Marketplace" : "YNOT Admin";
  const brandEnvPrefix = surface === "marketplace" ? "Ops" : "Admin";
  return (
    <aside className="a-side" aria-label="Admin navigation">
      <Link href={brandHref} className="a-brand" prefetch={false}>
        <span className="a-brand-mark">Y</span>
        <span>
          <span className="a-brand-name">{brandName}</span>
          <span className="a-brand-env">
            {brandEnvPrefix} · {process.env.NODE_ENV === "production" ? "Production" : "Dev"} · TH
          </span>
        </span>
      </Link>
      {nav.map((group) => (
        <div className="a-side-section" key={group.group}>
          <div className="a-side-label">{group.group}</div>
          {group.items.map((item) => {
            const itemPath = item.href.split("#")[0] ?? item.href;
            const isActive =
              itemPath === active ||
              (itemPath !== "/admin" && active.startsWith(itemPath));
            const badge = badges?.[item.href];
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className={`a-nav ${isActive ? "active" : ""}`.trim()}
              >
                <span className="a-nav-ico">
                  <AdminIcon name={item.icon} />
                </span>
                <span>{item.label}</span>
                {badge ? (
                  <span className="a-nav-badge">{badge}</span>
                ) : item.kbd ? (
                  <span className="a-nav-kbd">{item.kbd}</span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
      <div className="a-side-foot">
        <span className="av">{initials}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="nm" style={{ display: "block" }}>
            {viewer.displayName ?? "Signed-in user"}
          </span>
          <span className="rl" style={{ display: "block" }}>
            {(viewer.adminRole ?? "user")} · {viewer.authSource ?? "—"}
          </span>
        </span>
        <Link
          href="/auth/sign-out"
          aria-label="Sign out"
          prefetch={false}
          style={{ color: "var(--a-muted)" }}
        >
          <AdminIcon name="logout" size={14} />
        </Link>
      </div>
    </aside>
  );
}

function Breadcrumbs({ trail }: { trail: string[] }) {
  return (
    <div className="a-breadcrumbs">
      {trail.map((t, i) => (
        <span key={`${i}-${t}`} style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
          {i > 0 && <span className="sep">/</span>}
          <span className={i === trail.length - 1 ? "now" : ""}>{t}</span>
        </span>
      ))}
    </div>
  );
}

function AdminSurfaceSwitch({
  surface,
  isOwner,
}: {
  surface: AdminSurface;
  isOwner: boolean;
}) {
  const items = [
    { href: "/admin", label: "Gacha admin", icon: "stack" as const, surface: "gacha" as const },
    {
      href: "/admin/marketplace",
      label: "Marketplace admin",
      icon: "globe" as const,
      surface: "marketplace" as const,
    },
  ].filter((item) => isOwner || item.surface !== "marketplace");
  return (
    <nav className="a-surface-switch" aria-label="Admin workspace">
      {items.map((item) => {
        const active = item.surface === surface;
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            aria-current={active ? "page" : undefined}
            className={active ? "active" : undefined}
          >
            <AdminIcon name={item.icon} size={13} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function TopBar({
  trail,
  surface,
  isOwner,
}: {
  trail: string[];
  surface: AdminSurface;
  isOwner: boolean;
}) {
  const topMenu = surfaceTopMenu(surface, isOwner);
  const searchPlaceholder =
    surface === "marketplace"
      ? "Search orders, seller requests, listings..."
      : "Search packs, users, prize codes...";
  return (
    <div className="a-top">
      <nav className="a-top-menu" aria-label="Public site shortcuts">
        {topMenu.map((item) => (
          <Link
            href={item.href}
            key={item.href}
            prefetch={false}
            className={item.primary ? "home" : undefined}
          >
            {item.primary && <AdminIcon name="globe" size={13} />}
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
      <AdminSurfaceSwitch surface={surface} isOwner={isOwner} />
      <Breadcrumbs trail={trail} />
      <div className="a-search">
        <AdminIcon name="search" size={13} />
        <span>{searchPlaceholder}</span>
        <span className="kbd">⌘K</span>
      </div>
      <div className="a-top-actions">
        <span className="a-icon-btn" aria-hidden>
          <AdminIcon name="help" size={14} />
        </span>
        <span className="a-icon-btn" aria-hidden>
          <AdminIcon name="bell" size={14} />
          <span className="dot" />
        </span>
      </div>
    </div>
  );
}

export function AdminPageHead({
  eyebrow,
  title,
  desc,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  desc?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="a-page-head">
      <div>
        {eyebrow && <div className="a-eyebrow">{eyebrow}</div>}
        <h1 className="a-page-title">{title}</h1>
        {desc && <div className="a-page-desc">{desc}</div>}
      </div>
      {actions && <div className="a-page-actions">{actions}</div>}
    </div>
  );
}

export function AdminFrame({
  viewer,
  active,
  trail,
  surface = "gacha",
  eyebrow,
  title,
  desc,
  actions,
  badges,
  children,
}: {
  viewer: YnotViewer;
  active: string;
  trail: string[];
  surface?: AdminSurface;
  eyebrow?: ReactNode;
  title: ReactNode;
  desc?: ReactNode;
  actions?: ReactNode;
  badges?: Partial<Record<string, number>>;
  children: ReactNode;
}) {
  const isOwner = viewer.adminRole === "owner";

  return (
    <div className="admin-frame">
      <AdminScrollbarAutoHide />
      <Sidebar active={active} viewer={viewer} badges={badges} surface={surface} />
      <div className="a-main">
        <TopBar trail={trail} surface={surface} isOwner={isOwner} />
        <div className="a-content">
          <AdminPageHead
            eyebrow={eyebrow}
            title={title}
            desc={desc}
            actions={actions}
          />
          {children}
        </div>
      </div>
    </div>
  );
}
