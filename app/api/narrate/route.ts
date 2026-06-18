import type { NextRequest } from "next/server";
import { getPaintingById } from "@/lib/data";
import { localized, LOCALES, type Locale } from "@/lib/i18n";
import { synthesize, ttsConfigured } from "@/lib/tts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Warm-lambda cache so repeat listens (and local dev, where there's no CDN in
// front) don't re-synthesize. The real cache is the immutable HTTP/CDN response.
const mem = new Map<string, Buffer>();

function audio(buf: Buffer): Response {
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
    },
  });
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const id = Number(sp.get("id"));
  const lang = (sp.get("lang") || "en") as Locale;
  if (!id || !LOCALES.includes(lang)) {
    return new Response("bad request", { status: 400 });
  }
  // No key yet → tell the client to use its browser-voice fallback.
  if (!ttsConfigured()) {
    return new Response("audio guide not configured", { status: 503 });
  }

  const cacheKey = `${id}:${lang}`;
  const hit = mem.get(cacheKey);
  if (hit) return audio(hit);

  const p = await getPaintingById(id);
  if (!p) return new Response("not found", { status: 404 });
  const text = localized(lang, p.i18n, "story", p.story);
  if (!text) return new Response("no story", { status: 404 });

  try {
    const buf = await synthesize(text, lang);
    if (mem.size > 64) mem.clear();
    mem.set(cacheKey, buf);
    return audio(buf);
  } catch {
    return new Response("tts failed", { status: 502 });
  }
}
