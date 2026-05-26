"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Ico } from "./Icons";

type ToastKind = "success" | "error" | "info";
type ToastItem = { id: string; kind: ToastKind; msg: string };

type ToastContextValue = {
  toast: (kind: ToastKind, msg: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((kind: ToastKind, msg: string) => {
    const id = `tst-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((current) => [...current, { id, kind, msg }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 3000);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="cr-toasts" aria-live="polite">
        {toasts.map((item) => (
          <div key={item.id} className={`cr-toast cr-toast-${item.kind}`}>
            <span className="cr-toast-ico">
              <Ico
                name={
                  item.kind === "success"
                    ? "check"
                    : item.kind === "error"
                      ? "x"
                      : "info"
                }
                size={14}
              />
            </span>
            <span>{item.msg}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback: console only when called outside provider (e.g. during SSR).
    return {
      toast: () => {
        /* noop */
      },
    };
  }
  return ctx;
}

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  size?: "sm" | "md" | "lg" | "xl";
  children: ReactNode;
  footer?: ReactNode;
};

export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  size = "md",
  children,
  footer,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="cr-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`cr-modal cr-modal-${size}`}
        role="dialog"
        aria-modal="true"
      >
        <div className="cr-modal-head">
          <div className="cr-stack" style={{ gap: 2 }}>
            {eyebrow && <span className="cr-eyebrow">{eyebrow}</span>}
            <h2 className="cr-h2">{title}</h2>
          </div>
          <button
            type="button"
            className="cr-icon-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <Ico name="x" size={16} />
          </button>
        </div>
        <div className="cr-modal-body">{children}</div>
        {footer && <div className="cr-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

type PageHeadProps = {
  eyebrow?: string;
  title: string;
  lead?: string;
  back?: { href: string; label?: string };
  actions?: ReactNode;
};

export function PageHead({
  eyebrow,
  title,
  lead,
  back,
  actions,
}: PageHeadProps) {
  return (
    <div className="cr-page-head">
      <div className="cr-stack" style={{ gap: 6, maxWidth: "62ch" }}>
        {(eyebrow || back) && (
          <div className="cr-row" style={{ gap: 10 }}>
            {back && (
              <a className="cr-back" href={back.href}>
                <Ico name="chev-l" size={14} /> {back.label ?? "Back"}
              </a>
            )}
            {eyebrow && <span className="cr-eyebrow">{eyebrow}</span>}
          </div>
        )}
        <h1 className="cr-h1">{title}</h1>
        {lead && <p className="cr-lead">{lead}</p>}
      </div>
      {actions && (
        <div className="cr-row" style={{ gap: 8 }}>
          {actions}
        </div>
      )}
    </div>
  );
}
