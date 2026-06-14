/**
 * Influence links: for each artist, read Wikidata "influenced by" (P737); where
 * the influencer is also in our database, record a link and mine a short
 * anecdote from the influenced artist's English Wikipedia article.
 *
 *   npm run links
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const UA = "ArtHistoryAtlas/0.1 (https://github.com/; steepening@gmail.com)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url: string, retries = 4): Promise<any> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (res.ok) return res.json();
      if (res.status === 429 || res.status >= 500) {
        await sleep(1000 * (i + 1));
        continue;
      }
      return null;
    } catch {
      if (i === retries) return null;
      await sleep(800 * (i + 1));
    }
  }
  return null;
}

async function wbClaims(qid: string): Promise<any> {
  const d = await fetchJson(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims&ids=${qid}`,
  );
  await sleep(120);
  return d?.entities?.[qid]?.claims ?? {};
}

async function fullExtract(title: string): Promise<string> {
  const d = await fetchJson(
    `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&format=json&redirects=1&titles=${encodeURIComponent(title)}`,
  );
  const pages = d?.query?.pages ?? {};
  const first = Object.values(pages)[0] as { extract?: string } | undefined;
  return first?.extract ?? "";
}

function findAnecdote(extract: string, name: string): string | null {
  const surname = name.split(/\s+/).pop() ?? name;
  const text = extract.replace(/\s+/g, " ");
  const sentences = text.split(/(?<=[.!?])\s+/);
  for (const s of sentences) {
    const hit =
      s.includes(name) || (surname.length > 3 && s.includes(surname));
    if (hit) {
      const t = s.trim();
      if (t.length > 30 && t.length < 340) return t;
    }
  }
  return null;
}

async function main() {
  const { db } = await import("../db");
  const { artists, influences } = await import("../db/schema");
  console.log("— LINKS → Neon —\n");

  const arts = await db.select().from(artists);
  const byQid = new Map(
    arts.filter((a) => a.wikidataQid).map((a) => [a.wikidataQid as string, a]),
  );

  await db.delete(influences);

  let count = 0;
  let withNote = 0;
  for (const a of arts) {
    if (!a.wikidataQid) continue;
    const claims = await wbClaims(a.wikidataQid);
    const infQids: string[] = (claims.P737 ?? [])
      .map((c: any) => c?.mainsnak?.datavalue?.value?.id)
      .filter(Boolean);
    const linked = infQids
      .map((q) => byQid.get(q))
      .filter((x): x is (typeof arts)[number] => !!x && x.id !== a.id);
    if (!linked.length) continue;

    const extract = a.wikipediaTitle ? await fullExtract(a.wikipediaTitle) : "";
    for (const inf of linked) {
      const note = findAnecdote(extract, inf.name);
      await db
        .insert(influences)
        .values({ artistId: a.id, influencerId: inf.id, note });
      count++;
      if (note) withNote++;
    }
    console.log(
      `  ${a.name.padEnd(26)} ← ${linked.map((l) => l.name).join(", ")}`,
    );
    await sleep(120);
  }

  console.log(`\n— Done — ${count} links, ${withNote} with anecdotes`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
