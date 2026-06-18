"use client";

import { useEffect, useRef } from "react";

// The ~4s threshold morph, as one continuous panel, in three beats:
//  P1 (0–25%)   the artist card becomes the entrance door — same size + layout,
//               buttons fade, a light sweep blooms, the wood deepens, a handle
//               appears; a slightly-blurred view of the museum sits behind it.
//  P2 (25–55%)  it is pushed open on its left hinge (constant speed) — the door
//               swings while the interior behind stays put.
//  P3 (55–100%) you turn your head: the interior slides to the right, and the
//               panel swings back, grows tall and reflows — portrait fading out —
//               into the gallery's biography board (text scroll). A light flash
//               bridges into the room.
// Motion is linear throughout (no easing) so nothing accelerates.
export default function EntryDoor({
  portraitUrl,
  name,
  dates,
  sub,
  bio,
  birthYear,
  deathYear,
  accent,
}: {
  portraitUrl: string | null;
  name: string;
  dates: string | null;
  sub: string;
  bio: string;
  birthYear: number | null;
  deathYear: number | null;
  accent: string;
}) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const r = root.current;
    if (!r) return;
    const D = 4000;
    const A = (sel: string, kf: Keyframe[], opt: KeyframeAnimationOptions = {}) =>
      r.querySelector<HTMLElement>(sel)?.animate(kf, { fill: "forwards", duration: D, ...opt });

    // P1 — buttons fade, light sweep, handle, wood (panel + children hold)
    A(".ed-btns", [{ opacity: 1 }, { opacity: 0, offset: 0.2 }, { opacity: 0 }]);
    A(".ed-sweep", [
      { opacity: 0, transform: "translateX(-130%) skewX(-12deg)", offset: 0 },
      { opacity: 0.85, offset: 0.12 },
      { opacity: 0, transform: "translateX(160%) skewX(-12deg)", offset: 0.26 },
      { opacity: 0 },
    ]);
    A(".ed-handle", [{ opacity: 0 }, { opacity: 0, offset: 0.16 }, { opacity: 1, offset: 0.3 }, { opacity: 1, offset: 0.62 }, { opacity: 0, offset: 0.74 }, { opacity: 0 }]);

    // skin: card → wood door → dark scroll board
    A(".ed-panel", [
      { background: "#17130e", borderColor: "rgba(120,108,88,0.3)", borderWidth: "1px", boxShadow: "0 20px 60px rgba(0,0,0,0.5)", offset: 0 },
      { background: "#241c13", borderColor: accent, borderWidth: "3px", boxShadow: "0 30px 80px rgba(0,0,0,0.6)", offset: 0.25 },
      { background: "#241c13", borderColor: accent, borderWidth: "3px", offset: 0.55 },
      { background: "#15110b", borderColor: "#2e2517", borderWidth: "2px", boxShadow: "0 0 0 1px rgba(0,0,0,0.4)", offset: 1 },
    ]);

    // transform: hold → push open → swing back face-on, centred
    A(".ed-panel", [
      { transform: "translate(-50%,-50%) rotateY(0deg)", offset: 0 },
      { transform: "translate(-50%,-50%) rotateY(0deg)", offset: 0.25 },
      { transform: "translate(-50%,-50%) rotateY(80deg)", offset: 0.55 },
      { transform: "translate(-50%,-50%) rotateY(8deg)", offset: 0.86 },
      { transform: "translate(-50%,-50%) rotateY(8deg)", offset: 1 },
    ]);

    // grow tall to the board (overflowing the frame top/bottom, like K0)
    A(".ed-panel", [{ width: "460px", height: "434px", offset: 0 }, { width: "460px", height: "434px", offset: 0.55 }, { width: "540px", height: "880px", offset: 0.9 }, { width: "540px", height: "880px" }]);

    // reflow children into the board; the portrait fades out (the board has none)
    A(".ed-portrait", [{ opacity: 1, offset: 0 }, { opacity: 1, offset: 0.55 }, { opacity: 0, offset: 0.78 }, { opacity: 0 }]);
    A(".ed-htext", [
      { left: "156px", top: "26px", width: "282px", offset: 0 },
      { left: "156px", top: "26px", width: "282px", offset: 0.55 },
      { left: "30px", top: "40px", width: "480px", offset: 0.9 },
      { left: "30px", top: "40px", width: "480px" },
    ]);
    A(".ed-bio", [
      { left: "22px", top: "192px", width: "416px", fontSize: "12px", offset: 0 },
      { left: "22px", top: "192px", width: "416px", fontSize: "12px", offset: 0.55 },
      { left: "30px", top: "150px", width: "480px", fontSize: "16px", offset: 0.9 },
      { left: "30px", top: "150px", width: "480px", fontSize: "16px" },
    ]);
    A(".ed-keydates", [{ opacity: 0, offset: 0 }, { opacity: 0, offset: 0.72 }, { opacity: 1, offset: 0.92 }, { opacity: 1 }]);
    A(".ed-rod", [{ opacity: 0, offset: 0 }, { opacity: 0, offset: 0.62 }, { opacity: 1, offset: 0.9 }, { opacity: 1 }]);

    // the blurred interior: static while the door opens, then a hard, very fast
    // sweep that evacuates the whole interior off the right edge as you turn your
    // head left — the world rushes away, leaving the board on the dark
    A(".ed-bg", [
      { opacity: 0, transform: "translateX(0) scale(1.05)", offset: 0 },
      { opacity: 1, transform: "translateX(0) scale(1.05)", offset: 0.45 },
      { opacity: 1, transform: "translateX(0) scale(1.05)", offset: 0.55 },
      { opacity: 1, transform: "translateX(2100px) scale(1.05)", offset: 0.62 },
      { opacity: 1, transform: "translateX(2100px) scale(1.05)" },
    ]);

    // a light flash bridging into the gallery, then the black veil for the nav
    A(".ed-flash", [{ opacity: 0, offset: 0 }, { opacity: 0, offset: 0.84 }, { opacity: 0.85, offset: 0.93 }, { opacity: 0, offset: 1 }]);
    A(".ed-veil", [{ opacity: 0, offset: 0 }, { opacity: 0, offset: 0.9 }, { opacity: 1 }]);
  }, []);

  const keyDates = [
    birthYear != null ? { y: birthYear, l: "Born" } : null,
    deathYear != null ? { y: deathYear, l: "Died" } : null,
  ].filter(Boolean) as { y: number; l: string }[];

  return (
    <div ref={root} className="fixed inset-0 z-[60] overflow-hidden bg-black">
      {/* a slightly-blurred view of the museum interior behind the door */}
      <div className="ed-bg absolute" style={{ top: "-6%", bottom: "-6%", left: "-55%", right: "-55%", opacity: 0, filter: "blur(7px)" }}>
        <div className="absolute inset-0" style={{ background: "linear-gradient(#0c0a07, #16110b 60%, #0a0806)" }} />
        <div className="absolute inset-x-0 top-0" style={{ height: "26%", background: "repeating-linear-gradient(#120d08 0 16px, #1b140c 16px 30px)" }} />
        <div className="absolute" style={{ left: "34%", top: "30%", width: "32%", height: "34%", background: "#3a2f1c", boxShadow: "0 0 60px 24px rgba(243,228,196,0.25)", borderRadius: 4 }} />
        {[38, 50, 62].map((l) => (
          <div key={l} className="absolute" style={{ left: `${l}%`, top: "33%", width: "7%", height: "28%", background: "#f0e0bb", opacity: 0.5 }} />
        ))}
        <div className="absolute inset-x-0 bottom-0" style={{ height: "40%", background: "linear-gradient(#1a140d, #0b0906)" }} />
        {[14, 26, 74, 86].map((l) => (
          <div key={l} className="absolute" style={{ left: `${l}%`, top: "40%", width: "6%", height: "16%", background: "#2a2115", border: "2px solid #4a3c24", borderRadius: 2 }} />
        ))}
      </div>

      {/* the morphing panel: card → door → biography board */}
      <div
        className="ed-panel absolute"
        style={{
          left: "50%",
          top: "50%",
          width: 460,
          height: 434,
          boxSizing: "border-box",
          transform: "translate(-50%,-50%)",
          transformOrigin: "left center",
          backfaceVisibility: "hidden",
          borderStyle: "solid",
          borderRadius: 6,
          background: "#17130e",
        }}
      >
        <div className="ed-rod absolute" style={{ left: -8, right: -8, top: -6, height: 10, borderRadius: 5, background: "#241a10", opacity: 0 }} />
        <div className="ed-rod absolute" style={{ left: -8, right: -8, bottom: -6, height: 10, borderRadius: 5, background: "#241a10", opacity: 0 }} />

        <div className="absolute inset-0 overflow-hidden" style={{ borderRadius: 6 }}>
          <div className="ed-sweep pointer-events-none absolute" style={{ top: "-20%", left: 0, width: "52%", height: "140%", background: "linear-gradient(104deg, transparent, rgba(255,238,200,0.55), transparent)", opacity: 0 }} />
          {portraitUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="ed-portrait absolute rounded object-cover" style={{ left: 22, top: 20, width: 118, height: 152, border: `1px solid ${accent}66` }} src={portraitUrl} alt="" />
          )}
          <div className="ed-htext absolute" style={{ left: 156, top: 26, width: 282 }}>
            <div className="font-display text-[24px] leading-tight text-ink">{name}</div>
            {dates && (
              <div className="mt-1 text-[13px]" style={{ color: accent }}>
                {dates}
              </div>
            )}
            {sub && <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-ink-soft">{sub}</div>}
          </div>
          <p
            className="ed-bio absolute leading-relaxed text-ink-soft"
            style={{ left: 22, top: 192, width: 416, fontSize: 12, display: "-webkit-box", WebkitLineClamp: 9, WebkitBoxOrient: "vertical", overflow: "hidden" }}
          >
            {bio}
          </p>
          {keyDates.length > 0 && (
            <div className="ed-keydates absolute" style={{ left: 30, top: 600, width: 480, opacity: 0 }}>
              <div className="text-[12px] uppercase tracking-[0.22em]" style={{ color: accent }}>
                Key dates
              </div>
              {keyDates.map((k) => (
                <div key={k.l} className="mt-3 flex items-baseline gap-4 text-[15px]">
                  <span className="font-display" style={{ color: accent }}>
                    {k.y}
                  </span>
                  <span className="text-ink-soft">{k.l}</span>
                </div>
              ))}
            </div>
          )}
          <div className="ed-btns absolute flex gap-2" style={{ left: 22, top: 332, width: 416 }}>
            <div className="h-[26px] flex-1 rounded-full border border-line" />
            <div className="h-[26px] w-[64px] rounded-full" style={{ background: accent }} />
          </div>
        </div>

        <div className="ed-handle absolute" style={{ right: 6, top: "50%", width: 5, height: 32, marginTop: -16, borderRadius: 3, background: "#c9a24b", opacity: 0 }} />
      </div>

      <div className="ed-flash pointer-events-none absolute inset-0" style={{ opacity: 0, background: "radial-gradient(circle at 50% 50%, #fff5e2, #f3e4c4 40%, rgba(243,228,196,0.4) 70%)" }} />
      <div className="ed-veil absolute inset-0 bg-black" style={{ opacity: 0 }} />
    </div>
  );
}
