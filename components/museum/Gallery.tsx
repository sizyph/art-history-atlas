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
import InspectOverlay from "@/components/museum/InspectOverlay";
import LangSwitcher from "@/components/LangSwitcher";
import { useLocale, useT } from "@/components/LocaleProvider";
import { useAudio } from "@/components/AudioProvider";
import { localized, periodName } from "@/lib/i18n";

const WALL_COLOR = "#1b1712";
const SPACING = 3.6;
const WALL_HEIGHT = 4.4;
const ROOM_WIDTH = 9;
const EYE = 1.65;

function wallTextureUrl(p: Painting) {
  const src = p.imageUrl.replace("width=1800", "width=1100");
  return `/api/img?u=${encodeURIComponent(src)}`;
}

function zPositions(count: number): number[] {
  const start = (-(count - 1) / 2) * SPACING;
  return Array.from({ length: count }, (_, i) => start + i * SPACING);
}

type Hang = {
  p: Painting;
  position: [number, number, number];
  rotation: [number, number, number];
};

function useHangs(paintings: Painting[]): {
  hangs: Hang[];
  depth: number;
  descZ: number;
} {
  return useMemo(() => {
    const DESC = 3.6; // left-wall length reserved for the description, at the entrance
    const perSide = Math.ceil(paintings.length / 2);
    const depth = Math.max(perSide * SPACING + DESC + 3, 16);
    const front = depth / 2;
    const descZ = front - DESC / 2 - 0.7; // description centred near the entrance (left wall)
    const left = paintings.slice(0, perSide);
    const right = paintings.slice(perSide);

    // right wall: centred along the full wall
    const rz = zPositions(right.length);
    // left wall: paintings begin behind the description and run to the back
    const leftTop = descZ - DESC / 2 - 1.0;
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
        position: [-ROOM_WIDTH / 2 + 0.08, EYE, lz[i]],
        rotation: [0, Math.PI / 2, 0],
      }),
    );
    right.forEach((p, i) =>
      hangs.push({
        p,
        position: [ROOM_WIDTH / 2 - 0.08, EYE, rz[i]],
        rotation: [0, -Math.PI / 2, 0],
      }),
    );
    return { hangs, depth, descZ };
  }, [paintings]);
}

function PaintingFrame({
  hang,
  accent,
  onInspect,
}: {
  hang: Hang;
  accent: string;
  onInspect: (p: Painting) => void;
}) {
  const tex = useTexture(wallTextureUrl(hang.p));
  const lightRef = useRef<THREE.SpotLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);

  useEffect(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
  }, [tex]);

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

  const maxH = 1.9;
  const maxW = 2.7;
  let h = maxH;
  let w = h * aspect;
  if (w > maxW) {
    w = maxW;
    h = w / aspect;
  }
  const fw = w + 0.18;
  const fh = h + 0.18;

  return (
    <group position={hang.position} rotation={hang.rotation}>
      {/* frame */}
      <mesh position={[0, 0, -0.05]} castShadow receiveShadow>
        <boxGeometry args={[fw, fh, 0.1]} />
        <meshStandardMaterial color={accent} metalness={0.4} roughness={0.42} />
      </mesh>
      {/* inner mat */}
      <mesh position={[0, 0, 0.005]}>
        <planeGeometry args={[w + 0.04, h + 0.04]} />
        <meshStandardMaterial color="#0e0c0a" roughness={1} />
      </mesh>
      {/* canvas */}
      <mesh
        position={[0, 0, 0.02]}
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
      {/* picture light */}
      <spotLight
        ref={lightRef}
        position={[0, fh / 2 + 0.85, 1.7]}
        angle={0.66}
        penumbra={0.85}
        distance={10}
        intensity={42}
        color="#fff2dc"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
      />
      <object3D ref={targetRef} position={[0, 0, 0.1]} />
    </group>
  );
}

