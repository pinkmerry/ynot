import { AdminPaymentMethodForm } from "@/features/ynot/client";
import { AdminGate, PageHeader, WalletPanel, YnotShell } from "@/features/ynot/components";
import { getYnotDashboardData } from "@/features/ynot/data";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const data = await getYnotDashboardData();
  return <AdminGate viewer={data.viewer}><YnotShell viewer={data.viewer}><PageHeader eyebrow="Admin settings" title="Payment and platform settings" description="Manage active bank/PromptPay methods used by the wallet top-up page. Manual payment confirmation remains the first production payment flow." /><div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]"><AdminPaymentMethodForm /><WalletPanel wallet={data.wallet} paymentMethods={data.paymentMethods} topUps={data.adminTopUps} /></div></YnotShell></AdminGate>;
}
