import type { NextRequest } from "next/server";
import { ask, askConfigured, type AskContext } from "@/lib/ask";
import { LOCALES, type Locale } from "@/lib/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // No key yet → the client shows a graceful "ask unavailable" message.
  if (!askConfigured()) {
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
  };
  try {
    const result = await ask(question, ctx, lang);
    return Response.json(result);
  } catch {
    return new Response("ask failed", { status: 502 });
  }
}
