"use client";

import { useEffect, useState } from "react";
import { useT } from "@/components/LocaleProvider";

// Toggle the whole page in and out of full screen (with the WebKit fallback).
// Global: sits bottom-left on every view, opposite the sound control. A
// `className` override lets the deep-zoom place its own copy (the global one
// sits behind that overlay).
export default function FullscreenButton({
  className,
}: {
  className?: string;
} = {}) {
  const t = useT();
  const [fs, setFs] = useState(false);
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    const doc = document as Document & { webkitFullscreenElement?: Element };
    const onChange = () =>
      setFs(!!(document.fullscreenElement || doc.webkitFullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);

  // On touch devices the gallery's joystick owns the bottom-left corner, and
  // element-fullscreen is unsupported on iOS anyway — so don't show this there.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(pointer: coarse)");
    const apply = () => setCoarse(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  if (coarse) return null;

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const el = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    };
    const doc = document as Document & {
      webkitExitFullscreen?: () => Promise<void>;
      webkitFullscreenElement?: Element;
    };
    const active = document.fullscreenElement || doc.webkitFullscreenElement;
    try {
      const p = active
        ? (document.exitFullscreen || doc.webkitExitFullscreen)?.call(document)
        : (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {}
  };

  return (
    <button
      onClick={toggle}
      aria-label={fs ? t("exitFullscreen") : t("fullscreen")}
      title={fs ? t("exitFullscreen") : t("fullscreen")}
      className={
        className ??
        "pointer-events-auto fixed bottom-5 left-5 z-40 flex h-9 w-9 items-center justify-center rounded-full border border-white/12 bg-black/40 text-ink-soft backdrop-blur transition-colors hover:text-ink"
      }
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {fs ? (
          <path d="M9 4v5H4M15 4v5h5M15 20v-5h5M9 20v-5H4" />
        ) : (
          <path d="M8 3H3v5M16 3h5v5M16 21h5v-5M8 21H3v-5" />
        )}
      </svg>
    </button>
  );
}
