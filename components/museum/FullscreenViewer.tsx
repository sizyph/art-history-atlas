"use client";

import { useEffect, useRef, useState } from "react";
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
}: {
  painting: Painting;
  onClose: () => void;
}) {
  const t = useT();
  const [preset, setPreset] = useState("original");
  const [loading, setLoading] = useState(true);
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
        // OSD 6's default WebGL drawer mis-maps its GL viewport here (the image
        // renders small in the top-left) — the 2D canvas drawer is reliable and
        // plenty fast for a single deep-zoom image.
        drawer: "canvas",
        crossOriginPolicy: "Anonymous",
        showNavigationControl: false,
        showZoomControl: false,
        animationTime: 0.5,
        springStiffness: 8,
        zoomPerScroll: 1.4,
        visibilityRatio: 1,
        minZoomImageRatio: 0.9,
        maxZoomPixelRatio: 2.4,
        gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: true },
        gestureSettingsTouch: { pinchToZoom: true, flickEnabled: true },
      });
      viewerRef.current = viewer;
      // reveal only once the image is actually painted (not merely "open", which
      // fires on metadata) — and on failure, so the spinner never hangs
      const reveal = () => {
        if (!cancelled) setLoading(false);
      };
      viewer.addHandler("tile-drawn", reveal);
      viewer.addHandler("open-failed", reveal);
    })();
    return () => {
      cancelled = true;
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

      <div className="flex flex-wrap items-center justify-center gap-2 px-4 pb-7 pt-3">
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
