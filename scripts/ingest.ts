/**
 * Ingestion: Wikipedia + Wikidata + Wikimedia Commons -> Neon.
 *
 *   npm run ingest:dry   # fetch + report counts, NO database writes
 *   npm run ingest       # full run, writes to Neon (needs DATABASE_URL)
 *
 * Nothing here is invented: artists come from scripts/curated.ts, and each
 * artist's paintings are pulled live from Wikidata (creator = artist, type =
 * painting, has a Commons image AND an English Wikipedia article). The article
 * supplies the story; Wikidata claims supply the facts; Commons supplies the
 * image. Re-running re-syncs (upsert by slug; paintings replaced per artist).
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PERIODS } from "../lib/curated";

const DRY = process.argv.includes("--dry");
const ONLY = (
  process.argv.find((a) => a.startsWith("--only="))?.split("=")[1] ?? ""
).toLowerCase();
const UA = "ArtHistoryAtlas/0.1 (https://github.com/; steepening@gmail.com)";
const WDQS = "https://query.wikidata.org/sparql";
const MAX_PAINTINGS = 12;
const MIN_PAINTINGS = 8;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function yearOf(v?: string | null): number | null {
  if (!v) return null;
  const m = String(v).match(/^(-?\d{1,4})/);
  return m ? parseInt(m[1], 10) : null;
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

async function fetchJson(
  url: string,
  headers: Record<string, string> = {},
  retries = 4,
): Promise<any> {
  for (let i = 0; i <= retries; i++) {
    let res: Response;
    try {
      res = await fetch(url, { headers: { "User-Agent": UA, ...headers } });
    } catch (e) {
      if (i === retries) throw e;
      await sleep(800 * (i + 1));
      continue;
    }
    if (res.ok) return res.json();
    if (res.status === 429 || res.status >= 500) {
      await sleep(1200 * (i + 1));
      continue;
    }
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  throw new Error(`Failed after retries: ${url}`);
}

async function sparql(query: string): Promise<any[]> {
  const url = `${WDQS}?format=json&query=${encodeURIComponent(query)}`;
  const data = await fetchJson(url, { Accept: "application/sparql-results+json" });
  await sleep(250);
  return data.results.bindings;
}

async function resolveEntity(title: string) {
  const url = `https://en.wikipedia.org/w/api.php?action=query&prop=pageprops&ppprop=wikibase_item&redirects=1&format=json&titles=${encodeURIComponent(title)}`;
  const data = await fetchJson(url);
  const pages = data?.query?.pages ?? {};
  const page: any = Object.values(pages)[0];
  const qid = page?.pageprops?.wikibase_item;
  if (!qid) return null;
  return {
    qid,
    title: page.title as string,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(
      (page.title as string).replace(/ /g, "_"),
    )}`,
  };
}

async function summary(
  title: string,
): Promise<{ extract: string | null; thumb: string | null }> {
  try {
    const d = await fetchJson(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
    );
    return { extract: d.extract ?? null, thumb: d.thumbnail?.source ?? null };
  } catch {
    return { extract: null, thumb: null };
  }
}

async function artistMeta(qid: string) {
  const q = `SELECT ?birth ?death ?image ?countryLabel WHERE {
    OPTIONAL { wd:${qid} wdt:P569 ?birth. }
    OPTIONAL { wd:${qid} wdt:P570 ?death. }
    OPTIONAL { wd:${qid} wdt:P18 ?image. }
    OPTIONAL { wd:${qid} wdt:P27 ?country. }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
  } LIMIT 1`;
  const b = (await sparql(q))[0] ?? {};
  return {
    birthYear: yearOf(b.birth?.value),
    deathYear: yearOf(b.death?.value),
    portrait: b.image?.value ? b.image.value.replace(/^http:/, "https:") : null,
    nationality: b.countryLabel?.value ?? null,
  };
}

function commonsName(filePathUrl: string): string {
  const marker = "Special:FilePath/";
  const idx = filePathUrl.indexOf(marker);
  const enc =
    idx >= 0 ? filePathUrl.slice(idx + marker.length) : filePathUrl.split("/").pop()!;
  return decodeURIComponent(enc);
}

function filePageUrl(imageBase: string): string {
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(
    commonsName(imageBase).replace(/ /g, "_"),
  )}`;
}

type RawPainting = {
  qid: string;
  title: string;
  year: number | null;
  sitelinks: number;
  imageBase: string;
  articleTitle: string;
  articleUrl: string;
  medium?: string;
  genre?: string;
  location?: string;
  collection?: string;
  height?: number;
  width?: number;
};

async function paintingsFor(qid: string): Promise<RawPainting[]> {
  const q = `SELECT ?p ?pLabel ?year ?image ?article ?sitelinks ?mediumLabel ?genreLabel ?locationLabel ?collectionLabel ?height ?width WHERE {
    ?p wdt:P170 wd:${qid} ; wdt:P31/wdt:P279* wd:Q3305213 ; wdt:P18 ?image .
    ?p wikibase:sitelinks ?sitelinks .
    ?article schema:about ?p ; schema:isPartOf <https://en.wikipedia.org/> .
    OPTIONAL { ?p wdt:P571 ?date. BIND(YEAR(?date) AS ?year) }
    OPTIONAL { ?p wdt:P186 ?medium. }
    OPTIONAL { ?p wdt:P136 ?genre. }
    OPTIONAL { ?p wdt:P276 ?location. }
    OPTIONAL { ?p wdt:P195 ?collection. }
    OPTIONAL { ?p wdt:P2048 ?height. }
    OPTIONAL { ?p wdt:P2049 ?width. }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
  } ORDER BY DESC(?sitelinks)`;
  const rows = await sparql(q);

  const byId = new Map<string, RawPainting>();
  for (const r of rows) {
    const pid = r.p.value.split("/").pop()!;
    if (byId.has(pid)) continue;
    const articleUrl: string = r.article.value;
    const articleTitle = decodeURIComponent(
      articleUrl.split("/wiki/")[1] ?? "",
    ).replace(/_/g, " ");
    byId.set(pid, {
      qid: pid,
      title: r.pLabel?.value ?? articleTitle,
      year: r.year?.value ? parseInt(r.year.value, 10) : null,
      sitelinks: r.sitelinks?.value ? parseInt(r.sitelinks.value, 10) : 0,
      imageBase: r.image.value.replace(/^http:/, "https:"),
      articleTitle,
      articleUrl,
      medium: r.mediumLabel?.value,
      genre: r.genreLabel?.value,
      location: r.locationLabel?.value,
      collection: r.collectionLabel?.value,
      height: r.height?.value ? Math.round(parseFloat(r.height.value)) : undefined,
      width: r.width?.value ? Math.round(parseFloat(r.width.value)) : undefined,
    });
  }

  // Quality + dedup: drop label-less works, then unique by article and title.
  let list = [...byId.values()].filter((p) => !/^Q\d+$/.test(p.title));
  const seenA = new Set<string>();
  const seenT = new Set<string>();
  list = list.filter((p) => {
    const a = p.articleTitle.toLowerCase();
    const t = p.title.toLowerCase();
    if (seenA.has(a) || seenT.has(t)) return false;
    seenA.add(a);
    seenT.add(t);
    return true;
  });

  // Most-notable first: rank by Wikidata sitelink count (how many language
  // Wikipedias cover the work) — a robust proxy for fame, so each gallery shows
  // the artist's canonical works rather than the earliest dated ones.
  list.sort((a, b) => b.sitelinks - a.sitelinks);

  // Resolution floor: drop low-resolution scans. Check a buffer of top
  // candidates, then keep the most-notable high-res works up to the cap.
  const candidates = list.slice(0, MAX_PAINTINGS + 8);
  const sizes = await imageSizes(candidates.map((c) => c.imageBase));
  const RES_FLOOR = 1200; // px on the longest side — drops only true thumbnails
  const good = candidates.filter((c) => {
    const s = sizes.get(normName(commonsName(c.imageBase)));
    return !s || Math.max(s.w, s.h) >= RES_FLOOR; // keep if high-res or unknown
  });

  return (good.length >= MAX_PAINTINGS ? good : candidates).slice(
    0,
    MAX_PAINTINGS,
  );
}

const normName = (s: string) =>
  decodeURIComponent(s).replace(/_/g, " ").trim().toLowerCase();

// Original pixel dimensions of Commons files, batched via the imageinfo API.
async function imageSizes(
  imageBases: string[],
): Promise<Map<string, { w: number; h: number }>> {
  const out = new Map<string, { w: number; h: number }>();
  const names = imageBases.map(commonsName);
  for (let i = 0; i < names.length; i += 40) {
    const titles = names
      .slice(i, i + 40)
      .map((n) => `File:${n}`)
      .join("|");
    const url =
      `https://commons.wikimedia.org/w/api.php?action=query&format=json` +
      `&prop=imageinfo&iiprop=size&titles=${encodeURIComponent(titles)}`;
    try {
      const d = await fetchJson(url);
      const pages = d?.query?.pages ?? {};
      for (const pg of Object.values(pages) as any[]) {
        const ii = pg.imageinfo?.[0];
        const title: string | undefined = pg.title;
        if (ii?.width && title) {
          out.set(normName(title.replace(/^File:/, "")), {
            w: ii.width,
            h: ii.height,
          });
        }
      }
    } catch {
      /* size unknown for this batch → those works are kept */
    }
    await sleep(200);
  }
  return out;
}

