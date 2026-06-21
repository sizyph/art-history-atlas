"use client";

import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { MeshReflectorMaterial, useTexture } from "@react-three/drei";
import {
  Bloom,
  DepthOfField,
  EffectComposer,
  Vignette,
} from "@react-three/postprocessing";
import * as THREE from "three";
import type { Artist, Painting, Period } from "@/db/schema";
import type { Neighbor } from "@/lib/data";
import InspectOverlay from "@/components/museum/InspectOverlay";
import FullscreenViewer from "@/components/museum/FullscreenViewer";
import MoveStick from "@/components/museum/MoveStick";
import Visitors from "@/components/museum/Visitors";
import Atmosphere from "@/components/museum/Atmosphere";
import { daylight, skyColor, resetDaylight } from "@/lib/daylight";
import { PeripheralBlur } from "@/components/museum/effects";
import LangSwitcher from "@/components/LangSwitcher";
import { useLocale, useT } from "@/components/LocaleProvider";
import { useAudio } from "@/components/AudioProvider";
import { classifySubject, type ArtSubject, type Scene } from "@/lib/audio";
import { getGuideVolume } from "@/lib/guideAudio";
import { localized, periodName, type Locale } from "@/lib/i18n";
import {
  frameProfile,
  type DescPalette,
  type FrameProfile,
  type HangStrategy,
  type Museum,
} from "@/lib/museums";
import { makeWood, makeConcrete, makeStone } from "@/components/museum/textures";

const SPACING = 3.6;
const EYE = 1.65;

function wallTextureUrl(p: Painting) {
  const src = p.imageUrl.replace("width=1800", "width=1100");
  return `/api/img?u=${encodeURIComponent(src)}`;
}

function zPositions(count: number, spacing = SPACING): number[] {
  const start = (-(count - 1) / 2) * spacing;
  return Array.from({ length: count }, (_, i) => start + i * spacing);
}

type Hang = {
  p: Painting;
  position: [number, number, number];
  rotation: [number, number, number];
};

// Centre the most important item (items[0]) in the middle of a wall, the next
// ones flanking it outward — the symmetric Salon hang.
function centerOut<T>(items: T[]): T[] {
  const out: T[] = [];
  items.forEach((it, i) => (i % 2 === 0 ? out.push(it) : out.unshift(it)));
  return out;
}

// Curate the chosen works onto the two side walls according to the museum's
// hang strategy, returning the two walls' lists plus the spacing between works.
function arrangeHang(
  paintings: Painting[],
  hang: HangStrategy,
): { left: Painting[]; right: Painting[]; spacing: number } {
  let list = paintings.slice();
  let spacing = SPACING;

  if (hang === "chronological") {
    list.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
  } else if (hang === "thematic") {
    // cluster by sonic/visual subject, keeping fame order inside each cluster
    const groups = new Map<string, Painting[]>();
    for (const p of list) {
      const s = classifySubject(`${p.title} ${p.story ?? ""}`);
      const g = groups.get(s) ?? [];
      g.push(p);
      groups.set(s, g);
    }
    list = [...groups.values()].flat();
  } else if (hang === "sparse") {
    // show fewer, with room to breathe
    list = list.slice(0, Math.max(4, Math.ceil(list.length * 0.6)));
    spacing = SPACING * 1.55;
  }

  if (hang === "salon") {
    // balance importance across both walls, then centre each wall's masterwork
    const a: Painting[] = [];
    const b: Painting[] = [];
    list.forEach((p, i) => (i % 2 === 0 ? a : b).push(p));
    return { left: centerOut(a), right: centerOut(b), spacing };
  }

  // fame / chronological / thematic flow continuously: the first wall (entrance
  // → back) then the second
  const perSide = Math.ceil(list.length / 2);
  return { left: list.slice(0, perSide), right: list.slice(perSide), spacing };
}

function useHangs(
  paintings: Painting[],
  roomWidth: number,
  descReserve: number,
  hang: HangStrategy,
): {
  hangs: Hang[];
  depth: number;
  descZ: number;
} {
  return useMemo(() => {
    const { left, right, spacing } = arrangeHang(paintings, hang);
    const DESC = descReserve; // left-wall length reserved for the description
    const perSide = Math.max(left.length, right.length);
    const depth = Math.max(perSide * spacing + DESC + 3, 16);
    const front = depth / 2;
    const descZ = front - DESC / 2 - 0.7; // description centred near the entrance (left wall)

    // right wall: centred along the full wall
    const rz = zPositions(right.length, spacing);
    // left wall: paintings begin a clear gap behind the description (so the bio
    // reads as a standalone introduction) and run to the back
    const leftTop = descZ - DESC / 2 - 1.8;
    const leftBottom = -front + 2;
    const lz =
      left.length <= 1
        ? [(leftTop + leftBottom) / 2]
        : Array.from(
            { length: left.length },
            (_, i) =>
              leftTop - (i * (leftTop - leftBottom)) / (left.length - 1),
          );

    const hangs: Hang[] = [];
    left.forEach((p, i) =>
      hangs.push({
        p,
        position: [-roomWidth / 2 + 0.08, EYE, lz[i]],
        rotation: [0, Math.PI / 2, 0],
      }),
    );
    right.forEach((p, i) =>
      hangs.push({
        p,
        position: [roomWidth / 2 - 0.08, EYE, rz[i]],
        rotation: [0, -Math.PI / 2, 0],
      }),
    );
    return { hangs, depth, descZ };
  }, [paintings, roomWidth, descReserve, hang]);
}

// One beveled rectangular moulding (outer rect with a hole) as a single
// extruded mesh — the bevel catches the picture light like real carved relief.
function ringGeometry(
  openW: number,
  openH: number,
  border: number,
  depth: number,
  bevel: boolean,
): THREE.ExtrudeGeometry {
  const ow = openW / 2 + border;
  const oh = openH / 2 + border;
  const iw = openW / 2;
  const ih = openH / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-ow, -oh);
  shape.lineTo(ow, -oh);
  shape.lineTo(ow, oh);
  shape.lineTo(-ow, oh);
  shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-iw, -ih);
  hole.lineTo(-iw, ih);
  hole.lineTo(iw, ih);
  hole.lineTo(iw, -ih);
  hole.closePath();
  shape.holes.push(hole);
  const bevelT = Math.min(border * 0.45, depth * 0.6);
  return new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, depth - bevelT),
    bevelEnabled: bevel,
    bevelThickness: bevelT,
    bevelSize: bevel ? border * 0.42 : 0,
    bevelSegments: 2,
    steps: 1,
  });
}

