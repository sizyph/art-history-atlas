import { asc, count, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { artists, influences, paintings, periods } from "@/db/schema";
import type { Artist } from "@/db/schema";
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

/** An adjoining gallery the influence graph connects to (a walkable doorway). */
export type Neighbor = {
  slug: string;
  name: string;
  i18n: Artist["i18n"];
  portraitUrl: string | null;
  color: string;
  note: string | null;
  direction: "influencer" | "influenced";
};

/**
 * Artists linked to this one by the "influenced by" graph and who have a
 * gallery of their own to walk — `influencer` = shaped them, `influenced` =
 * carried them forward. Ordered so predecessors come first.
 */
export async function getNeighbors(artistId: number): Promise<Neighbor[]> {
  const other = alias(artists, "other");
  const pick = (dir: "influencer" | "influenced") => {
    const self = dir === "influencer" ? influences.artistId : influences.influencerId;
    const neighbor = dir === "influencer" ? influences.influencerId : influences.artistId;
    return db
      .select({
        slug: other.slug,
        name: other.name,
        i18n: other.i18n,
        portraitUrl: other.portraitUrl,
        color: periods.color,
        note: influences.note,
        works: count(paintings.id),
      })
      .from(influences)
      .innerJoin(other, eq(neighbor, other.id))
      .innerJoin(periods, eq(other.periodId, periods.id))
      .leftJoin(paintings, eq(paintings.artistId, other.id))
      .where(eq(self, artistId))
      .groupBy(other.id, periods.color, influences.note);
  };

  const [influencers, influenced] = await Promise.all([
    pick("influencer"),
    pick("influenced"),
  ]);

  const seen = new Set<string>();
  const out: Neighbor[] = [];
  for (const [dir, rows] of [
    ["influencer", influencers],
    ["influenced", influenced],
  ] as const) {
    for (const r of rows) {
      if (r.works === 0 || seen.has(r.slug)) continue; // only walkable galleries
      seen.add(r.slug);
      out.push({
        slug: r.slug,
        name: r.name,
        i18n: r.i18n,
        portraitUrl: r.portraitUrl,
        color: r.color,
        note: r.note,
        direction: dir,
      });
    }
  }
  return out;
}

/** One artist with their period, ordered paintings, and influence neighbors. */
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

  const [works, neighbors] = await Promise.all([
    db
      .select()
      .from(paintings)
      .where(eq(paintings.artistId, artist.id))
      .orderBy(asc(paintings.orderIndex)),
    getNeighbors(artist.id),
  ]);

  return { artist, period, paintings: works, neighbors };
}

export async function getAllArtistSlugs(): Promise<string[]> {
  const rows = await db.select({ slug: artists.slug }).from(artists);
  return rows.map((r) => r.slug);
}

/** Title + story (with translations) for one painting — used by the audio guide. */
export async function getPaintingById(id: number) {
  const [p] = await db
    .select({
      id: paintings.id,
      title: paintings.title,
      story: paintings.story,
      i18n: paintings.i18n,
    })
    .from(paintings)
    .where(eq(paintings.id, id))
    .limit(1);
  return p ?? null;
}
