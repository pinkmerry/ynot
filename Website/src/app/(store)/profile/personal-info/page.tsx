import { Shell } from "@/features/ynot/cr/Shell";
import { PersonalInfoExperience } from "@/features/ynot/cr/PersonalInfoExperience";
import { YnotShell } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";
import { requireCurrentProfile } from "@/lib/auth/protected-route";

export const dynamic = "force-dynamic";

export default async function PersonalInfoPage() {
  await requireCurrentProfile("/profile/personal-info");
  const data = await getYnotDashboardSlice({
    wallet: true,
    addresses: true,
    shipping: true,
  });

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
      <Shell>
        <PersonalInfoExperience
          viewer={data.viewer}
          addresses={data.addresses}
          shipping={data.shipping}
          connections={{
            line: { connected: data.viewer.authSource === "line" },
            google: { connected: data.viewer.authSource === "supabase" },
            email: {
              connected:
                data.viewer.authSource === "supabase" &&
                data.viewer.authenticated,
            },
          }}
          links={{
            lineHref,
            googleConnectHref,
            emailConnectHref,
          }}
        />
      </Shell>
    </YnotShell>
  );
}
