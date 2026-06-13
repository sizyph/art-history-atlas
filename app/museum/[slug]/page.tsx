import { notFound } from "next/navigation";
import Link from "next/link";
import { getArtistBySlug } from "@/lib/data";
import Gallery from "@/components/museum/Gallery";

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
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center">
        <h1 className="font-display text-4xl text-ink">{artist.name}</h1>
        <p className="max-w-md text-sm leading-relaxed text-ink-soft">
          No public-domain works for {artist.name} are on Wikimedia Commons yet,
          so there&rsquo;s no gallery to walk. Their biography still lives on the
          timeline.
        </p>
        <Link
          href="/"
          className="rounded-full border border-line px-5 py-2.5 text-sm text-ink transition-colors hover:bg-bg-elev"
        >
          ← Back to the constellation
        </Link>
      </main>
    );
  }

  return <Gallery artist={artist} period={period ?? null} paintings={paintings} />;
}
