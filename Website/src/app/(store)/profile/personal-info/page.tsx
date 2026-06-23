import { Shell } from "@/features/ynot/cr/Shell";
import { PersonalInfoExperience } from "@/features/ynot/cr/PersonalInfoExperience";
import { YnotShell } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";
import { requireCurrentProfile } from "@/lib/auth/protected-route";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PersonalInfoPage() {
  const session = await requireCurrentProfile("/profile/personal-info");
  const supabase = createServiceSupabaseClient();
  const [data, profileResult, identitiesResult] = await Promise.all([
    getYnotDashboardSlice({
      wallet: true,
      addresses: true,
      shipping: true,
    }),
    supabase
      .from("profiles")
      .select("line_user_id")
      .eq("id", session.profileId)
      .maybeSingle(),
    supabase
      .from("user_identities")
      .select("provider")
      .eq("profile_id", session.profileId),
  ]);
  if (profileResult.error) throw profileResult.error;
  if (identitiesResult.error) throw identitiesResult.error;

  const identityProviders = new Set(
    (identitiesResult.data ?? []).map((identity) => identity.provider),
  );
  const hasLineIdentity =
    Boolean(profileResult.data?.line_user_id) || identityProviders.has("line");
  const hasGoogleIdentity = identityProviders.has("google");
  const hasEmailIdentity = identityProviders.has("email");

  const lineHref = data.viewer.authenticated
    ? "/api/line/login/start?mode=connect&next=/profile/personal-info"
    : "/api/line/login/start?mode=login&next=/profile/personal-info";
  const googleConnectHref =
    data.viewer.authSource === "line"
      ? "/api/auth/google/start?mode=connect&next=/profile/personal-info"
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
            line: { connected: hasLineIdentity },
            google: { connected: hasGoogleIdentity },
            email: { connected: hasEmailIdentity },
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
