import Link from "next/link";
import type { ReactNode } from "react";
import { AdminIcon, type AdminIconName } from "./Icon";
import type { YnotViewer } from "../types";

type NavItem = {
  href: string;
  label: string;
  icon: AdminIconName;
  kbd?: string;
  badge?: number;
};

const NAV: { group: string; items: NavItem[] }[] = [
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

const PUBLIC_TOP_MENU = [
  { href: "/", label: "Home page", primary: true },
  { href: "/packs", label: "Y-Packs", primary: false },
  { href: "/marketplace", label: "Marketplace", primary: false },
] as const;

function Sidebar({
  active,
  viewer,
  badges,
}: {
  active: string;
  viewer: YnotViewer;
  badges?: Partial<Record<string, number>>;
}) {
  const initials =
    (viewer.displayName ?? "U")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0])
      .join("")
      .toUpperCase() || "U";
  return (
    <aside className="a-side" aria-label="Admin navigation">
      <Link href="/admin" className="a-brand" prefetch={false}>
        <span className="a-brand-mark">Y</span>
        <span>
          <span className="a-brand-name">YNOTT Admin</span>
          <span className="a-brand-env">
            {process.env.NODE_ENV === "production" ? "Production · TH" : "Dev · TH"}
          </span>
        </span>
      </Link>
      {NAV.map((group) => (
        <div className="a-side-section" key={group.group}>
          <div className="a-side-label">{group.group}</div>
          {group.items.map((item) => {
            const isActive =
              item.href === active ||
              (item.href !== "/admin" && active.startsWith(item.href));
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

function TopBar({ trail }: { trail: string[] }) {
  return (
    <div className="a-top">
      <nav className="a-top-menu" aria-label="Public site shortcuts">
        {PUBLIC_TOP_MENU.map((item) => (
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
      <Breadcrumbs trail={trail} />
      <div className="a-search">
        <AdminIcon name="search" size={13} />
        <span>Search packs, users, prize codes…</span>
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
  eyebrow?: ReactNode;
  title: ReactNode;
  desc?: ReactNode;
  actions?: ReactNode;
  badges?: Partial<Record<string, number>>;
  children: ReactNode;
}) {
  return (
    <div className="admin-frame">
      <Sidebar active={active} viewer={viewer} badges={badges} />
      <div className="a-main">
        <TopBar trail={trail} />
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