function Room({ depth }: { depth: number }) {
  const wallProps = {
    receiveShadow: true,
  } as const;
  return (
    <group>
      {/* reflective floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[ROOM_WIDTH, depth]} />
        <MeshReflectorMaterial
          resolution={1024}
          blur={[400, 120]}
          mixBlur={1.1}
          mixStrength={2.4}
          mixContrast={1}
          roughness={0.82}
          depthScale={1.1}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.3}
          color="#13110d"
          metalness={0.55}
        />
      </mesh>
      {/* ceiling */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, WALL_HEIGHT, 0]}>
        <planeGeometry args={[ROOM_WIDTH, depth]} />
        <meshStandardMaterial color="#0d0b09" roughness={1} />
      </mesh>
      {/* left wall */}
      <mesh
        {...wallProps}
        position={[-ROOM_WIDTH / 2, WALL_HEIGHT / 2, 0]}
        rotation={[0, Math.PI / 2, 0]}
      >
        <planeGeometry args={[depth, WALL_HEIGHT]} />
        <meshStandardMaterial color={WALL_COLOR} roughness={0.96} />
      </mesh>
      {/* right wall */}
      <mesh
        {...wallProps}
        position={[ROOM_WIDTH / 2, WALL_HEIGHT / 2, 0]}
        rotation={[0, -Math.PI / 2, 0]}
      >
        <planeGeometry args={[depth, WALL_HEIGHT]} />
        <meshStandardMaterial color={WALL_COLOR} roughness={0.96} />
      </mesh>
      {/* far wall */}
      <mesh {...wallProps} position={[0, WALL_HEIGHT / 2, -depth / 2]}>
        <planeGeometry args={[ROOM_WIDTH, WALL_HEIGHT]} />
        <meshStandardMaterial color={WALL_COLOR} roughness={0.96} />
      </mesh>
      {/* near wall */}
      <mesh
        {...wallProps}
        position={[0, WALL_HEIGHT / 2, depth / 2]}
        rotation={[0, Math.PI, 0]}
      >
        <planeGeometry args={[ROOM_WIDTH, WALL_HEIGHT]} />
        <meshStandardMaterial color={WALL_COLOR} roughness={0.96} />
      </mesh>
    </group>
  );
}

