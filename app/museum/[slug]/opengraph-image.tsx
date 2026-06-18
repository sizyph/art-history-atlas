import { ImageResponse } from "next/og";
import { getArtistBySlug } from "@/lib/data";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "ars gratia artis";

const UA = "ArtHistoryAtlas/0.1 (https://nuit-etoilee.vercel.app; steepening@gmail.com)";

const atWidth = (url: string, w: number) => {
  const base = url.replace(/[?&]width=\d+/g, "");
  return `${base}${base.includes("?") ? "&" : "?"}width=${w}`;
};

// Fetch the image ourselves (with a UA Commons accepts) and embed it, so Satori
// never has to fetch — avoids its size-detection and large-file timeouts.
async function dataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get("content-type") || "image/jpeg";
    return `data:${ct};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

// A social-preview card: the artist's signature work, framed, on a dark ground.
export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getArtistBySlug(slug).catch(() => null);
  const painting = data?.paintings?.[0];

  const src = painting ? await dataUrl(atWidth(painting.imageUrl, 700)) : null;

  const aspect =
    painting?.width && painting?.height ? painting.width / painting.height : 1.3;
  let w = 760;
  let h = Math.round(w / aspect);
  if (h > 470) {
    h = 470;
    w = Math.round(h * aspect);
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(ellipse at center, #181410 0%, #0b0a08 75%)",
        }}
      >
        <div
          style={{
            display: "flex",
            padding: 14,
            background: "#0e0c09",
            border: "7px solid #b08a3c",
            boxShadow: "0 30px 90px rgba(0,0,0,0.7)",
          }}
        >
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="" width={w} height={h} />
          ) : (
            <div style={{ width: 520, height: 360, background: "#1a160f" }} />
          )}
        </div>
      </div>
    ),
    { ...size },
  );
}
