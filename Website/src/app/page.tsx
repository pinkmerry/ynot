import { normalizeHomeSeries, normalizeHomeSort, normalizeHomeTag, YnotHomeExperience, YnotShell } from "@/features/ynot/components";
import { getYnotPublicHomeData } from "@/features/ynot/data";

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
    sort: normalizeHomeSort(params?.sort),
  };
  const data = await getYnotPublicHomeData();
  return (
    <YnotShell
      viewer={data.viewer}
      shellClassName="ynot-home-mint"
    >
      <YnotHomeExperience data={data} homeFilter={homeFilter} />
    </YnotShell>
  );
}
