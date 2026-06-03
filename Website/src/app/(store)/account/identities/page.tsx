import { IdentitiesPanel, type IdentityRow } from "@/features/auth/IdentitiesPanel";
import { identityActionToken } from "@/lib/auth/identity-action-tokens";
import { requireCurrentProfile } from "@/lib/auth/protected-route";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function IdentitiesPage() {
  const session = await requireCurrentProfile("/account/identities");
  const supabase = createServiceSupabaseClient();

  const [profileResult, identitiesResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,email,email_verified_at,phone,phone_verified_at,line_user_id,display_name")
      .eq("id", session.profileId)
      .maybeSingle(),
    supabase
      .from("user_identities")
      .select("id,provider,email,display_name,linked_at,last_seen_at")
      .eq("profile_id", session.profileId)
      .order("linked_at", { ascending: true }),
  ]);

  const profile = profileResult.data;
  const identities: IdentityRow[] = await Promise.all((identitiesResult.data ?? []).map(async (row) => ({
    id: await identityActionToken(session.profileId, row.id),
    provider: row.provider,
    email: row.email,
    displayName: row.display_name,
    linkedAt: row.linked_at,
    lastSeenAt: row.last_seen_at,
  })));

  return (
    <IdentitiesPanel
      profile={{
        email: profile?.email ?? null,
        emailVerifiedAt: profile?.email_verified_at ?? null,
        phone: profile?.phone ?? null,
        phoneVerifiedAt: profile?.phone_verified_at ?? null,
        displayName: profile?.display_name ?? session.displayName ?? "YNot Customer",
        hasLine: Boolean(profile?.line_user_id),
      }}
      identities={identities}
    />
  );
}
