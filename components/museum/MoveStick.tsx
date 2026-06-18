"use client";

import { useRef, useState } from "react";

// A virtual joystick for walking the gallery on touch devices. Writes an analog
// {x: strafe, y: forward} vector (−1..1) into a ref the Player reads each frame.
export default function MoveStick({
  move,
  accent,
}: {
  move: React.RefObject<{ x: number; y: number }>;
  accent: string;
}) {
  const baseRef = useRef<HTMLDivElement>(null);
  const active = useRef(false);
  const pid = useRef<number | null>(null);
  const [thumb, setThumb] = useState({ x: 0, y: 0 });
  const R = 46; // max thumb travel (px)

  const update = (clientX: number, clientY: number) => {
    const el = baseRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let dx = clientX - (r.left + r.width / 2);
    let dy = clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > R) {
      dx = (dx / len) * R;
      dy = (dy / len) * R;
    }
    setThumb({ x: dx, y: dy });
    move.current.x = dx / R;
    move.current.y = -dy / R; // drag up → walk forward
  };

  const reset = () => {
    setThumb({ x: 0, y: 0 });
    move.current.x = 0;
    move.current.y = 0;
    active.current = false;
    pid.current = null;
  };

  return (
    <div
      ref={baseRef}
      data-testid="movestick"
      onPointerDown={(e) => {
        e.stopPropagation();
        active.current = true;
        pid.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (active.current && e.pointerId === pid.current)
          update(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        if (e.pointerId === pid.current) reset();
      }}
      onPointerCancel={reset}
      className="pointer-events-auto fixed bottom-7 left-6 z-30 touch-none select-none rounded-full"
      style={{
        width: 116,
        height: 116,
        background: "rgba(0,0,0,0.26)",
        border: "1px solid rgba(255,255,255,0.14)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
      }}
    >
      <div
        className="absolute rounded-full"
        style={{
          width: 52,
          height: 52,
          left: "50%",
          top: "50%",
          transform: `translate(calc(-50% + ${thumb.x}px), calc(-50% + ${thumb.y}px))`,
          background: `${accent}d0`,
          boxShadow: `0 0 16px ${accent}80`,
          transition: active.current ? "none" : "transform 0.18s ease",
        }}
      />
    </div>
  );
}
