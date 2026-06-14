import {
  pgTable,
  serial,
  integer,
  text,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

/**
 * Art-historical periods (the "galaxies" of the constellation).
 * Names, date ranges and blurbs are sourced from Wikipedia.
 */
export const periods = pgTable("periods", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  startYear: integer("start_year").notNull(),
  endYear: integer("end_year").notNull(),
  blurb: text("blurb"),
  color: text("color").notNull(),
  orderIndex: integer("order_index").notNull(),
  wikipediaTitle: text("wikipedia_title"),
  wikipediaUrl: text("wikipedia_url"),
});

/**
 * Artists (the "stars"). Each belongs to one period for clustering.
 * Bio + portrait + dates all sourced from Wikipedia / Wikidata.
 */
export const artists = pgTable(
  "artists",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    periodId: integer("period_id")
      .notNull()
      .references(() => periods.id),
    birthYear: integer("birth_year"),
    deathYear: integer("death_year"),
    nationality: text("nationality"),
    bio: text("bio"),
    portraitUrl: text("portrait_url"),
    wikidataQid: text("wikidata_qid"),
    wikipediaTitle: text("wikipedia_title"),
    wikipediaUrl: text("wikipedia_url"),
    orderIndex: integer("order_index").notNull().default(0),
    i18n: jsonb("i18n").$type<
      Record<string, { name?: string; nationality?: string; bio?: string }>
    >(),
  },
  (t) => [index("artists_period_idx").on(t.periodId)],
);

/**
 * Paintings hung in each artist's gallery. Image from Wikimedia Commons,
 * story (article extract) + facts from the painting's Wikipedia article.
 */
export const paintings = pgTable(
  "paintings",
  {
    id: serial("id").primaryKey(),
    artistId: integer("artist_id")
      .notNull()
      .references(() => artists.id),
    title: text("title").notNull(),
    year: integer("year"),
    imageUrl: text("image_url").notNull(),
    thumbUrl: text("thumb_url"),
    width: integer("width"),
    height: integer("height"),
    story: text("story"),
    facts: jsonb("facts").$type<string[]>(),
    location: text("location"),
    license: text("license"),
    creditLine: text("credit_line"),
    wikidataQid: text("wikidata_qid"),
    wikipediaTitle: text("wikipedia_title"),
    wikipediaUrl: text("wikipedia_url"),
    sourceUrl: text("source_url"),
    orderIndex: integer("order_index").notNull().default(0),
    i18n: jsonb("i18n").$type<
      Record<string, { title?: string; story?: string }>
    >(),
  },
  (t) => [index("paintings_artist_idx").on(t.artistId)],
);

export type Period = typeof periods.$inferSelect;
export type Artist = typeof artists.$inferSelect;
export type Painting = typeof paintings.$inferSelect;
export type NewPeriod = typeof periods.$inferInsert;
export type NewArtist = typeof artists.$inferInsert;
export type NewPainting = typeof paintings.$inferInsert;