function Moulding({
  w,
  h,
  prof,
}: {
  w: number;
  h: number;
  prof: FrameProfile;
}) {
  const openW = w + prof.mat * 2;
  const openH = h + prof.mat * 2;

  const main = useMemo(
    () =>
      ringGeometry(
        openW,
        openH,
        prof.border,
        prof.depth,
        prof.style === "ornate" || prof.style === "wood",
      ),
    [openW, openH, prof.border, prof.depth, prof.style],
  );
  const lip = useMemo(
    () => (prof.lip ? ringGeometry(openW, openH, 0.022, 0.03, true) : null),
    [openW, openH, prof.lip],
  );
  const outer = useMemo(
    () =>
      prof.steps === 3
        ? ringGeometry(
            openW + prof.border * 2,
            openH + prof.border * 2,
            0.03,
            prof.depth * 1.25,
            true,
          )
        : null,
    [openW, openH, prof.border, prof.depth, prof.steps],
  );
  useEffect(
    () => () => {
      main.dispose();
      lip?.dispose();
      outer?.dispose();
    },
    [main, lip, outer],
  );

  if (prof.style === "none") {
    return (
      <mesh position={[0, 0, -prof.depth / 2]}>
        <boxGeometry args={[w + 0.012, h + 0.012, prof.depth]} />
        <meshStandardMaterial
          color={prof.color}
          roughness={prof.roughness}
          metalness={prof.metalness}
        />
      </mesh>
    );
  }
  if (prof.style === "float") {
    const bw = w + prof.gap * 2 + prof.border * 2;
    const bh = h + prof.gap * 2 + prof.border * 2;
    return (
      <mesh position={[0, 0, -prof.depth / 2]} castShadow>
        <boxGeometry args={[bw, bh, prof.depth]} />
        <meshStandardMaterial
          color={prof.color}
          roughness={prof.roughness}
          metalness={prof.metalness}
        />
      </mesh>
    );
  }

  // ornate / wood / silk: beveled moulding (+ optional carved relief)
  const front = 0.055;
  return (
    <group>
      {outer && (
        <mesh
          geometry={outer}
          position={[0, 0, front - prof.depth * 1.25 + 0.002]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial
            color={prof.color}
            metalness={prof.metalness}
            roughness={prof.roughness + 0.08}
          />
        </mesh>
      )}
      <mesh
        geometry={main}
        position={[0, 0, front - prof.depth]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color={prof.color}
          metalness={prof.metalness}
          roughness={prof.roughness}
        />
      </mesh>
      {lip && (
        <mesh geometry={lip} position={[0, 0, front - 0.028]}>
          <meshStandardMaterial
            color={prof.color}
            metalness={Math.min(1, prof.metalness + 0.1)}
            roughness={Math.max(0.2, prof.roughness - 0.12)}
          />
        </mesh>
      )}
      {prof.mat > 0 && (
        <mesh position={[0, 0, front - prof.depth + 0.01]}>
          <planeGeometry args={[openW, openH]} />
          <meshStandardMaterial color={prof.matColor} roughness={0.95} />
        </mesh>
      )}
    </group>
  );
}

// A museum wall label: a small off-white plate with the painting's name in
// clear black, and the year beneath. Drawn unlit so it stays legible in every
// room's light.
function makeLabelTexture(title: string, year: number | null): THREE.CanvasTexture {
  const W = 512;
  const H = 170;
  const PAD = 26;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = "#f3f2ec";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(0,0,0,0.14)";
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, W - 3, H - 3);

  // title — shrink the type until it fits two lines, ellipsise if it still won't
  let fs = 42;
  let lines: string[] = [];
  for (; fs >= 24; fs -= 2) {
    ctx.font = `600 ${fs}px "Cormorant Garamond", Georgia, serif`;
    lines = wrapText(ctx, title, W - PAD * 2);
    if (lines.length <= 2) break;
  }
  if (lines.length > 2) {
    lines = lines.slice(0, 2);
    let last = lines[1];
    while (ctx.measureText(`${last}…`).width > W - PAD * 2 && last.length > 1) {
      last = last.slice(0, -1);
    }
    lines[1] = `${last.trimEnd()}…`;
  }
  ctx.fillStyle = "#161616";
  ctx.textBaseline = "alphabetic";
  let y = lines.length === 2 ? 52 : 70;
  for (const ln of lines) {
    ctx.fillText(ln, PAD, y);
    y += fs + 6;
  }

  if (year != null) {
    ctx.fillStyle = "#6b6b64";
    ctx.font = '400 27px "Inter", system-ui, sans-serif';
    ctx.fillText(String(year), PAD, H - 26);
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

// Visual busyness of the loaded image, 0 (sparse/flat) → 1 (dense/detailed),
// from the mean luminance gradient of a small downsample. Same-origin via the
// /api/img proxy, so the canvas isn't tainted and pixels are readable.
function imageComplexity(img: HTMLImageElement): number {
  try {
    const N = 36;
    const cv = document.createElement("canvas");
    cv.width = N;
    cv.height = N;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    if (!ctx) return 0.5;
    ctx.drawImage(img, 0, 0, N, N);
    const d = ctx.getImageData(0, 0, N, N).data;
    const lum = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++)
      lum[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    let sum = 0;
    let cnt = 0;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        if (x < N - 1) {
          sum += Math.abs(lum[i] - lum[i + 1]);
          cnt++;
        }
        if (y < N - 1) {
          sum += Math.abs(lum[i] - lum[i + N]);
          cnt++;
        }
      }
    const edge = sum / Math.max(1, cnt); // mean |gradient| of 0..255 luminance
    return Math.max(0, Math.min(1, (edge - 5) / 17));
  } catch {
    return 0.5;
  }
}

function PaintingFrame({
  hang,
  museum,
  accent,
  label,
  year,
  onInspect,
}: {
  hang: Hang;
  museum: Museum;
  accent: string;
  label: string;
  year: number | null;
  onInspect: (p: Painting) => void;
}) {
  const tex = useTexture(wallTextureUrl(hang.p));
  const light = museum.pictureLight;
  const lightRef = useRef<THREE.SpotLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);
  const [labelTex, setLabelTex] = useState<THREE.CanvasTexture | null>(null);

  const prof = useMemo(() => {
    const complexity =
      museum.frameApproach === "contrast"
        ? imageComplexity(tex.image as HTMLImageElement)
        : 0.5;
    return frameProfile(museum, accent, complexity);
  }, [museum, accent, tex]);

  useEffect(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
  }, [tex]);

  useEffect(() => {
    let cancelled = false;
    const build = () => {
      if (cancelled) return;
      setLabelTex((old) => {
        old?.dispose();
        return makeLabelTexture(label, year);
      });
    };
    build();
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(build);
    }
    return () => {
      cancelled = true;
    };
  }, [label, year]);

  useEffect(() => {
    if (lightRef.current && targetRef.current) {
      lightRef.current.target = targetRef.current;
      lightRef.current.target.updateMatrixWorld();
    }
  });

  const img = tex.image as HTMLImageElement | undefined;
  const aspect =
    img && img.width && img.height
      ? img.width / img.height
      : hang.p.width && hang.p.height
        ? hang.p.width / hang.p.height
        : 1.3;

  // Real-world scale (dimensions are stored in centimetres → metres), gently
  // clamped so the tiniest sketches stay visible and the largest canvases don't
  // crowd or clip the wall — relative sizes are preserved in between.
  let w: number;
  let h: number;
  let yOffset = 0;
  if (hang.p.width && hang.p.height) {
    const rw = hang.p.width / 100;
    const rh = hang.p.height / 100;
    const longest = Math.max(rw, rh);
    const k = Math.min(Math.max(longest, 0.45), 3.3) / longest;
    w = rw * k;
    h = rh * k;
    // lift tall canvases so their bottom rests just above the floor
    yOffset = Math.max(0, h / 2 + 0.25 - EYE);
  } else {
    const maxH = 1.9;
    const maxW = 2.7;
    h = maxH;
    w = h * aspect;
    if (w > maxW) {
      w = maxW;
      h = w / aspect;
    }
  }
  // Smaller paintings get a wider, deeper frame — more moulding to catch the
  // picture light and give an easily-overlooked work its presence on the wall.
  const size = Math.max(w, h);
  const sizeFactor = Math.min(Math.max(1.3 / size, 0.8), 1.9);
  const fprof: FrameProfile =
    sizeFactor === 1
      ? prof
      : {
          ...prof,
          border: prof.border * sizeFactor,
          depth: prof.depth * (1 + (sizeFactor - 1) * 0.45),
        };
  const fh = h + (fprof.mat + fprof.border) * 2;

  return (
    <group
      position={[hang.position[0], hang.position[1] + yOffset, hang.position[2]]}
      rotation={hang.rotation}
    >
      <Moulding w={w} h={h} prof={fprof} />
      {/* canvas */}
      <mesh
        position={[0, 0, 0.045]}
        castShadow
        onClick={(e) => {
          e.stopPropagation();
          onInspect(hang.p);
        }}
        onPointerOver={() => (document.body.style.cursor = "pointer")}
        onPointerOut={() => (document.body.style.cursor = "")}
      >
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={tex} roughness={0.62} metalness={0} />
      </mesh>
      {/* name plate — to the right, its bottom aligned with the painting's */}
      {labelTex &&
        (() => {
          const plateW = 0.5;
          const plateH = (plateW * 170) / 512;
          const x = w / 2 + fprof.mat + fprof.border + 0.1 + plateW / 2;
          const y = -h / 2 + plateH / 2;
          return (
            <mesh position={[x, y, 0.02]}>
              <planeGeometry args={[plateW, plateH]} />
              <meshBasicMaterial map={labelTex} toneMapped={false} />
            </mesh>
          );
        })()}
      {/* picture light */}
      {light.show && (
        <>
          <spotLight
            ref={lightRef}
            position={[0, fh / 2 + 0.85, 1.7]}
            angle={light.angle}
            penumbra={0.85}
            distance={10}
            intensity={light.intensity}
            color={light.color}
          />
          <object3D ref={targetRef} position={[0, 0, 0.1]} />
        </>
      )}
    </group>
  );
}

function useRoomTextures(museum: Museum, depth: number) {
  const textures = useMemo(() => {
    const ry = Math.max(4, Math.round(depth / 2.2));
    const rx = Math.max(3, Math.round(museum.roomWidth / 2.2));
    const floor =
      museum.floor === "parquet"
        ? makeWood(museum.floorColor, { planks: 5, repeat: [rx, ry] })
        : museum.floor === "plank"
          ? makeWood(museum.floorColor, { planks: 6, repeat: [rx, ry] })
          : museum.floor === "concrete"
            ? makeConcrete(museum.floorColor, [rx, ry])
            : museum.floor === "stone"
              ? makeStone(museum.floorColor, [rx, ry])
              : null;
    const wall =
      museum.wallKind === "timber"
        ? makeWood(museum.wall, { planks: 5, vertical: true, repeat: [6, 3] })
        : museum.wallKind === "stone"
          ? makeStone(museum.wall, [3, 2])
          : museum.wallKind === "concrete"
            ? makeConcrete(museum.wall, [2, 2])
            : null;
    return { floor, wall };
  }, [museum, depth]);

  useEffect(
    () => () => {
      textures.floor?.dispose();
      textures.wall?.dispose();
    },
    [textures],
  );
  return textures;
}

function Ceiling({ museum, depth }: { museum: Museum; depth: number }) {
  const { roomWidth: W, wallHeight: H, ceiling, ceilingKind } = museum;
  const skyMat = useRef<THREE.MeshBasicMaterial>(null);
  const clereMats = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const scratch = useRef(new THREE.Color());

  // skylights drift with the daylight state (warmer + dimmer toward dusk)
  useFrame(() => {
    if (!skyMat.current && clereMats.current.length === 0) return;
    skyColor(scratch.current);
    const lv = daylight.level;
    if (skyMat.current) {
      skyMat.current.color.copy(scratch.current).multiplyScalar(lv);
    }
    for (const m of clereMats.current) {
      if (m) m.color.copy(scratch.current).multiplyScalar(lv);
    }
  });

  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, H, 0]}>
        <planeGeometry args={[W, depth]} />
        <meshStandardMaterial color={ceiling} roughness={1} side={THREE.DoubleSide} />
      </mesh>

      {ceilingKind === "vault" && (
        <group>
          {/* glass-roof skylight ridge — a warm daylight strip down the nave */}
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, H - 0.02, 0]}>
            <planeGeometry args={[W * 0.26, depth - 1]} />
            <meshBasicMaterial ref={skyMat} color="#fff3da" toneMapped={false} />
          </mesh>
          {/* vault ribs across the nave */}
          {Array.from({ length: Math.max(3, Math.round(depth / 3.5)) }).map(
            (_, i, arr) => {
              const z = -depth / 2 + (depth / (arr.length + 1)) * (i + 1);
              return (
                <mesh key={i} position={[0, H - 0.12, z]}>
                  <boxGeometry args={[W, 0.22, 0.18]} />
                  <meshStandardMaterial color="#b3a487" roughness={0.9} />
                </mesh>
              );
            },
          )}
        </group>
      )}

      {ceilingKind === "clerestory" && (
        <>
          {[-1, 1].map((s, idx) => (
            <mesh
              key={s}
              position={[s * (W / 2 - 0.05), H - 0.5, 0]}
              rotation={[0, -s * (Math.PI / 2), 0]}
            >
              <planeGeometry args={[depth - 1, 0.7]} />
              <meshBasicMaterial
                ref={(m) => {
                  clereMats.current[idx] = m;
                }}
                color="#fbf4e6"
                toneMapped={false}
              />
            </mesh>
          ))}
        </>
      )}

      {ceilingKind === "beam" &&
        Array.from({ length: Math.max(3, Math.round(depth / 2.6)) }).map(
          (_, i, arr) => {
            const z = -depth / 2 + (depth / (arr.length + 1)) * (i + 1);
            return (
              <mesh key={i} position={[0, H - 0.14, z]}>
                <boxGeometry args={[W, 0.2, 0.16]} />
                <meshStandardMaterial color="#120e09" roughness={1} />
              </mesh>
            );
          },
        )}

      {ceilingKind === "industrial" && (
        <group>
          {/* a boxed HVAC duct running down the hall */}
          <mesh position={[-W * 0.16, H - 0.34, 0]}>
            <boxGeometry args={[0.55, 0.42, depth - 1.2]} />
            <meshStandardMaterial color="#c9cbce" metalness={0.45} roughness={0.5} />
          </mesh>
          {/* service pipes of varied gauge */}
          {[-W * 0.34, -W * 0.04, W * 0.16, W * 0.33].map((x, i) => (
            <mesh
              key={i}
              position={[x, H - 0.16 - (i % 2) * 0.06, 0]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <cylinderGeometry
                args={[
                  0.045 + (i % 3) * 0.018,
                  0.045 + (i % 3) * 0.018,
                  depth - 0.6,
                  10,
                ]}
              />
              <meshStandardMaterial
                color={i % 2 ? "#dadbdc" : "#9b9da0"}
                metalness={0.5}
                roughness={0.5}
              />
            </mesh>
          ))}
          {/* black track-light rails with spot fixtures */}
          {[-W * 0.27, W * 0.27].map((x, r) => (
            <group key={r}>
              <mesh position={[x, H - 0.12, 0]}>
                <boxGeometry args={[0.06, 0.09, depth - 1]} />
                <meshStandardMaterial
                  color="#2a2b2d"
                  metalness={0.3}
                  roughness={0.6}
                />
              </mesh>
              {Array.from({ length: Math.max(3, Math.round(depth / 3)) }).map(
                (_, i, arr) => {
                  const z = -depth / 2 + (depth / (arr.length + 1)) * (i + 1);
                  return (
                    <mesh
                      key={i}
                      position={[x, H - 0.24, z]}
                      rotation={[0.5 * (x < 0 ? -1 : 1), 0, 0]}
                    >
                      <cylinderGeometry args={[0.05, 0.065, 0.18, 10]} />
                      <meshStandardMaterial
                        color="#1b1c1e"
                        metalness={0.4}
                        roughness={0.5}
                      />
                    </mesh>
                  );
                },
              )}
            </group>
          ))}
        </group>
      )}
    </group>
  );
}

