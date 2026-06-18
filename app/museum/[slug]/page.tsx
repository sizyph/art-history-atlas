import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getArtistBySlug } from "@/lib/data";
import Gallery from "@/components/museum/Gallery";
import NoWorks from "@/components/museum/NoWorks";
import { getMuseum } from "@/lib/museums";

export const dynamic = "force-dynamic";

const atWidth = (url: string, w: number) => {
  const base = url.replace(/[?&]width=\d+/g, "");
  return `${base}${base.includes("?") ? "&" : "?"}width=${w}`;
};

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const sp = await searchParams;
  const data = await getArtistBySlug(slug).catch(() => null);
  if (!data) return { title: "ars gratia artis" };
  const { artist, paintings } = data;
  const workId = typeof sp.work === "string" ? Number(sp.work) : null;
  const work = workId ? paintings.find((p) => p.id === workId) : null;
  const title = work
    ? `${work.title} — ${artist.name} · ars gratia artis`
    : `${artist.name} · ars gratia artis`;
  const description = (
    (work?.story || artist.bio) ??
    `Walk ${artist.name}'s gallery — their real paintings in a 3D museum.`
  ).slice(0, 185);
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      // a specific work overrides the artist card with that painting
      ...(work
        ? { images: [{ url: atWidth(work.imageUrl, 1200), alt: work.title }] }
        : {}),
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function MuseumPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const intro = sp.intro === "1";
  const museum = getMuseum(typeof sp.museum === "string" ? sp.museum : null);
  const data = await getArtistBySlug(slug);
  if (!data) notFound();

  const { artist, period, paintings, neighbors } = data;

  if (!paintings.length) {
    return <NoWorks name={artist.name} />;
  }

  const workId = typeof sp.work === "string" ? Number(sp.work) : null;
  const openWorkId =
    workId && paintings.some((p) => p.id === workId) ? workId : null;

  return (
    <Gallery
      museum={museum}
      artist={artist}
      period={period ?? null}
      paintings={paintings}
      neighbors={neighbors}
      intro={intro}
      openWorkId={openWorkId}
    />
  );
}
