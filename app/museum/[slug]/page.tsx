import { notFound } from "next/navigation";
import { getArtistBySlug } from "@/lib/data";
import Gallery from "@/components/museum/Gallery";
import NoWorks from "@/components/museum/NoWorks";

export const dynamic = "force-dynamic";

export default async function MuseumPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getArtistBySlug(slug);
  if (!data) notFound();

  const { artist, period, paintings } = data;

  if (!paintings.length) {
    return <NoWorks name={artist.name} />;
  }

  return <Gallery artist={artist} period={period ?? null} paintings={paintings} />;
}
