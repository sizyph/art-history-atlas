import Constellation from "@/components/Constellation";
import { buildLayout } from "@/lib/timeline";
import { getConstellationData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const data = await getConstellationData();
  const layout = buildLayout(data);
  return <Constellation layout={layout} />;
}
