"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { StarArtist } from "@/lib/timeline";
import { useLocale, useT } from "@/components/LocaleProvider";
import { useAudio } from "@/components/AudioProvider";
import EntryDoor from "@/components/EntryDoor";
import { localized, periodName } from "@/lib/i18n";
import { MUSEUMS, getMuseum } from "@/lib/museums";

export default function ArtistCard({
  artist,
  onClose,
}: {
  artist: StarArtist;
  onClose: () => void;
}) {
  const [shown, setShown] = useState(false);
  const [entering, setEntering] = useState(false);
  const [museumId, setMuseumId] = useState("nezu");
  const router = useRouter();
  const t = useT();
  const { locale } = useLocale();
  const { enterMuseum } = useAudio();
  const selMuseum = getMuseum(museumId);
  const enterColor = selMuseum.signature;

  // Press the threshold: the presentation card becomes the entrance door and is
  // pushed inward; a loud vernissage greets you and muffles as you cross. The
  // gallery's own intro takes over once we navigate.
  const startEnter = () => {
    setEntering(true);
    enterMuseum();
    window.setTimeout(
      () => router.push(`/museum/${artist.slug}?intro=1&museum=${museumId}`),
      3950,
    );
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
  const displayName =
    localized(locale, artist.i18n, "name", artist.name) ?? artist.name;
  const displayBio = localized(locale, artist.i18n, "bio", artist.bio);
  const nationality = localized(
    locale,
    artist.i18n,
    "nationality",
    artist.nationality,
  );
  const sub = [nationality, periodName(locale, artist.periodName)]
    .filter(Boolean)
    .join(" · ");
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
                  {displayName[0]}
                </span>
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 pt-1">
            <h2 className="font-display text-[26px] font-medium leading-tight text-ink">
              {displayName}
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
            {displayBio ?? t("biographyUnavailable")}
          </p>
        </div>

        <div className="p-6 pt-5">
          {canEnter ? (
            <>
              <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-ink-faint">
                {t("chooseMuseum")}
              </div>
              <div className="flex items-stretch gap-2">
                <div className="relative flex-1">
                  <select
                    value={museumId}
                    onChange={(e) => setMuseumId(e.target.value)}
                    className="w-full appearance-none rounded-full border border-line bg-[#221D16] py-2.5 pl-4 pr-9 text-sm text-ink outline-none transition-colors hover:border-white/25 focus:border-white/35"
                    style={{ colorScheme: "dark" }}
                  >
                    {MUSEUMS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] text-ink-faint">
                    ▾
                  </span>
                </div>
                <button
                  onClick={startEnter}
                  className="group inline-flex shrink-0 items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-medium transition-transform hover:scale-[1.03]"
                  style={{ background: enterColor, color: "#15120E" }}
                >
                  {t("enter")}
                  <span className="transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </button>
              </div>
              <p className="mt-2.5 text-[11px] leading-snug text-ink-faint">
                {selMuseum.blurb[locale]}
              </p>
              <div className="mt-3 flex items-center justify-between text-[11px] text-ink-faint">
                <span>
                  {artist.paintingCount > 0 && t("works", { n: artist.paintingCount })}
                </span>
                {artist.wikipediaUrl && (
                  <a
                    href={artist.wikipediaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:text-ink-soft"
                  >
                    {t("wikipedia")}
                  </a>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-end justify-between gap-4">
              <span className="max-w-[60%] text-[12px] leading-snug text-ink-faint">
                {t("galleryUnavailable")}
              </span>
              {artist.wikipediaUrl && (
                <a
                  href={artist.wikipediaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-[11px] text-ink-faint underline underline-offset-2 hover:text-ink-soft"
                >
                  {t("wikipedia")}
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {entering && (
        <EntryDoor
          portraitUrl={artist.portraitUrl}
          name={displayName}
          dates={dates}
          sub={sub}
          bio={displayBio ?? t("biographyUnavailable")}
          birthYear={artist.birthYear}
          deathYear={artist.deathYear}
          accent={enterColor}
        />
      )}
    </div>
  );
}
