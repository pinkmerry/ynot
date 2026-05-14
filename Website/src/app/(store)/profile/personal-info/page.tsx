import Link from "next/link";
import { AddressForm, PersonalInfoForm } from "@/features/ynot/client";
import { OrderList, PageHeader, YnotShell } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";
import { requireCurrentProfile } from "@/lib/auth/protected-route";

export const dynamic = "force-dynamic";

export default async function PersonalInfoPage() {
  await requireCurrentProfile("/profile/personal-info");
  const data = await getYnotDashboardSlice({
    addresses: true,
    shipping: true,
  });
  const authLabel = data.viewer.authSource === "line" ? "LINE" : "Supabase";
  const adminLabel = data.viewer.adminRole
    ? data.viewer.adminRole.toUpperCase()
    : "CUSTOMER";
  const lineHref = data.viewer.authenticated
    ? "/api/line/login/start?mode=connect&next=/profile/personal-info"
    : "/api/line/login/start?mode=login&next=/profile/personal-info";
  const googleConnectHref =
    data.viewer.authSource === "line"
      ? "/api/auth/google/start?next=/profile/personal-info"
      : undefined;
  const emailConnectHref =
    data.viewer.authSource === "line"
      ? "/signup?next=/profile/personal-info"
      : undefined;

  return (
    <YnotShell viewer={data.viewer} walletBalance={data.wallet.balanceCoins}>
      <PageHeader
        eyebrow="10 · Personal Info"
        title="Personal Info"
        description="Manage your real account details here: name, phone, LINE connection, shipping addresses, and shipping history."
        action={
          <Link
            className="plain-button rounded-2xl px-5 py-3 text-sm font-black"
            href="/profile"
          >
            Back to profile
          </Link>
        }
      />

      <div className="profile-dashboard personal-info-page">
        <PersonalInfoForm
          lineHref={lineHref}
          googleConnectHref={googleConnectHref}
          emailConnectHref={emailConnectHref}
          loginMethod={authLabel}
          accountType={adminLabel}
        />

        <div className="personal-info-grid">
          <section className="profile-address-focus" id="shipping-address">
            <div className="profile-section-head">
              <span>Shipping address</span>
              <strong>Saved addresses</strong>
              <p>
                Add the address you want YNOTT to use when you request physical
                shipping from your collection.
              </p>
            </div>
            <AddressForm addresses={data.addresses} />
          </section>

          <section className="profile-panel personal-shipping-panel">
            <div className="profile-section-head">
              <span>Shipping</span>
              <strong>Shipping request history</strong>
            </div>
            <OrderList title="Shipping history" orders={data.shipping} />
          </section>
        </div>
      </div>
    </YnotShell>
  );
}
