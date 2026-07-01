import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { AdminIcon } from "./Icon";

export function AdminCard({
  children,
  className = "",
  ...props
}: ComponentPropsWithoutRef<"section"> & {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section {...props} className={`card ${className}`.trim()}>
      {children}
    </section>
  );
}

export function AdminCardHead({
  label,
  title,
  actions,
}: {
  label?: ReactNode;
  title?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="card-head">
      <div>
        {label && <p className="section-label">{label}</p>}
        {title && <h3>{title}</h3>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function AdminPill({
  kind = "default",
  children,
}: {
  kind?: "default" | "live" | "draft" | "review" | "closed" | "warn" | "fail" | "archived";
  children: ReactNode;
}) {
  return (
    <span className={`pill ${kind}`}>
      <span className="d" />
      {children}
    </span>
  );
}

const STATUS_MAP: Record<string, [string, string]> = {
  live: ["live", "Live"],
  draft: ["draft", "Draft"],
  pending_review: ["review", "Pending review"],
  pending_slip: ["warn", "Awaiting slip"],
  approved: ["live", "Approved"],
  rejected: ["fail", "Rejected"],
  cancelled: ["archived", "Cancelled"],
  expired: ["archived", "Expired"],
  changes_requested: ["warn", "Changes requested"],
  closed: ["closed", "Closed"],
  archived: ["archived", "Archived"],
  preparing: ["review", "Preparing"],
  submitted: ["review", "Submitted"],
  packing: ["warn", "Packing"],
  ready_for_pickup: ["warn", "Ready for pickup"],
  picked_up: ["live", "Picked up"],
  shipped: ["closed", "Shipped"],
  delivered: ["live", "Delivered"],
  completed: ["live", "Completed"],
  not_submitted: ["draft", "Draft"],
  reserved: ["review", "Reserved"],
  active: ["live", "Active"],
  flagged: ["warn", "Flagged"],
  suspended: ["fail", "Suspended"],
  hidden: ["draft", "Hidden"],
  private: ["closed", "Private"],
  public: ["live", "Public"],
  pending: ["review", "Pending"],
};

export function AdminStatusPill({ status }: { status: string }) {
  const [kind, label] = STATUS_MAP[status] ?? ["default", status];
  return (
    <AdminPill kind={kind as Parameters<typeof AdminPill>[0]["kind"]}>
      {label}
    </AdminPill>
  );
}

export function AdminTierPill({
  tier,
  label,
}: {
  tier: "rainbow" | "gold" | "silver" | "bronze";
  label?: string;
}) {
  return <span className={`tier-pill ${tier}`}>{label ?? tier}</span>;
}

export function AdminBar({
  value,
  max = 100,
  tone,
}: {
  value: number;
  max?: number;
  tone?: "mint" | "sky";
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={`bar ${tone ?? ""}`.trim()}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

export function AdminSpark({
  data = [],
  color = "var(--a-gold)",
  height = 32,
}: {
  data?: number[];
  color?: string;
  height?: number;
}) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = 100 - ((v - min) / (max - min || 1)) * 100;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ width: "100%", height }}
    >
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} />
      <polyline
        points={`0,100 ${pts} 100,100`}
        fill={color}
        opacity={0.12}
        stroke="none"
      />
    </svg>
  );
}

export function AdminKPI({
  label,
  value,
  delta,
  deltaDir = "up",
  color = "var(--a-gold)",
  spark,
}: {
  label: ReactNode;
  value: ReactNode;
  delta?: ReactNode;
  deltaDir?: "up" | "down";
  color?: string;
  spark?: number[];
}) {
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {delta && (
        <div className={`delta ${deltaDir}`}>
          <AdminIcon name={deltaDir === "up" ? "arrow-up" : "arrow-dn"} size={11} />
          {delta}
        </div>
      )}
      {spark && <AdminSpark data={spark} color={color} height={28} />}
    </div>
  );
}

export function AdminToggle({ on = false }: { on?: boolean }) {
  return <span className={`toggle ${on ? "on" : ""}`.trim()} aria-hidden />;
}

export function AdminField({
  label,
  children,
  hint,
}: {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && (
        <div style={{ fontSize: 11, color: "var(--a-muted)" }}>{hint}</div>
      )}
    </div>
  );
}

export function AdminThumb({
  label,
  className = "sq",
  background,
  color,
  children,
}: {
  label?: string;
  className?: "" | "sq" | "lg";
  background?: string;
  color?: string;
  children?: ReactNode;
}) {
  return (
    <span
      className={`thumb ${className}`.trim()}
      style={{
        background: background,
        color: color,
      }}
    >
      {children ?? label ?? ""}
    </span>
  );
}

export function AdminTabs({
  options,
  activeKey,
  className = "",
}: {
  options: { key: string; label: ReactNode }[];
  activeKey: string;
  className?: string;
}) {
  return (
    <div className={`tabs ${className}`.trim()}>
      {options.map((opt) => (
        <div
          key={opt.key}
          className={`t ${opt.key === activeKey ? "active" : ""}`.trim()}
        >
          {opt.label}
        </div>
      ))}
    </div>
  );
}

export const fmtTHB = (n: number) =>
  `฿${Number(n ?? 0).toLocaleString("en-US")}`;
export const fmtCoin = (n: number) =>
  `${Number(n ?? 0).toLocaleString("en-US")} coins`;
