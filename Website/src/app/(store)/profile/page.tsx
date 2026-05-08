import Link from "next/link";
import { AddressForm } from "@/features/ynot/client";
import { PageHeader, YnotShell } from "@/features/ynot/components";
import { getYnotDashboardData } from "@/features/ynot/data";
import { requireCurrentProfile } from "@/lib/auth/protected-route";

export const dynamic = "force-dynamic";

type ProfilePageProps = {
  searchParams?: Promise<{ error?: string; message?: string }>;
};

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  await requireCurrentProfile("/profile");
  const params = await searchParams;
  const data = await getYnotDashboardData();
  const lineHref = data.viewer.authenticated
    ? "/api/line/login/start?mode=connect&next=/profile"
    : "/api/line/login/start?mode=login&next=/profile";

  return (
    <YnotShell viewer={data.viewer}>
      <PageHeader
        eyebrow="09 · Profile · Settings"
        title="My Account"
        description="iOS-style flat list: account, notifications, security, and linked platforms on one canonical profile."
        action={(
          <Link className="gold-button rounded-2xl px-5 py-3 text-sm font-black" href={data.viewer.authenticated ? "/wallet" : "/login"}>
            {data.viewer.authenticated ? "Manage wallet" : "Login"}
          </Link>
        )}
      />

      {params?.error && (
        <p className="rounded-2xl border border-red-300/25 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-100">{params.error}</p>
      )}
      {params?.message && (
        <p className="rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-100">{params.message}</p>
      )}

      <div className="phone-page-shell profile-phone grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <section className="soft-card profile-card" id="personal-info">
          <div className="profile-hero-row">
            <span className="profile-avatar">{data.viewer.displayName.charAt(0).toUpperCase()}</span>
            <div>
              <h3>{data.viewer.displayName}</h3>
              <p>{data.viewer.authenticated ? `${data.viewer.authSource ?? "web"} connected` : "guest@ynot.app"}</p>
              <span className="vip-bonus">⭐ VIP +7%</span>
            </div>
            <strong>›</strong>
          </div>
          <div className="settings-section-label">Account</div>
          <dl className="settings-list">
            <div className="settings-row"><dt>👤 Profile info</dt><dd>{data.viewer.displayName} ›</dd></div>
            <div className="settings-row"><dt>📍 Shipping address</dt><dd>{data.addresses.length || 0} addresses ›</dd></div>
            <div className="settings-row"><dt>🔐 Admin</dt><dd>{data.viewer.adminRole ?? "Customer"} ›</dd></div>
          </dl>
          <div className="settings-section-label">Profile actions</div>
          <div className="profile-quick-actions">
            <Link className="plain-button rounded-2xl px-4 py-3 text-center text-sm font-black" href="/collection">
              Collection
            </Link>
            <Link className="plain-button rounded-2xl px-4 py-3 text-center text-sm font-black" href="/shipping">
              Ship Card
            </Link>
          </div>
          <div className="settings-section-label">Notifications</div>
          <div className="settings-list">
            <div className="settings-row"><span>New cards</span><em className="toggle-on" /></div>
            <div className="settings-row"><span>Promotions</span><em className="toggle-on" /></div>
          </div>
          <div className="settings-section-label">Security</div>
          <div className="settings-list">
            <div className="settings-row"><span>🔑 Change password</span><strong>›</strong></div>
          </div>
          <div className="mt-4 grid gap-2">
            <Link className="plain-button rounded-2xl px-4 py-3 text-center text-sm font-black" href={lineHref}>
              {data.viewer.authenticated ? "Connect LINE to this account" : "Login with LINE"}
            </Link>
            <p className="text-xs leading-relaxed text-[var(--muted)]">
              If LINE is already attached to another profile, the system creates an admin-reviewed merge request instead of unsafe silent merging.
            </p>
          </div>
        </section>

        <AddressForm addresses={data.addresses} />
      </div>
    </YnotShell>
  );
}
