"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

// Props are derived type-only from the client barrel so we don't pull its
// runtime code into this module's static graph.
type GachaOpenPanelProps = ComponentProps<
  (typeof import("../client"))["GachaOpenPanel"]
>;

// Defer the 408 KB client barrel chunk until after first paint. The route shows
// the skeleton immediately; the panel hydrates and (with autoStart) fires the
// open. ssr:false is valid here because this wrapper is a Client Component.
const GachaOpenPanel = dynamic(
  () => import("../client").then((mod) => ({ default: mod.GachaOpenPanel })),
  {
    ssr: false,
    loading: () => (
      <div
        className="cr-page"
        style={{ padding: 48, textAlign: "center" }}
        aria-busy="true"
      >
        <span className="cr-mute">Preparing your pack…</span>
      </div>
    ),
  },
);

export function GachaOpenPanelLazy(props: GachaOpenPanelProps) {
  return <GachaOpenPanel {...props} />;
}
