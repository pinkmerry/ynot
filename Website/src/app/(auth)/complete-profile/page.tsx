import { redirect } from "next/navigation";
import { CompleteProfileForm } from "@/features/auth/CompleteProfileForm";
import { requireCurrentProfile, safeNextPath } from "@/lib/auth/protected-route";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Props = {
  searchParams?: Promise<{ next?: string }>;
};

export default async function CompleteProfilePage({ searchParams }: Props) {
  const params = await searchParams;
  const nextPath = safeNextPath(params?.next);
  const session = await requireCurrentProfile(
    `/complete-profile${nextPath !== "/" ? `?next=${encodeURIComponent(nextPath)}` : ""}`,
  );

  const supabase = createServiceSupabaseClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id,email,email_verified_at,display_name")
    .eq("id", session.profileId)
    .maybeSingle();

  if (profile?.email_verified_at) {
    redirect(nextPath);
  }

  return (
    <CompleteProfileForm
      profileId={session.profileId}
      defaultEmail={profile?.email ?? ""}
      displayName={profile?.display_name ?? session.displayName ?? "YNot Customer"}
      nextPath={nextPath}
    />
  );
}
