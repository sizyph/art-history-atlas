/**
 * Content translation: fill artists.i18n and paintings.i18n for fr + ja, all
 * from Wikidata (labels, country of citizenship) and the French / Japanese
 * Wikipedias (article summaries). Nothing invented — English values remain the
 * fallback wherever a language lacks the article/label.
 *
 *   npm run translate
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";

const UA = "ArtHistoryAtlas/0.1 (https://github.com/; steepening@gmail.com)";
const LANGS = ["fr", "ja"] as const;
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

async function wbGetEntities(
  ids: string[],
  props: string,
  extra = "",
): Promise<Record<string, any>> {
  if (!ids.length) return {};
  const url =
    `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json` +
    `&ids=${ids.join("|")}&props=${props}&languages=fr|ja${extra}`;
  const d = await fetchJson(url);
  await sleep(150);
  return d?.entities ?? {};
}

async function summaryExtract(lang: string, title: string): Promise<string | null> {
  const d = await fetchJson(
    `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
  );
  const ex = d?.extract;
  return typeof ex === "string" && ex.length > 0 ? ex : null;
}

async function main() {
  const { db } = await import("../db");
  const { artists, paintings } = await import("../db/schema");
  console.log("— TRANSLATE → Neon (fr, ja) —\n");

  // ── Artists ────────────────────────────────────────────────────────────
  const arts = await db.select().from(artists);
  const countryQids = new Set<string>();
  const collected: {
    id: number;
    name: string;
    labels: Record<string, string | undefined>;
    country?: string;
    titles: Record<string, string | undefined>;
  }[] = [];

  for (const a of arts) {
    if (!a.wikidataQid) continue;
    const ents = await wbGetEntities(
      [a.wikidataQid],
      "labels|claims|sitelinks",
      "&sitefilter=frwiki|jawiki",
    );
    const e = ents[a.wikidataQid];
    if (!e) continue;
    const country = (e.claims?.P27 ?? [])
      .map((c: any) => c?.mainsnak?.datavalue?.value?.id)
      .filter(Boolean)[0];
    if (country) countryQids.add(country);
    collected.push({
      id: a.id,
      name: a.name,
      labels: { fr: e.labels?.fr?.value, ja: e.labels?.ja?.value },
      country,
      titles: {
        fr: e.sitelinks?.frwiki?.title,
        ja: e.sitelinks?.jawiki?.title,
      },
    });
  }

  // Country labels in fr/ja
  const countryLabels: Record<string, Record<string, string | undefined>> = {};
  const cq = [...countryQids];
  for (let i = 0; i < cq.length; i += 50) {
    const ents = await wbGetEntities(cq.slice(i, i + 50), "labels");
    for (const q of Object.keys(ents)) {
      countryLabels[q] = {
        fr: ents[q].labels?.fr?.value,
        ja: ents[q].labels?.ja?.value,
      };
    }
  }

  let aDone = 0;
  for (const c of collected) {
    const i18n: Record<string, any> = {};
    for (const lang of LANGS) {
      const bio = c.titles[lang]
        ? await summaryExtract(lang, c.titles[lang]!)
        : null;
      const nat = c.country ? countryLabels[c.country]?.[lang] : undefined;
      const entry: Record<string, string> = {};
      if (c.labels[lang]) entry.name = c.labels[lang]!;
      if (nat) entry.nationality = nat;
      if (bio) entry.bio = bio;
      if (Object.keys(entry).length) i18n[lang] = entry;
    }
    await db.update(artists).set({ i18n }).where(eq(artists.id, c.id));
    aDone++;
    const tag = LANGS.map(
      (l) => `${l}:${i18n[l]?.bio ? "bio" : i18n[l]?.name ? "name" : "—"}`,
    ).join(" ");
    console.log(`  ${c.name.padEnd(26)} ${tag}`);
    await sleep(80);
  }

  // ── Painting titles ───────────────────────────────────────────────────
  const ps = await db.select().from(paintings);
  const withQid = ps.filter((p) => p.wikidataQid);
  const titleMap: Record<string, Record<string, string | undefined>> = {};
  const pq = [...new Set(withQid.map((p) => p.wikidataQid!))];
  for (let i = 0; i < pq.length; i += 50) {
    const ents = await wbGetEntities(pq.slice(i, i + 50), "labels");
    for (const q of Object.keys(ents)) {
      titleMap[q] = {
        fr: ents[q].labels?.fr?.value,
        ja: ents[q].labels?.ja?.value,
      };
    }
  }

  let pDone = 0;
  for (const p of withQid) {
    const tl = titleMap[p.wikidataQid!];
    if (!tl || (!tl.fr && !tl.ja)) continue;
    const i18n: Record<string, any> = {};
    for (const lang of LANGS) if (tl[lang]) i18n[lang] = { title: tl[lang] };
    if (!Object.keys(i18n).length) continue;
    await db.update(paintings).set({ i18n }).where(eq(paintings.id, p.id));
    pDone++;
  }

  console.log(
    `\n— Done — artists: ${aDone}/${arts.length} · painting titles: ${pDone}/${ps.length}`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
