import Constellation from "@/components/Constellation";
import { buildLayout } from "@/lib/timeline";
import { getConstellationData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const data = await getConstellationData();
  const layout = buildLayout(data);
  const focus = (await searchParams).focus;
  const focusSlug = typeof focus === "string" ? focus : undefined;
  return <Constellation layout={layout} focusSlug={focusSlug} />;
}
