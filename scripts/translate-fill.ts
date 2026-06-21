/**
 * Fill missing fr/ja content by machine-translating from English: painting
 * titles + stories, and artist nationalities + bios. English stays the Wikipedia
 * source of truth; other locales fall back to a good translation only where no
 * native-language article exists. Idempotent: only fills empty fields.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const LANGS = ["fr", "ja"] as const;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Unofficial Google Translate endpoint (no key). Chunk long text on sentence
// boundaries to stay within the GET URL limit, then stitch the pieces back.
function chunk(text: string, max = 1400): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let buf = "";
  for (const sentence of text.split(/(?<=[.!?。！？])\s+/)) {
    if ((buf + " " + sentence).length > max && buf) {
      out.push(buf);
      buf = sentence;
    } else {
      buf = buf ? `${buf} ${sentence}` : sentence;
    }
  }
  if (buf) out.push(buf);
  return out;
}

async function translateOnce(text: string, target: string): Promise<string> {
  const url =
    `https://translate.googleapis.com/translate_a/single?client=gtx` +
    `&sl=en&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (res.status === 429 || res.status >= 500) {
        await sleep(800 * (attempt + 1));
        continue;
      }
      const data = (await res.json()) as [[[string]]];
      return data[0].map((seg) => seg[0]).join("");
    } catch {
      await sleep(600 * (attempt + 1));
    }
  }
  throw new Error("translate failed");
}

async function translate(text: string, target: string): Promise<string> {
  const parts = chunk(text);
  const done: string[] = [];
  for (const part of parts) {
    done.push(await translateOnce(part, target));
    await sleep(120);
  }
  return done.join(" ");
}

async function main() {
  const { db } = await import("../db");
  const { artists, paintings } = await import("../db/schema");
  const { eq } = await import("drizzle-orm");

  // ── Paintings: title + story ───────────────────────────────────────────
  const rows = await db.select().from(paintings);
  console.log(`— FILL TRANSLATIONS — ${rows.length} paintings\n`);

  let filled = 0;
  let touched = 0;
  for (const p of rows) {
    const i18n = {
      ...((p.i18n ?? {}) as Record<string, { title?: string; story?: string }>),
    };
    let changed = false;
    for (const lang of LANGS) {
      const entry = { ...(i18n[lang] ?? {}) };
      if (p.title && !entry.title) {
        try {
          const title = (await translate(p.title, lang)).trim();
          if (title) {
            entry.title = title;
            changed = true;
            filled++;
          }
        } catch {
          console.log(`  ✗ ${lang} title ${p.title}`);
        }
      }
      if (p.story && !entry.story) {
        try {
          const story = (await translate(p.story, lang)).trim();
          if (story) {
            entry.story = story;
            changed = true;
            filled++;
          }
        } catch {
          console.log(`  ✗ ${lang} story ${p.title}`);
        }
      }
      i18n[lang] = entry;
    }
    if (changed) {
      await db.update(paintings).set({ i18n }).where(eq(paintings.id, p.id));
      touched++;
      if (touched % 20 === 0) console.log(`  …${touched} paintings updated`);
    }
  }
  console.log(`— paintings: ${filled} fields filled across ${touched} rows\n`);

  // ── Artists: nationality + bio ─────────────────────────────────────────
  const arts = await db.select().from(artists);
  console.log(`— ${arts.length} artists\n`);
  let aFilled = 0;
  let aTouched = 0;
  for (const a of arts) {
    const i18n = {
      ...((a.i18n ?? {}) as Record<
        string,
        { name?: string; nationality?: string; bio?: string }
      >),
    };
    let changed = false;
    for (const lang of LANGS) {
      const entry = { ...(i18n[lang] ?? {}) };
      if (a.nationality && !entry.nationality) {
        try {
          const v = (await translate(a.nationality, lang)).trim();
          if (v) {
            entry.nationality = v;
            changed = true;
            aFilled++;
          }
        } catch {
          console.log(`  ✗ ${lang} nat ${a.name}`);
        }
      }
      if (a.bio && !entry.bio) {
        try {
          const v = (await translate(a.bio, lang)).trim();
          if (v) {
            entry.bio = v;
            changed = true;
            aFilled++;
          }
        } catch {
          console.log(`  ✗ ${lang} bio ${a.name}`);
        }
      }
      i18n[lang] = entry;
    }
    if (changed) {
      await db.update(artists).set({ i18n }).where(eq(artists.id, a.id));
      aTouched++;
    }
  }
  console.log(`— artists: ${aFilled} fields filled across ${aTouched} rows`);
  console.log(`\n— Done —`);
  process.exit(0);
}

main();
