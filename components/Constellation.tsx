"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Galaxy, Layout, StarArtist } from "@/lib/timeline";
import ArtistCard from "@/components/ArtistCard";
import ConstellationFilter from "@/components/ConstellationFilter";
import LangSwitcher from "@/components/LangSwitcher";
import { useLocale, useT } from "@/components/LocaleProvider";
import { useAudio } from "@/components/AudioProvider";
import { localized, periodName } from "@/lib/i18n";

type View = { x: number; y: number; scale: number };

type Star = {
  x: number;
  y: number;
  r: number;
  baseA: number;
  color: string;
  color2: string;
  flick: number;
  ph: number;
  sp: number;
  tw: number;
};

type Meteor = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  len: number;
};

function Starfield({ view, flying }: { view: View; flying: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cvs = ref.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let stars: Star[] = [];
    const meteors: Meteor[] = [];
    let nextMeteor = 3;
    let raf = 0;
    let last = 0;
    // warm white, blue-white, amber, warm — realistic star colours
    const COLORS = ["236,230,218", "208,219,240", "247,226,201", "255,243,228"];
    const FLICK = ["120,170,255", "255,150,120", "170,255,205"]; // shimmer hues
    const lerpColor = (c1: string, c2: string, m: number) => {
      const a = c1.split(",");
      const b = c2.split(",");
      return `${Math.round(+a[0] + (+b[0] - +a[0]) * m)},${Math.round(
        +a[1] + (+b[1] - +a[1]) * m,
      )},${Math.round(+a[2] + (+b[2] - +a[2]) * m)}`;
    };

    const build = () => {
      const parent = cvs.parentElement;
      w = parent?.clientWidth || window.innerWidth;
      h = parent?.clientHeight || window.innerHeight;
      if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cvs.width = w * dpr;
      cvs.height = h * dpr;
      cvs.style.width = `${w}px`;
      cvs.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      let s = 9301;
      const rnd = () => {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
      };
      stars = [];
      for (let i = 0; i < 1060; i++) {
        const x = rnd() * w;
        const y = rnd() * h;
        const bright = rnd();
        const r = bright > 0.9 ? rnd() * 1.6 + 1.0 : rnd() * 1.05 + 0.35;
        const baseA = bright > 0.9 ? rnd() * 0.35 + 0.55 : rnd() * 0.42 + 0.24;
        const dawnFade = 1 - 0.32 * (x / w); // stars wash out toward the dawn (right)
        const color = COLORS[Math.floor(rnd() * COLORS.length)];
        const flickering = rnd() < 0.16; // ~1 in 6 stars shimmers colour
        stars.push({
          x,
          y,
          r,
          baseA: baseA * dawnFade,
          color,
          color2: flickering ? FLICK[Math.floor(rnd() * FLICK.length)] : color,
          flick: flickering ? rnd() * 0.5 + 0.4 : 0,
          ph: rnd() * Math.PI * 2,
          sp: rnd() * 0.9 + 0.25,
          tw: bright > 0.55 ? 1 : 0.35,
        });
      }
      // a faint Milky Way band, bottom-left → upper-right
      for (let i = 0; i < 260; i++) {
        const t = rnd();
        const bx = t * w;
        const by = h * 0.82 - t * h * 0.6 + (rnd() - 0.5) * h * 0.16;
        const dawnFade = 1 - 0.42 * (bx / w);
        stars.push({
          x: bx,
          y: by,
          r: rnd() * 0.85 + 0.3,
          baseA: (rnd() * 0.3 + 0.16) * dawnFade,
          color: "236,231,223",
          color2: "236,231,223",
          flick: 0,
          ph: rnd() * Math.PI * 2,
          sp: rnd() * 0.8 + 0.25,
          tw: 0.5,
        });
      }
    };

    const paintBg = () => {
      // deep cold night → faintly warmer, lighter pre-dawn (left → right)
      const base = ctx.createLinearGradient(0, 0, w, 0);
      base.addColorStop(0, "#04050b");
      base.addColorStop(0.5, "#0a0a14");
      base.addColorStop(1, "#221a14");
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);

      // dawn glow rising on the right edge
      const dawn = ctx.createRadialGradient(
        w * 1.05,
        h * 0.66,
        0,
        w * 1.05,
        h * 0.66,
        w * 0.78,
      );
      dawn.addColorStop(0, "rgba(150,104,66,0.26)");
      dawn.addColorStop(0.5, "rgba(96,72,62,0.09)");
      dawn.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = dawn;
      ctx.fillRect(0, 0, w, h);
    };

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((t - last) / 1000, 0.05);
      if (t - last < 33) return; // ~30fps is plenty for a calm twinkle
      last = t;
      if (!w || !h) return;
      const time = t / 1000;
      ctx.clearRect(0, 0, w, h);
      paintBg();
      for (const st of stars) {
        const tw = 1 + st.tw * 0.32 * Math.sin(time * st.sp + st.ph);
        const a = Math.max(0, Math.min(1, st.baseA * tw));
        if (a <= 0.01) continue;
        const col =
          st.flick > 0
            ? lerpColor(
                st.color,
                st.color2,
                (Math.sin(time * st.sp * 1.3 + st.ph) * 0.5 + 0.5) * st.flick,
              )
            : st.color;
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${col},${a})`;
        ctx.fill();
        if (st.r > 1.0) {
          ctx.beginPath();
          ctx.arc(st.x, st.y, st.r * 2.8, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${col},${a * 0.1})`;
          ctx.fill();
        }
      }

      // an occasional shooting star
      nextMeteor -= dt;
      if (nextMeteor <= 0 && meteors.length < 2) {
        nextMeteor = 6 + Math.random() * 9;
        const dir = Math.random() < 0.5 ? -1 : 1;
        const speed = 8 + Math.random() * 6;
        meteors.push({
          x: w * (0.15 + Math.random() * 0.7),
          y: -20 - Math.random() * h * 0.1,
          vx: dir * speed * 0.5,
          vy: speed,
          life: 0,
          len: 70 + Math.random() * 70,
        });
      }
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.x += m.vx;
        m.y += m.vy;
        m.life += 1;
        const fade = Math.max(0, 1 - m.life / 70);
        const inv = 1 / Math.hypot(m.vx, m.vy);
        const tx = m.x - m.vx * inv * m.len;
        const ty = m.y - m.vy * inv * m.len;
        const grad = ctx.createLinearGradient(m.x, m.y, tx, ty);
        grad.addColorStop(0, `rgba(255,248,236,${0.85 * fade})`);
        grad.addColorStop(1, "rgba(255,248,236,0)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        if (m.y > h + 50 || m.x < -80 || m.x > w + 80 || m.life > 90) {
          meteors.splice(i, 1);
        }
      }
    };

    build();
    [120, 400, 900, 1600].forEach((d) => window.setTimeout(build, d));
    raf = requestAnimationFrame(frame);
    const ro = new ResizeObserver(() => build());
    ro.observe(cvs.parentElement ?? cvs);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  // Parallax: drift + zoom the whole sky a touch with the constellation view,
  // clamped so the up-scaled canvas never reveals an edge.
  const vw = typeof window !== "undefined" ? window.innerWidth : 1440;
  const vh = typeof window !== "undefined" ? window.innerHeight : 900;
  const zoom = 1.3 + Math.max(0, view.scale - 0.25) * 0.1;
  const maxX = ((zoom - 1) / 2) * vw * 0.9;
  const maxY = ((zoom - 1) / 2) * vh * 0.9;
  const px = Math.max(-maxX, Math.min(maxX, view.x * 0.025));
  const py = Math.max(-maxY, Math.min(maxY, view.y * 0.025));

  return (
    <canvas
      ref={ref}
      className="pointer-events-none absolute inset-0"
      aria-hidden
      style={{
        transform: `translate(${px}px, ${py}px) scale(${zoom})`,
        transformOrigin: "center",
        transition: flying
          ? "transform 1.15s cubic-bezier(0.22,1,0.36,1)"
          : "none",
        willChange: "transform",
      }}
    />
  );
}

