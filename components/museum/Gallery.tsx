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
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import type { Artist, Painting, Period } from "@/db/schema";
import InspectOverlay from "@/components/museum/InspectOverlay";
import LangSwitcher from "@/components/LangSwitcher";
import { useLocale, useT } from "@/components/LocaleProvider";
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

function useHangs(paintings: Painting[]): { hangs: Hang[]; depth: number } {
  return useMemo(() => {
    const perSide = Math.ceil(paintings.length / 2);
    const depth = Math.max(perSide * SPACING + 3, 14);
    const left = paintings.slice(0, perSide);
    const right = paintings.slice(perSide);
    const lz = zPositions(left.length);
    const rz = zPositions(right.length);
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
    return { hangs, depth };
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
}: {
  depth: number;
  enabled: React.RefObject<boolean>;
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
      camera.position.addScaledVector(dir.current, speed * Math.min(dt, 0.05));
    }
    const hx = ROOM_WIDTH / 2 - 0.7;
    const hz = depth / 2 - 0.7;
    camera.position.x = Math.max(-hx, Math.min(hx, camera.position.x));
    camera.position.z = Math.max(-hz, Math.min(hz, camera.position.z));
    camera.position.y = EYE;
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
  const { camera, gl } = useThree();
  const start = useRef<number | null>(null);
  const turned = useRef(false);
  const done = useRef(false);

  useFrame((state) => {
    if (!active || done.current) return;
    if (start.current === null) {
      start.current = state.clock.elapsedTime;
      gl.toneMappingExposure = 0.4; // open dim
      camera.rotation.y = 0.08;
    }
    const e = state.clock.elapsedTime - start.current;

    let targetYaw: number;
    let targetExp: number;
    if (e < INTRO_READ) {
      targetYaw = 0.5; // turned left toward the placard
      targetExp = 0.42;
    } else {
      targetYaw = 0; // face down the gallery
      targetExp = 1.12;
      if (!turned.current) {
        turned.current = true;
        onTurning();
      }
    }

    camera.rotation.y += (targetYaw - camera.rotation.y) * 0.07;
    gl.toneMappingExposure +=
      (targetExp - gl.toneMappingExposure) * 0.05;

    if (e > INTRO_READ + INTRO_TURN) {
      done.current = true;
      camera.rotation.y = 0;
      gl.toneMappingExposure = 1.12;
      onDone();
    }
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

function WallPlacard({
  artist,
  period,
  keyDates,
  accent,
  phase,
}: {
  artist: Artist;
  period: Period | null;
  keyDates: { year: number; label: string }[];
  accent: string;
  phase: number;
}) {
  const t = useT();
  const { locale } = useLocale();
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

  return (
    <div
      className="pointer-events-none absolute inset-y-0 left-0 z-30 flex items-center"
      style={{
        opacity: phase === 0 ? 1 : 0,
        transform: phase === 0 ? "translateX(0)" : "translateX(-48px)",
        transition:
          "opacity 0.7s ease, transform 1.25s cubic-bezier(0.4,0,0.2,1)",
      }}
    >
      <div
        className="m-6 w-[360px] overflow-hidden rounded-xl border border-line p-6"
        style={{
          background: "rgba(20,16,11,0.93)",
          backdropFilter: "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
          boxShadow: `0 30px 80px -20px rgba(0,0,0,0.85), 0 0 0 1px ${accent}22`,
        }}
      >
        <div
          className="-mx-6 -mt-6 mb-5"
          style={{
            height: 3,
            background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
          }}
        />
        <div className="flex gap-4">
          {artist.portraitUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={artist.portraitUrl}
              alt=""
              className="h-[112px] w-[86px] rounded object-cover"
              style={{ border: "1px solid #38322A" }}
            />
          )}
          <div className="min-w-0">
            <h2 className="font-display text-2xl leading-tight text-ink">
              {name}
            </h2>
            {dates && (
              <div
                className="mt-1 font-display text-sm"
                style={{ color: accent }}
              >
                {dates}
              </div>
            )}
            {sub && (
              <div className="mt-1.5 text-[10px] uppercase tracking-[0.16em] text-ink-soft">
                {sub}
              </div>
            )}
          </div>
        </div>

        {bio && (
          <p
            className="mt-4 text-[12.5px] leading-relaxed text-ink-soft"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 5,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {bio}
          </p>
        )}

        {keyDates.length > 0 && (
          <div className="mt-5">
            <div
              className="mb-2.5 text-[10px] uppercase tracking-[0.2em]"
              style={{ color: accent }}
            >
              {t("keyDates")}
            </div>
            <ul className="space-y-2 border-l border-line pl-4">
              {keyDates.map((d, i) => (
                <li key={i} className="relative flex gap-3 text-[12.5px]">
                  <span
                    className="absolute -left-[18px] top-1.5 h-1.5 w-1.5 rounded-full"
                    style={{ background: accent }}
                  />
                  <span className="w-9 shrink-0 font-display tabular-nums text-ink-faint">
                    {d.year}
                  </span>
                  <span className="text-ink-soft">{d.label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
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
  const { hangs, depth } = useHangs(paintings);
  const accent = period?.color ?? "#c9a24b";
  const t = useT();
  const { locale } = useLocale();
  const [inspect, setInspect] = useState<Painting | null>(null);
  const [phase, setPhase] = useState<0 | 1 | 2>(intro ? 0 : 2);
  const moving = useRef(!intro);
  const looking = useRef(!intro);
  const didDrag = useRef(false);

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

        <Player depth={depth} enabled={moving} />
        <Controls didDrag={didDrag} enabled={looking} />
        {intro && (
          <IntroCamera
            active={phase < 2}
            onTurning={() => setPhase(1)}
            onDone={() => setPhase(2)}
          />
        )}

        <EffectComposer>
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

      {/* intro: the gallery sits dim + blurred behind a left-wall placard,
          then clears as the camera turns to face the room */}
      {phase < 2 && (
        <div
          className="pointer-events-none absolute inset-0 z-20"
          style={{
            backdropFilter: phase === 0 ? "blur(7px)" : "blur(0px)",
            WebkitBackdropFilter: phase === 0 ? "blur(7px)" : "blur(0px)",
            background: phase === 0 ? "rgba(10,8,6,0.4)" : "rgba(10,8,6,0)",
            transition:
              "backdrop-filter 1.3s ease, -webkit-backdrop-filter 1.3s ease, background 1.3s ease",
          }}
        />
      )}
      {phase < 2 && (
        <WallPlacard
          artist={artist}
          period={period}
          keyDates={keyDates}
          accent={accent}
          phase={phase}
        />
      )}

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
