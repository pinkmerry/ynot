import type { Metadata } from "next";
import type { ReactNode } from "react";

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
  return <>{children}</>;
}
