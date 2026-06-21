"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useT } from "@/components/LocaleProvider";
import { useAudio } from "@/components/AudioProvider";
import { getGuideVolume } from "@/lib/guideAudio";
import { type Locale } from "@/lib/i18n";

const BCP47: Record<Locale, string> = { en: "en-US", fr: "fr-FR", ja: "ja-JP" };
const SILENCE_MS = 4000;

type Phase = "idle" | "listening" | "thinking" | "answering" | "error";
type Source = { title: string; uri: string };

// A spoken docent: tap the "?", it asks aloud, listens (auto-stops after 4s of
// silence), answers with a free LLM + web search, and reads the reply in the
// same neural Ava voice — with the text and sources on a card.
export default function AskDocent({
  artist,
  museum,
  getWork,
}: {
  artist: string;
  museum: string;
  getWork: () => string | null;
}) {
  const t = useT();
  const { locale } = useLocale();
  const { setDucked } = useAudio();

  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [typed, setTyped] = useState("");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const silence = useRef<number | undefined>(undefined);
  const finalRef = useRef("");
  const openRef = useRef(false);

  const supported =
    typeof window !== "undefined" &&
    ("webkitSpeechRecognition" in window || "SpeechRecognition" in window);

  const clearSilence = () => {
    if (silence.current !== undefined) {
      window.clearTimeout(silence.current);
      silence.current = undefined;
    }
  };

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setDucked(false);
  };

  const stopRec = () => {
    clearSilence();
    if (recRef.current) {
      try {
        recRef.current.onend = null;
        recRef.current.onresult = null;
        recRef.current.onerror = null;
        recRef.current.stop();
      } catch {}
      recRef.current = null;
    }
  };

  // Speak text in the Ava voice; resolves when finished (or immediately if TTS
  // is unavailable). Ducks the soundscape while it plays.
  const speak = (text: string) =>
    new Promise<void>((resolve) => {
      const el = new Audio();
      audioRef.current = el;
      setDucked(true);
      fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, lang: locale }),
      })
        .then((r) => (r.ok ? r.blob() : Promise.reject()))
        .then((blob) => {
          if (audioRef.current !== el) return resolve();
          el.src = URL.createObjectURL(blob);
          el.volume = getGuideVolume();
          const done = () => {
            if (audioRef.current === el) audioRef.current = null;
            setDucked(false);
            resolve();
          };
          el.onended = done;
          el.onerror = done;
          el.play().catch(done);
        })
        .catch(() => {
          if (audioRef.current === el) audioRef.current = null;
          setDucked(false);
          resolve();
        });
    });

  const submit = async (question: string) => {
    const q = question.trim();
    if (!q) {
      setPhase("idle");
      return;
    }
    setPhase("thinking");
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          lang: locale,
          artist,
          museum,
          work: getWork() ?? undefined,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { answer: string; sources: Source[] };
      if (!openRef.current) return;
      setAnswer(data.answer);
      setSources(data.sources ?? []);
      setPhase("answering");
      await speak(data.answer);
    } catch {
      if (openRef.current) setPhase("error");
    }
  };

  const startListening = () => {
    if (!supported) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR: any =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).SpeechRecognition ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = BCP47[locale];
    rec.continuous = true;
    rec.interimResults = true;
    finalRef.current = "";
    setTranscript("");
    setPhase("listening");

    const armSilence = () => {
      clearSilence();
      silence.current = window.setTimeout(() => {
        try {
          rec.stop();
        } catch {}
      }, SILENCE_MS);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const txt = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalRef.current += txt;
        else interim += txt;
      }
      setTranscript((finalRef.current + interim).trim());
      armSilence();
    };
    rec.onerror = () => {
      clearSilence();
    };
    rec.onend = () => {
      clearSilence();
      recRef.current = null;
      if (!openRef.current) return;
      const q = finalRef.current.trim() || transcript.trim();
      if (q) submit(q);
      else setPhase("idle");
    };

    recRef.current = rec;
    try {
      rec.start();
      armSilence(); // autostop even if the visitor says nothing
    } catch {
      setPhase("idle");
    }
  };

  const begin = async () => {
    setOpen(true);
    openRef.current = true;
    setAnswer("");
    setSources([]);
    setTranscript("");
    if (supported) {
      await speak(t("askPrompt"));
      if (openRef.current) startListening();
    } else {
      setPhase("idle"); // text-input fallback shows
    }
  };

  const close = () => {
    openRef.current = false;
    setOpen(false);
    setPhase("idle");
    stopRec();
    stopAudio();
    setTranscript("");
    setTyped("");
  };

  useEffect(() => {
    return () => {
      openRef.current = false;
      clearSilence();
      stopRec();
      stopAudio();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!open) {
    return (
      <button
        onClick={begin}
        aria-label={t("ask")}
        title={t("ask")}
        className="pointer-events-auto absolute right-6 top-1/2 z-30 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/45 text-xl text-ink backdrop-blur transition-colors hover:bg-black/65"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9.1 9a3 3 0 1 1 5.8 1c0 2-3 2.5-3 4" />
          <circle cx="12" cy="18" r="0.6" fill="currentColor" stroke="none" />
        </svg>
      </button>
    );
  }

  const listening = phase === "listening";
  return (
    <div className="pointer-events-auto absolute right-6 top-1/2 z-30 flex w-[340px] max-w-[86vw] -translate-y-1/2 flex-col gap-3 rounded-2xl border border-white/15 bg-black/70 p-4 backdrop-blur">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.22em] text-ink-faint">
          {t("ask")}
        </span>
        <button
          onClick={close}
          aria-label="Close"
          className="text-xl leading-none text-ink-faint transition-colors hover:text-ink"
        >
          ×
        </button>
      </div>

      {(listening || phase === "idle") && supported && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                listening ? "animate-pulse bg-[var(--gold)]/25" : "bg-white/10"
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="2" width="6" height="12" rx="3" />
                <path d="M5 10a7 7 0 0 0 14 0M12 19v3" />
              </svg>
            </span>
            <span className="text-[13px] text-ink-soft">
              {listening ? t("askListening") : t("askPrompt")}
            </span>
          </div>
          {transcript && (
            <p className="text-[14px] italic leading-relaxed text-ink">
              “{transcript}”
            </p>
          )}
          {listening && (
            <button
              onClick={stopRec}
              className="self-start rounded-full border border-white/15 px-3.5 py-1.5 text-[12px] uppercase tracking-[0.15em] text-ink-soft transition-colors hover:text-ink"
            >
              {t("askStop")}
            </button>
          )}
        </div>
      )}

      {!supported && phase !== "thinking" && phase !== "answering" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(typed);
          }}
          className="flex flex-col gap-2"
        >
          <input
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={t("askPlaceholder")}
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-[14px] text-ink outline-none placeholder:text-ink-faint focus:border-white/35"
          />
          <button
            type="submit"
            className="self-start rounded-full px-4 py-1.5 text-[12px] uppercase tracking-[0.15em]"
            style={{ background: "var(--gold)", color: "#15120E" }}
          >
            {t("ask")}
          </button>
        </form>
      )}

      {phase === "thinking" && (
        <div className="flex items-center gap-2 py-1 text-[13px] text-ink-soft">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/25 border-t-[var(--gold)]" />
          {t("askThinking")}
        </div>
      )}

      {phase === "answering" && (
        <div className="flex flex-col gap-3">
          <div
            data-scroll-list
            className="max-h-[40vh] overflow-y-auto pr-1 text-[14px] leading-relaxed text-ink [scrollbar-width:thin] [&::-webkit-scrollbar]:w-[6px] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20"
            style={{ overscrollBehavior: "contain" }}
          >
            {answer}
          </div>
          {sources.length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-faint">
              <span className="uppercase tracking-[0.18em]">{t("askSources")}:</span>
              {sources.map((s, i) => (
                <a
                  key={i}
                  href={s.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="max-w-[140px] truncate underline underline-offset-2 hover:text-ink-soft"
                >
                  {s.title}
                </a>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                stopAudio();
                begin();
              }}
              className="rounded-full px-4 py-1.5 text-[12px] uppercase tracking-[0.15em]"
              style={{ background: "var(--gold)", color: "#15120E" }}
            >
              {t("askAgain")}
            </button>
            <button
              onClick={stopAudio}
              className="rounded-full border border-white/15 px-3.5 py-1.5 text-[12px] uppercase tracking-[0.15em] text-ink-soft transition-colors hover:text-ink"
            >
              {t("askStop")}
            </button>
          </div>
        </div>
      )}

      {phase === "error" && (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-ink-soft">{t("askError")}</p>
          <button
            onClick={begin}
            className="self-start rounded-full px-4 py-1.5 text-[12px] uppercase tracking-[0.15em]"
            style={{ background: "var(--gold)", color: "#15120E" }}
          >
            {t("askAgain")}
          </button>
        </div>
      )}
    </div>
  );
}
