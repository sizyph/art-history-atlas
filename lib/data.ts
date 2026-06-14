import { asc, count, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { artists, influences, paintings, periods } from "@/db/schema";
import type { LayoutInput } from "@/lib/timeline";

/** Periods + artists (with painting counts) for the constellation. */
export async function getConstellationData(): Promise<LayoutInput> {
  const ps = await db.select().from(periods).orderBy(asc(periods.orderIndex));
  const as = await db
    .select({
      id: artists.id,
      slug: artists.slug,
      name: artists.name,
      periodId: artists.periodId,
      birthYear: artists.birthYear,
      deathYear: artists.deathYear,
      nationality: artists.nationality,
      bio: artists.bio,
      portraitUrl: artists.portraitUrl,
      wikipediaUrl: artists.wikipediaUrl,
      orderIndex: artists.orderIndex,
      i18n: artists.i18n,
      paintingCount: count(paintings.id),
    })
    .from(artists)
    .leftJoin(paintings, eq(paintings.artistId, artists.id))
    .groupBy(artists.id)
    .orderBy(asc(artists.orderIndex));

  const infl = alias(artists, "infl");
  const links = await db
    .select({
      aSlug: artists.slug,
      bSlug: infl.slug,
      note: influences.note,
    })
    .from(influences)
    .innerJoin(artists, eq(influences.artistId, artists.id))
    .innerJoin(infl, eq(influences.influencerId, infl.id));

  return { periods: ps, artists: as, influences: links };
}

/** One artist with their period and ordered paintings (for the museum). */
export async function getArtistBySlug(slug: string) {
  const [artist] = await db
    .select()
    .from(artists)
    .where(eq(artists.slug, slug))
    .limit(1);
  if (!artist) return null;

  const [period] = await db
    .select()
    .from(periods)
    .where(eq(periods.id, artist.periodId))
    .limit(1);

  const works = await db
    .select()
    .from(paintings)
    .where(eq(paintings.artistId, artist.id))
    .orderBy(asc(paintings.orderIndex));

  return { artist, period, paintings: works };
}

export async function getAllArtistSlugs(): Promise<string[]> {
  const rows = await db.select({ slug: artists.slug }).from(artists);
  return rows.map((r) => r.slug);
}
