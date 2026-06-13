"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { StarArtist } from "@/lib/timeline";

export default function ArtistCard({
  artist,
  onClose,
}: {
  artist: StarArtist;
  onClose: () => void;
}) {
  const [shown, setShown] = useState(false);
  const [entering, setEntering] = useState(false);
  const router = useRouter();

  const startEnter = () => {
    setEntering(true);
    window.setTimeout(() => router.push(`/museum/${artist.slug}`), 700);
  };

  useEffect(() => {
    const r = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(r);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const dates =
    artist.birthYear != null || artist.deathYear != null
      ? `${artist.birthYear ?? "?"} – ${artist.deathYear ?? "?"}`
      : null;
  const sub = [artist.nationality, artist.periodName].filter(Boolean).join(" · ");
  const canEnter = artist.paintingCount > 0;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{
        background: "rgba(8,7,5,0.66)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        opacity: shown ? 1 : 0,
        transition: "opacity 0.4s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[460px] overflow-hidden rounded-2xl border border-line"
        style={{
          background: "#17130E",
          boxShadow: `0 30px 90px -20px rgba(0,0,0,0.85), 0 0 0 1px ${artist.periodColor}22`,
          transform: shown ? "translateY(0) scale(1)" : "translateY(16px) scale(0.985)",
          opacity: shown ? 1 : 0,
          transition:
            "transform 0.55s cubic-bezier(0.16,1,0.3,1), opacity 0.5s ease",
        }}
      >
        <div
          style={{
            height: 3,
            background: `linear-gradient(90deg, transparent, ${artist.periodColor}, transparent)`,
          }}
        />
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 text-2xl leading-none text-ink-faint transition-colors hover:text-ink"
        >
          ×
        </button>

        <div className="flex gap-5 p-6">
          <div className="shrink-0">
            {artist.portraitUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={artist.portraitUrl}
                alt={artist.name}
                className="h-[150px] w-[116px] rounded-md object-cover"
                style={{ border: "1px solid #38322A" }}
              />
            ) : (
              <div
                className="flex h-[150px] w-[116px] items-center justify-center rounded-md"
                style={{ background: "#221D16", border: "1px solid #38322A" }}
              >
                <span className="font-display text-3xl text-ink-faint">
                  {artist.name[0]}
                </span>
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 pt-1">
            <h2 className="font-display text-[26px] font-medium leading-tight text-ink">
              {artist.name}
            </h2>
            {dates && (
              <div
                className="mt-1.5 font-display text-[15px]"
                style={{ color: artist.periodColor }}
              >
                {dates}
              </div>
            )}
            {sub && (
              <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-ink-soft">
                {sub}
              </div>
            )}
          </div>
        </div>

        <div
          className="mx-6 h-px"
          style={{
            background: `linear-gradient(90deg, ${artist.periodColor}99, transparent)`,
          }}
        />

        <div className="px-6 pt-4">
          <p
            className="text-[14px] leading-relaxed text-ink-soft"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 6,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {artist.bio ?? "Biography unavailable."}
          </p>
        </div>

        <div className="flex items-end justify-between gap-4 p-6 pt-5">
          {canEnter ? (
            <button
              onClick={startEnter}
              className="group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-transform hover:scale-[1.02]"
              style={{ background: artist.periodColor, color: "#15120E" }}
            >
              Enter the museum
              <span className="transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </button>
          ) : (
            <span className="max-w-[60%] text-[12px] leading-snug text-ink-faint">
              Gallery unavailable — this artist&rsquo;s work is still in
              copyright, so no public-domain images exist on Commons.
            </span>
          )}
          <div className="shrink-0 text-right text-[11px] text-ink-faint">
            {artist.paintingCount > 0 && (
              <div className="mb-0.5">{artist.paintingCount} works</div>
            )}
            {artist.wikipediaUrl && (
              <a
                href={artist.wikipediaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-ink-soft"
              >
                Wikipedia
              </a>
            )}
          </div>
        </div>
      </div>

      {entering && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-hidden bg-black">
          {artist.portraitUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={artist.portraitUrl}
              alt=""
              className="h-[150px] w-[116px] object-cover"
              style={{
                animation: "dollyIn 0.72s cubic-bezier(0.6,0,0.85,1) forwards",
              }}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
