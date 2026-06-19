"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useT } from "@/components/LocaleProvider";
import { useAudio } from "@/components/AudioProvider";
import { type Locale } from "@/lib/i18n";
import { getGuideVolume, useGuideVolume } from "@/lib/guideAudio";

const BCP47: Record<Locale, string> = { en: "en-US", fr: "fr-FR", ja: "ja-JP" };

// Press-to-listen narration (neural via /api/narrate, with the browser voice as
// a fallback), ducking the soundscape while it plays. A volume slider appears
// while it speaks; the level is shared across every guide (see lib/guideAudio).
export default function GuideButton({
  params,
  text,
  accent,
}: {
  params: { id: number } | { artist: number };
  text: string | null;
  accent: string;
}) {
  const t = useT();
  const { locale } = useLocale();
  const { setDucked } = useAudio();
  const [speaking, setSpeaking] = useState(false);
  const speakingRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [volume, setVolume] = useGuideVolume();

  // keep the playing narration in sync with the shared volume
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const stopAll = () => {
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    window.speechSynthesis?.cancel();
    speakingRef.current = false;
    setSpeaking(false);
    setDucked(false);
  };

  const speakBrowser = () => {
    const synth = window.speechSynthesis;
    if (!synth || !text) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = BCP47[locale];
    u.rate = 0.96;
    u.volume = getGuideVolume();
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

  const speak = () => {
    if (!text) return;
    if (speakingRef.current) {
      stopAll();
      return;
    }
    speakingRef.current = true;
    setSpeaking(true);
    setDucked(true);
    const q = "id" in params ? `id=${params.id}` : `artist=${params.artist}`;
    const el = new Audio(`/api/narrate?${q}&lang=${locale}`);
    el.volume = getGuideVolume();
    audioRef.current = el;
    let handled = false;
    const fallback = () => {
      if (handled || audioRef.current !== el) return;
      handled = true;
      audioRef.current = null;
      speakingRef.current = false;
      setSpeaking(false);
      setDucked(false);
      speakBrowser();
    };
    el.onended = stopAll;
    el.onerror = fallback;
    el.play().catch(fallback);
  };

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
      window.speechSynthesis?.cancel();
      setDucked(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!text) return null;

  return (
    <div className="flex items-center gap-2.5">
      <button
        onClick={speak}
        className="inline-flex w-fit items-center gap-2 rounded-full border px-3.5 py-1.5 text-[12px] transition-colors"
        style={{
          borderColor: speaking ? accent : "var(--line)",
          color: speaking ? accent : "var(--ink-soft)",
          background: speaking ? `${accent}1f` : "transparent",
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          {speaking ? (
            <rect x="6" y="6" width="12" height="12" rx="1.5" />
          ) : (
            <path d="M8 5v14l11-7z" />
          )}
        </svg>
        {t("listen")}
      </button>
      {speaking && (
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          aria-label="Volume"
          className="h-1 w-20 cursor-pointer"
          style={{ accentColor: accent }}
        />
      )}
    </div>
  );
}