function buildFacts(p: RawPainting): string[] {
  const f: string[] = [];
  if (p.medium) f.push(cap(p.medium));
  if (p.genre) f.push(`Genre: ${p.genre}`);
  if (p.collection || p.location) f.push(`Held at ${p.collection ?? p.location}`);
  if (p.height && p.width) f.push(`${p.height} × ${p.width} cm`);
  return f;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;
  const worker = async () => {
    while (idx < items.length) {
      const i = idx++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return out;
}

async function main() {
  console.log(DRY ? "— DRY RUN (no DB writes) —" : "— INGEST → Neon —");

  let db: any = null;
  let S: any = null;
  let eq: any = null;
  if (!DRY) {
    db = (await import("../db")).db;
    S = await import("../db/schema");
    eq = (await import("drizzle-orm")).eq;
  }

  const report: { period: string; artist: string; n: number }[] = [];
  let totalPaintings = 0;

  for (let pi = 0; pi < PERIODS.length; pi++) {
    const period = PERIODS[pi];
    console.log(`\n=== ${period.name} (${period.startYear}–${period.endYear}) ===`);

    const pSum = DRY
      ? { extract: null, thumb: null }
      : await summary(period.wikipediaTitle);

    let periodId = 0;
    if (!DRY) {
      const rows = await db
        .insert(S.periods)
        .values({
          slug: period.slug,
          name: period.name,
          startYear: period.startYear,
          endYear: period.endYear,
          color: period.color,
          orderIndex: pi,
          blurb: pSum.extract,
          wikipediaTitle: period.wikipediaTitle,
          wikipediaUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(
            period.wikipediaTitle.replace(/ /g, "_"),
          )}`,
        })
        .onConflictDoUpdate({
          target: S.periods.slug,
          set: {
            name: period.name,
            startYear: period.startYear,
            endYear: period.endYear,
            color: period.color,
            orderIndex: pi,
            blurb: pSum.extract,
          },
        })
        .returning({ id: S.periods.id });
      periodId = rows[0].id;
    }

    for (let ai = 0; ai < period.artists.length; ai++) {
      const title = period.artists[ai];
      if (ONLY && !title.toLowerCase().includes(ONLY)) continue;
      const ent = await resolveEntity(title);
      if (!ent) {
        console.log(`  ! could not resolve "${title}"`);
        continue;
      }

      const paints = await paintingsFor(ent.qid);
      report.push({ period: period.name, artist: ent.title, n: paints.length });
      const mark = paints.length < MIN_PAINTINGS ? "⚠︎" : " ";
      console.log(`  ${mark} ${ent.title.padEnd(28)} ${paints.length} paintings`);
      if (ONLY)
        for (const p of paints)
          console.log(`       · ${p.title} (${p.sitelinks} wikis, ${p.year ?? "—"})`);

      if (DRY) continue;

      const [meta, bio] = await Promise.all([
        artistMeta(ent.qid),
        summary(ent.title),
      ]);
      const portrait = meta.portrait ?? bio.thumb ?? null;

      const aRows = await db
        .insert(S.artists)
        .values({
          slug: slugify(ent.title),
          name: ent.title,
          periodId,
          birthYear: meta.birthYear,
          deathYear: meta.deathYear,
          nationality: meta.nationality,
          bio: bio.extract,
          portraitUrl: portrait,
          wikidataQid: ent.qid,
          wikipediaTitle: ent.title,
          wikipediaUrl: ent.url,
          orderIndex: ai,
        })
        .onConflictDoUpdate({
          target: S.artists.slug,
          set: {
            periodId,
            birthYear: meta.birthYear,
            deathYear: meta.deathYear,
            nationality: meta.nationality,
            bio: bio.extract,
            portraitUrl: portrait,
            wikidataQid: ent.qid,
            orderIndex: ai,
          },
        })
        .returning({ id: S.artists.id });
      const artistId = aRows[0].id;

      const stories = await mapPool(
        paints,
        4,
        async (p) => (await summary(p.articleTitle)).extract,
      );

      await db.delete(S.paintings).where(eq(S.paintings.artistId, artistId));
      if (paints.length) {
        await db.insert(S.paintings).values(
          paints.map((p, i) => ({
            artistId,
            title: p.title,
            year: p.year,
            imageUrl: `${p.imageBase}?width=1800`,
            thumbUrl: `${p.imageBase}?width=600`,
            width: p.width ?? null,
            height: p.height ?? null,
            story: stories[i] ?? null,
            facts: buildFacts(p),
            location: p.location ?? p.collection ?? null,
            license: "Wikimedia Commons",
            creditLine: "Wikimedia Commons",
            wikidataQid: p.qid,
            wikipediaTitle: p.articleTitle,
            wikipediaUrl: p.articleUrl,
            sourceUrl: filePageUrl(p.imageBase),
            orderIndex: i,
          })),
        );
      }
      totalPaintings += paints.length;
      await sleep(120);
    }
  }

  console.log("\n— Summary —");
  console.log(
    `Periods ${PERIODS.length}  ·  Artists ${report.length}  ·  Paintings ${totalPaintings}`,
  );
  const low = report.filter((r) => r.n < MIN_PAINTINGS);
  if (low.length) {
    console.log(`Below ${MIN_PAINTINGS} paintings:`);
    low.forEach((r) => console.log(`  ${r.period} / ${r.artist}: ${r.n}`));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
