import { AdminPaymentMethodForm } from "@/features/ynot/client";
import { AdminGate, WalletPanel } from "@/features/ynot/components";
import { getAllPaymentMethods, getYnotDashboardSlice } from "@/features/ynot/data";
import {
  AdminCard,
  AdminCardHead,
  AdminFrame,
  AdminIcon,
  AdminPill,
} from "@/features/ynot/admin";

export const dynamic = "force-dynamic";

const SETTINGS_NAV: { key: string; label: string; icon: Parameters<typeof AdminIcon>[0]["name"]; active?: boolean }[] = [
  { key: "storefront", label: "Storefront", icon: "globe" },
  { key: "payments", label: "Payments", icon: "coin", active: true },
  { key: "wallet", label: "Wallet & ledger", icon: "sliders" },
  { key: "branding", label: "Branding", icon: "image" },
  { key: "flags", label: "Feature flags", icon: "sparkles" },
  { key: "integrations", label: "Integrations", icon: "stack" },
];

export default async function AdminSettingsPage() {
  const [data, allPaymentMethods] = await Promise.all([
    getYnotDashboardSlice({
      wallet: true,
      paymentMethods: true,
      adminTopUps: true,
    }),
    getAllPaymentMethods(),
  ]);
  return (
    <AdminGate viewer={data.viewer}>
      <AdminFrame
        viewer={data.viewer}
        active="/admin/settings"
        trail={["Admin", "Platform", "Settings", "Payments"]}
        eyebrow="Admin settings · payments"
        title="Platform settings"
        desc="Storefront config, payment methods, feature flags, and integration credentials. Owner-only fields are marked with a lock."
        actions={
          <>
            <span className="btn">Discard</span>
            <span className="btn btn-primary">Save changes</span>
          </>
        }
      >
        <div className="admin-settings-grid">
          <AdminCard className="admin-settings-nav-card">
            <div className="list" style={{ padding: "6px 6px" }}>
              {SETTINGS_NAV.map((s) => (
                <div
                  key={s.key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "7px 10px",
                    borderRadius: 6,
                    fontSize: 12,
                    background: s.active
                      ? "rgba(244,197,66,0.10)"
                      : "transparent",
                    color: s.active ? "var(--a-fg)" : "var(--a-fg-dim)",
                    boxShadow: s.active
                      ? "inset 0 0 0 1px rgba(244,197,66,0.16)"
                      : "none",
                  }}
                >
                  <AdminIcon name={s.icon} size={13} />
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
            <div
              style={{
                padding: "10px 12px",
                borderTop: "1px solid var(--a-border-soft)",
                fontSize: 10,
                color: "var(--a-muted)",
                lineHeight: 1.6,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 4,
                }}
              >
                <AdminIcon name="shield" size={11} />
                Role management is in{" "}
                <span style={{ color: "var(--a-fg-dim)" }}>
                  People › Users › Edit
                </span>
                .
              </div>
            </div>
          </AdminCard>

          <div className="admin-settings-main">
            <AdminCard className="admin-settings-payment-card">
              <AdminCardHead
                label="Payment methods"
                title="Bank Transfer"
                actions={<AdminPill kind="live">{data.paymentMethods.length} configured</AdminPill>}
              />
              <div className="card-pad">
                <AdminPaymentMethodForm paymentMethods={allPaymentMethods} />
              </div>
            </AdminCard>

            <AdminCard className="admin-settings-wallet-card">
              <AdminCardHead
                label="Customer preview"
                title="Wallet panel"
              />
              <div className="card-pad">
                <WalletPanel
                  wallet={data.wallet}
                  paymentMethods={data.paymentMethods}
                  topUps={data.adminTopUps}
                />
              </div>
            </AdminCard>
          </div>
        </div>
      </AdminFrame>
    </AdminGate>
  );
}
