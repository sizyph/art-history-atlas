"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// A soft, dark human silhouette (white shape on transparent → tinted by the
// material colour), with feathered edges so it reads as a person, not a cut-out.
function makeFigureTexture(): THREE.CanvasTexture {
  const W = 128;
  const H = 256;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d")!;
  ctx.filter = "blur(2.4px)";
  ctx.fillStyle = "#fff";
  // head
  ctx.beginPath();
  ctx.ellipse(64, 42, 18, 22, 0, 0, Math.PI * 2);
  ctx.fill();
  // body + legs
  ctx.beginPath();
  ctx.moveTo(46, 72);
  ctx.quadraticCurveTo(38, 130, 47, 196);
  ctx.lineTo(58, 248);
  ctx.lineTo(64, 198);
  ctx.lineTo(70, 248);
  ctx.lineTo(81, 196);
  ctx.quadraticCurveTo(90, 130, 82, 72);
  ctx.quadraticCurveTo(64, 60, 46, 72);
  ctx.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

type Fig = {
  x: number;
  z: number;
  tx: number;
  tz: number;
  pause: number;
  h: number;
  tint: string;
  phase: number; // desync for the idle sway
  atWall: boolean; // current target is a viewing spot at a wall
  lead: number; // index of the companion this one follows (−1 if none)
  follow: number; // index of this one's companion (−1 if none)
};

// Dark grey-browns rather than near-black, so a silhouette still reads against
// a very dark room (Nezu, Gardner) while staying clearly a figure in bright ones.
const TINTS = ["#26252c", "#2b251d", "#222329", "#2d2620"];

// Visitors are scenery — never let them catch a click or the focus ray.
const noRaycast = () => {};

function retarget(f: Fig, roomWidth: number, depth: number) {
  const hx = roomWidth / 2 - 1.4;
  const hz = depth / 2 - 2;
  // mostly drift up to a wall (to stand before the art), sometimes the middle
  if (Math.random() < 0.72) {
    f.tx = (Math.random() < 0.5 ? -1 : 1) * (hx - 0.2 + Math.random() * 0.3);
    f.tz = -hz + Math.random() * 2 * hz;
    f.atWall = true;
  } else {
    f.tx = -hx + Math.random() * 2 * hx;
    f.tz = -hz + Math.random() * 2 * hz;
    f.atWall = false;
  }
}

function spawn(roomWidth: number, depth: number): Fig {
  const hx = roomWidth / 2 - 1.4;
  const hz = depth / 2 - 2;
  const f: Fig = {
    x: -hx + Math.random() * 2 * hx,
    z: -hz + Math.random() * 2 * hz,
    tx: 0,
    tz: 0,
    pause: Math.random() * 5,
    h: 1.62 + Math.random() * 0.22,
    tint: TINTS[Math.floor(Math.random() * TINTS.length)],
    phase: Math.random() * Math.PI * 2,
    atWall: false,
    lead: -1,
    follow: -1,
  };
  retarget(f, roomWidth, depth);
  return f;
}

// A few visitors who drift slowly through the hall, pausing before the works —
// the difference between a rendered room and an inhabited place.
export default function Visitors({
  depth,
  roomWidth,
  count,
}: {
  depth: number;
  roomWidth: number;
  count: number;
}) {
  const tex = useMemo(makeFigureTexture, []);
  useEffect(() => () => tex.dispose(), [tex]);

  const figs = useRef<Fig[]>([]);
  if (figs.current.length !== count) {
    figs.current = Array.from({ length: count }, () => spawn(roomWidth, depth));
    // pair the first two into companions (only when a solo wanderer remains)
    if (count >= 3) {
      figs.current[0].follow = 1;
      figs.current[1].lead = 0;
    }
  }
  const groups = useRef<(THREE.Group | null)[]>([]);

  useFrame((state, dt) => {
    const cam = state.camera;
    const step = Math.min(dt, 0.05);
    const tm = state.clock.elapsedTime;
    const list = figs.current;
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      const g = groups.current[i];
      if (!g) continue;
      if (f.lead >= 0) {
        // a companion: walk to the spot its leader keeps assigning, then wait
        const dx = f.tx - f.x;
        const dz = f.tz - f.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.3) {
          const s = (step * 0.46) / d;
          f.x += dx * s;
          f.z += dz * s;
        }
      } else if (f.pause > 0) {
        f.pause -= step;
      } else {
        const dx = f.tx - f.x;
        const dz = f.tz - f.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.28) {
          // dwell longer when standing before a work than mid-floor
          f.pause = f.atWall ? 6 + Math.random() * 8 : 2 + Math.random() * 4;
          retarget(f, roomWidth, depth);
          if (f.follow >= 0) {
            // place the companion beside the new viewing spot
            const fo = list[f.follow];
            const lim = roomWidth / 2 - 1.0;
            const off = f.tx < 0 ? 0.7 : -0.7;
            fo.tx = Math.max(-lim, Math.min(lim, f.tx + off));
            fo.tz = f.tz + (Math.random() - 0.5) * 0.6;
            fo.atWall = f.atWall;
          }
        } else {
          const s = (step * 0.5) / d;
          f.x += dx * s;
          f.z += dz * s;
        }
      }
      // billboard to the viewer (upright), with a slow weight-shift sway
      g.position.set(f.x, 0, f.z);
      g.rotation.y = Math.atan2(cam.position.x - f.x, cam.position.z - f.z);
      g.rotation.z = Math.sin(tm * 0.8 + f.phase) * 0.02;
    }
  });

  return (
    <group>
      {figs.current.map((f, i) => (
        <group
          key={i}
          ref={(el) => {
            groups.current[i] = el;
          }}
          position={[f.x, 0, f.z]}
        >
          <mesh
            position={[0, f.h / 2, 0]}
            scale={[f.h * 0.36, f.h, 1]}
            raycast={noRaycast}
          >
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial
              map={tex}
              color={f.tint}
              transparent
              opacity={0.86}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          {/* soft contact shadow */}
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0.02, 0]}
            raycast={noRaycast}
          >
            <circleGeometry args={[0.32, 20]} />
            <meshBasicMaterial color="#000" transparent opacity={0.26} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