function starPortrait(url: string | null): string | null {
  if (!url) return null;
  if (url.includes("Special:FilePath")) {
    return /width=\d+/.test(url)
      ? url.replace(/width=\d+/, "width=96")
      : `${url}${url.includes("?") ? "&" : "?"}width=96`;
  }
  return url;
}

// Surname for the influence label (last word of the name).
function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] || name;
}

// A gently undulating path between two stars (an influence link).
function wavyPath(ax: number, ay: number, bx: number, by: number): string {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const waves = Math.max(2, Math.round(len / 200));
  const amp = Math.min(26, len * 0.05);
  const N = waves * 10;
  let d = "";
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const off = Math.sin(t * Math.PI * waves) * amp * Math.sin(t * Math.PI);
    const x = ax + dx * t + px * off;
    const y = ay + dy * t + py * off;
    d += `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)} `;
  }
  return d;
}

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
  const [highlight, setHighlight] = useState<string[] | null>(null);
  const [linkTip, setLinkTip] = useState<{
    key: string;
    title: string;
    note: string | null;
    x: number;
    y: number;
  } | null>(null);
  const { locale } = useLocale();
  const t = useT();
  const { setScene: setAudioScene } = useAudio();
  useEffect(() => {
    setAudioScene("constellation");
  }, [setAudioScene]);

  const bounds = useMemo(() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const g of layout.galaxies) {
      minX = Math.min(minX, g.x);
      minY = Math.min(minY, g.y);
      maxX = Math.max(maxX, g.x);
      maxY = Math.max(maxY, g.y);
    }
    return { minX, minY, maxX, maxY };
  }, [layout]);

  // Keep the galaxy field from being pushed entirely off-screen — at least a
  // sliver of the timeline always stays visible.
  const clampView = (v: View): View => {
    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 720;
    const m = 130;
    const clamp1 = (val: number, bMin: number, bMax: number, vp: number) => {
      const lo = m - bMax * v.scale;
      const hi = vp - m - bMin * v.scale;
      return lo <= hi ? Math.min(Math.max(val, lo), hi) : (lo + hi) / 2;
    };
    return {
      scale: v.scale,
      x: clamp1(v.x, bounds.minX, bounds.maxX, vw),
      y: clamp1(v.y, bounds.minY, bounds.maxY, vh),
    };
  };

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
        return clampView({ scale: ns, x: cx - wx * ns, y: cy - wy * ns });
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const flyTo = (v: View) => {
    interacted.current = true;
    setFlying(true);
    setView(clampView(v));
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

  // Frame a set of movements (and their artists) within the viewport.
  const flyToFit = (slugs: string[]) => {
    const gs = layout.galaxies.filter((g) => slugs.includes(g.slug));
    if (!gs.length) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const g of gs) {
      for (const p of [{ x: g.x, y: g.y }, ...g.artists]) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
    }
    const pad = 320;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 720;
    const scale = Math.max(
      0.2,
      Math.min(vw / (maxX - minX + pad * 2), vh / (maxY - minY + pad * 2), 1.8),
    );
    flyTo({ scale, x: vw / 2 - cx * scale, y: vh / 2 - cy * scale });
  };

  const pickPeriod = (g: Galaxy) => {
    setHighlight([g.slug]);
    flyToPeriod(g);
  };

  const pickArtist = (g: Galaxy, a: StarArtist) => {
    setHighlight([g.slug]);
    // Center the constellation on the artist's star, so stepping back from the
    // card reveals their surroundings.
    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 720;
    const s = 1.55;
    flyTo({ scale: s, x: vw / 2 - a.x * s, y: vh / 2 - a.y * s });
    window.setTimeout(() => setSelected(a), 650);
  };

  // Live response as the filter search narrows: brighten + frame the matches.
  const previewResults = (slugs: string[]) => {
    if (slugs.length > 0 && slugs.length < layout.galaxies.length) {
      setHighlight(slugs);
      flyToFit(slugs);
    } else {
      setHighlight(null);
    }
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
    setView((v) => clampView({ ...v, x: v.x + dx, y: v.y + dy }));
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
      <Starfield view={view} flying={flying} />

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
          {starsOn > 0 &&
            layout.links.map((lk) => {
              const d = wavyPath(lk.ax, lk.ay, lk.bx, lk.by);
              const title = `${lastName(lk.bName)} – ${lastName(lk.aName)}`;
              return (
                <g key={lk.key}>
                  <path
                    d={d}
                    fill="none"
                    stroke="#5b93e0"
                    strokeOpacity={
                      linkTip?.key === lk.key ? 0.98 : 0.42 * starsOn
                    }
                    strokeWidth={linkTip?.key === lk.key ? 2.6 : 1.3}
                    vectorEffect="non-scaling-stroke"
                  />
                  {/* a wide invisible corridor so every link is hoverable */}
                  <path
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={26}
                    vectorEffect="non-scaling-stroke"
                    style={{ pointerEvents: "stroke", cursor: "help" }}
                    onPointerEnter={(e) =>
                      setLinkTip({
                        key: lk.key,
                        title,
                        note: lk.note,
                        x: e.clientX,
                        y: e.clientY,
                      })
                    }
                    onPointerMove={(e) =>
                      setLinkTip((p) =>
                        p && p.key === lk.key
                          ? { ...p, x: e.clientX, y: e.clientY }
                          : p,
                      )
                    }
                    onPointerLeave={() => setLinkTip(null)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </g>
              );
            })}
        </svg>

        {layout.galaxies.map((g, gi) => (
          <div
            key={g.slug}
            className="absolute"
            style={{
              left: g.x,
              top: g.y,
              opacity: !highlight || highlight.includes(g.slug) ? 1 : 0.16,
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
                {periodName(locale, g.name)}
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
                    starsOn * (!highlight || highlight.includes(g.slug) ? 1 : 0.16),
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
                    width: 58,
                    height: 58,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "50%",
                    transform: `translate(-50%, -50%) scale(${inv})`,
                  }}
                >
                  {a.portraitUrl ? (
                    <span
                      style={{
                        display: "block",
                        width: 51,
                        height: 51,
                        borderRadius: "50%",
                        overflow: "hidden",
                        border: `2px solid ${g.color}`,
                        boxSizing: "border-box",
                        boxShadow: `0 0 16px 2px ${g.color}`,
                        background: "#221d16",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={starPortrait(a.portraitUrl) ?? a.portraitUrl}
                        alt=""
                        loading="lazy"
                        style={{
                          display: "block",
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    </span>
                  ) : (
                    <span
                      style={{
                        display: "block",
                        width: 27,
                        height: 27,
                        borderRadius: "50%",
                        background: "#efe9dd",
                        boxShadow: `0 0 18px 3px ${g.color}`,
                      }}
                    />
                  )}
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
                  {localized(locale, a.i18n, "name", a.name)}
                </div>
              </div>
            )),
          )}
      </div>

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.4) 100%)",
        }}
      />

      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-7 py-6">
        <LangSwitcher />
        <div className="hidden text-[11px] uppercase tracking-[0.3em] text-ink-faint sm:block">
          {t("tagline")}
        </div>
      </header>

      <ConstellationFilter
        galaxies={layout.galaxies}
        onPickPeriod={pickPeriod}
        onPickArtist={pickArtist}
        onResults={previewResults}
      />

      <div className="pointer-events-none absolute inset-x-0 bottom-5 text-center text-[11px] uppercase tracking-[0.3em] text-ink-faint">
        {t("scrollHint")}
      </div>

      {selected && (
        <ArtistCard artist={selected} onClose={() => setSelected(null)} />
      )}

      {linkTip && (
        <div
          className="pointer-events-none fixed z-40 max-w-[300px] rounded-lg border border-line px-3 py-2 text-[12px] leading-snug text-ink-soft"
          style={{
            left: Math.min(linkTip.x + 16, (typeof window !== "undefined" ? window.innerWidth : 1280) - 320),
            top: linkTip.y + 16,
            background: "rgba(20,17,12,0.96)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            boxShadow: "0 18px 50px -16px rgba(0,0,0,0.8)",
          }}
        >
          <span className="block text-[10px] uppercase tracking-[0.18em] text-[#5b93e0]">
            ✦ Influence
          </span>
          <span className="mb-1 mt-0.5 block font-display text-[14px] text-ink">
            {linkTip.title}
          </span>
          {linkTip.note}
        </div>
      )}
    </div>
  );
}
