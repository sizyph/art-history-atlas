"use client";

import { useEffect, useState } from "react";
import type { Painting } from "@/db/schema";
import { useT } from "@/components/LocaleProvider";

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
  const t = useT();

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

  const facts = (painting.facts ?? []) as string[];

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
        <div className="flex min-h-[38vh] flex-1 items-center justify-center bg-black p-4 md:p-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={painting.imageUrl}
            alt={painting.title}
            className="max-h-[82vh] max-w-full object-contain"
            style={{ boxShadow: `0 0 0 1px ${accent}55, 0 30px 80px -20px #000` }}
          />
        </div>

        <div className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto p-7 md:w-[360px]">
          <div>
            <h2 className="font-display text-[26px] leading-tight text-ink">
              {painting.title}
            </h2>
            <div className="mt-1 text-sm" style={{ color: accent }}>
              {painting.year ?? t("dateUnknown")}
              {painting.location ? ` · ${painting.location}` : ""}
            </div>
          </div>

          {painting.story && (
            <p className="text-[14px] leading-relaxed text-ink-soft">
              {painting.story}
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
            <span>{painting.creditLine ?? "Wikimedia Commons"}</span>
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
    </div>
  );
}
