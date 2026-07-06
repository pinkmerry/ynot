import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import "@/features/marketplace-ui/theme/marketplace-theme.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--mp-font-mono",
});

export const metadata: Metadata = {
  title: "Marketplace Ops | YNOT Marketplace",
  description:
    "YNOT marketplace operations dashboard for orders, seller intake, payouts, fulfilment, refunds, and reconciliation.",
};

export default function AdminMarketplaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <div className={`mp-root ${jetbrainsMono.variable}`}>{children}</div>;
}
