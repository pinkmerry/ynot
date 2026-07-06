"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { MpIcon } from "./MpIcon";

/**
 * Shared marketplace UI primitives ported from the design prototype at
 * /Users/pinkmerry/Downloads/ynott/project/marketplace-shared.jsx,
 * marketplace-proto-1.jsx (toasts, ~lines 48-58), and
 * marketplace-proto-2.jsx (steps header, ~lines 239-245).
 *
 * These render classes owned by ../theme/marketplace-theme.css — do not
 * rename a class here without updating the theme file to match.
 *
 * The whole module is marked "use client" because MpToasts/useToasts need
 * hooks (state + timers). The other primitives here (MpBadge, MpBtn,
 * MpPanel, MpChip, MpEmpty, MpSteps) are pure/presentational and would be
 * server-safe on their own — they only inherit the client boundary because
 * they share this file with the toast hook.
 */

// ---------- MpBadge ----------

export type MpBadgeKind = "official" | "community" | "graded" | "raw" | "sold";

export interface MpBadgeProps {
  kind: MpBadgeKind;
  children: ReactNode;
}

export function MpBadge({ kind, children }: MpBadgeProps) {
  return <span className={`mp-badge mp-badge-${kind}`}>{children}</span>;
}

// ---------- MpBtn ----------

export type MpBtnVariant = "primary" | "green";
export type MpBtnSize = "lg" | "sm";

export interface MpBtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: MpBtnVariant;
  size?: MpBtnSize;
}

export function MpBtn({ variant, size, className, ...rest }: MpBtnProps) {
  const cls = [
    "mp-btn",
    variant && `mp-btn-${variant}`,
    size === "lg" && "mp-btn-lg",
    size === "sm" && "mpa-btn-sm",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return <button {...rest} className={cls} />;
}

// ---------- MpPanel ----------

export interface MpPanelProps {
  children: ReactNode;
  className?: string;
}

export function MpPanel({ children, className }: MpPanelProps) {
  const cls = ["mp-panel", className].filter(Boolean).join(" ");
  return <div className={cls}>{children}</div>;
}

// ---------- MpChip ----------

export interface MpChipProps {
  active?: boolean;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function MpChip({ active, children, className, onClick }: MpChipProps) {
  const cls = ["mp-chip", active && "active", className].filter(Boolean).join(" ");
  // Interactive chips (used as filter toggles) render a real button for native
  // keyboard/focus behavior; static label chips stay a plain span.
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick}>
        {children}
      </button>
    );
  }
  return <span className={cls}>{children}</span>;
}

// ---------- MpEmpty ----------

export interface MpEmptyProps {
  glyph: string;
  title: string;
  hint?: string;
  children?: ReactNode;
}

export function MpEmpty({ glyph, title, hint, children }: MpEmptyProps) {
  return (
    <div className="mp-empty">
      <span className="glyph">
        <MpIcon name={glyph} size={20} />
      </span>
      <span style={{ fontSize: 15, fontWeight: 700 }}>{title}</span>
      {hint ? <span className="mp-small mp-mute">{hint}</span> : null}
      {children}
    </div>
  );
}

// ---------- MpSteps ----------

export interface MpStep {
  label: string;
  status?: "done" | "now";
  n: number;
}

export interface MpStepsProps {
  steps: MpStep[];
}

/**
 * Ported from marketplace-proto-2.jsx:239-245's checkout steps header.
 */
export function MpSteps({ steps }: MpStepsProps) {
  return (
    <div className="mp-steps">
      {steps.map((step, i) => (
        <Fragment key={step.label}>
          <span className={["mp-step", step.status].filter(Boolean).join(" ")}>
            <span className="n">
              {step.status === "done" ? <MpIcon name="check" size={11} strokeWidth={2.6} /> : step.n}
            </span>{" "}
            {step.label}
          </span>
          {i < steps.length - 1 ? <span className="mp-step-sep" /> : null}
        </Fragment>
      ))}
    </div>
  );
}

// ---------- MpToasts / useToasts ----------

export type MpToastKind = "info" | "success" | "error";

export interface MpToast {
  id: number;
  kind: MpToastKind;
  message: string;
}

const TOAST_AUTO_DISMISS_MS = 3200;

export interface UseToastsResult {
  toasts: MpToast[];
  toast: (message: string, kind?: MpToastKind) => void;
}

/**
 * Client-side toast queue. `toast(message)` pushes a { id, kind, message }
 * entry that auto-dismisses after TOAST_AUTO_DISMISS_MS, mirroring the
 * prototype's `ProtoToasts` + inline toast() helper. Pending dismiss timers
 * are tracked and cleared on unmount so we never setState after unmount.
 */
export function useToasts(): UseToastsResult {
  const [toasts, setToasts] = useState<MpToast[]>([]);
  const nextId = useRef(0);
  const timers = useRef<Set<number>>(new Set());

  const toast = useCallback((message: string, kind: MpToastKind = "info") => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, kind, message }]);
    if (typeof window !== "undefined") {
      const timerId = window.setTimeout(() => {
        timers.current.delete(timerId);
        setToasts((current) => current.filter((t) => t.id !== id));
      }, TOAST_AUTO_DISMISS_MS);
      timers.current.add(timerId);
    }
  }, []);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timerId of pending) window.clearTimeout(timerId);
      pending.clear();
    };
  }, []);

  return { toasts, toast };
}

export interface MpToastsProps {
  toasts: MpToast[];
}

/**
 * Fixed bottom toast stack, ported from marketplace-proto-1.jsx:48-58.
 */
export function MpToasts({ toasts }: MpToastsProps) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 22,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        zIndex: 90,
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            background: "var(--mp-ink)",
            color: "#fff",
            borderRadius: 999,
            padding: "10px 20px",
            fontSize: 13,
            fontWeight: 600,
            boxShadow: "var(--mp-shadow)",
            animation: "mpToastIn .25s ease",
          }}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
