type IconName =
  | "search"
  | "bell"
  | "user"
  | "coin"
  | "filter"
  | "chev-d"
  | "chev-r"
  | "chev-l"
  | "plus"
  | "minus"
  | "check"
  | "edit"
  | "trash"
  | "upload"
  | "pin"
  | "truck"
  | "phone"
  | "mail"
  | "swap"
  | "sparkle"
  | "x"
  | "arrow-up"
  | "arrow-down"
  | "arrow-right"
  | "qr"
  | "bank"
  | "history"
  | "menu"
  | "card"
  | "settings"
  | "logout"
  | "info"
  | "tag"
  | "grid";

type IcoProps = {
  name: IconName;
  size?: number;
  className?: string;
};

export function Ico({ name, size = 16, className }: IcoProps) {
  const baseProps = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor" as const,
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true as const,
    focusable: false as const,
  };
  switch (name) {
    case "search":
      return (
        <svg {...baseProps}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      );
    case "bell":
      return (
        <svg {...baseProps}>
          <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 7H4c0-1 2-2 2-7z" />
          <path d="M10 19a2 2 0 0 0 4 0" />
        </svg>
      );
    case "user":
      return (
        <svg {...baseProps}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" />
        </svg>
      );
    case "coin":
      return (
        <svg {...baseProps}>
          <circle cx="12" cy="12" r="8" />
          <path d="M9 9c0 3 6 1 6 4 0 1.5-1.5 2-3 2s-3-.7-3-2" />
          <path d="M12 7v1.5M12 15v1.5" />
        </svg>
      );
    case "filter":
      return (
        <svg {...baseProps}>
          <path d="M3 5h18l-7 9v6l-4-2v-4z" />
        </svg>
      );
    case "chev-d":
      return (
        <svg {...baseProps}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      );
    case "chev-r":
      return (
        <svg {...baseProps}>
          <path d="m9 6 6 6-6 6" />
        </svg>
      );
    case "chev-l":
      return (
        <svg {...baseProps}>
          <path d="m15 6-6 6 6 6" />
        </svg>
      );
    case "plus":
      return (
        <svg {...baseProps}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "minus":
      return (
        <svg {...baseProps}>
          <path d="M5 12h14" />
        </svg>
      );
    case "check":
      return (
        <svg {...baseProps}>
          <path d="m5 12 5 5L20 7" />
        </svg>
      );
    case "edit":
      return (
        <svg {...baseProps}>
          <path d="M4 20h4l11-11-4-4L4 16v4z" />
        </svg>
      );
    case "trash":
      return (
        <svg {...baseProps}>
          <path d="M4 7h16" />
          <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
          <path d="M6 7l1 13h10l1-13" />
        </svg>
      );
    case "upload":
      return (
        <svg {...baseProps}>
          <path d="M12 20V9" />
          <path d="m7 13 5-5 5 5" />
          <path d="M4 4h16" />
        </svg>
      );
    case "pin":
      return (
        <svg {...baseProps}>
          <path d="M12 21s-7-6-7-12a7 7 0 0 1 14 0c0 6-7 12-7 12z" />
          <circle cx="12" cy="9" r="2.5" />
        </svg>
      );
    case "truck":
      return (
        <svg {...baseProps}>
          <rect x="1.5" y="6" width="13" height="10" rx="1" />
          <path d="M14.5 9h4l3 3.5V16h-7z" />
          <circle cx="6" cy="18" r="1.7" />
          <circle cx="17.5" cy="18" r="1.7" />
        </svg>
      );
    case "phone":
      return (
        <svg {...baseProps}>
          <path d="M5 4h4l2 5-3 2c1 3 3 5 6 6l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
        </svg>
      );
    case "mail":
      return (
        <svg {...baseProps}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 7 9 6 9-6" />
        </svg>
      );
    case "swap":
      return (
        <svg {...baseProps}>
          <path d="M4 7h14l-3-3" />
          <path d="M20 17H6l3 3" />
        </svg>
      );
    case "sparkle":
      return (
        <svg {...baseProps}>
          <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
        </svg>
      );
    case "x":
      return (
        <svg {...baseProps}>
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      );
    case "arrow-up":
      return (
        <svg {...baseProps}>
          <path d="M12 19V5" />
          <path d="m6 11 6-6 6 6" />
        </svg>
      );
    case "arrow-down":
      return (
        <svg {...baseProps}>
          <path d="M12 5v14" />
          <path d="m18 13-6 6-6-6" />
        </svg>
      );
    case "arrow-right":
      return (
        <svg {...baseProps}>
          <path d="M5 12h14" />
          <path d="m13 6 6 6-6 6" />
        </svg>
      );
    case "qr":
      return (
        <svg {...baseProps}>
          <rect x="3" y="3" width="6" height="6" rx="1" />
          <rect x="15" y="3" width="6" height="6" rx="1" />
          <rect x="3" y="15" width="6" height="6" rx="1" />
          <path d="M15 15h2v2h-2zM19 15h2v2h-2zM15 19h2v2h-2zM19 19h2v2h-2z" />
        </svg>
      );
    case "bank":
      return (
        <svg {...baseProps}>
          <path d="M3 21h18" />
          <path d="M5 21V10" />
          <path d="M19 21V10" />
          <path d="M9 21V10" />
          <path d="M15 21V10" />
          <path d="M3 10l9-5 9 5" />
        </svg>
      );
    case "history":
      return (
        <svg {...baseProps}>
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <path d="M3 4v5h5" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "menu":
      return (
        <svg {...baseProps}>
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      );
    case "card":
      return (
        <svg {...baseProps}>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M3 10h18" />
        </svg>
      );
    case "settings":
      return (
        <svg {...baseProps}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.4.9a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-.9-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.4-.9a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z" />
        </svg>
      );
    case "logout":
      return (
        <svg {...baseProps}>
          <path d="M14 4h5v16h-5" />
          <path d="M10 8 4 12l6 4" />
          <path d="M4 12h11" />
        </svg>
      );
    case "info":
      return (
        <svg {...baseProps}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v.5M11 11h1v5h1" />
        </svg>
      );
    case "tag":
      return (
        <svg {...baseProps}>
          <path d="M20 12L12 4H5v7l8 8z" />
          <circle cx="8.5" cy="8.5" r="1" />
        </svg>
      );
    case "grid":
      return (
        <svg {...baseProps}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );
    default:
      return null;
  }
}

// YNOT brand coin — single source of truth for every coin icon.
// The real favicon trident (B1) recolored via CSS mask of the git-tracked PNG,
// inside a thin ring. `color` defaults to currentColor: it reads black on light
// surfaces (prices) and light on dark surfaces (header pill) automatically, so the
// coin stays visible everywhere. `size` may be a number (px) or any CSS length.
export const COIN_GREEN = "#05A66B";
const COIN_MASK = "url(/ynot-logo-512.png)";

export function CoinMark({
  size = "1em",
  color = "currentColor",
}: {
  size?: number | string;
  color?: string;
}) {
  const dim = typeof size === "number" ? `${size}px` : size;
  const border =
    typeof size === "number"
      ? `${Math.max(1, size * 0.06)}px`
      : `max(1px, calc(${size} * 0.06))`;
  return (
    <span
      aria-hidden
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        boxSizing: "border-box",
        width: dim,
        height: dim,
        borderRadius: "50%",
        border: `${border} solid ${color}`,
        color,
        flexShrink: 0,
        overflow: "hidden",
        verticalAlign: "-0.15em",
      }}
    >
      <span
        style={{
          width: "68%",
          height: "68%",
          background: color,
          transform: "translateY(7.4%)",
          WebkitMaskImage: COIN_MASK,
          maskImage: COIN_MASK,
          WebkitMaskSize: "contain",
          maskSize: "contain",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
        }}
      />
    </span>
  );
}

export function CoinPip({ size = 14 }: { size?: number }) {
  return <CoinMark size={size} />;
}

export function formatCoins(n: number): string {
  return Math.round(n).toLocaleString();
}
