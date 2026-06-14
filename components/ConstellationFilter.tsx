"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import type { Galaxy, StarArtist } from "@/lib/timeline";
import { useLocale, useT } from "@/components/LocaleProvider";
import { localized, periodName } from "@/lib/i18n";

type Props = {
  galaxies: Galaxy[];
  onPickPeriod: (g: Galaxy) => void;
  onPickArtist: (g: Galaxy, a: StarArtist) => void;
};

export default function ConstellationFilter({
  galaxies,
  onPickPeriod,
  onPickArtist,
}: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"movements" | "artists">("movements");
  const [q, setQ] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const tr = useT();
  const { locale } = useLocale();

  useEffect(() => {
    if (open && panelRef.current) {
      gsap.fromTo(
        panelRef.current,
        { opacity: 0, y: -10, scaleY: 0.95, transformOrigin: "top center" },
        { opacity: 1, y: 0, scaleY: 1, duration: 0.4, ease: "power3.out" },
      );
    }
  }, [open]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const rows = listRef.current.querySelectorAll("[data-row]");
    gsap.fromTo(
      rows,
      { opacity: 0, x: -10 },
      { opacity: 1, x: 0, duration: 0.32, ease: "power2.out", stagger: 0.018 },
    );
  }, [tab, q, open]);

  const ql = q.trim().toLowerCase();
  const periods = galaxies.filter((g) => !ql || g.name.toLowerCase().includes(ql));
  const artists = galaxies
    .flatMap((g) => g.artists.map((a) => ({ g, a })))
    .filter(({ a }) => {
      if (!ql) return true;
      const ln = localized(locale, a.i18n, "name", a.name) ?? a.name;
      return (
        a.name.toLowerCase().includes(ql) || ln.toLowerCase().includes(ql)
      );
    });
  const empty = (tab === "movements" ? periods.length : artists.length) === 0;

  return (
    <div className="pointer-events-auto absolute left-1/2 top-5 z-30 -translate-x-1/2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-white/15 bg-black/40 px-5 py-2.5 text-[11px] uppercase tracking-[0.22em] text-ink backdrop-blur transition-colors hover:bg-black/60"
      >
        <span className="text-gold">✦</span> {tr("explore")}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute left-1/2 top-12 w-[320px] -translate-x-1/2 overflow-hidden rounded-2xl border border-line"
          style={{
            background: "rgba(20,17,12,0.96)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            boxShadow: "0 30px 80px -20px rgba(0,0,0,0.85)",
          }}
        >
          <div className="flex gap-1 p-3">
            {(["movements", "artists"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex-1 rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] transition-colors"
                style={{
                  background:
                    tab === t ? "rgba(201,162,75,0.16)" : "transparent",
                  color: tab === t ? "var(--gold)" : "var(--ink-soft)",
                }}
              >
                {tr(t)}
              </button>
            ))}
          </div>

          <div className="px-3 pb-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={
                tab === "movements"
                  ? tr("searchMovements")
                  : tr("searchArtists")
              }
              className="w-full rounded-lg border border-line bg-black/30 px-3 py-2 text-[13px] text-ink outline-none placeholder:text-ink-faint focus:border-gold-soft"
            />
          </div>

          <div ref={listRef} className="max-h-[46vh] overflow-y-auto px-2 pb-3">
            {tab === "movements"
              ? periods.map((g) => (
                  <button
                    key={g.slug}
                    data-row
                    onClick={() => {
                      onPickPeriod(g);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/5"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: g.color, boxShadow: `0 0 8px ${g.color}` }}
                    />
                    <span className="flex-1 text-[13px] text-ink">
                      {periodName(locale, g.name)}
                    </span>
                    <span className="text-[11px] text-ink-faint">
                      {g.startYear}
                    </span>
                  </button>
                ))
              : artists.map(({ g, a }) => (
                  <button
                    key={`${a.slug}-${g.slug}`}
                    data-row
                    onClick={() => {
                      onPickArtist(g, a);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/5"
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: g.color }}
                    />
                    <span className="flex-1 text-[13px] text-ink">
                      {localized(locale, a.i18n, "name", a.name)}
                    </span>
                    <span className="text-[11px] text-ink-faint">
                      {periodName(locale, g.name)}
                    </span>
                  </button>
                ))}
            {empty && (
              <div className="px-3 py-6 text-center text-[12px] text-ink-faint">
                {tr("noMatches")}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