// A white wall pierced by a rounded arch that opens onto a brighter adjoining
// room — the signature of the converted-factory white cube.
function PortalWall({
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
  const geo = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-W / 2, -H / 2);
    shape.lineTo(W / 2, -H / 2);
    shape.lineTo(W / 2, H / 2);
    shape.lineTo(-W / 2, H / 2);
    shape.closePath();
    const aw = 2.7;
    const ah = 3.4;
    const r = aw / 2;
    const base = -H / 2;
    const hole = new THREE.Path();
    hole.moveTo(-aw / 2, base);
    hole.lineTo(-aw / 2, base + ah - r);
    hole.absarc(0, base + ah - r, r, Math.PI, 0, true);
    hole.lineTo(aw / 2, base);
    hole.closePath();
    shape.holes.push(hole);
    return new THREE.ShapeGeometry(shape);
  }, [W, H]);
  useEffect(() => () => geo.dispose(), [geo]);

  return (
    <group>
      <mesh geometry={geo} position={[0, H / 2, -depth / 2]} receiveShadow>
        <meshStandardMaterial color={color} roughness={0.97} />
      </mesh>
      {/* the brighter room glimpsed through the arch */}
      <mesh position={[0, H / 2, -depth / 2 - 1.7]}>
        <planeGeometry args={[5, H]} />
        <meshStandardMaterial color="#e6e7e8" roughness={1} />
      </mesh>
      <mesh
        position={[1.6, H / 2, -depth / 2 - 0.9]}
        rotation={[0, -Math.PI / 2, 0]}
      >
        <planeGeometry args={[1.7, H]} />
        <meshStandardMaterial color="#d7d8d9" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -depth / 2 - 0.9]}>
        <planeGeometry args={[3.2, 1.7]} />
        <meshStandardMaterial color="#5a5c5f" roughness={0.7} metalness={0.2} />
      </mesh>
      <pointLight
        position={[0, H * 0.6, -depth / 2 - 0.8]}
        intensity={6}
        distance={9}
        decay={2}
        color="#fbfbfa"
      />
    </group>
  );
}

// Low benches down the middle of the hall — scale, and a place for the eye to
// rest. Tone follows the room so they belong.
function Benches({
  depth,
  wood,
}: {
  depth: number;
  wood: boolean;
}) {
  const zs = depth > 22 ? [depth * 0.16, -depth * 0.16] : [0];
  const top = wood ? "#6b4a2d" : "#26272a";
  return (
    <group>
      {zs.map((z, i) => (
        <group key={i} position={[0, 0, z]}>
          <mesh position={[0, 0.46, 0]} castShadow>
            <boxGeometry args={[1.5, 0.12, 0.6]} />
            <meshStandardMaterial color={top} roughness={0.5} metalness={wood ? 0 : 0.3} />
          </mesh>
          {[-0.62, 0.62].map((x) => (
            <mesh key={x} position={[x, 0.22, 0]}>
              <boxGeometry args={[0.1, 0.44, 0.5]} />
              <meshStandardMaterial color="#1a1a1c" roughness={0.6} metalness={0.4} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function Room({ museum, depth }: { museum: Museum; depth: number }) {
  const { roomWidth: W, wallHeight: H, wall, wallRoughness } = museum;
  const { floor: floorTex, wall: wallTex } = useRoomTextures(museum, depth);

  const wallMat = (
    <meshStandardMaterial
      color={wall}
      map={wallTex ?? undefined}
      roughness={wallRoughness}
    />
  );

  return (
    <group>
      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[W, depth]} />
        {museum.floor === "reflector" || museum.floor === "concrete" ? (
          // a dark mirror floor — the map barely shows here, and dropping it
          // keeps the sampler count safely under the GPU's texture-unit limit.
          <MeshReflectorMaterial
            resolution={1024}
            blur={museum.floor === "concrete" ? [320, 110] : [400, 120]}
            mixBlur={museum.floor === "concrete" ? 1.5 : 1.1}
            mixStrength={museum.floor === "concrete" ? 1.5 : 2.4}
            mixContrast={1}
            roughness={museum.floor === "concrete" ? 0.5 : 0.82}
            depthScale={1.1}
            minDepthThreshold={0.4}
            maxDepthThreshold={1.3}
            color={museum.floorColor}
            metalness={museum.floor === "concrete" ? 0.45 : 0.55}
          />
        ) : (
          <meshStandardMaterial
            map={floorTex ?? undefined}
            color={museum.floorColor}
            roughness={museum.floor === "parquet" ? 0.58 : 0.85}
            metalness={museum.floor === "parquet" ? 0.12 : 0.05}
          />
        )}
      </mesh>

      <Ceiling museum={museum} depth={depth} />

      {/* left wall */}
      <mesh
        receiveShadow
        position={[-W / 2, H / 2, 0]}
        rotation={[0, Math.PI / 2, 0]}
      >
        <planeGeometry args={[depth, H]} />
        {wallMat}
      </mesh>
      {/* right wall */}
      <mesh
        receiveShadow
        position={[W / 2, H / 2, 0]}
        rotation={[0, -Math.PI / 2, 0]}
      >
        <planeGeometry args={[depth, H]} />
        {wallMat}
      </mesh>
      {/* far wall (pierced by an arched portal in the white-cube) */}
      {museum.portal ? (
        <PortalWall W={W} H={H} depth={depth} color={wall} />
      ) : (
        <mesh receiveShadow position={[0, H / 2, -depth / 2]}>
          <planeGeometry args={[W, H]} />
          {wallMat}
        </mesh>
      )}
      {/* near wall */}
      <mesh receiveShadow position={[0, H / 2, depth / 2]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[W, H]} />
        {wallMat}
      </mesh>

      {/* baseboard for the lighter rooms grounds the walls */}
      {(museum.wallKind === "stone" || museum.wallKind === "timber") && (
        <>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * (W / 2 - 0.02), 0.09, 0]}>
              <boxGeometry args={[0.06, 0.18, depth]} />
              <meshStandardMaterial color="#3a2f22" roughness={0.8} />
            </mesh>
          ))}
        </>
      )}

      {/* Nezu: glowing washi screens on the far wall */}
      {museum.shoji && (
        <group position={[0, H * 0.5, -depth / 2 + 0.05]}>
          {[-1, 0, 1].map((i) => (
            <group key={i} position={[i * (W / 3.2), 0, 0]}>
              <mesh>
                <planeGeometry args={[W / 3.6, H * 0.74]} />
                <meshBasicMaterial color="#f3e4c4" toneMapped={false} />
              </mesh>
              {/* lattice */}
              {[-0.66, -0.33, 0, 0.33, 0.66].map((u) => (
                <mesh key={u} position={[u * (W / 3.6), 0, 0.01]}>
                  <boxGeometry args={[0.03, H * 0.74, 0.02]} />
                  <meshBasicMaterial color="#2a2118" toneMapped={false} />
                </mesh>
              ))}
              {[-0.4, -0.13, 0.13, 0.4].map((v) => (
                <mesh key={v} position={[0, v * H * 0.74, 0.01]}>
                  <boxGeometry args={[W / 3.6, 0.03, 0.02]} />
                  <meshBasicMaterial color="#2a2118" toneMapped={false} />
                </mesh>
              ))}
            </group>
          ))}
        </group>
      )}

      <Benches
        depth={depth}
        wood={museum.wallKind === "timber" || museum.floor === "parquet"}
      />
    </group>
  );
}

function Player({
  depth,
  roomWidth,
  enabled,
  onStep,
  move,
}: {
  depth: number;
  roomWidth: number;
  enabled: React.RefObject<boolean>;
  onStep?: () => void;
  move?: React.RefObject<{ x: number; y: number }>;
}) {
  const { camera } = useThree();
  const keys = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const map: Record<string, string> = {
      KeyW: "f",
      ArrowUp: "f",
      KeyS: "b",
      ArrowDown: "b",
      KeyA: "l",
      ArrowLeft: "l",
      KeyD: "r",
      ArrowRight: "r",
    };
    const down = (e: KeyboardEvent) => {
      const k = map[e.code];
      if (k) keys.current[k] = true;
    };
    const up = (e: KeyboardEvent) => {
      const k = map[e.code];
      if (k) keys.current[k] = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const front = useRef(new THREE.Vector3());
  const side = useRef(new THREE.Vector3());
  const dir = useRef(new THREE.Vector3());
  const stepAccum = useRef(0);

  useFrame((_, dt) => {
    if (!enabled.current) return;
    const speed = 3.4;
    camera.getWorldDirection(front.current);
    front.current.y = 0;
    front.current.normalize();
    side.current.crossVectors(front.current, camera.up).normalize();
    dir.current.set(0, 0, 0);
    if (keys.current.f) dir.current.add(front.current);
    if (keys.current.b) dir.current.sub(front.current);
    if (keys.current.r) dir.current.add(side.current);
    if (keys.current.l) dir.current.sub(side.current);
    // touch joystick (analog): y = forward, x = strafe
    if (move?.current && (move.current.x || move.current.y)) {
      dir.current.addScaledVector(front.current, move.current.y);
      dir.current.addScaledVector(side.current, move.current.x);
    }
    let len = dir.current.length();
    if (len > 0) {
      if (len > 1) {
        dir.current.divideScalar(len);
        len = 1;
      }
      const moved = speed * len * Math.min(dt, 0.05);
      camera.position.addScaledVector(dir.current, moved);
      stepAccum.current += moved;
      if (stepAccum.current > 1.7) {
        stepAccum.current = 0;
        onStep?.();
      }
    }
    const hx = roomWidth / 2 - 0.7;
    const hz = depth / 2 - 0.7;
    camera.position.x = Math.max(-hx, Math.min(hx, camera.position.x));
    camera.position.z = Math.max(-hz, Math.min(hz, camera.position.z));
    camera.position.y = EYE;
  });

  return null;
}

// Feeds the soundscape where you're looking and how deep you stand — always on
// (including during the entry), so the entrance crowd muffles as you turn in.
function Spatial({
  depth,
  onFacing,
  onDepth,
}: {
  depth: number;
  onFacing: (f: number) => void;
  onDepth: (d: number) => void;
}) {
  const { camera } = useThree();
  const fwd = useRef(new THREE.Vector3());
  const acc = useRef(0);
  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current < 0.15) return;
    acc.current = 0;
    camera.getWorldDirection(fwd.current);
    onFacing(Math.max(0, Math.min(1, (-fwd.current.z + 1) / 2)));
    onDepth(Math.max(0, Math.min(1, (depth / 2 - camera.position.z) / depth)));
  });
  return null;
}

