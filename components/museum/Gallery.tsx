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
import {
  frameProfile,
  type DescPalette,
  type FrameProfile,
  type Museum,
} from "@/lib/museums";
import { makeWood, makeConcrete, makeStone } from "@/components/museum/textures";

const SPACING = 3.6;
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

function useHangs(
  paintings: Painting[],
  roomWidth: number,
  descReserve: number,
): {
  hangs: Hang[];
  depth: number;
  descZ: number;
} {
  return useMemo(() => {
    const DESC = descReserve; // left-wall length reserved for the description
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
  }, [paintings, roomWidth, descReserve]);
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

function PaintingFrame({
  hang,
  prof,
  light,
  onInspect,
}: {
  hang: Hang;
  prof: FrameProfile;
  light: Museum["pictureLight"];
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
  const fh = h + (prof.mat + prof.border) * 2;

  return (
    <group position={hang.position} rotation={hang.rotation}>
      <Moulding w={w} h={h} prof={prof} />
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
            <meshBasicMaterial color="#fff3da" toneMapped={false} />
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
          {[-1, 1].map((s) => (
            <mesh
              key={s}
              position={[s * (W / 2 - 0.05), H - 0.5, 0]}
              rotation={[0, -s * (Math.PI / 2), 0]}
            >
              <planeGeometry args={[depth - 1, 0.7]} />
              <meshBasicMaterial color="#fbf4e6" toneMapped={false} />
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
      {/* far wall */}
      <mesh receiveShadow position={[0, H / 2, -depth / 2]}>
        <planeGeometry args={[W, H]} />
        {wallMat}
      </mesh>
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
    </group>
  );
}

function Player({
  depth,
  roomWidth,
  enabled,
  onStep,
  onDepth,
}: {
  depth: number;
  roomWidth: number;
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
    const hx = roomWidth / 2 - 0.7;
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

// The entry adapts to the museum: a dim placard read (default), a bright
// daylight wash that the eye settles out of (Orsay/Chiba), spotlights punching
// in from black (HongKun), or a slow warm paper-screen fade (Nezu).
function IntroCamera({
  museum,
  active,
  onTurning,
  onDone,
}: {
  museum: Museum;
  active: boolean;
  onTurning: () => void;
  onDone: () => void;
}) {
  const { camera } = useThree();
  const start = useRef<number | null>(null);
  const turned = useRef(false);
  const done = useRef(false);
  const lit = useRef(
    museum.intro === "spotlight"
      ? 0
      : museum.intro === "shoji"
        ? 0.05
        : museum.intro === "daylight"
          ? 1
          : 0.32,
  );

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
    const gl = state.gl as THREE.WebGLRenderer;
    if (start.current === null) {
      start.current = state.clock.elapsedTime;
      if (museum.intro === "placard") camera.rotation.y = 0.06;
      else if (museum.intro === "daylight") {
        camera.rotation.y = 0.1;
        camera.rotation.x = 0.1;
      } else camera.rotation.y = 0;
    }
    const e = state.clock.elapsedTime - start.current;

    const finish = () => {
      done.current = true;
      camera.rotation.y = 0;
      camera.rotation.x = 0;
      setLights(state, 1);
      gl.toneMappingExposure = museum.exposure;
      onDone();
    };
    const turn = () => {
      if (!turned.current) {
        turned.current = true;
        onTurning();
      }
    };

    if (museum.intro === "daylight") {
      turn();
      camera.rotation.y += (0 - camera.rotation.y) * 0.05;
      camera.rotation.x += (0 - camera.rotation.x) * 0.05;
      lit.current += (1 - lit.current) * 0.05;
      setLights(state, lit.current);
      const k = Math.min(1, e / 1.8);
      gl.toneMappingExposure = museum.exposure * (1.85 - 0.85 * k);
      if (e > 2.0) finish();
    } else if (museum.intro === "spotlight") {
      if (e < 0.55) {
        setLights(state, 0);
      } else {
        turn();
        lit.current += (1 - lit.current) * 0.1;
        setLights(state, lit.current);
      }
      if (e > 1.7) finish();
    } else if (museum.intro === "shoji") {
      if (e > 0.3) turn();
      lit.current += (1 - lit.current) * 0.035;
      setLights(state, lit.current);
      camera.rotation.y += (0 - camera.rotation.y) * 0.04;
      const k = Math.min(1, e / 2.2);
      gl.toneMappingExposure = museum.exposure * (0.7 + 0.3 * k);
      if (e > 2.4) finish();
    } else {
      // placard
      let targetYaw: number;
      let targetLit: number;
      if (e < INTRO_READ) {
        targetYaw = 1.2;
        targetLit = 0.32;
      } else {
        targetYaw = 0;
        targetLit = 1;
        turn();
      }
      camera.rotation.y += (targetYaw - camera.rotation.y) * 0.07;
      lit.current += (targetLit - lit.current) * 0.05;
      setLights(state, lit.current);
      if (e > INTRO_READ + INTRO_TURN) finish();
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

export default function Gallery({
  museum,
  artist,
  period,
  paintings,
  intro = false,
}: {
  museum: Museum;
  artist: Artist;
  period: Period | null;
  paintings: Painting[];
  intro?: boolean;
}) {
  const descReserve = museum.descMount === "wall" ? 3.6 : 1.9;
  const { hangs, depth, descZ } = useHangs(
    paintings,
    museum.roomWidth,
    descReserve,
  );
  const accent = museum.accentFromPeriod
    ? (period?.color ?? museum.signature)
    : museum.signature;
  const periodNameStr = period?.name ?? null;
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
              />
            );
          },
        )}
        <Room museum={museum} depth={depth} />
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
                prof={frameProfile(museum, periodNameStr, hang.p.year, accent)}
                light={museum.pictureLight}
                onInspect={onInspect}
              />
            </Suspense>
          </TexBoundary>
        ))}

        <Player
          depth={depth}
          roomWidth={museum.roomWidth}
          enabled={moving}
          onStep={step}
          onDepth={setGalleryDepth}
        />
        <Controls didDrag={didDrag} enabled={looking} />
        {intro && (
          <IntroCamera
            museum={museum}
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
          <div
            className="mt-0.5 text-[10px] uppercase tracking-[0.22em]"
            style={{ color: museum.signature }}
          >
            {museum.name}
          </div>
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
