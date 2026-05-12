import { PageHeader, WalletPanel, YnotShell } from "@/features/ynot/components";
import { TopUpForm } from "@/features/ynot/client";
import { getYnotDashboardData } from "@/features/ynot/data";
import { requireCurrentProfile } from "@/lib/auth/protected-route";

export const dynamic = "force-dynamic";

export default async function WalletPage() {
  await requireCurrentProfile("/wallet");
  const data = await getYnotDashboardData();
  return (
    <YnotShell viewer={data.viewer} walletBalance={data.wallet.balanceCoins}>
      <PageHeader eyebrow="08 · Wallet" title="Top Up" description="2 stages: payment method → coin pack + VIP bonus. Manual bank/QR slip upload remains first for production." />
      <div className="phone-page-shell wallet-phone grid gap-4 xl:grid-cols-[1fr_0.8fr]">
        <WalletPanel wallet={data.wallet} paymentMethods={data.paymentMethods} topUps={data.topUps} />
        <TopUpForm paymentMethods={data.paymentMethods} />
      </div>
    </YnotShell>
  );
}
