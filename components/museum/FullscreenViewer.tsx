"use client";

import { useEffect, useState } from "react";
import type { Painting } from "@/db/schema";
import { useT } from "@/components/LocaleProvider";

const PRESETS = [
  { key: "original", label: "Original", filter: "none" },
  { key: "vivid", label: "Vivid", filter: "saturate(1.4) contrast(1.08)" },
  {
    key: "warm",
    label: "Warm",
    filter: "saturate(1.12) sepia(0.12) brightness(1.04)",
  },
  {
    key: "crisp",
    label: "Crisp",
    filter: "url(#fsSharpen) contrast(1.07) saturate(1.04)",
  },
] as const;

export default function FullscreenViewer({
  painting,
  onClose,
}: {
  painting: Painting;
  onClose: () => void;
}) {
  const t = useT();
  const [preset, setPreset] = useState("original");
  const [maxDef, setMaxDef] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const src = painting.imageUrl.replace(
    "width=1800",
    maxDef ? "width=3200" : "width=2200",
  );
  const filter = PRESETS.find((p) => p.key === preset)?.filter ?? "none";

  const pill = (active: boolean) =>
    ({
      borderColor: active ? "var(--gold)" : "rgba(255,255,255,0.16)",
      color: active ? "var(--gold)" : "var(--ink-soft)",
      background: active ? "rgba(201,162,75,0.14)" : "transparent",
    }) as const;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black" onClick={onClose}>
      <svg width="0" height="0" className="absolute">
        <filter id="fsSharpen">
          <feConvolveMatrix
            order="3"
            preserveAlpha="true"
            kernelMatrix="0 -0.55 0  -0.55 3.2 -0.55  0 -0.55 0"
          />
        </filter>
      </svg>

      <div className="flex flex-1 items-center justify-center overflow-hidden p-4 sm:p-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={painting.title}
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full object-contain"
          style={{ filter }}
        />
      </div>

      <div
        onClick={(e) => e.stopPropagation()}
        className="flex flex-wrap items-center justify-center gap-2 px-4 pb-7 pt-2"
      >
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPreset(p.key)}
            className="rounded-full border px-4 py-1.5 text-[12px] transition-colors"
            style={pill(preset === p.key)}
          >
            {p.label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-white/15" />
        <button
          onClick={() => setMaxDef((m) => !m)}
          className="rounded-full border px-4 py-1.5 text-[12px] transition-colors"
          style={pill(maxDef)}
        >
          {t("maxDefinition")}
        </button>
      </div>

      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute right-5 top-4 text-3xl leading-none text-white/70 transition-colors hover:text-white"
      >
        ×
      </button>
    </div>
  );
}