function Controls({
  didDrag,
  enabled,
}: {
  didDrag: React.RefObject<boolean>;
  enabled: React.RefObject<boolean>;
}) {
  const { camera, gl } = useThree();
  const dragging = useRef(false);
  const pointerId = useRef<number | null>(null);
  const last = useRef({ x: 0, y: 0 });
  const yaw = useRef(0);
  const pitch = useRef(0);

  useEffect(() => {
    camera.rotation.order = "YXZ";
    yaw.current = camera.rotation.y;
    pitch.current = camera.rotation.x;
    const el = gl.domElement;
    el.style.touchAction = "none";

    const down = (e: PointerEvent) => {
      if (!enabled.current || dragging.current) return;
      dragging.current = true;
      pointerId.current = e.pointerId; // only this finger drives the look
      didDrag.current = false;
      // re-sync from the live camera (the intro may have rotated it)
      yaw.current = camera.rotation.y;
      pitch.current = camera.rotation.x;
      last.current = { x: e.clientX, y: e.clientY };
    };
    const move = (e: PointerEvent) => {
      if (
        !enabled.current ||
        !dragging.current ||
        e.pointerId !== pointerId.current
      )
        return;
      const dx = e.clientX - last.current.x;
      const dy = e.clientY - last.current.y;
      last.current = { x: e.clientX, y: e.clientY };
      if (Math.abs(dx) + Math.abs(dy) > 2) didDrag.current = true;
      yaw.current -= dx * 0.0026;
      pitch.current = Math.max(
        -1.2,
        Math.min(1.2, pitch.current - dy * 0.0026),
      );
      camera.rotation.y = yaw.current;
      camera.rotation.x = pitch.current;
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId === pointerId.current) {
        dragging.current = false;
        pointerId.current = null;
      }
    };

    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [camera, gl, didDrag, enabled]);

  return null;
}

type CamKey = { p: [number, number, number]; yaw: number; fov: number };

// The entry is one continuous move: you begin framed on the artist's wall
// presentation (the card, become a fresco), the room fades up *around* it, the
// camera steps back to take in the panel and the first painting, then turns to
// reveal the whole hall. Each museum layers its own light on top — a dim read,
// a bright daylight wash, or a slow warm paper-screen fade.
function IntroCamera({
  museum,
  depth,
  descZ,
  active,
  onTurning,
  onDone,
}: {
  museum: Museum;
  depth: number;
  descZ: number;
  active: boolean;
  onTurning: () => void;
  onDone: () => void;
}) {
  const { camera } = useThree();
  const start = useRef<number | null>(null);
  const turned = useRef(false);
  const done = useRef(false);

  const keys = useMemo(() => {
    const W = museum.roomWidth;
    const clampX = (x: number) =>
      Math.max(-(W / 2 - 0.7), Math.min(W / 2 - 0.7, x));
    const K0: CamKey = { p: [clampX(-W / 2 + 2.8), EYE, descZ], yaw: Math.PI / 2, fov: 46 };
    const K1: CamKey = { p: [clampX(-W / 2 + 5.0), EYE, descZ - 0.9], yaw: 1.0, fov: 56 };
    const K2: CamKey = { p: [0, EYE, depth / 2 - 1.6], yaw: 0, fov: 62 };
    return { K0, K1, K2 };
  }, [museum.roomWidth, depth, descZ]);

  const setLights = (state: { scene: THREE.Scene }, factor: number) => {
    state.scene.traverse((o) => {
      const L = o as unknown as THREE.Light & { isLight?: boolean };
      if (L.isLight) {
        if (L.userData.base === undefined) L.userData.base = L.intensity;
        L.intensity = (L.userData.base as number) * factor;
      }
    });
  };

  const ease = (x: number) => {
    const c = Math.max(0, Math.min(1, x));
    return c * c * (3 - 2 * c);
  };

  const A = 0.9; // hold framed on the presentation
  const B = 1.5; // step back to reveal panel + first painting
  const C = 1.5; // turn to the full gallery
  const TOTAL = A + B + C;

  useFrame((state) => {
    if (!active || done.current) return;
    const gl = state.gl as THREE.WebGLRenderer;
    const cam = camera as THREE.PerspectiveCamera;
    if (start.current === null) {
      start.current = state.clock.elapsedTime;
      camera.rotation.order = "YXZ";
    }
    const e = state.clock.elapsedTime - start.current;
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    const place = (a: CamKey, b: CamKey, t: number) => {
      cam.position.set(lerp(a.p[0], b.p[0], t), EYE, lerp(a.p[2], b.p[2], t));
      camera.rotation.y = lerp(a.yaw, b.yaw, t);
      camera.rotation.x = 0;
      const fov = lerp(a.fov, b.fov, t);
      if (Math.abs(cam.fov - fov) > 0.01) {
        cam.fov = fov;
        cam.updateProjectionMatrix();
      }
    };

    // lighting + exposure, smoothly over the whole move
    const litStart =
      museum.intro === "shoji" ? 0.06 : museum.intro === "daylight" ? 1 : 0.36;
    setLights(state, litStart + (1 - litStart) * ease(e / TOTAL));
    if (museum.intro === "daylight") {
      gl.toneMappingExposure =
        museum.exposure * (1.7 - 0.7 * ease(e / (TOTAL * 0.7)));
    } else if (museum.intro === "shoji") {
      gl.toneMappingExposure = museum.exposure * (0.72 + 0.28 * ease(e / TOTAL));
    }

    const finish = () => {
      done.current = true;
      place(keys.K2, keys.K2, 0);
      setLights(state, 1);
      gl.toneMappingExposure = museum.exposure;
      onDone();
    };

    if (e < A) {
      place(keys.K0, keys.K0, 0);
    } else if (e < A + B) {
      place(keys.K0, keys.K1, ease((e - A) / B));
    } else if (e < TOTAL) {
      if (!turned.current) {
        turned.current = true;
        onTurning();
      }
      place(keys.K1, keys.K2, ease((e - A - B) / C));
    } else {
      finish();
    }
  });

  return null;
}

// Eye-like focus: keep whatever sits at screen-centre sharp and let the depth-
// of-field blur everything nearer/farther (and, with it, the periphery).
function EyeFocus({
  dofRef,
}: {
  dofRef: React.RefObject<{ target: THREE.Vector3 } | null>;
}) {
  const { camera, scene } = useThree();
  const ray = useRef(new THREE.Raycaster());
  const dir = useRef(new THREE.Vector3());
  const fp = useRef(new THREE.Vector3(0, EYE, 0));
  const tp = useRef(new THREE.Vector3());
  const center = useRef(new THREE.Vector2(0, 0));
  useFrame(() => {
    const dof = dofRef.current;
    if (!dof) return;
    ray.current.setFromCamera(center.current, camera);
    const hit = ray.current
      .intersectObjects(scene.children, true)
      .find((h) => h.distance > 0.3);
    if (hit) {
      tp.current.copy(hit.point);
    } else {
      camera.getWorldDirection(dir.current);
      tp.current.copy(camera.position).addScaledVector(dir.current, 6);
    }
    fp.current.lerp(tp.current, 0.4);
    dof.target = fp.current;
  });
  return null;
}

function FallbackFrame({ hang, accent }: { hang: Hang; accent: string }) {
  return (
    <group position={hang.position} rotation={hang.rotation}>
      <mesh position={[0, 0, -0.05]} castShadow receiveShadow>
        <boxGeometry args={[2, 1.6, 0.1]} />
        <meshStandardMaterial color={accent} metalness={0.4} roughness={0.42} />
      </mesh>
      <mesh position={[0, 0, 0.01]}>
        <planeGeometry args={[1.84, 1.44]} />
        <meshStandardMaterial color="#0e0c0a" roughness={1} />
      </mesh>
    </group>
  );
}

class TexBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {}
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
): string[] {
  const parts = text.split(/(\s+)/);
  const lines: string[] = [];
  let line = "";
  for (const part of parts) {
    const test = line + part;
    if (ctx.measureText(test).width > maxW && line.trim()) {
      lines.push(line.trimEnd());
      line = part.replace(/^\s+/, "");
    } else {
      line = test;
    }
    // break runs with no spaces (e.g. CJK) by character
    while (ctx.measureText(line).width > maxW && line.length > 1) {
      let bp = line.length;
      while (bp > 1 && ctx.measureText(line.slice(0, bp)).width > maxW) bp--;
      lines.push(line.slice(0, bp));
      line = line.slice(bp);
    }
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines;
}

function makeDescriptionTexture(
  d: {
    name: string;
    dates: string | null;
    sub: string;
    bio: string | null;
    keyHeader: string;
    keyDates: { year: number; label: string }[];
    accent: string;
  },
  palette: DescPalette,
  dim: { W: number; H: number } = { W: 840, H: 1180 },
): THREE.CanvasTexture {
  const W = dim.W;
  const H = dim.H;
  const PAD = 64;
  const maxW = W - PAD * 2;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d")!;
  const rule = palette.rule === "accent" ? d.accent : palette.ink;

  ctx.fillStyle = palette.panel;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = d.accent;
  ctx.fillRect(0, 0, W, 9);
  ctx.strokeStyle = palette.faint;
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 2;
  ctx.strokeRect(9, 9, W - 18, H - 18);
  ctx.globalAlpha = 1;

  let y = 134;
  ctx.fillStyle = palette.ink;
  ctx.font = '600 64px "Cormorant Garamond", Georgia, serif';
  for (const ln of wrapText(ctx, d.name, maxW)) {
    ctx.fillText(ln, PAD, y);
    y += 70;
  }
  y += 6;

  if (d.dates) {
    ctx.fillStyle = d.accent;
    ctx.font = '34px "Cormorant Garamond", Georgia, serif';
    ctx.fillText(d.dates, PAD, y);
    y += 46;
  }
  if (d.sub) {
    ctx.fillStyle = palette.sub;
    ctx.font = '20px "Inter", system-ui, sans-serif';
    ctx.letterSpacing = "3px";
    ctx.fillText(d.sub.toUpperCase(), PAD, y);
    ctx.letterSpacing = "0px";
    y += 38;
  }

  y += 16;
  ctx.strokeStyle = rule;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(PAD + 230, y);
  ctx.stroke();
  ctx.globalAlpha = 1;
  y += 44;

  if (d.bio) {
    ctx.fillStyle = palette.body;
    ctx.font = '27px "Inter", system-ui, sans-serif';
    for (const ln of wrapText(ctx, d.bio, maxW).slice(0, 11)) {
      ctx.fillText(ln, PAD, y);
      y += 39;
    }
  }

  y += 36;
  ctx.fillStyle = d.accent;
  ctx.font = '22px "Inter", system-ui, sans-serif';
  ctx.letterSpacing = "3px";
  ctx.fillText(d.keyHeader.toUpperCase(), PAD, y);
  ctx.letterSpacing = "0px";
  y += 20;
  for (const kd of d.keyDates) {
    y += 47;
    if (y > H - 46) break;
    ctx.fillStyle = d.accent;
    ctx.beginPath();
    ctx.arc(PAD + 6, y - 9, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = palette.faint;
    ctx.font = '600 25px "Cormorant Garamond", Georgia, serif';
    ctx.fillText(String(kd.year), PAD + 30, y);
    ctx.fillStyle = palette.body;
    ctx.font = '25px "Inter", system-ui, sans-serif';
    let label = kd.label;
    while (ctx.measureText(label).width > maxW - 130 && label.length > 4) {
      label = label.slice(0, -2);
    }
    if (label !== kd.label) label = `${label.trimEnd()}…`;
    ctx.fillText(label, PAD + 130, y);
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

// The artist description, presented to suit the museum: a full-height fresco on
// the entrance wall (default/Orsay), a small framed wall label (Chiba/HongKun),
// or a hanging scroll (Nezu).
function DescriptionWall({
  museum,
  artist,
  period,
  keyDates,
  accent,
  z,
}: {
  museum: Museum;
  artist: Artist;
  period: Period | null;
  keyDates: { year: number; label: string }[];
  accent: string;
  z: number;
}) {
  const t = useT();
  const { locale } = useLocale();
  const [tex, setTex] = useState<THREE.CanvasTexture | null>(null);
  const mount = museum.descMount;
  const dim = mount === "scroll" ? { W: 720, H: 1320 } : { W: 840, H: 1180 };

  useEffect(() => {
    let cancelled = false;
    const name =
      localized(locale, artist.i18n, "name", artist.name) ?? artist.name;
    const dates =
      artist.birthYear != null || artist.deathYear != null
        ? `${artist.birthYear ?? "?"} – ${artist.deathYear ?? "?"}`
        : null;
    const sub = [
      localized(locale, artist.i18n, "nationality", artist.nationality),
      period ? periodName(locale, period.name) : null,
    ]
      .filter(Boolean)
      .join(" · ");
    const bio = localized(locale, artist.i18n, "bio", artist.bio);
    const build = () => {
      if (cancelled) return;
      setTex((old) => {
        old?.dispose();
        return makeDescriptionTexture(
          { name, dates, sub, bio, keyHeader: t("keyDates"), keyDates, accent },
          museum.desc,
          dim,
        );
      });
    };
    build();
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(build);
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, artist, period, keyDates, accent, museum]);

  if (!tex) return null;
  const W = museum.roomWidth;
  const H = museum.wallHeight;
  const x = -W / 2 + 0.06;
  const ratio = dim.W / dim.H;

  if (mount === "placard") {
    const PH = 1.55;
    const PW = PH * ratio;
    return (
      <group position={[x, EYE, z]} rotation={[0, Math.PI / 2, 0]}>
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[PW + 0.1, PH + 0.1]} />
          <meshStandardMaterial color={museum.desc.faint} roughness={0.8} />
        </mesh>
        <mesh>
          <planeGeometry args={[PW, PH]} />
          <meshBasicMaterial map={tex} toneMapped={false} />
        </mesh>
      </group>
    );
  }

  if (mount === "scroll") {
    const PH = H - 1.1;
    const PW = PH * ratio;
    return (
      <group position={[x, H * 0.52, z]} rotation={[0, Math.PI / 2, 0]}>
        <mesh>
          <planeGeometry args={[PW, PH]} />
          <meshBasicMaterial map={tex} toneMapped={false} />
        </mesh>
        {[1, -1].map((s) => (
          <mesh
            key={s}
            position={[0, (s * (PH + 0.16)) / 2, 0.02]}
            rotation={[0, 0, Math.PI / 2]}
          >
            <cylinderGeometry args={[0.055, 0.055, PW + 0.34, 12]} />
            <meshStandardMaterial color="#241a10" roughness={0.6} metalness={0.1} />
          </mesh>
        ))}
      </group>
    );
  }

  // wall: full-height fresco
  const PH = H - 0.5;
  const PW = PH * ratio;
  return (
    <mesh position={[x, H / 2, z]} rotation={[0, Math.PI / 2, 0]}>
      <planeGeometry args={[PW, PH]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  );
}

// ── Walkable influence doorways ───────────────────────────────────────────
// The far wall opens onto the galleries of artists this one shaped or was
// shaped by — a rounded arch, a glowing passage, the kindred artist's portrait
// medallion and name. Walk up and step through (click/tap) to travel there.

// Trace a rounded-top arch outline (width w, total height h, base at baseY).
function archOutline(
  target: THREE.Shape | THREE.Path,
  w: number,
  h: number,
  baseY: number,
) {
  const r = w / 2;
  target.moveTo(-w / 2, baseY);
  target.lineTo(-w / 2, baseY + h - r);
  target.absarc(0, baseY + h - r, r, Math.PI, 0, true);
  target.lineTo(w / 2, baseY);
  target.lineTo(-w / 2, baseY);
}

function makeArchRing(
  w: number,
  h: number,
  border: number,
  depth: number,
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  archOutline(shape, w, h, 0);
  const hole = new THREE.Path();
  archOutline(hole, w - border * 2, h - border * 2, border);
  shape.holes.push(hole);
  const bevelT = Math.min(border * 0.4, depth * 0.55);
  return new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.02, depth - bevelT),
    bevelEnabled: true,
    bevelThickness: bevelT,
    bevelSize: border * 0.34,
    bevelSegments: 2,
    steps: 1,
  });
}

function portraitTextureUrl(url: string): string {
  const at = /width=\d+/.test(url)
    ? url.replace(/width=\d+/, "width=360")
    : `${url}${url.includes("?") ? "&" : "?"}width=360`;
  return `/api/img?u=${encodeURIComponent(at)}`;
}

// A dark nameplate for the passage: the relation (tag) over the artist's name.
function makeDoorSign(name: string, tag: string, accent: string): THREE.CanvasTexture {
  const W = 512;
  const H = 224;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = accent;
  ctx.font = '600 26px "Inter", system-ui, sans-serif';
  ctx.textAlign = "center";
  ctx.letterSpacing = "5px";
  ctx.fillText(tag.toUpperCase(), W / 2, 44);
  ctx.letterSpacing = "0px";

  let fs = 58;
  ctx.fillStyle = "#f3efe6";
  let lines: string[] = [];
  for (; fs >= 30; fs -= 3) {
    ctx.font = `600 ${fs}px "Cormorant Garamond", Georgia, serif`;
    lines = wrapText(ctx, name, W - 44);
    if (lines.length <= 2) break;
  }
  if (lines.length > 2) lines = lines.slice(0, 2);
  let y = lines.length === 2 ? 108 : 132;
  for (const ln of lines) {
    ctx.fillText(ln, W / 2, y);
    y += fs + 4;
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

// A plain glowing disc — stands in for a portrait that's missing or won't load.
function MedallionDisc({ r, y, accent }: { r: number; y: number; accent: string }) {
  return (
    <mesh position={[0, y, 0.045]}>
      <circleGeometry args={[r, 48]} />
      <meshStandardMaterial
        color="#15110c"
        emissive={accent}
        emissiveIntensity={0.14}
        roughness={0.9}
      />
    </mesh>
  );
}

// The kindred artist's portrait, as a round medallion. Suspends on its texture.
function DoorMedallion({
  url,
  radius,
  y,
  accent,
}: {
  url: string;
  radius: number;
  y: number;
  accent: string;
}) {
  const tex = useTexture(portraitTextureUrl(url));
  useEffect(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
  }, [tex]);
  return (
    <mesh position={[0, y, 0.05]}>
      <circleGeometry args={[radius, 48]} />
      <meshStandardMaterial
        map={tex}
        roughness={0.7}
        emissive={accent}
        emissiveIntensity={0.06}
      />
    </mesh>
  );
}

function InfluenceDoor({
  neighbor,
  position,
  width,
  height,
  onTravel,
}: {
  neighbor: Neighbor;
  position: [number, number, number];
  width: number;
  height: number;
  onTravel: (slug: string) => void;
  // accent comes from the neighbor's own period colour
}) {
  const t = useT();
  const { locale } = useLocale();
  const accent = neighbor.color;
  const border = Math.min(0.14, width * 0.12);
  const ring = useMemo(
    () => makeArchRing(width, height, border, 0.16),
    [width, height, border],
  );
  useEffect(() => () => ring.dispose(), [ring]);

  const name = localized(locale, neighbor.i18n, "name", neighbor.name) ?? neighbor.name;
  const tag = t(neighbor.direction === "influencer" ? "influencedBy" : "influenceOn");
  const sign = useMemo(() => makeDoorSign(name, tag, accent), [name, tag, accent]);
  useEffect(() => () => sign.dispose(), [sign]);

  const [hover, setHover] = useState(false);
  const lightRef = useRef<THREE.PointLight>(null);
  useFrame((_, dt) => {
    const l = lightRef.current;
    if (l) {
      const target = hover ? 5.5 : 3.2;
      l.intensity += (target - l.intensity) * Math.min(1, dt * 6);
    }
  });

  const innerW = width - border * 2;
  const innerH = height - border * 2;
  const medR = Math.min(innerW * 0.34, 0.34);
  const medY = border + innerH * 0.66;
  const signW = Math.min(innerW * 0.96, 1.1);
  const signH = (signW * 224) / 512;

  return (
    <group
      position={position}
      onClick={(e) => {
        e.stopPropagation();
        onTravel(neighbor.slug);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = "";
      }}
    >
      {/* glowing passage seen through the arch */}
      <mesh position={[0, height / 2, -0.02]}>
        <planeGeometry args={[innerW + 0.04, height]} />
        <meshStandardMaterial
          color="#0b0a08"
          emissive={accent}
          emissiveIntensity={hover ? 0.5 : 0.32}
          roughness={1}
        />
      </mesh>
      {/* arch moulding */}
      <mesh geometry={ring} castShadow receiveShadow>
        <meshStandardMaterial color={accent} metalness={0.5} roughness={0.42} />
      </mesh>
      {/* portrait medallion (with a plain disc if it's missing or fails) */}
      {neighbor.portraitUrl ? (
        <TexBoundary fallback={<MedallionDisc r={medR} y={medY} accent={accent} />}>
          <Suspense fallback={<MedallionDisc r={medR} y={medY} accent={accent} />}>
            <DoorMedallion
              url={neighbor.portraitUrl}
              radius={medR}
              y={medY}
              accent={accent}
            />
          </Suspense>
        </TexBoundary>
      ) : (
        <MedallionDisc r={medR} y={medY} accent={accent} />
      )}
      {/* medallion rim */}
      <mesh position={[0, medY, 0.035]}>
        <ringGeometry args={[medR, medR + 0.03, 48]} />
        <meshStandardMaterial color={accent} metalness={0.6} roughness={0.35} side={THREE.DoubleSide} />
      </mesh>
      {/* nameplate */}
      <mesh position={[0, border + innerH * 0.22, 0.05]}>
        <planeGeometry args={[signW, signH]} />
        <meshBasicMaterial map={sign} transparent toneMapped={false} />
      </mesh>
      {/* threshold light on the floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0.5]}>
        <planeGeometry args={[innerW, 1.0]} />
        <meshBasicMaterial color={accent} transparent opacity={hover ? 0.16 : 0.08} />
      </mesh>
      <pointLight
        ref={lightRef}
        position={[0, height * 0.5, 0.6]}
        intensity={3.2}
        distance={5}
        decay={2}
        color={accent}
      />
    </group>
  );
}

// Lay the doorways out across the far wall, sized to fit however many there are.
function InfluenceDoors({
  neighbors,
  museum,
  depth,
  onTravel,
}: {
  neighbors: Neighbor[];
  museum: Museum;
  depth: number;
  onTravel: (slug: string) => void;
}) {
  const doors = neighbors.slice(0, 6);
  if (!doors.length) return null;
  const W = museum.roomWidth;
  const avail = W - 1.4;
  const width = Math.max(0.9, Math.min(1.5, avail / doors.length - 0.3));
  const height = Math.min(width * 1.9, museum.wallHeight - 0.5);
  const gap = width + Math.min(0.5, (avail - width * doors.length) / Math.max(1, doors.length));
  const span = gap * (doors.length - 1);
  const z = -depth / 2 + 0.2;
  return (
    <group>
      {doors.map((n, i) => (
        <InfluenceDoor
          key={n.slug}
          neighbor={n}
          position={[-span / 2 + i * gap, 0, z]}
          width={width}
          height={height}
          onTravel={onTravel}
        />
      ))}
    </group>
  );
}

const BCP47: Record<Locale, string> = { en: "en-US", fr: "fr-FR", ja: "ja-JP" };

type TourStop = {
  painting: Painting;
  title: string;
  subject: ArtSubject;
  pos: [number, number, number];
  yaw: number;
  pitch: number;
};

// A viewing pose in front of every hung work, in walking order — the itinerary
// the guided tour follows.
function buildTourStops(hangs: Hang[], locale: Locale): TourStop[] {
  const VIEW = 2.7;
  return hangs.map((h) => {
    const [px, py, pz] = h.position;
    const leftWall = h.rotation[1] > 0; // +π/2 left wall, −π/2 right wall
    const x = leftWall ? px + VIEW : px - VIEW;
    const yaw = leftWall ? Math.PI / 2 : -Math.PI / 2;
    const pitch = Math.atan2(py - EYE, VIEW) * 0.6;
    return {
      painting: h.p,
      title: localized(locale, h.p.i18n, "title", h.p.title) ?? h.p.title,
      subject: classifySubject(`${h.p.title} ${h.p.story ?? ""}`),
      pos: [x, EYE, pz],
      yaw,
      pitch,
    };
  });
}

// shortest-path angular interpolation
function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// Walks the camera to the current tour stop along a gently curved floor path —
// facing the way it's heading, then turning to the work on arrival and holding
// it with a barely-there drift, the way a docent pauses before a canvas.
function TourCamera({
  activeRef,
  targetRef,
}: {
  activeRef: React.RefObject<boolean>;
  targetRef: React.RefObject<TourStop | null>;
}) {
  const { camera } = useThree();
  const cur = useRef<TourStop | null>(null);
  const from = useRef(new THREE.Vector3());
  const fromYaw = useRef(0);
  const mid = useRef(new THREE.Vector3());
  const t = useRef(1);

  useFrame((state, dt) => {
    if (!activeRef.current) {
      cur.current = null;
      return;
    }
    const tg = targetRef.current;
    if (!tg) return;
    camera.rotation.order = "YXZ";

    if (tg !== cur.current) {
      cur.current = tg;
      from.current.copy(camera.position);
      fromYaw.current = camera.rotation.y;
      t.current = 0;
      // a midpoint nudged toward the room centre so the walk sweeps, not darts
      mid.current.set(
        (from.current.x + tg.pos[0]) * 0.3,
        EYE,
        (from.current.z + tg.pos[2]) * 0.5,
      );
    }

    const TRANSIT = 2.4;
    t.current = Math.min(1, t.current + dt / TRANSIT);
    const tt = t.current;

    if (tt < 1) {
      const a = from.current;
      const b = mid.current;
      const u = 1 - tt;
      camera.position.set(
        u * u * a.x + 2 * u * tt * b.x + tt * tt * tg.pos[0],
        EYE,
        u * u * a.z + 2 * u * tt * b.z + tt * tt * tg.pos[2],
      );
      // heading follows the path's velocity, then turns to face the work
      const vx = 2 * u * (b.x - a.x) + 2 * tt * (tg.pos[0] - b.x);
      const vz = 2 * u * (b.z - a.z) + 2 * tt * (tg.pos[2] - b.z);
      const walkYaw =
        Math.hypot(vx, vz) > 0.001 ? Math.atan2(-vx, -vz) : tg.yaw;
      const settle = Math.max(0, Math.min(1, (tt - 0.62) / 0.38));
      camera.rotation.y = lerpAngle(
        lerpAngle(fromYaw.current, walkYaw, Math.min(1, tt * 4)),
        tg.yaw,
        settle,
      );
      camera.rotation.x += (tg.pitch * settle - camera.rotation.x) * 0.12;
    } else {
      // arrived: hold the work, breathing very slightly
      const k = Math.min(1, dt * 2);
      camera.position.x += (tg.pos[0] - camera.position.x) * k;
      camera.position.z += (tg.pos[2] - camera.position.z) * k;
      camera.position.y = EYE;
      const drift = tg.yaw + Math.sin(state.clock.elapsedTime * 0.22) * 0.02;
      camera.rotation.y = lerpAngle(camera.rotation.y, drift, k);
      camera.rotation.x += (tg.pitch - camera.rotation.x) * k;
    }
    camera.rotation.z = 0;
  });
  return null;
}

type FocusMeta = {
  cx: number;
  cz: number;
  nx: number; // inward wall normal (toward room centre)
  subject: ArtSubject;
  title: string;
};

// Approach-to-contemplate: stand close to a work and face it, and the room
// hushes and darkens around it while its own soundscape rises — the world
// falling away from the thing you're looking at.
function Contemplate({
  enabledRef,
  hangs,
  locale,
  onScene,
  onArtwork,
  onFocus,
  onNear,
}: {
  enabledRef: React.RefObject<boolean>;
  hangs: Hang[];
  locale: Locale;
  onScene: (s: Scene) => void;
  onArtwork: (s: ArtSubject | null) => void;
  onFocus: (title: string | null) => void;
  onNear: (s: ArtSubject | null, pan: number, level: number) => void;
}) {
  const { camera, gl, scene } = useThree();
  const metas = useMemo<FocusMeta[]>(
    () =>
      hangs.map((h) => ({
        cx: h.position[0],
        cz: h.position[2],
        nx: h.rotation[1] > 0 ? 1 : -1,
        subject: classifySubject(`${h.p.title} ${h.p.story ?? ""}`),
        title: localized(locale, h.p.i18n, "title", h.p.title) ?? h.p.title,
      })),
    [hangs, locale],
  );
  const f = useRef(0);
  const fwd = useRef(new THREE.Vector3());
  const baseExp = useRef<number | null>(null);
  const prevEnabled = useRef(false);
  const lastScene = useRef<Scene | null>(null);
  const lastTitle = useRef<string | null>(null);

  useFrame((state, dt) => {
    const enabled = enabledRef.current;
    const justEnabled = enabled && !prevEnabled.current;
    const justDisabled = !enabled && prevEnabled.current;
    prevEnabled.current = enabled;
    if (justEnabled) lastScene.current = null; // re-assert after an overlay
    if (justDisabled) {
      lastTitle.current = null;
      onFocus(null);
      onNear(null, 0, 0); // hand the spatial bus back to silence
    }

    let target = 0;
    let best: FocusMeta | null = null;
    let nearest: FocusMeta | null = null;
    let nearestDist = Infinity;
    let nearestPan = 0;
    if (enabled && metas.length) {
      camera.getWorldDirection(fwd.current);
      const fx = fwd.current.x;
      const fz = fwd.current.z;
      const flen = Math.hypot(fx, fz) || 1;
      const rx = -fz / flen; // camera's right, in the floor plane
      const rz = fx / flen;
      let bestScore = -1;
      for (const m of metas) {
        const dx = m.cx - camera.position.x;
        const dz = m.cz - camera.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.4 || m.nx * dx >= 0) continue; // must be on the room side
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = m;
          nearestPan = Math.max(-1, Math.min(1, (dx * rx + dz * rz) / dist));
        }
        const dot = (fx * dx + fz * dz) / (flen * dist);
        const near = dist < (lastScene.current === "artview" ? 4.0 : 3.1);
        const facing = dot > (lastScene.current === "artview" ? 0.55 : 0.72);
        if (near && facing && dot > bestScore) {
          bestScore = dot;
          best = m;
        }
      }
      target = best ? 1 : 0;
    }

    if (enabled) {
      const want: Scene = target === 1 ? "artview" : "gallery";
      if (want !== lastScene.current) {
        lastScene.current = want;
        onArtwork(want === "artview" && best ? best.subject : null);
        const title = want === "artview" && best ? best.title : null;
        lastTitle.current = title;
        onFocus(title);
        onScene(want);
      } else if (want === "artview" && best && best.title !== lastTitle.current) {
        lastTitle.current = best.title; // slid to an adjacent work
        onArtwork(best.subject);
        onFocus(best.title);
      }
      // faint, panned hint of whatever work you're closest to
      const level = nearest
        ? Math.max(0, Math.min(0.3, 0.3 * (1 - (nearestDist - 1.2) / 6)))
        : 0;
      onNear(nearest ? nearest.subject : null, nearestPan, level);
    }

    f.current += (target - f.current) * Math.min(1, dt * 2.2);

    // Only touch the lights while contemplating (or easing back out) — never
    // during the intro, where IntroCamera owns the lighting ramp.
    if (enabled || f.current > 0.001) {
      // dim the fill so the lit canvas glows; lift exposure a touch with it
      const k = 1 - 0.5 * f.current;
      scene.traverse((o) => {
        const L = o as THREE.Light & {
          isAmbientLight?: boolean;
          isHemisphereLight?: boolean;
        };
        if (L.isAmbientLight || L.isHemisphereLight || L.userData?.dimmable) {
          if (L.userData.dimBase === undefined) L.userData.dimBase = L.intensity;
          L.intensity = (L.userData.dimBase as number) * k;
        }
      });
      if (baseExp.current === null) baseExp.current = gl.toneMappingExposure;
      gl.toneMappingExposure = baseExp.current * (1 + 0.12 * f.current);
    }
  });

  return null;
}

// A slow tide of daylight in skylit halls: over a few minutes the sun warms and
// lowers toward golden hour and back, carrying the skylight and god-ray shafts
// with it (via the shared daylight store). Runs only after the intro, so it
// never fights IntroCamera's lighting ramp.
function DayCycle() {
  const { scene } = useThree();
  const sun = useRef<THREE.DirectionalLight | null>(null);
  const baseInt = useRef(1);
  const baseCol = useRef(new THREE.Color());
  const amber = useRef(new THREE.Color("#ffb066"));
  const t0 = useRef<number | null>(null);

  useEffect(() => resetDaylight, []);

  useFrame((state) => {
    if (t0.current === null) t0.current = state.clock.elapsedTime;
    const e = state.clock.elapsedTime - t0.current;
    const PERIOD = 240; // seconds for a full midday → dusk → midday swing
    const warm = 0.5 - 0.5 * Math.cos((e / PERIOD) * Math.PI * 2);
    daylight.warm = warm;
    daylight.level = 1 - warm * 0.22;

    if (!sun.current) {
      scene.traverse((o) => {
        const L = o as THREE.DirectionalLight;
        if (L.isDirectionalLight && !sun.current) {
          sun.current = L;
          const stored = L.userData.dayBaseInt as number | undefined;
          baseInt.current = stored ?? L.intensity;
          L.userData.dayBaseInt = baseInt.current;
          baseCol.current.copy(L.color);
        }
      });
    }
    const s = sun.current;
    if (s) {
      s.intensity = baseInt.current * (1 - warm * 0.4);
      s.color.copy(baseCol.current).lerp(amber.current, warm * 0.6);
    }
  });
  return null;
}

export default function Gallery({
  museum,
  artist,
  period,
  paintings,
  neighbors = [],
  intro = false,
  openWorkId = null,
}: {
  museum: Museum;
  artist: Artist;
  period: Period | null;
  paintings: Painting[];
  neighbors?: Neighbor[];
  intro?: boolean;
  openWorkId?: number | null;
}) {
  const descReserve = museum.descMount === "wall" ? 3.6 : 1.9;
  const { hangs, depth, descZ } = useHangs(
    paintings,
    museum.roomWidth,
    descReserve,
    museum.hang,
  );
  const accent = museum.accentFromPeriod
    ? (period?.color ?? museum.signature)
    : museum.signature;
  const t = useT();
  const { locale } = useLocale();
  const {
    setScene: setAudioScene,
    setFacing,
    setDepth,
    step,
    setArtwork,
    setNearWork,
    setDucked,
    setRoomSize,
  } = useAudio();
  useEffect(() => {
    setAudioScene("gallery");
    setRoomSize(depth);
    return () => setAudioScene("off");
  }, [setAudioScene, setRoomSize, depth]);
  const [inspect, setInspect] = useState<Painting | null>(null);
  const [fullscreen, setFullscreen] = useState<Painting | null>(null);
  const lastClick = useRef(0);
  const [phase, setPhase] = useState<0 | 1 | 2>(intro ? 0 : 2);
  const moving = useRef(!intro);
  const looking = useRef(!intro);
  const didDrag = useRef(false);
  const moveRef = useRef({ x: 0, y: 0 });
  const [coarse, setCoarse] = useState(false);
  const [traveling, setTraveling] = useState(false);
  const router = useRouter();

  // guided tour + approach-to-contemplate
  const tourStops = useMemo(() => buildTourStops(hangs, locale), [hangs, locale]);
  const [tour, setTour] = useState(false);
  const [tourIdx, setTourIdx] = useState(0);
  const [focusTitle, setFocusTitle] = useState<string | null>(null);
  const tourActive = useRef(false);
  const tourTarget = useRef<TourStop | null>(null);
  const tourAudio = useRef<HTMLAudioElement | null>(null);
  const tourTimer = useRef<number | undefined>(undefined);
  const contemplateOn = useRef(false);
  const visitorCount = Math.min(6, Math.max(3, Math.round(depth / 7)));
  const skylit =
    museum.daylight != null ||
    museum.ceilingKind === "vault" ||
    museum.ceilingKind === "clerestory";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dofRef = useRef<any>(null);

  // step through a doorway into a kindred artist's gallery — fade out, then
  // navigate (keeping the same museum so the journey stays visually continuous)
  const travelTo = (slug: string) => {
    if (traveling || didDrag.current) return;
    setTraveling(true);
    window.setTimeout(
      () => router.push(`/museum/${slug}?intro=1&museum=${museum.id}`),
      520,
    );
  };

  // touch devices can't press WASD — show an on-screen joystick instead
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(pointer: coarse)");
    const apply = () => setCoarse(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  useEffect(() => {
    moving.current = phase === 2 && !inspect && !tour;
    looking.current = phase === 2 && !tour;
    contemplateOn.current = phase === 2 && !inspect && !fullscreen && !tour;
  }, [phase, inspect, fullscreen, tour]);

  // a shared deep link (?work=<id>) opens straight to that painting
  useEffect(() => {
    if (openWorkId == null) return;
    const w = paintings.find((p) => p.id === openWorkId);
    if (w) setInspect(w);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openWorkId]);

  // opening a single work → the art view (binaural tone) and that painting's
  // soundscape. On close, Contemplate re-asserts the room (or keeps the art
  // view if you're still standing before the work), so no reset is needed here.
  useEffect(() => {
    const p = inspect ?? fullscreen;
    if (p) {
      setAudioScene("artview");
      setArtwork(classifySubject(`${p.title} ${p.story ?? ""}`));
    }
  }, [inspect, fullscreen, setAudioScene, setArtwork]);

  const keyDates = useMemo(() => {
    const works = paintings
      .filter((p) => p.year != null)
      .sort((a, b) => (a.year as number) - (b.year as number));
    const picks: Painting[] = [];
    if (works.length) {
      const idxs =
        works.length <= 3
          ? works.map((_, i) => i)
          : [0, Math.floor(works.length / 2), works.length - 1];
      for (const i of idxs) picks.push(works[i]);
    }
    const items: { year: number; label: string }[] = [];
    if (artist.birthYear != null)
      items.push({ year: artist.birthYear, label: t("born") });
    for (const p of picks)
      items.push({
        year: p.year as number,
        label: localized(locale, p.i18n, "title", p.title) ?? p.title,
      });
    if (artist.deathYear != null)
      items.push({ year: artist.deathYear, label: t("died") });
    return items.sort((a, b) => a.year - b.year);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paintings, artist, locale]);

  // single click opens the inspector; a quick second click (double-click) on a
  // painting jumps straight to full screen.
  const onInspect = (p: Painting) => {
    if (didDrag.current || tourActive.current) return;
    const now = performance.now();
    if (now - lastClick.current < 320) {
      setInspect(null);
      setFullscreen(p);
    } else {
      setInspect(p);
    }
    lastClick.current = now;
  };

  // ── Guided tour orchestration ──────────────────────────────────────────
  const clearTourTimer = () => {
    if (tourTimer.current !== undefined) {
      window.clearTimeout(tourTimer.current);
      tourTimer.current = undefined;
    }
  };
  const stopTourAudio = () => {
    if (tourAudio.current) {
      tourAudio.current.onended = null;
      tourAudio.current.onerror = null;
      tourAudio.current.pause();
      tourAudio.current.src = "";
      tourAudio.current = null;
    }
    window.speechSynthesis?.cancel();
  };

  function endTour() {
    tourActive.current = false;
    clearTourTimer();
    stopTourAudio();
    setDucked(false);
    setArtwork(null);
    setAudioScene("gallery");
    setTour(false);
    setFocusTitle(null);
    moving.current = true;
    looking.current = true;
    contemplateOn.current = true;
  }

  function nextStop(from: number) {
    if (!tourActive.current) return;
    clearTourTimer();
    setDucked(false);
    const n = from + 1;
    if (n >= tourStops.length) endTour();
    else goToStop(n);
  }

  function playNarration(i: number) {
    if (!tourActive.current) return;
    const s = tourStops[i];
    if (!s) return;
    setDucked(true);
    const el = new Audio(`/api/narrate?id=${s.painting.id}&lang=${locale}`);
    el.volume = getGuideVolume();
    tourAudio.current = el;
    const finish = () => {
      if (tourAudio.current === el) tourAudio.current = null;
      nextStop(i);
    };
    let fellBack = false;
    const fallback = () => {
      if (fellBack || !tourActive.current) return;
      fellBack = true;
      if (tourAudio.current === el) tourAudio.current = null;
      const synth = window.speechSynthesis;
      const text = localized(locale, s.painting.i18n, "story", s.painting.story);
      if (synth && text) {
        synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = BCP47[locale];
        u.rate = 0.96;
        u.volume = getGuideVolume();
        const v = synth
          .getVoices()
          .find((x) => x.lang?.toLowerCase().startsWith(locale));
        if (v) u.voice = v;
        u.onend = () => nextStop(i);
        u.onerror = () => nextStop(i);
        synth.speak(u);
        tourTimer.current = window.setTimeout(() => {
          synth.cancel();
          nextStop(i);
        }, 40000);
      } else {
        tourTimer.current = window.setTimeout(() => nextStop(i), 6000);
      }
    };
    el.onended = finish;
    el.onerror = fallback;
    el.play().catch(fallback);
    // hard safety cap against a stalled stream
    tourTimer.current = window.setTimeout(() => {
      if (tourActive.current) {
        stopTourAudio();
        nextStop(i);
      }
    }, 48000);
  }

  function goToStop(i: number) {
    if (!tourActive.current) return;
    clearTourTimer();
    stopTourAudio();
    setDucked(false);
    const s = tourStops[i];
    if (!s) {
      endTour();
      return;
    }
    setTourIdx(i);
    setFocusTitle(s.title);
    tourTarget.current = s;
    tourTimer.current = window.setTimeout(() => playNarration(i), 2600);
  }

  function startTour() {
    if (tourActive.current || !tourStops.length) return;
    setInspect(null);
    setFullscreen(null);
    tourActive.current = true;
    moving.current = false;
    looking.current = false;
    contemplateOn.current = false;
    setTour(true);
    setAudioScene("gallery");
    goToStop(0);
  }

  // stop any tour audio/timers if the gallery unmounts mid-tour
  useEffect(
    () => () => {
      tourActive.current = false;
      if (tourTimer.current !== undefined) window.clearTimeout(tourTimer.current);
      if (tourAudio.current) {
        tourAudio.current.pause();
        tourAudio.current = null;
      }
      window.speechSynthesis?.cancel();
    },
    [],
  );

  return (
    <div
      className="relative h-screen w-screen overflow-hidden"
      style={{ background: museum.bg }}
    >
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ fov: 62, near: 0.1, far: 90, position: [0, EYE, depth / 2 - 1.6] }}
        gl={{ antialias: true }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = museum.exposure;
        }}
      >
        <color attach="background" args={[museum.bg]} />
        <fog attach="fog" args={[museum.fogColor, museum.fogNear, museum.fogFar]} />

        <ambientLight intensity={museum.ambient} />
        <hemisphereLight
          args={[museum.hemiSky, museum.hemiGround, museum.hemiIntensity]}
        />
        {museum.daylight && (
          <directionalLight
            position={museum.daylight.pos}
            intensity={museum.daylight.intensity}
            color={museum.daylight.color}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-bias={-0.0004}
          />
        )}
        {Array.from({ length: Math.max(2, Math.round(depth / 6)) }).map(
          (_, i, arr) => {
            const z = -depth / 2 + (depth / (arr.length + 1)) * (i + 1);
            return (
              <pointLight
                key={`ceil-${i}`}
                position={[0, museum.wallHeight - 0.4, z]}
                intensity={museum.ceilLightIntensity}
                distance={16}
                decay={2}
                color={museum.ceilLightColor}
                userData={{ dimmable: true }}
              />
            );
          },
        )}
        <Room museum={museum} depth={depth} />
        <Atmosphere museum={museum} depth={depth} />
        <Visitors depth={depth} roomWidth={museum.roomWidth} count={visitorCount} />
        <DescriptionWall
          museum={museum}
          artist={artist}
          period={period}
          keyDates={keyDates}
          accent={accent}
          z={descZ}
        />
        {hangs.map((hang) => (
          <TexBoundary
            key={hang.p.id}
            fallback={<FallbackFrame hang={hang} accent={accent} />}
          >
            <Suspense fallback={null}>
              <PaintingFrame
                hang={hang}
                museum={museum}
                accent={accent}
                label={
                  localized(locale, hang.p.i18n, "title", hang.p.title) ??
                  hang.p.title
                }
                year={hang.p.year}
                onInspect={onInspect}
              />
            </Suspense>
          </TexBoundary>
        ))}

        <InfluenceDoors
          neighbors={neighbors}
          museum={museum}
          depth={depth}
          onTravel={travelTo}
        />

        <Player
          depth={depth}
          roomWidth={museum.roomWidth}
          enabled={moving}
          onStep={step}
          move={moveRef}
        />
        <Spatial depth={depth} onFacing={setFacing} onDepth={setDepth} />
        <Controls didDrag={didDrag} enabled={looking} />
        {intro && (
          <IntroCamera
            museum={museum}
            depth={depth}
            descZ={descZ}
            active={phase < 2}
            onTurning={() => setPhase(1)}
            onDone={() => setPhase(2)}
          />
        )}
        <EyeFocus dofRef={dofRef} />
        <Contemplate
          enabledRef={contemplateOn}
          hangs={hangs}
          locale={locale}
          onScene={setAudioScene}
          onArtwork={setArtwork}
          onFocus={setFocusTitle}
          onNear={setNearWork}
        />
        <TourCamera activeRef={tourActive} targetRef={tourTarget} />
        {skylit && phase === 2 && <DayCycle />}

        <EffectComposer>
          {/* gentle depth separation — the centre subject stays crisp */}
          <DepthOfField
            ref={dofRef}
            bokehScale={1.4}
            focusRange={0.03}
            focalLength={0.02}
          />
          {/* the gaze: sharp centre, blur growing into the corners */}
          <PeripheralBlur intensity={7} innerRadius={0.24} outerRadius={0.62} />
          <Bloom
            intensity={museum.bloom}
            luminanceThreshold={museum.bloomThreshold}
            luminanceSmoothing={0.25}
            mipmapBlur
          />
          <Vignette eskil={false} offset={0.2} darkness={museum.vignette} />
        </EffectComposer>
      </Canvas>

      {/* fade in from black */}
      <FadeIn />


      {/* top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-6">
        <Link
          href={`/?focus=${artist.slug}`}
          className="pointer-events-auto rounded-full border border-white/15 bg-black/30 px-4 py-2 text-[12px] text-ink backdrop-blur transition-colors hover:bg-black/50"
        >
          ← Constellation
        </Link>
        <LangSwitcher />
        <div className="text-right">
          <div className="font-display text-lg text-ink">
            {localized(locale, artist.i18n, "name", artist.name)}
          </div>
          {period && (
            <div className="text-[11px] uppercase tracking-[0.25em] text-ink-faint">
              {periodName(locale, period.name)}
            </div>
          )}
          <div
            className="mt-0.5 text-[10px] uppercase tracking-[0.22em]"
            style={{ color: museum.signature }}
          >
            {museum.name}
          </div>
        </div>
      </div>

      {phase === 2 && !inspect && !tour && <HintBanner touch={coarse} />}

      {coarse && phase === 2 && !inspect && !fullscreen && !tour && (
        <MoveStick move={moveRef} accent={accent} />
      )}

      {/* approach-to-contemplate: a quiet caption while you dwell on a work */}
      {focusTitle && !tour && !inspect && !fullscreen && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 flex justify-center">
          <span
            className="font-display text-[19px] italic tracking-wide text-ink/85"
            style={{ textShadow: "0 2px 14px rgba(0,0,0,0.7)" }}
          >
            {focusTitle}
          </span>
        </div>
      )}

      {/* launch the guided tour */}
      {phase === 2 && !inspect && !fullscreen && !tour && !traveling && tourStops.length > 0 && (
        <button
          onClick={startTour}
          className="pointer-events-auto absolute bottom-7 left-1/2 -translate-x-1/2 inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-[12px] uppercase tracking-[0.2em] backdrop-blur transition-colors"
          style={{
            borderColor: `${accent}66`,
            color: accent,
            background: "rgba(8,7,5,0.5)",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
          {t("tour")}
        </button>
      )}

      {tour && <TourBar idx={tourIdx} total={tourStops.length} title={focusTitle} accent={accent} onNext={() => nextStop(tourIdx)} onEnd={endTour} />}

      {inspect && (
        <InspectOverlay
          painting={inspect}
          accent={accent}
          onClose={() => setInspect(null)}
        />
      )}

      {fullscreen && (
        <FullscreenViewer
          painting={fullscreen}
          onClose={() => setFullscreen(null)}
        />
      )}

      {traveling && <TravelFade />}
    </div>
  );
}

function TravelFade() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(r);
  }, []);
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[70] bg-black"
      style={{ opacity: on ? 1 : 0, transition: "opacity 0.5s ease" }}
    />
  );
}

