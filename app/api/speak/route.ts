import type { NextRequest } from "next/server";
import { synthesize, ttsConfigured } from "@/lib/tts";
import { LOCALES, type Locale } from "@/lib/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Speak arbitrary text in the neural Ava voice — used for the docent's spoken
// prompt and its spoken answer (the painting/artist guides use /api/narrate).
export async function POST(req: NextRequest) {
  if (!ttsConfigured()) {
    return new Response("tts not configured", { status: 503 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }
  const text = String(body.text ?? "")
    .slice(0, 1200)
    .trim();
  const lang = (body.lang ?? "en") as Locale;
  if (!text || !LOCALES.includes(lang)) {
    return new Response("bad request", { status: 400 });
  }
  try {
    const buf = await synthesize(text, lang);
    return new Response(new Uint8Array(buf), {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch {
    return new Response("tts failed", { status: 502 });
  }
}
