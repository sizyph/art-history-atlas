"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Museum } from "@/lib/museums";

const noRaycast = () => {};

// A soft vertical column: bright near the top (the skylight), fading down and
// feathered at the edges — drawn additively it reads as a shaft of daylight.
function makeShaftTexture(): THREE.CanvasTexture {
  const W = 64;
  const H = 256;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d")!;
  const v = ctx.createLinearGradient(0, 0, 0, H);
  v.addColorStop(0, "rgba(255,255,255,0.55)");
  v.addColorStop(0.5, "rgba(255,255,255,0.22)");
  v.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  // feather the left/right edges
  ctx.globalCompositeOperation = "destination-in";
  const h = ctx.createLinearGradient(0, 0, W, 0);
  h.addColorStop(0, "rgba(0,0,0,0)");
  h.addColorStop(0.5, "rgba(0,0,0,1)");
  h.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = h;
  ctx.fillRect(0, 0, W, H);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A round, soft dot for a single dust mote.
function makeDotTexture(): THREE.CanvasTexture {
  const S = 32;
  const cv = document.createElement("canvas");
  cv.width = S;
  cv.height = S;
  const ctx = cv.getContext("2d")!;
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.5)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Shafts of light leaning down from the skylight, billboarded so they always
// read as volume. Centre ridge (vault) or the two flanks (clerestory).
function Shafts({
  W,
  H,
  depth,
  color,
  mode,
}: {
  W: number;
  H: number;
  depth: number;
  color: string;
  mode: "center" | "sides";
}) {
  const tex = useMemo(makeShaftTexture, []);
  const groups = useRef<(THREE.Group | null)[]>([]);

  const shafts = useMemo(() => {
    const out: { x: number; z: number; w: number; phase: number }[] = [];
    const n = Math.max(2, Math.round(depth / 4.5));
    for (let i = 0; i < n; i++) {
      const z = -depth / 2 + (depth / (n + 1)) * (i + 1);
      const w = 1.0 + (i % 3) * 0.35;
      const phase = (i * 1.7) % (Math.PI * 2);
      if (mode === "center") {
        out.push({ x: (i % 2 === 0 ? -1 : 1) * W * 0.06, z, w, phase });
      } else {
        out.push({ x: -(W / 2 - 0.7), z, w, phase });
        out.push({ x: W / 2 - 0.7, z, w, phase: phase + 1 });
      }
    }
    return out;
  }, [W, depth, mode]);

  useFrame((state) => {
    const cam = state.camera;
    const tm = state.clock.elapsedTime;
    for (let i = 0; i < shafts.length; i++) {
      const g = groups.current[i];
      if (!g) continue;
      const s = shafts[i];
      g.rotation.y = Math.atan2(cam.position.x - s.x, cam.position.z - s.z);
      // gentle shimmer
      g.scale.x = 1 + 0.12 * Math.sin(tm * 0.5 + s.phase);
    }
  });

  return (
    <group>
      {shafts.map((s, i) => (
        <group
          key={i}
          ref={(el) => {
            groups.current[i] = el;
          }}
          position={[s.x, H / 2, s.z]}
        >
          <mesh raycast={noRaycast}>
            <planeGeometry args={[s.w, H * 1.04]} />
            <meshBasicMaterial
              map={tex}
              color={color}
              transparent
              opacity={0.5}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// Slow motes of dust adrift in the hall's volume, catching the light.
function DustMotes({
  W,
  H,
  depth,
  color,
}: {
  W: number;
  H: number;
  depth: number;
  color: string;
}) {
  const sprite = useMemo(makeDotTexture, []);
  const geomRef = useRef<THREE.BufferGeometry>(null);

  const { positions, vel } = useMemo(() => {
    const N = Math.min(220, Math.max(70, Math.round(W * depth * 0.9)));
    const positions = new Float32Array(N * 3);
    const vel = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      positions[i * 3] = (Math.random() - 0.5) * W * 0.92;
      positions[i * 3 + 1] = 0.3 + Math.random() * (H - 0.6);
      positions[i * 3 + 2] = (Math.random() - 0.5) * depth * 0.92;
      vel[i * 3] = (Math.random() - 0.5) * 0.05;
      vel[i * 3 + 1] = (Math.random() - 0.5) * 0.02 - 0.01;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.05;
    }
    return { positions, vel };
  }, [W, H, depth]);

  useFrame((_, dt) => {
    const g = geomRef.current;
    if (!g) return;
    const step = Math.min(dt, 0.05);
    const p = positions;
    const hx = (W * 0.92) / 2;
    const hz = (depth * 0.92) / 2;
    for (let i = 0; i < p.length / 3; i++) {
      p[i * 3] += vel[i * 3] * step;
      p[i * 3 + 1] += vel[i * 3 + 1] * step;
      p[i * 3 + 2] += vel[i * 3 + 2] * step;
      // drift back into the volume when a mote wanders out (or settles)
      if (p[i * 3] < -hx) p[i * 3] = hx;
      else if (p[i * 3] > hx) p[i * 3] = -hx;
      if (p[i * 3 + 2] < -hz) p[i * 3 + 2] = hz;
      else if (p[i * 3 + 2] > hz) p[i * 3 + 2] = -hz;
      if (p[i * 3 + 1] < 0.25 || p[i * 3 + 1] > H - 0.25) {
        p[i * 3 + 1] = 0.3 + Math.random() * (H - 0.6);
      }
    }
    g.attributes.position.needsUpdate = true;
  });

  return (
    <points raycast={noRaycast}>
      <bufferGeometry ref={geomRef}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.035}
        map={sprite}
        color={color}
        transparent
        opacity={0.5}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
        toneMapped={false}
      />
    </points>
  );
}

// Floating dust everywhere; daylight shafts where the ceiling lets light in.
export default function Atmosphere({
  museum,
  depth,
}: {
  museum: Museum;
  depth: number;
}) {
  const W = museum.roomWidth;
  const H = museum.wallHeight;
  const warm = "#fff1d4";
  return (
    <group>
      <DustMotes W={W} H={H} depth={depth} color={warm} />
      {museum.ceilingKind === "vault" && (
        <Shafts W={W} H={H} depth={depth} color={warm} mode="center" />
      )}
      {museum.ceilingKind === "clerestory" && (
        <Shafts W={W} H={H} depth={depth} color="#fbf4e6" mode="sides" />
      )}
    </group>
  );
}