function FadeIn() {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGone(true), 60);
    return () => clearTimeout(t);
  }, []);
  return (
    <div
      className="pointer-events-none absolute inset-0 bg-black"
      style={{
        opacity: gone ? 0 : 1,
        transition: "opacity 0.7s ease",
      }}
    />
  );
}

function TourBar({
  idx,
  total,
  title,
  accent,
  onNext,
  onEnd,
}: {
  idx: number;
  total: number;
  title: string | null;
  accent: string;
  onNext: () => void;
  onEnd: () => void;
}) {
  const t = useT();
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-7 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-4 rounded-full border border-white/15 bg-black/55 px-5 py-2.5 backdrop-blur">
        <span
          className="text-[11px] tabular-nums tracking-[0.2em]"
          style={{ color: accent }}
        >
          {idx + 1} / {total}
        </span>
        {title && (
          <span className="max-w-[44vw] truncate font-display text-[15px] italic text-ink">
            {title}
          </span>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={onNext}
            className="rounded-full border border-white/15 px-3 py-1 text-[11px] uppercase tracking-[0.15em] text-ink-soft transition-colors hover:text-ink"
          >
            {t("tourNext")}
          </button>
          <button
            onClick={onEnd}
            className="rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.15em]"
            style={{ color: accent }}
          >
            {t("tourEnd")}
          </button>
        </div>
      </div>
    </div>
  );
}

function HintBanner({ touch }: { touch: boolean }) {
  const t = useT();
  const [hide, setHide] = useState(false);
  useEffect(() => {
    const onDown = () => setHide(true);
    window.addEventListener("pointerdown", onDown, { once: true });
    const t = setTimeout(() => setHide(true), 6500);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      clearTimeout(t);
    };
  }, []);
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-10 flex justify-center"
      style={{ opacity: hide ? 0 : 1, transition: "opacity 0.6s ease" }}
    >
      <span className="rounded-full border border-white/15 bg-black/45 px-6 py-3 text-[12px] uppercase tracking-[0.25em] text-ink backdrop-blur">
        {t(touch ? "museumHintTouch" : "museumHint")}
      </span>
    </div>
  );
}
