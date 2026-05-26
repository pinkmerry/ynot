"use client";

import { type ReactNode } from "react";
import { CoinPip, formatCoins } from "./Icons";
import { ToastProvider } from "./UiKit";

import "./theme.css";

export type ShellProps = {
  children: ReactNode;
};

/**
 * Wraps a redesigned (light-theme) page inside .cr-root so the new CSS tokens
 * scope to this surface only, plus a client ToastProvider so client
 * components can call useToast(). The top bar + footer come from the
 * surrounding YnotShell at the page level so navigation looks identical to
 * every other store page.
 */
export function Shell({ children }: ShellProps) {
  return (
    <div className="cr-root cr-root-embedded">
      <ToastProvider>{children}</ToastProvider>
    </div>
  );
}

export { CoinPip, formatCoins };
