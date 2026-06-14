/**
 * Fill missing fr/ja painting stories by machine-translating the English
 * Wikipedia story. English stays the Wikipedia source of truth; other locales
 * fall back to a good translation only where no native-language article exists.
 * Idempotent: only fills locales whose story is currently empty.
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
  const { paintings } = await import("../db/schema");
  const { eq } = await import("drizzle-orm");

  const rows = await db.select().from(paintings);
  console.log(`— FILL TRANSLATIONS — ${rows.length} paintings\n`);

  let filled = 0;
  let touched = 0;
  for (const p of rows) {
    if (!p.story) continue;
    const i18n = {
      ...((p.i18n ?? {}) as Record<string, { title?: string; story?: string }>),
    };
    let changed = false;
    for (const lang of LANGS) {
      if (i18n[lang]?.story) continue;
      try {
        const story = await translate(p.story, lang);
        if (story && story.trim()) {
          i18n[lang] = { ...(i18n[lang] ?? {}), story: story.trim() };
          changed = true;
          filled++;
        }
      } catch {
        console.log(`  ✗ ${lang} ${p.title}`);
      }
    }
    if (changed) {
      await db.update(paintings).set({ i18n }).where(eq(paintings.id, p.id));
      touched++;
      if (touched % 20 === 0) console.log(`  …${touched} paintings updated`);
    }
  }
  console.log(`\n— Done — ${filled} stories filled across ${touched} paintings`);
  process.exit(0);
}

main();
