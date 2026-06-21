import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("../db");
  const { artists, paintings } = await import("../db/schema");

  const arts = await db.select().from(artists);
  const ps = await db.select().from(paintings);

  const tally = (
    rows: Record<string, unknown>[],
    enField: string,
    sub: string,
  ) => {
    let en = 0;
    const have: Record<string, number> = { fr: 0, ja: 0 };
    for (const r of rows) {
      if (!r[enField]) continue;
      en++;
      const i18n = (r.i18n ?? {}) as Record<string, Record<string, string>>;
      for (const l of ["fr", "ja"]) {
        if (i18n[l]?.[sub] && String(i18n[l][sub]).trim()) have[l]++;
      }
    }
    return { en, fr: have.fr, ja: have.ja };
  };

  console.log("ARTISTS", arts.length);
  console.log("  bio        ", tally(arts, "bio", "bio"));
  console.log("  nationality", tally(arts, "nationality", "nationality"));
  console.log("PAINTINGS", ps.length);
  console.log("  title      ", tally(ps, "title", "title"));
  console.log("  story      ", tally(ps, "story", "story"));
  process.exit(0);
}

main();
