"use client";

import { useEffect, useRef, useState } from "react";
import type { Galaxy, Layout, StarArtist } from "@/lib/timeline";
import ArtistCard from "@/components/ArtistCard";
import ConstellationFilter from "@/components/ConstellationFilter";

function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cvs = ref.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cvs.width = w * dpr;
      cvs.height = h * dpr;
      cvs.style.width = `${w}px`;
      cvs.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      let s = 9301;
      const rnd = () => {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
      };
      for (let i = 0; i < 280; i++) {
        const x = rnd() * w;
        const y = rnd() * h;
        const r = rnd() * 1.3 + 0.2;
        const a = rnd() * 0.5 + 0.08;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(236,230,218,${a})`;
        ctx.fill();
      }
    };

    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, []);

  return (
    <canvas ref={ref} className="pointer-events-none absolute inset-0" aria-hidden />
  );
}

type View = { x: number; y: number; scale: number };

export default function Constellation({ layout }: { layout: Layout }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const didDrag = useRef(false);
  const interacted = useRef(false);
  const flyTimer = useRef<number | undefined>(undefined);
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 0.25 });
  const [ready, setReady] = useState(false);
  const [flying, setFlying] = useState(false);
  const [selected, setSelected] = useState<StarArtist | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);

  const computeFit = (): View | null => {
    if (typeof window === "undefined") return null;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (!w || !h) return null;
    const scale = Math.min(
      (w * 0.92) / layout.width,
      (h * 0.86) / layout.height,
    );
    return {
      scale,
      x: (w - layout.width * scale) / 2,
      y: (h - layout.height * scale) / 2,
    };
  };

  // Fit the full sweep once the wrap actually has a size, and refit on resize
  // until the user takes over. A ResizeObserver (reading contentRect) is the
  // only reliable trigger: at mount the container can be 0 (e.g. inside a
  // not-yet-sized iframe) and no window 'resize' fires when it grows.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const apply = (w: number, h: number) => {
      if (!w || !h) return;
      setReady(true);
      if (interacted.current) return;
      const scale = Math.min(
        (w * 0.92) / layout.width,
        (h * 0.86) / layout.height,
      );
      setView({
        scale,
        x: (w - layout.width * scale) / 2,
        y: (h - layout.height * scale) / 2,
      });
    };
    const r = el.getBoundingClientRect();
    apply(r.width, r.height);
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0].contentRect;
      apply(cr.width, cr.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.width, layout.height]);

  // Wheel zoom toward cursor (native, non-passive).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      interacted.current = true;
      setFlying(false);
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      setView((v) => {
        const ns = Math.min(Math.max(v.scale * Math.exp(-e.deltaY * 0.0016), 0.14), 4);
        const wx = (cx - v.x) / v.scale;
        const wy = (cy - v.y) / v.scale;
        return { scale: ns, x: cx - wx * ns, y: cy - wy * ns };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const flyTo = (v: View) => {
    interacted.current = true;
    setFlying(true);
    setView(v);
    window.clearTimeout(flyTimer.current);
    flyTimer.current = window.setTimeout(() => setFlying(false), 1150);
  };

  const flyToPeriod = (g: Galaxy) => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const s = 1.3;
    flyTo({ scale: s, x: r.width / 2 - g.x * s, y: r.height / 2 - g.y * s });
  };

  const flyToOverview = () => {
    setHighlight(null);
    const v = computeFit();
    if (v) flyTo(v);
  };

  const pickPeriod = (g: Galaxy) => {
    setHighlight(g.slug);
    flyToPeriod(g);
  };

  const pickArtist = (g: Galaxy, a: StarArtist) => {
    setHighlight(g.slug);
    flyToPeriod(g);
    window.setTimeout(() => setSelected(a), 650);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    interacted.current = true;
    setFlying(false);
    didDrag.current = false;
    drag.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) didDrag.current = true;
    drag.current = { x: e.clientX, y: e.clientY };
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const inv = 1 / view.scale;
  const starsOn = Math.min(Math.max((view.scale - 0.5) / 0.55, 0), 1);
  const labelsOn = Math.min(Math.max((view.scale - 1.0) / 0.45, 0), 1);

  return (
    <div
      ref={wrapRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onClick={() => {
        if (!didDrag.current) flyToOverview();
      }}
      className="relative h-screen w-screen cursor-grab touch-none select-none overflow-hidden bg-bg active:cursor-grabbing"
    >
      <Starfield />

      <div
        className="absolute left-0 top-0"
        style={{
          width: layout.width,
          height: layout.height,
          transformOrigin: "0 0",
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          opacity: ready ? 1 : 0,
          transition: flying
            ? "transform 1.15s cubic-bezier(0.16, 1, 0.3, 1)"
            : "opacity 0.7s ease",
        }}
      >
        <svg
          width={layout.width}
          height={layout.height}
          className="pointer-events-none absolute left-0 top-0 overflow-visible"
        >
          <polyline
            points={layout.galaxies.map((g) => `${g.x},${g.y}`).join(" ")}
            fill="none"
            stroke="rgba(201,162,75,0.14)"
            strokeWidth={2}
          />
          {starsOn > 0 &&
            layout.galaxies.flatMap((g) =>
              g.artists.map((a) => (
                <line
                  key={`${g.slug}-${a.slug}-l`}
                  x1={g.x}
                  y1={g.y}
                  x2={a.x}
                  y2={a.y}
                  stroke={g.color}
                  strokeOpacity={0.16 * starsOn}
                  strokeWidth={1.2}
                />
              )),
            )}
        </svg>

        {layout.galaxies.map((g, gi) => (
          <div
            key={g.slug}
            className="absolute"
            style={{
              left: g.x,
              top: g.y,
              opacity: !highlight || highlight === g.slug ? 1 : 0.16,
              transition: "opacity 0.6s ease",
            }}
          >
            <div
              className="pointer-events-none absolute"
              style={{
                left: 0,
                top: 0,
                width: 560,
                height: 380,
                transform: "translate(-50%, -50%)",
                background: `radial-gradient(ellipse at center, ${g.color}1f, transparent 68%)`,
              }}
            />
            <div
              className="pointer-events-none absolute"
              style={{
                left: 0,
                top: 0,
                width: 170,
                height: 170,
                borderRadius: "50%",
                transform: "translate(-50%, -50%)",
                background: `radial-gradient(circle, ${g.color}d0, ${g.color}26 38%, transparent 70%)`,
              }}
            />
            <button
              type="button"
              aria-label={`Zoom into ${g.name}`}
              onClick={(e) => {
                e.stopPropagation();
                if (!didDrag.current) flyToPeriod(g);
              }}
              className="galaxy-core absolute"
              style={{
                left: 0,
                top: 0,
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: "#fff7ea",
                boxShadow: `0 0 28px 9px ${g.color}`,
              }}
            />
            <div
              className="pointer-events-none absolute text-center"
              style={{
                left: 0,
                top: 0,
                width: 260,
                transform: `translate(-50%, ${(gi % 2 === 0 ? 20 : -58) * inv}px) scale(${inv})`,
                transformOrigin: "top center",
              }}
            >
              <div
                className="font-display font-medium"
                style={{ color: "#efe9dd", fontSize: 20, lineHeight: 1.05 }}
              >
                {g.name}
              </div>
              <div
                style={{
                  color: g.color,
                  fontSize: 11,
                  letterSpacing: 2,
                  marginTop: 3,
                }}
              >
                {g.startYear}–{g.endYear}
              </div>
            </div>
          </div>
        ))}

        {starsOn > 0 &&
          layout.galaxies.flatMap((g) =>
            g.artists.map((a) => (
              <div
                key={`${g.slug}-${a.slug}`}
                className="pointer-events-none absolute"
                style={{
                  left: a.x,
                  top: a.y,
                  opacity:
                    starsOn * (!highlight || highlight === g.slug ? 1 : 0.16),
                }}
              >
                <button
                  type="button"
                  aria-label={a.name}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!didDrag.current) setSelected(a);
                  }}
                  className="artist-star pointer-events-auto absolute"
                  style={{
                    left: 0,
                    top: 0,
                    width: 24,
                    height: 24,
                    transform: `translate(-50%, -50%) scale(${inv})`,
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      width: 9,
                      height: 9,
                      borderRadius: "50%",
                      background: "#efe9dd",
                      boxShadow: `0 0 10px 2px ${g.color}`,
                    }}
                  />
                </button>
                <div
                  className="pointer-events-none absolute"
                  style={{
                    left: 0,
                    top: 0,
                    transform: `translate(14px, -50%) scale(${inv})`,
                    transformOrigin: "left center",
                    color: "#cdc4b4",
                    fontSize: 12.5,
                    whiteSpace: "nowrap",
                    opacity: labelsOn,
                  }}
                >
                  {a.name}
                </div>
              </div>
            )),
          )}
      </div>

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 52%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-7 py-6">
        <div className="font-display text-xl tracking-wide text-ink">
          Constellation
        </div>
        <div className="text-[11px] uppercase tracking-[0.3em] text-ink-faint">
          Atlas of Art History
        </div>
      </header>

      <ConstellationFilter
        galaxies={layout.galaxies}
        onPickPeriod={pickPeriod}
        onPickArtist={pickArtist}
      />

      <div className="pointer-events-none absolute inset-x-0 bottom-5 text-center text-[11px] uppercase tracking-[0.3em] text-ink-faint">
        Scroll to zoom · drag to pan · click a movement
      </div>

      {selected && (
        <ArtistCard artist={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
