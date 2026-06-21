"use client";

import { useEffect, useRef, useState } from "react";
import type { Painting } from "@/db/schema";
import { useLocale, useT } from "@/components/LocaleProvider";
import { localized } from "@/lib/i18n";
import AskDocent from "@/components/museum/AskDocent";
import FullscreenButton from "@/components/FullscreenButton";

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

// Commons serves any downscaled width via Special:FilePath/<file>?width=N, so we
// can build a resolution pyramid without a tile server — OpenSeadragon picks the
// level it needs as you zoom and loads the bigger image only when you go deeper.
const MAX_W = 8000;

function commonsFile(imageUrl: string): string {
  const m = imageUrl.match(/Special:FilePath\/([^?]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

function proxiedAtWidth(imageUrl: string, w: number): string {
  const base = imageUrl.replace(/[?&]width=\d+/g, "");
  const sep = base.includes("?") ? "&" : "?";
  return `/api/img?u=${encodeURIComponent(`${base}${sep}width=${w}`)}`;
}

async function originalSize(
  imageUrl: string,
): Promise<{ w: number; h: number } | null> {
  const file = commonsFile(imageUrl);
  if (!file) return null;
  try {
    const url =
      `https://commons.wikimedia.org/w/api.php?action=query&format=json` +
      `&origin=*&prop=imageinfo&iiprop=size&titles=${encodeURIComponent(`File:${file}`)}`;
    const d = await (await fetch(url)).json();
    const pages = d?.query?.pages ?? {};
    const ii = (Object.values(pages)[0] as { imageinfo?: { width: number; height: number }[] })
      ?.imageinfo?.[0];
    return ii?.width ? { w: ii.width, h: ii.height } : null;
  } catch {
    return null;
  }
}

export default function FullscreenViewer({
  painting,
  onClose,
  guideActive = false,
  guideAudioRef,
  guidePaused = false,
  onGuideToggle,
  artistName,
  museumName,
}: {
  painting: Painting;
  onClose: () => void;
  guideActive?: boolean;
  guideAudioRef?: React.RefObject<HTMLAudioElement | null>;
  guidePaused?: boolean;
  onGuideToggle?: () => void;
  artistName?: string;
  museumName?: string;
}) {
  const t = useT();
  const { locale } = useLocale();
  const workTitle =
    localized(locale, painting.i18n, "title", painting.title) ?? painting.title;
  const [preset, setPreset] = useState("original");
  const [loading, setLoading] = useState(true);
  const [guideProgress, setGuideProgress] = useState(0);

  // While a tour narration plays, track how far through the guide's speech we are.
  useEffect(() => {
    if (!guideActive) return;
    const id = window.setInterval(() => {
      const a = guideAudioRef?.current;
      if (a && a.duration > 0 && !Number.isNaN(a.duration)) {
        setGuideProgress(Math.min(1, a.currentTime / a.duration));
      }
    }, 120);
    return () => window.clearInterval(id);
  }, [guideActive, guideAudioRef]);
  const hostRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const viewerRef = useRef<any>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let viewer: any;
    let ro: ResizeObserver | null = null;
    setLoading(true);
    (async () => {
      const dims = await originalSize(painting.imageUrl);
      const aspect =
        dims && dims.w
          ? dims.h / dims.w
          : painting.width && painting.height
            ? painting.height / painting.width
            : 1.3;
      const cap = Math.min(dims?.w ?? 4000, MAX_W);
      if (cancelled || !hostRef.current) return;

      const OpenSeadragon = (await import("openseadragon")).default;
      // On Retina (dpr > 1) OSD's home/fit zoom comes out wrong — the painting
      // opens cropped / pinned to a corner. Pin the pixel ratio to 1 so geometry
      // is correct at every dpr; zoomed-in detail still comes from the up-to-
      // 8000px source tiles, so it stays crisp. (runtime-assignable; d.ts says ro)
      (OpenSeadragon as unknown as { pixelDensityRatio: number }).pixelDensityRatio = 1;
      const widths = [1280, 2560, 5120].filter((w) => w < cap - 200);
      widths.push(cap);
      const levels = widths.map((w) => ({
        url: proxiedAtWidth(painting.imageUrl, w),
        width: w,
        height: Math.max(1, Math.round(w * aspect)),
      }));

      viewer = OpenSeadragon({
        element: hostRef.current,
        tileSources: { type: "legacy-image-pyramid", levels },
        crossOriginPolicy: "Anonymous",
        showNavigationControl: false,
        showZoomControl: false,
        animationTime: 0.5,
        springStiffness: 8,
        zoomPerScroll: 1.4,
        visibilityRatio: 1,
        minZoomImageRatio: 0.9,
        maxZoomPixelRatio: 2.4,
        // We own resizing (below). OSD's internal autoResize poll, combined with
        // Retina device-pixel rounding, intermittently recomputed the viewport
        // mid-zoom — pinning the image to a corner and leaving the bottom-right
        // unreachable. Driving it ourselves makes the geometry deterministic.
        autoResize: false,
        gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: true },
        gestureSettingsTouch: { pinchToZoom: true, flickEnabled: true },
      });
      viewerRef.current = viewer;
      viewer.addHandler("open", () => {
        // lock the correct full-image fit once the source is known
        try {
          const el = hostRef.current;
          if (el) {
            viewer.viewport.resize(
              new OpenSeadragon.Point(el.clientWidth, el.clientHeight),
              false,
            );
          }
          viewer.viewport.goHome(true);
        } catch {}
        if (!cancelled) setLoading(false);
      });

      // Keep OSD's notion of the container exactly in sync with the real element
      // at every device-pixel ratio, preserving the current view on a resize.
      if (typeof ResizeObserver !== "undefined" && hostRef.current) {
        ro = new ResizeObserver(() => {
          const el = hostRef.current;
          if (!el || !viewerRef.current) return;
          const w = el.clientWidth;
          const h = el.clientHeight;
          if (w < 2 || h < 2) return;
          try {
            viewer.viewport.resize(new OpenSeadragon.Point(w, h), true);
            viewer.viewport.applyConstraints(true);
          } catch {}
        });
        ro.observe(hostRef.current);
      }
    })();
    return () => {
      cancelled = true;
      try {
        ro?.disconnect();
      } catch {}
      try {
        viewer?.destroy();
      } catch {}
    };
  }, [painting]);

  const filter = PRESETS.find((p) => p.key === preset)?.filter ?? "none";
  const pill = (active: boolean) =>
    ({
      borderColor: active ? "var(--gold)" : "rgba(255,255,255,0.16)",
      color: active ? "var(--gold)" : "var(--ink-soft)",
      background: active ? "rgba(201,162,75,0.14)" : "transparent",
    }) as const;

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-black"
      // the viewer can sit inside the inspector's click-to-close backdrop —
      // keep clicks (buttons, panning) from bubbling out and closing it
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <svg width="0" height="0" className="absolute">
        <filter id="fsSharpen">
          <feConvolveMatrix
            order="3"
            preserveAlpha="true"
            kernelMatrix="0 -0.55 0  -0.55 3.2 -0.55  0 -0.55 0"
          />
        </filter>
      </svg>

      <div className="relative flex-1 overflow-hidden">
        <div
          ref={hostRef}
          className="h-full w-full cursor-grab active:cursor-grabbing"
          style={{ filter }}
        />
        {loading && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[12px] uppercase tracking-[0.25em] text-ink-faint">
            …
          </div>
        )}
        {!loading && (
          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 text-[11px] uppercase tracking-[0.2em] text-white/35">
            {t("zoomPan")}
          </div>
        )}
      </div>

      {/* guided-tour: how far through the docent's speech, with pause/play so
          you can linger on a detail before the tour moves on */}
      {guideActive && (
        <div className="flex items-center justify-center gap-3 px-6 pt-4">
          <button
            onClick={onGuideToggle}
            aria-label={guidePaused ? "Resume guide" : "Pause guide"}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/20 text-white/85 transition-colors hover:bg-white/10"
          >
            {guidePaused ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            )}
          </button>
          <div className="relative h-1 w-[min(420px,56vw)] overflow-hidden rounded-full bg-white/15">
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${Math.round(guideProgress * 100)}%`,
                background: "var(--gold)",
                transition: "width 0.12s linear",
              }}
            />
          </div>
          <span className="w-9 text-[11px] tabular-nums text-white/45">
            {Math.round(guideProgress * 100)}%
          </span>
        </div>
      )}

      {/* one control bar along the bottom — full-screen, colour presets, fit,
          and (asking about this work) the docent — so the frame stays clear */}
      <div className="flex flex-wrap items-center justify-center gap-2 px-4 pb-7 pt-3">
        <FullscreenButton className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/30 text-white/70 transition-colors hover:text-white" />
        <span className="mx-1 h-4 w-px bg-white/15" />
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
          onClick={() => viewerRef.current?.viewport?.goHome?.()}
          className="rounded-full border px-4 py-1.5 text-[12px] transition-colors"
          style={pill(false)}
        >
          {t("fit")}
        </button>
        {artistName && museumName && (
          <>
            <span className="mx-1 h-4 w-px bg-white/15" />
            <AskDocent
              artist={artistName}
              museum={museumName}
              getWork={() => workTitle}
              placement="bar"
            />
          </>
        )}
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
