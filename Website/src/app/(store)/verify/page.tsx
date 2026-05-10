import { PageHeader, YnotShell } from "@/features/ynot/components";
import { VerifyPanel } from "@/features/ynot/client";
import { getYnotDashboardData } from "@/features/ynot/data";

export const dynamic = "force-dynamic";

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const [data, params] = await Promise.all([getYnotDashboardData(), searchParams]);
  return (
    <YnotShell viewer={data.viewer}>
      <PageHeader
        eyebrow="Provably fair"
        title="Verify a pack open"
        description="Enter a pack receipt code (e.g. GO-1042) to recompute every card draw using the campaign's published HMAC commitment."
      />
      <VerifyPanel initialCode={params.code ?? ""} />
    </YnotShell>
  );
}
