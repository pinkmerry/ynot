import { normalizeHomeSeries, normalizeHomeTag, YnotHomeExperience, YnotShell } from "@/features/ynot/components";
import { getYnotDashboardData } from "@/features/ynot/data";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const homeFilter = {
    series: normalizeHomeSeries(params?.series),
    tag: normalizeHomeTag(params?.tag),
  };
  const data = await getYnotDashboardData();
  return (
    <YnotShell viewer={data.viewer} homeFilter={homeFilter}>
      <YnotHomeExperience data={data} homeFilter={homeFilter} />
    </YnotShell>
  );
}
