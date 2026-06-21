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
};

// Dark grey-browns rather than near-black, so a silhouette still reads against
// a very dark room (Nezu, Gardner) while staying clearly a figure in bright ones.
const TINTS = ["#26252c", "#2b251d", "#222329", "#2d2620"];

// Visitors are scenery — never let them catch a click or the focus ray.
const noRaycast = () => {};

function retarget(f: Fig, roomWidth: number, depth: number) {
  const hx = roomWidth / 2 - 1.4;
  const hz = depth / 2 - 2;
  // mostly drift toward a wall (where the art is), sometimes the middle
  if (Math.random() < 0.62) {
    f.tx = (Math.random() < 0.5 ? -1 : 1) * (hx - 0.3 + Math.random() * 0.3);
    f.tz = -hz + Math.random() * 2 * hz;
  } else {
    f.tx = -hx + Math.random() * 2 * hx;
    f.tz = -hz + Math.random() * 2 * hz;
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
  }
  const groups = useRef<(THREE.Group | null)[]>([]);

  useFrame((state, dt) => {
    const cam = state.camera;
    const step = Math.min(dt, 0.05);
    for (let i = 0; i < figs.current.length; i++) {
      const f = figs.current[i];
      const g = groups.current[i];
      if (!g) continue;
      if (f.pause > 0) {
        f.pause -= step;
      } else {
        const dx = f.tx - f.x;
        const dz = f.tz - f.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.28) {
          f.pause = 3 + Math.random() * 7;
          retarget(f, roomWidth, depth);
        } else {
          const s = (step * 0.5) / d;
          f.x += dx * s;
          f.z += dz * s;
        }
      }
      g.position.set(f.x, 0, f.z);
      // billboard to the viewer (upright)
      g.rotation.y = Math.atan2(cam.position.x - f.x, cam.position.z - f.z);
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
