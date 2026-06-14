"use client";

import { useState } from "react";
import { useAudio } from "@/components/AudioProvider";

function SpeakerIcon({ on }: { on: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" stroke="none" />
      {on ? (
        <>
          <path d="M16 8.5a4 4 0 0 1 0 7" />
          <path d="M18.8 6a7 7 0 0 1 0 12" />
        </>
      ) : (
        <path d="M16.5 9.5l4 5M20.5 9.5l-4 5" />
      )}
    </svg>
  );
}

export default function AudioControl() {
  const { ready, muted, volume, setMuted, setVolume } = useAudio();
  const [open, setOpen] = useState(false);
  const on = ready && !muted && volume > 0;

  return (
    <div
      className="pointer-events-auto fixed bottom-5 left-5 z-40 flex items-center gap-2"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        onClick={() => setMuted(!muted)}
        aria-label={muted ? "Unmute" : "Mute"}
        title={ready ? (muted ? "Unmute" : "Mute") : "Sound on"}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/12 bg-black/40 text-ink-soft backdrop-blur transition-colors hover:text-ink"
      >
        <SpeakerIcon on={on} />
      </button>
      <div
        style={{
          width: open ? 92 : 0,
          opacity: open ? 1 : 0,
          overflow: "hidden",
          transition: "width 0.25s ease, opacity 0.25s ease",
        }}
      >
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          aria-label="Volume"
          className="audio-slider w-[88px]"
          style={{ accentColor: "var(--gold)" }}
        />
      </div>
    </div>
  );
}