function Player({
  depth,
  enabled,
  onStep,
  onDepth,
}: {
  depth: number;
  enabled: React.RefObject<boolean>;
  onStep?: () => void;
  onDepth?: (d: number) => void;
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
  const depthT = useRef(0);

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
    if (dir.current.lengthSq() > 0) {
      dir.current.normalize();
      const moved = speed * Math.min(dt, 0.05);
      camera.position.addScaledVector(dir.current, moved);
      stepAccum.current += moved;
      if (stepAccum.current > 1.7) {
        stepAccum.current = 0;
        onStep?.();
      }
    }
    const hx = ROOM_WIDTH / 2 - 0.7;
    const hz = depth / 2 - 0.7;
    camera.position.x = Math.max(-hx, Math.min(hx, camera.position.x));
    camera.position.z = Math.max(-hz, Math.min(hz, camera.position.z));
    camera.position.y = EYE;

    depthT.current += dt;
    if (depthT.current > 0.3) {
      depthT.current = 0;
      onDepth?.(
        Math.max(0, Math.min(1, (depth / 2 - camera.position.z) / depth)),
      );
    }
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
      if (!enabled.current) return;
      dragging.current = true;
      didDrag.current = false;
      // re-sync from the live camera (the intro may have rotated it)
      yaw.current = camera.rotation.y;
      pitch.current = camera.rotation.x;
      last.current = { x: e.clientX, y: e.clientY };
    };
    const move = (e: PointerEvent) => {
      if (!enabled.current || !dragging.current) return;
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
    const up = () => {
      dragging.current = false;
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

const INTRO_READ = 1.7; // seconds dwelling on the placard
const INTRO_TURN = 1.4; // seconds turning to face the gallery

// During the entry, dim + turn the camera toward the left-wall placard, then
// turn right to the gallery as the lights (tone-mapping exposure) come up.
function IntroCamera({
  active,
  onTurning,
  onDone,
}: {
  active: boolean;
  onTurning: () => void;
  onDone: () => void;
}) {
  const { camera } = useThree();
  const start = useRef<number | null>(null);
  const turned = useRef(false);
  const done = useRef(false);
  const lit = useRef(0.32);

  const setLights = (state: { scene: THREE.Scene }, factor: number) => {
    state.scene.traverse((o) => {
      const L = o as unknown as THREE.Light & { isLight?: boolean };
      if (L.isLight) {
        if (L.userData.base === undefined) L.userData.base = L.intensity;
        L.intensity = (L.userData.base as number) * factor;
      }
    });
  };

  useFrame((state) => {
    if (!active || done.current) return;
    if (start.current === null) {
      start.current = state.clock.elapsedTime;
      camera.rotation.y = 0.06;
    }
    const e = state.clock.elapsedTime - start.current;

    let targetYaw: number;
    let targetLit: number;
    if (e < INTRO_READ) {
      targetYaw = 1.2; // turned left to face the description wall
      targetLit = 0.32; // gallery dim while you read it
    } else {
      targetYaw = 0; // face down the gallery
      targetLit = 1; // lights come up
      if (!turned.current) {
        turned.current = true;
        onTurning();
      }
    }

    camera.rotation.y += (targetYaw - camera.rotation.y) * 0.07;
    lit.current += (targetLit - lit.current) * 0.05;
    setLights(state, lit.current);

    if (e > INTRO_READ + INTRO_TURN) {
      done.current = true;
      camera.rotation.y = 0;
      setLights(state, 1);
      onDone();
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
    fp.current.lerp(tp.current, 0.25);
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

function makeDescriptionTexture(d: {
  name: string;
  dates: string | null;
  sub: string;
  bio: string | null;
  keyHeader: string;
  keyDates: { year: number; label: string }[];
  accent: string;
}): THREE.CanvasTexture {
  const W = 840;
  const H = 1180;
  const PAD = 64;
  const maxW = W - PAD * 2;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d")!;

  ctx.fillStyle = "#19140d";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = d.accent;
  ctx.fillRect(0, 0, W, 9);
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 2;
  ctx.strokeRect(9, 9, W - 18, H - 18);

  let y = 134;
  ctx.fillStyle = "#efe7d7";
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
    ctx.fillStyle = "#a99f8d";
    ctx.font = '20px "Inter", system-ui, sans-serif';
    ctx.letterSpacing = "3px";
    ctx.fillText(d.sub.toUpperCase(), PAD, y);
    ctx.letterSpacing = "0px";
    y += 38;
  }

  y += 16;
  ctx.strokeStyle = d.accent;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(PAD + 230, y);
  ctx.stroke();
  ctx.globalAlpha = 1;
  y += 44;

  if (d.bio) {
    ctx.fillStyle = "#c4baa6";
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
    ctx.fillStyle = "#9a8f7b";
    ctx.font = '600 25px "Cormorant Garamond", Georgia, serif';
    ctx.fillText(String(kd.year), PAD + 30, y);
    ctx.fillStyle = "#d8cfbd";
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

// The artist description, painted full-height on the left wall at the entrance.
function DescriptionWall({
  artist,
  period,
  keyDates,
  accent,
  z,
}: {
  artist: Artist;
  period: Period | null;
  keyDates: { year: number; label: string }[];
  accent: string;
  z: number;
}) {
  const t = useT();
  const { locale } = useLocale();
  const [tex, setTex] = useState<THREE.CanvasTexture | null>(null);

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
        return makeDescriptionTexture({
          name,
          dates,
          sub,
          bio,
          keyHeader: t("keyDates"),
          keyDates,
          accent,
        });
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
  }, [locale, artist, period, keyDates, accent]);

  if (!tex) return null;
  const PH = WALL_HEIGHT - 0.5;
  const PW = PH * (840 / 1180);
  return (
    <mesh
      position={[-ROOM_WIDTH / 2 + 0.06, WALL_HEIGHT / 2, z]}
      rotation={[0, Math.PI / 2, 0]}
    >
      <planeGeometry args={[PW, PH]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  );
}

export default function Gallery({
  artist,
  period,
  paintings,
  intro = false,
}: {
  artist: Artist;
  period: Period | null;
  paintings: Painting[];
  intro?: boolean;
}) {
  const { hangs, depth, descZ } = useHangs(paintings);
  const accent = period?.color ?? "#c9a24b";
  const t = useT();
  const { locale } = useLocale();
  const { setScene: setAudioScene, setGalleryDepth, step } = useAudio();
  useEffect(() => {
    setAudioScene("gallery");
    return () => setAudioScene("off");
  }, [setAudioScene]);
  const [inspect, setInspect] = useState<Painting | null>(null);
  const [phase, setPhase] = useState<0 | 1 | 2>(intro ? 0 : 2);
  const moving = useRef(!intro);
  const looking = useRef(!intro);
  const didDrag = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dofRef = useRef<any>(null);

  useEffect(() => {
    moving.current = phase === 2 && !inspect;
    looking.current = phase === 2;
  }, [phase, inspect]);

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

  const onInspect = (p: Painting) => {
    if (didDrag.current) return;
    setInspect(p);
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0b0a08]">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ fov: 62, near: 0.1, far: 80, position: [0, EYE, depth / 2 - 1.6] }}
        gl={{ antialias: true }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.12;
        }}
      >
        <color attach="background" args={["#0b0a08"]} />
        <fog attach="fog" args={["#0b0a08", 9, 42]} />

        <ambientLight intensity={0.32} />
        <hemisphereLight args={["#4a4230", "#0a0908", 0.42]} />
        {Array.from({ length: Math.max(2, Math.round(depth / 6)) }).map(
          (_, i, arr) => {
            const z = -depth / 2 + (depth / (arr.length + 1)) * (i + 1);
            return (
              <pointLight
                key={`ceil-${i}`}
                position={[0, WALL_HEIGHT - 0.4, z]}
                intensity={7}
                distance={15}
                decay={2}
                color="#ffe7c2"
              />
            );
          },
        )}
        <Room depth={depth} />
        <DescriptionWall
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
              <PaintingFrame hang={hang} accent={accent} onInspect={onInspect} />
            </Suspense>
          </TexBoundary>
        ))}

        <Player
          depth={depth}
          enabled={moving}
          onStep={step}
          onDepth={setGalleryDepth}
        />
        <Controls didDrag={didDrag} enabled={looking} />
        {intro && (
          <IntroCamera
            active={phase < 2}
            onTurning={() => setPhase(1)}
            onDone={() => setPhase(2)}
          />
        )}
        <EyeFocus dofRef={dofRef} />

        <EffectComposer>
          <DepthOfField
            ref={dofRef}
            bokehScale={2.2}
            focusRange={0.006}
            focalLength={0.02}
          />
          <Bloom
            intensity={0.5}
            luminanceThreshold={0.62}
            luminanceSmoothing={0.25}
            mipmapBlur
          />
          <Vignette eskil={false} offset={0.2} darkness={0.72} />
        </EffectComposer>
      </Canvas>

      {/* fade in from black */}
      <FadeIn />


      {/* top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-6">
        <Link
          href="/"
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
        </div>
      </div>

      {phase === 2 && !inspect && <HintBanner />}

      {inspect && (
        <InspectOverlay
          painting={inspect}
          accent={accent}
          onClose={() => setInspect(null)}
        />
      )}
    </div>
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
        transition: "opacity 1.2s ease",
      }}
    />
  );
}

function HintBanner() {
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
        {t("museumHint")}
      </span>
    </div>
  );
}
