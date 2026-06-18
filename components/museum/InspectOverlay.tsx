"use client";

import { useEffect, useRef, useState } from "react";
import type { Painting } from "@/db/schema";
import { useLocale, useT } from "@/components/LocaleProvider";
import { useAudio } from "@/components/AudioProvider";
import { localized, type Locale } from "@/lib/i18n";
import FullscreenViewer from "@/components/museum/FullscreenViewer";

const BCP47: Record<Locale, string> = {
  en: "en-US",
  fr: "fr-FR",
  ja: "ja-JP",
};

function ExpandIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 3H3v5M16 3h5v5M16 21h5v-5M8 21H3v-5" />
    </svg>
  );
}

export default function InspectOverlay({
  painting,
  accent,
  onClose,
}: {
  painting: Painting;
  accent: string;
  onClose: () => void;
}) {
  const [shown, setShown] = useState(false);
  const [fs, setFs] = useState(false);
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const t = useT();
  const { setDucked } = useAudio();
  const speakingRef = useRef(false);

  const share = async () => {
    const url = `${location.origin}${location.pathname}?work=${painting.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: painting.title, url });
        return;
      }
    } catch {
      return; // user dismissed the native share sheet
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {}
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

  const { locale } = useLocale();
  const facts = (painting.facts ?? []) as string[];
  const title =
    localized(locale, painting.i18n, "title", painting.title) ?? painting.title;
  const story = localized(locale, painting.i18n, "story", painting.story);

  // audio guide: read the story aloud in the current language (browser TTS),
  // ducking the soundscape while it plays.
  const speak = () => {
    const synth = window.speechSynthesis;
    if (!synth || !story) return;
    if (speakingRef.current) {
      synth.cancel(); // onend resets state + un-ducks
      return;
    }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(story);
    u.lang = BCP47[locale];
    u.rate = 0.96;
    const v = synth
      .getVoices()
      .find((x) => x.lang?.toLowerCase().startsWith(locale));
    if (v) u.voice = v;
    const done = () => {
      speakingRef.current = false;
      setSpeaking(false);
      setDucked(false);
    };
    u.onend = done;
    u.onerror = done;
    speakingRef.current = true;
    setSpeaking(true);
    setDucked(true);
    synth.speak(u);
  };

  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
      speakingRef.current = false;
      setSpeaking(false);
      setDucked(false);
    };
  }, [painting, setDucked]);

  return (
    <div
      onClick={onClose}
      data-testid="inspect"
      className="absolute inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
      style={{
        background: "rgba(6,5,4,0.82)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        opacity: shown ? 1 : 0,
        transition: "opacity 0.5s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[92vh] w-full max-w-[1180px] flex-col overflow-hidden rounded-2xl border border-line md:flex-row"
        style={{
          background: "#141009",
          boxShadow: "0 40px 120px -30px rgba(0,0,0,0.9)",
          transform: shown ? "scale(1)" : "scale(0.985)",
          opacity: shown ? 1 : 0,
          transition:
            "transform 0.55s cubic-bezier(0.16,1,0.3,1), opacity 0.4s ease",
        }}
      >
        <div className="relative flex min-h-[38vh] flex-1 items-center justify-center bg-black p-4 md:p-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={painting.imageUrl}
            alt={painting.title}
            onClick={() => setFs(true)}
            title={t("fullscreen")}
            className="max-h-[82vh] max-w-full cursor-zoom-in object-contain"
            style={{ boxShadow: `0 0 0 1px ${accent}55, 0 30px 80px -20px #000` }}
          />
          <button
            onClick={() => setFs(true)}
            aria-label={t("fullscreen")}
            title={t("fullscreen")}
            className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/25 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/50 hover:text-white"
          >
            <ExpandIcon />
          </button>
        </div>

        <div className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto p-7 md:w-[360px]">
          <div>
            <h2 className="font-display text-[26px] leading-tight text-ink">
              {title}
            </h2>
            <div className="mt-1 text-sm" style={{ color: accent }}>
              {painting.year ?? t("dateUnknown")}
              {painting.location ? ` · ${painting.location}` : ""}
            </div>
          </div>

          {story && (
            <button
              onClick={speak}
              className="inline-flex w-fit items-center gap-2 rounded-full border px-3.5 py-1.5 text-[12px] transition-colors"
              style={{
                borderColor: speaking ? accent : "var(--line)",
                color: speaking ? accent : "var(--ink-soft)",
                background: speaking ? `${accent}1f` : "transparent",
              }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="currentColor"
                stroke="none"
              >
                {speaking ? (
                  <rect x="6" y="6" width="12" height="12" rx="1.5" />
                ) : (
                  <path d="M8 5v14l11-7z" />
                )}
              </svg>
              {t("listen")}
            </button>
          )}

          {story && (
            <p className="text-[14px] leading-relaxed text-ink-soft">
              {story}
            </p>
          )}

          {facts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {facts.map((f, i) => (
                <span
                  key={i}
                  className="rounded-full border border-line px-3 py-1 text-[11px] text-ink-soft"
                >
                  {f}
                </span>
              ))}
            </div>
          )}

          <div className="mt-auto flex items-center justify-between gap-3 pt-2 text-[11px] text-ink-faint">
            <button
              onClick={share}
              className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 transition-colors hover:text-ink-soft"
              style={{ color: copied ? "var(--gold)" : undefined }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
              </svg>
              {copied ? t("linkCopied") : t("share")}
            </button>
            <div className="flex gap-3">
              {painting.sourceUrl && (
                <a
                  href={painting.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-ink-soft"
                >
                  Commons
                </a>
              )}
              {painting.wikipediaUrl && (
                <a
                  href={painting.wikipediaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-ink-soft"
                >
                  {t("wikipedia")}
                </a>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 text-2xl leading-none text-ink-faint hover:text-ink"
        >
          ×
        </button>
      </div>

      {fs && (
        <FullscreenViewer painting={painting} onClose={() => setFs(false)} />
      )}
    </div>
  );
}
