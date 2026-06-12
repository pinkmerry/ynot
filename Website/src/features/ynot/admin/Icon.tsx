import type { SVGProps } from "react";
import { CoinMark } from "../cr/Icons";

export type AdminIconName =
  | "grid" | "stack" | "gift" | "tag" | "users" | "coin" | "truck" | "swap"
  | "trophy" | "sparkles" | "sliders" | "shield" | "pulse" | "search" | "bell"
  | "help" | "plus" | "filter" | "download" | "upload" | "edit" | "more"
  | "check" | "x" | "chev-d" | "chev-r" | "arrow-up" | "arrow-dn" | "eye"
  | "eye-off" | "globe" | "image" | "play" | "warning" | "clock" | "logout";

export function AdminIcon({
  name,
  size = 14,
  ...rest
}: { name: AdminIconName; size?: number } & SVGProps<SVGSVGElement>) {
  const common: SVGProps<SVGSVGElement> = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    ...rest,
  };
  switch (name) {
    case "grid":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );
    case "stack":
      return (
        <svg {...common}>
          <path d="M12 3 3 8l9 5 9-5-9-5z" />
          <path d="M3 13l9 5 9-5" />
          <path d="M3 18l9 5 9-5" />
        </svg>
      );
    case "gift":
      return (
        <svg {...common}>
          <rect x="3" y="8" width="18" height="13" rx="1.5" />
          <path d="M3 12h18" />
          <path d="M12 8v13" />
          <path d="M7.5 8a2.5 2.5 0 1 1 2.5-2.5c0 1.5-1 2.5-2.5 2.5z" />
          <path d="M16.5 8A2.5 2.5 0 1 0 14 5.5c0 1.5 1 2.5 2.5 2.5z" />
        </svg>
      );
    case "tag":
      return (
        <svg {...common}>
          <path d="M20 12L12 4H5v7l8 8z" />
          <circle cx="8.5" cy="8.5" r="1" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.5" />
          <path d="M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M21.5 18c0-2-1.5-3.5-3.5-3.5" />
        </svg>
      );
    case "coin":
      // Brand coin (C1) — unified site-wide trident mark.
      return <CoinMark size={size} />;
    case "truck":
      return (
        <svg {...common}>
          <rect x="1.5" y="6" width="13" height="10" rx="1" />
          <path d="M14.5 9h4l3 3.5V16h-7z" />
          <circle cx="6" cy="18" r="1.7" />
          <circle cx="17.5" cy="18" r="1.7" />
        </svg>
      );
    case "swap":
      return (
        <svg {...common}>
          <path d="M4 7h14l-3-3" />
          <path d="M20 17H6l3 3" />
        </svg>
      );
    case "trophy":
      return (
        <svg {...common}>
          <path d="M8 4h8v5a4 4 0 1 1-8 0V4z" />
          <path d="M16 6h3v2a3 3 0 0 1-3 3" />
          <path d="M8 6H5v2a3 3 0 0 0 3 3" />
          <path d="M12 13v4" />
          <path d="M9 21h6l-1-3h-4z" />
        </svg>
      );
    case "sparkles":
      return (
        <svg {...common}>
          <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
          <path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
        </svg>
      );
    case "sliders":
      return (
        <svg {...common}>
          <path d="M4 6h12" />
          <path d="M4 12h7" />
          <path d="M4 18h12" />
          <circle cx="18" cy="6" r="2" />
          <circle cx="13" cy="12" r="2" />
          <circle cx="18" cy="18" r="2" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6l8-3z" />
        </svg>
      );
    case "pulse":
      return (
        <svg {...common}>
          <path d="M3 12h4l2-6 4 12 2-6h6" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      );
    case "bell":
      return (
        <svg {...common}>
          <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 7H4c0-1 2-2 2-7z" />
          <path d="M10 19a2 2 0 0 0 4 0" />
        </svg>
      );
    case "help":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7" />
          <circle cx="12" cy="17" r=".6" fill="currentColor" />
        </svg>
      );
    case "plus":
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "filter":
      return (
        <svg {...common}>
          <path d="M3 5h18l-7 9v6l-4-2v-4z" />
        </svg>
      );
    case "download":
      return (
        <svg {...common}>
          <path d="M12 4v11" />
          <path d="m7 11 5 5 5-5" />
          <path d="M4 20h16" />
        </svg>
      );
    case "upload":
      return (
        <svg {...common}>
          <path d="M12 20V9" />
          <path d="m7 13 5-5 5 5" />
          <path d="M4 4h16" />
        </svg>
      );
    case "edit":
      return (
        <svg {...common}>
          <path d="M4 20h4l11-11-4-4L4 16v4z" />
        </svg>
      );
    case "more":
      return (
        <svg {...common}>
          <circle cx="5" cy="12" r="1.2" fill="currentColor" />
          <circle cx="12" cy="12" r="1.2" fill="currentColor" />
          <circle cx="19" cy="12" r="1.2" fill="currentColor" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="m5 12 5 5L20 7" />
        </svg>
      );
    case "x":
      return (
        <svg {...common}>
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      );
    case "chev-d":
      return (
        <svg {...common}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      );
    case "chev-r":
      return (
        <svg {...common}>
          <path d="m9 6 6 6-6 6" />
        </svg>
      );
    case "arrow-up":
      return (
        <svg {...common}>
          <path d="M12 19V5" />
          <path d="m6 11 6-6 6 6" />
        </svg>
      );
    case "arrow-dn":
      return (
        <svg {...common}>
          <path d="M12 5v14" />
          <path d="m18 13-6 6-6-6" />
        </svg>
      );
    case "eye":
      return (
        <svg {...common}>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "eye-off":
      return (
        <svg {...common}>
          <path d="M3 3l18 18" />
          <path d="M10.5 6.2A10.4 10.4 0 0 1 12 6c6.5 0 10 6 10 6a18 18 0 0 1-3.2 4.1" />
          <path d="M6.1 7.3C3.8 8.9 2 12 2 12s3.5 6 10 6c1.2 0 2.3-.2 3.3-.5" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      );
    case "globe":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18" />
          <path d="M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </svg>
      );
    case "image":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="10" r="1.7" />
          <path d="m4 18 5-5 4 4 3-3 4 4" />
        </svg>
      );
    case "play":
      return (
        <svg {...common}>
          <path d="M7 5v14l12-7z" />
        </svg>
      );
    case "warning":
      return (
        <svg {...common}>
          <path d="m12 3 10 17H2z" />
          <path d="M12 10v4" />
          <circle cx="12" cy="17.2" r=".6" fill="currentColor" />
        </svg>
      );
    case "clock":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "logout":
      return (
        <svg {...common}>
          <path d="M14 4h5v16h-5" />
          <path d="M10 8 4 12l6 4" />
          <path d="M4 12h11" />
        </svg>
      );
    default:
      return null;
  }
}
