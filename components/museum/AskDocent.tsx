"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useT } from "@/components/LocaleProvider";
import { useAudio } from "@/components/AudioProvider";
import { getGuideVolume } from "@/lib/guideAudio";
import { ASK_GREETINGS, type Locale } from "@/lib/i18n";

const BCP47: Record<Locale, string> = { en: "en-US", fr: "fr-FR", ja: "ja-JP" };
const SILENCE_MS = 4000;

type Phase = "intro" | "listening" | "thinking" | "answering" | "error";
type Source = { title: string; uri: string };

// A docent you can speak to or type to. Tap "?", it greets you aloud (a varied,
// immersive line), then listens — auto-stopping after 4s of silence, or when you
// press Stop, either of which sends the question. You can also just type. Spoken
// questions are answered aloud in the Ava voice; typed ones answer in text with
// a Listen button. Answers cite their web sources when the model searched.
export default function AskDocent({
  artist,
  museum,
  getWork,
  getView,
  placement = "edge",
}: {
  artist: string;
  museum: string;
  getWork: () => string | null;
  // In deep-zoom, returns the exact area in view (a cropped JPEG data URL + a
  // plain-words location) so a question can be about what's inside that crop.
  getView?: () => Promise<{ image?: string; region?: string }>;
  // "edge": floats at the right of the gallery; "bar": an inline trigger that
  // sits in the deep-zoom's control bar, with the panel popping up above it.
  placement?: "edge" | "bar";
}) {
  const t = useT();
  const { locale } = useLocale();
  const { setDucked, muted } = useAudio();

  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("intro");
  const [greeting, setGreeting] = useState("");
  const [transcript, setTranscript] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [typed, setTyped] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [errKey, setErrKey] = useState<"askError" | "askBusy">("askError");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const silence = useRef<number | undefined>(undefined);
  const transcriptRef = useRef(""); // live, so Stop/auto-stop always have the text
  const submittedRef = useRef(false); // one answer per question (Stop + onend race)
  const abortRef = useRef(false); // closing/typing — don't auto-submit on end
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
    setSpeaking(false);
  };

  const teardownRec = (abort: boolean) => {
    clearSilence();
    const rec = recRef.current;
    recRef.current = null;
    if (!rec) return;
    if (abort) {
      rec.onend = null;
      rec.onresult = null;
      rec.onerror = null;
    }
    try {
      if (abort) rec.abort();
      else rec.stop();
    } catch {}
  };

  // Speak text in the Ava voice; resolves when finished (or at once if TTS is
  // unavailable). Ducks the soundscape while it plays.
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

  const runAnswer = async (question: string, viaVoice: boolean) => {
    setPhase("thinking");
    try {
      // in deep-zoom, attach the exact area in view so "who is this?" works
      let view: { image?: string; region?: string } = {};
      if (getView) {
        try {
          view = await getView();
        } catch {}
      }
      if (!openRef.current) return;
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          lang: locale,
          artist,
          museum,
          work: getWork() ?? undefined,
          region: view.region,
          image: view.image ? view.image.split(",")[1] : undefined,
        }),
      });
      if (res.status === 429) {
        if (openRef.current) {
          setErrKey("askBusy");
          setPhase("error");
        }
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { answer: string; sources: Source[] };
      if (!openRef.current) return;
      setAnswer(data.answer);
      setSources(data.sources ?? []);
      setPhase("answering");
      if (viaVoice && !muted) {
        setSpeaking(true);
        await speak(data.answer);
        setSpeaking(false);
      }
    } catch {
      if (openRef.current) {
        setErrKey("askError");
        setPhase("error");
      }
    }
  };

  // Exactly one answer per question, whichever trigger fires first.
  const submitOnce = (question: string, viaVoice: boolean) => {
    const q = question.trim();
    if (!q || submittedRef.current) return;
    submittedRef.current = true;
    abortRef.current = true; // any trailing onend won't re-submit
    void runAnswer(q, viaVoice);
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
    transcriptRef.current = "";
    submittedRef.current = false;
    abortRef.current = false;
    setTranscript("");
    setPhase("listening");

    let finalText = "";
    const armSilence = () => {
      clearSilence();
      silence.current = window.setTimeout(() => {
        try {
          rec.stop(); // → onend → submit
        } catch {}
      }, SILENCE_MS);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const txt = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += txt;
        else interim += txt;
      }
      const combined = (finalText + interim).trim();
      transcriptRef.current = combined;
      setTranscript(combined);
      armSilence();
    };
    rec.onerror = () => clearSilence();
    rec.onend = () => {
      clearSilence();
      recRef.current = null;
      if (abortRef.current || !openRef.current) return;
      const q = transcriptRef.current.trim();
      if (q) submitOnce(q, true);
      else setPhase("intro");
    };

    recRef.current = rec;
    try {
      rec.start();
      armSilence(); // auto-stop even if nothing is ever said
    } catch {
      setPhase("intro");
    }
  };

  // The Stop button (and the mic toggle while active): answer with what we have.
  const stopAndAnswer = () => {
    clearSilence();
    const q = transcriptRef.current.trim();
    teardownRec(false); // graceful stop; onend would also fire
    if (q) submitOnce(q, true);
    else setPhase("intro");
  };

  const submitTyped = () => {
    const q = typed.trim();
    if (!q) return;
    stopAudio();
    teardownRec(true);
    submittedRef.current = false;
    submitOnce(q, false);
  };

  const begin = async () => {
    setOpen(true);
    openRef.current = true;
    setAnswer("");
    setSources([]);
    setTranscript("");
    setTyped("");
    submittedRef.current = false;
    abortRef.current = false;
    const pool = ASK_GREETINGS[locale] ?? ASK_GREETINGS.en;
    const g = pool[Math.floor(Math.random() * pool.length)];
    setGreeting(g);
    setPhase("intro");
    // Voice conversation only when sound is on; muted → chat only (text in/out).
    if (supported && !muted) {
      await speak(g);
      // unless the visitor started typing meanwhile, open the mic
      if (openRef.current && !abortRef.current && !transcriptRef.current) {
        startListening();
      }
    }
  };

  const askAgain = () => {
    stopAudio();
    begin();
  };

  const close = () => {
    abortRef.current = true;
    openRef.current = false;
    setOpen(false);
    setPhase("intro");
    teardownRec(true);
    stopAudio();
    setTranscript("");
    setTyped("");
  };

  // The site mute is the master switch: muting mid-conversation cuts the guide
  // voice and the mic at once, leaving the exchange as text.
  useEffect(() => {
    if (!muted) return;
    stopAudio();
    if (recRef.current) {
      abortRef.current = true;
      teardownRec(true);
      if (phase === "listening") setPhase("intro");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muted]);

  useEffect(() => {
    return () => {
      abortRef.current = true;
      openRef.current = false;
      clearSilence();
      teardownRec(true);
      stopAudio();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bar = placement === "bar";
  const listening = phase === "listening";
  const inputStage = phase === "intro" || phase === "listening";

  const trigger = (
    <button
      onClick={bar && open ? close : begin}
      aria-label={t("ask")}
      title={t("ask")}
      className={
        bar
          ? "pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full border bg-black/30 transition-colors"
          : "pointer-events-auto absolute right-6 top-1/2 z-30 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/45 text-ink backdrop-blur transition-colors hover:bg-black/65"
      }
      style={
        bar
          ? {
              borderColor: open ? "var(--gold)" : "rgba(255,255,255,0.18)",
              color: open ? "var(--gold)" : "rgba(255,255,255,0.8)",
            }
          : undefined
      }
    >
      <svg width={bar ? 16 : 20} height={bar ? 16 : 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.1 9a3 3 0 1 1 5.8 1c0 2-3 2.5-3 4" />
        <circle cx="12" cy="18" r="0.6" fill="currentColor" stroke="none" />
      </svg>
    </button>
  );

  if (!open) return trigger;

  const panel = (
    <div
      className={
        bar
          ? "pointer-events-auto absolute bottom-[86px] right-5 z-[60] flex w-[360px] max-w-[88vw] flex-col gap-3 rounded-2xl border border-white/15 bg-black/80 p-4 backdrop-blur"
          : "pointer-events-auto absolute right-6 top-1/2 z-30 flex w-[360px] max-w-[88vw] -translate-y-1/2 flex-col gap-3 rounded-2xl border border-white/15 bg-black/75 p-4 backdrop-blur"
      }
    >
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

      {inputStage && (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] leading-relaxed text-ink-soft">
            {listening && transcript ? (
              <span className="italic text-ink">“{transcript}”</span>
            ) : (
              greeting || t("askPrompt")
            )}
          </p>

          <div className="flex items-center gap-2">
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onFocus={() => {
                // typing takes over from the mic
                if (recRef.current) {
                  abortRef.current = true;
                  teardownRec(true);
                  setPhase("intro");
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitTyped();
              }}
              placeholder={t("askPlaceholder")}
              className="min-w-0 flex-1 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-[14px] text-ink outline-none placeholder:text-ink-faint focus:border-white/35"
            />
            {supported && !muted && (
              <button
                onClick={listening ? stopAndAnswer : startListening}
                aria-label={listening ? t("askStop") : t("ask")}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors ${
                  listening
                    ? "animate-pulse border-[var(--gold)] bg-[var(--gold)]/25"
                    : "border-white/15 hover:bg-white/10"
                }`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="2" width="6" height="12" rx="3" />
                  <path d="M5 10a7 7 0 0 0 14 0M12 19v3" />
                </svg>
              </button>
            )}
            <button
              onClick={submitTyped}
              aria-label={t("ask")}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              style={{ background: "var(--gold)", color: "#15120E" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </div>
          {listening && (
            <button
              onClick={stopAndAnswer}
              className="self-start rounded-full border border-white/15 px-3.5 py-1.5 text-[12px] uppercase tracking-[0.15em] text-ink-soft transition-colors hover:text-ink"
            >
              {t("askStop")}
            </button>
          )}
        </div>
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
            className="max-h-[42vh] overflow-y-auto pr-1 text-[14px] leading-relaxed text-ink [scrollbar-width:thin] [&::-webkit-scrollbar]:w-[6px] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20"
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
                  className="max-w-[150px] truncate underline underline-offset-2 hover:text-ink-soft"
                >
                  {s.title}
                </a>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={askAgain}
              className="rounded-full px-4 py-1.5 text-[12px] uppercase tracking-[0.15em]"
              style={{ background: "var(--gold)", color: "#15120E" }}
            >
              {t("askAgain")}
            </button>
            {!muted && (
              <button
                onClick={async () => {
                  if (speaking) {
                    stopAudio();
                  } else {
                    setSpeaking(true);
                    await speak(answer);
                    setSpeaking(false);
                  }
                }}
                className="rounded-full border border-white/15 px-3.5 py-1.5 text-[12px] uppercase tracking-[0.15em] text-ink-soft transition-colors hover:text-ink"
              >
                {speaking ? t("askStop") : t("listen")}
              </button>
            )}
          </div>
        </div>
      )}

      {phase === "error" && (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-ink-soft">{t(errKey)}</p>
          <button
            onClick={askAgain}
            className="self-start rounded-full px-4 py-1.5 text-[12px] uppercase tracking-[0.15em]"
            style={{ background: "var(--gold)", color: "#15120E" }}
          >
            {t("askAgain")}
          </button>
        </div>
      )}
    </div>
  );

  // In the bar, the trigger stays in the control row and the panel floats above
  // it; at the edge, the panel replaces the floating trigger.
  return bar ? (
    <>
      {trigger}
      {panel}
    </>
  ) : (
    panel
  );
}
