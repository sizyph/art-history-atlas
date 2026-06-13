import type { NextRequest } from "next/server";

export const runtime = "nodejs";

// Only Wikimedia/Wikipedia hosts — this is an image proxy, not an open relay.
const ALLOWED = /(^|\.)wikimedia\.org$|(^|\.)wikipedia\.org$/;

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u");
  if (!u) return new Response("missing u", { status: 400 });

  let target: URL;
  try {
    target = new URL(u);
  } catch {
    return new Response("bad url", { status: 400 });
  }
  if (target.protocol !== "https:" || !ALLOWED.test(target.hostname)) {
    return new Response("forbidden host", { status: 403 });
  }

  const upstream = await fetch(target.toString(), {
    headers: {
      "User-Agent": "ArtHistoryAtlas/0.1 (https://github.com/; steepening@gmail.com)",
      Accept: "image/*",
    },
    redirect: "follow",
  });

  if (!upstream.ok || !upstream.body) {
    return new Response("upstream error", { status: 502 });
  }

  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("content-type") ?? "image/jpeg");
  headers.set("Cache-Control", "public, max-age=604800, immutable");
  headers.set("Access-Control-Allow-Origin", "*");
  return new Response(upstream.body, { status: 200, headers });
}
