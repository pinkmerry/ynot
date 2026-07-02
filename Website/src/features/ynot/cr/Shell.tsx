"use client";

import { type CSSProperties, type ReactNode } from "react";
import { CoinPip, formatCoins } from "./Icons";
import { ToastProvider } from "./UiKit";

import "./theme.css";

export type ShellProps = {
  children: ReactNode;
  className?: string;
};

const embeddedRootLayoutStyle: CSSProperties = {
  alignSelf: "stretch",
  flex: "1 1 auto",
  maxWidth: "none",
  width: "100%",
  marginLeft: 0,
  marginRight: 0,
  paddingLeft: 0,
  paddingRight: 0,
};

/**
 * Wraps a redesigned (light-theme) page inside .cr-root so the new CSS tokens
 * scope to this surface only, plus a client ToastProvider so client
 * components can call useToast(). The top bar + footer come from the
 * surrounding YnotShell at the page level so navigation looks identical to
 * every other store page.
 */
export function Shell({ children, className }: ShellProps) {
  return (
    <div
      className={["cr-root cr-root-embedded", className].filter(Boolean).join(" ")}
      style={embeddedRootLayoutStyle}
    >
      <ToastProvider>{children}</ToastProvider>
    </div>
  );
}

export { CoinPip, formatCoins };
