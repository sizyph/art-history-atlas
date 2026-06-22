import type { NextRequest } from "next/server";
import { ask, askConfigured, type AskContext, type AskResult } from "@/lib/ask";
import { askGroq, groqConfigured } from "@/lib/askGroq";
import { LOCALES, type Locale } from "@/lib/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Warm-lambda cache: identical questions (same language + work) reuse the answer
// instead of spending another model call — gentler on the free-tier quota.
const mem = new Map<string, AskResult>();

export async function POST(req: NextRequest) {
  // No brain configured at all → the client shows a graceful "unavailable".
  if (!askConfigured() && !groqConfigured()) {
    return new Response("ask not configured", { status: 503 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }
  const question = String(body.question ?? "")
    .slice(0, 500)
    .trim();
  const lang = (body.lang ?? "en") as Locale;
  if (!question || !LOCALES.includes(lang)) {
    return new Response("bad request", { status: 400 });
  }
  const ctx: AskContext = {
    artist: body.artist ? String(body.artist).slice(0, 120) : undefined,
    museum: body.museum ? String(body.museum).slice(0, 120) : undefined,
    work: body.work ? String(body.work).slice(0, 160) : undefined,
    region: body.region ? String(body.region).slice(0, 200) : undefined,
  };
  // base64 JPEG of the exact deep-zoom view; ignore anything implausibly large
  let image =
    typeof body.image === "string" && body.image.length < 1_800_000
      ? body.image
      : undefined;

  // Cache only text answers — an attached view is specific to that moment.
  const cacheKey = image ? null : `${lang}:${ctx.work ?? ""}:${question.toLowerCase()}`;
  if (cacheKey) {
    const hit = mem.get(cacheKey);
    if (hit) return Response.json(hit);
  }

  // Gemini first (keeps web-search sources); on any failure — most often its
  // small free-tier quota — fall back to Groq (free, higher limits, no sources).
  let result: AskResult | null = null;
  let primaryErr: unknown = null;
  if (askConfigured()) {
    try {
      result = await ask(question, ctx, lang, image);
    } catch (e) {
      primaryErr = e;
    }
  }
  if (!result && groqConfigured()) {
    try {
      result = await askGroq(question, ctx, lang, image);
    } catch (e) {
      if (!primaryErr) primaryErr = e;
    }
  }
  image = undefined; // free the base64

  if (result) {
    if (cacheKey) {
      if (mem.size > 80) mem.clear();
      mem.set(cacheKey, result);
    }
    return Response.json(result);
  }

  // everything failed → tell the client the docent is busy, not broken
  const busy = primaryErr instanceof Error && primaryErr.message === "rate_limited";
  return new Response(busy ? "busy" : "ask failed", {
    status: busy ? 429 : 502,
  });
}
