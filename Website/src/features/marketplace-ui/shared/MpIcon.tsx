import type { SVGProps } from "react";

export interface MpIconProps extends SVGProps<SVGSVGElement> {
  name: string;
  size?: number;
}

/**
 * Icon set ported from marketplace-shared.jsx's `MPIcon` component
 * (prototype: /Users/pinkmerry/Downloads/ynott/project/marketplace-shared.jsx).
 * Same `name` switch, same SVG paths — just typed for TSX.
 */
export function MpIcon({ name, size = 15, ...rest }: MpIconProps) {
  const base = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...rest,
  };

  switch (name) {
    case "search":
      return (
        <svg {...base}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      );
    case "bell":
      return (
        <svg {...base}>
          <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 7H4c0-1 2-2 2-7z" />
          <path d="M10 19a2 2 0 0 0 4 0" />
        </svg>
      );
    case "chev-d":
      return (
        <svg {...base}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      );
    case "chev-r":
      return (
        <svg {...base}>
          <path d="m9 6 6 6-6 6" />
        </svg>
      );
    case "chev-l":
      return (
        <svg {...base}>
          <path d="m15 6-6 6 6 6" />
        </svg>
      );
    case "check":
      return (
        <svg {...base}>
          <path d="m5 12 5 5L20 7" />
        </svg>
      );
    case "shield":
      return (
        <svg {...base}>
          <path d="M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case "truck":
      return (
        <svg {...base}>
          <rect x="1.5" y="6" width="13" height="10" rx="1" />
          <path d="M14.5 9h4l3 3.5V16h-7z" />
          <circle cx="6" cy="18" r="1.7" />
          <circle cx="17.5" cy="18" r="1.7" />
        </svg>
      );
    case "bag":
      return (
        <svg {...base}>
          <path d="M6 8h12l1 13H5z" />
          <path d="M9 8V6a3 3 0 0 1 6 0v2" />
        </svg>
      );
    case "tag":
      return (
        <svg {...base}>
          <path d="M20 12L12 4H5v7l8 8z" />
          <circle cx="8.5" cy="8.5" r="1" />
        </svg>
      );
    case "swap":
      return (
        <svg {...base}>
          <path d="M4 7h14l-3-3" />
          <path d="M20 17H6l3 3" />
        </svg>
      );
    case "plus":
      return (
        <svg {...base}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "x":
      return (
        <svg {...base}>
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      );
    case "home":
      return (
        <svg {...base}>
          <path d="M4 11 12 4l8 7" />
          <path d="M6 10v10h12V10" />
        </svg>
      );
    case "gift":
      return (
        <svg {...base}>
          <rect x="3" y="8" width="18" height="13" rx="1.5" />
          <path d="M3 12h18" />
          <path d="M12 8v13" />
        </svg>
      );
    case "store":
      return (
        <svg {...base}>
          <path d="M4 9 5.5 4h13L20 9" />
          <path d="M4 9h16v11H4z" />
          <path d="M9 20v-6h6v6" />
        </svg>
      );
    case "user":
      return (
        <svg {...base}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" />
        </svg>
      );
    case "star":
      return (
        <svg {...base}>
          <path d="m12 3 2.7 5.6 6.3.8-4.6 4.2 1.2 6.1L12 16.8 6.4 19.7l1.2-6.1L3 9.4l6.3-.8z" />
        </svg>
      );
    case "filter":
      return (
        <svg {...base}>
          <path d="M3 5h18l-7 9v6l-4-2v-4z" />
        </svg>
      );
    case "menu":
      return (
        <svg {...base}>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      );
    case "trend-up":
      return (
        <svg {...base}>
          <path d="M4 17l5.5-5.5 3.5 3.5L20 8" />
          <path d="M15 8h5v5" />
        </svg>
      );
    case "trend-down":
      return (
        <svg {...base}>
          <path d="M4 8l5.5 5.5L13 10l7 7" />
          <path d="M20 12v5h-5" />
        </svg>
      );
    case "clock":
      return (
        <svg {...base}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </svg>
      );
    default:
      return null;
  }
}
