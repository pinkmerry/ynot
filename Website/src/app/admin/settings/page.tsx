import { AdminPaymentMethodForm } from "@/features/ynot/client";
import {
  AdminSectionShell,
  PageHeader,
  WalletPanel,
} from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const data = await getYnotDashboardSlice({
    wallet: true,
    paymentMethods: true,
    adminTopUps: true,
  });
  return (
    <AdminSectionShell viewer={data.viewer} activeHref="/admin/settings">
      <PageHeader
        eyebrow="Admin settings"
        title="Payment and platform settings"
        description="Manage active bank/PromptPay methods used by the wallet top-up page. Manual payment confirmation remains the first production payment flow."
      />
      <div className="admin-page-grid">
        <AdminPaymentMethodForm />
        <section className="admin-panel admin-preview-panel soft-card">
          <div className="admin-panel-head">
            <div>
              <p className="section-label">Customer wallet preview</p>
              <h3 className="title-m">Configured payment methods</h3>
            </div>
          </div>
          <WalletPanel
            wallet={data.wallet}
            paymentMethods={data.paymentMethods}
            topUps={data.adminTopUps}
          />
        </section>
      </div>
    </AdminSectionShell>
  );
}
