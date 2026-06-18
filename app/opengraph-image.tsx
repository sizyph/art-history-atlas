import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "ars gratia artis — an atlas of art history";

// Home social card: a triptych of public-domain masterworks on a dark ground.
const WORKS = [
  "Caravaggio%20-%20Medusa%20-%20Google%20Art%20Project.jpg",
  "Jan%20Vermeer%20van%20Delft%20-%20Young%20Woman%20with%20a%20Pearl%20Necklace%20-%20Google%20Art%20Project.jpg",
  "Edvard%20Munch%20-%20Evening%20on%20Karl%20Johan%20Street%20%281892%29.jpg",
];

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 28,
          padding: 40,
          background:
            "radial-gradient(ellipse at center, #181410 0%, #080705 80%)",
        }}
      >
        {WORKS.map((w) => (
          <div
            key={w}
            style={{
              display: "flex",
              padding: 10,
              background: "#0e0c09",
              border: "6px solid #b08a3c",
              boxShadow: "0 24px 70px rgba(0,0,0,0.7)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://commons.wikimedia.org/wiki/Special:FilePath/${w}?width=520`}
              alt=""
              style={{ height: 420, objectFit: "contain" }}
            />
          </div>
        ))}
      </div>
    ),
    { ...size },
  );
}
