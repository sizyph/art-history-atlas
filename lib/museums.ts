// Each "museum" is a complete visual identity for the 3D gallery: room
// proportions, wall/floor/ceiling materials, lighting mood, the opening
// transition, how the artist is presented, and a framing strategy. The default
// is the dark jewel-box we shipped first; the others evoke real museums.

import type { Locale } from "@/lib/i18n";

export type FloorKind =
  | "reflector" // dark mirror-polished (default)
  | "parquet" // warm herringbone wood (Orsay)
  | "plank" // pale timber boards (Chiba)
  | "concrete" // polished dark concrete (HongKun)
  | "stone"; // honed warm stone (Nezu)

export type WallKind =
  | "plaster" // smooth painted plaster
  | "stone" // pale Beaux-Arts stone
  | "timber" // wood-panelled
  | "concrete"; // board-formed concrete

export type CeilingKind =
  | "flat"
  | "vault" // barrel-vaulted with a skylight ridge (Orsay)
  | "clerestory" // bright slot of daylight near the top (Chiba)
  | "beam" // dark timber beams (Nezu)
  | "industrial"; // exposed pipes, ducts and track lighting (HongKun)

export type IntroKind =
  | "placard" // dim, read the left-wall placard, then turn to the room
  | "daylight" // eyes adjust from a bright wash; gentle drift in
  | "spotlight" // black, then the picture lights punch in one by one
  | "shoji"; // a slow warm fade with the paper screens glowing up

export type FrameStrategy =
  | "period" // curator frames each work to its era (default)
  | "salon" // gilded Salon frames throughout (Orsay)
  | "minimalWood" // slim natural-wood floaters (Chiba)
  | "contemporary" // black floaters / frameless (HongKun)
  | "nihon"; // dark wood + silk mat (Nezu)

export type DescMount = "wall" | "placard" | "scroll";

export type DescPalette = {
  panel: string; // panel background
  ink: string; // title / body
  body: string; // body text
  sub: string; // subtitle
  faint: string; // muted
  rule: "accent" | "ink";
};

export type Museum = {
  id: string;
  name: string; // dropdown label, e.g. "Musée d'Orsay, Paris"
  short: string;
  blurb: Record<Locale, string>;

  // architecture
  roomWidth: number;
  wallHeight: number;
  wall: string;
  wallKind: WallKind;
  wallRoughness: number;
  ceiling: string;
  ceilingKind: CeilingKind;
  floor: FloorKind;
  floorColor: string;
  shoji?: boolean; // glowing paper screens (Nezu)
  portal?: boolean; // an arched opening to an adjoining room (HongKun)

  // atmosphere / light
  bg: string;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  ambient: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  ceilLightColor: string;
  ceilLightIntensity: number;
  daylight?: { color: string; intensity: number; pos: [number, number, number] };
  exposure: number;
  bloom: number;
  bloomThreshold: number;
  vignette: number;
  pictureLight: { color: string; intensity: number; angle: number; show: boolean };

  // presentation
  intro: IntroKind;
  signature: string; // ties the entry transition + non-period accents together
  accentFromPeriod: boolean;
  frame: FrameStrategy;
  descMount: DescMount;
  desc: DescPalette;
};

const DARK_DESC: DescPalette = {
  panel: "#19140d",
  ink: "#efe7d7",
  body: "#c4baa6",
  sub: "#a99f8d",
  faint: "#9a8f7b",
  rule: "accent",
};

export const MUSEUMS: Museum[] = [
  {
    id: "default",
    name: "Constellation Gallery",
    short: "Constellation",
    blurb: {
      en: "An intimate jewel-box — dark walls, a mirror floor, a single spotlit work at a time.",
      fr: "Un écrin intime — murs sombres, sol miroir, une œuvre éclairée à la fois.",
      ja: "親密な宝石箱——暗い壁、鏡の床、一点ずつ照らされる作品。",
    },
    roomWidth: 9,
    wallHeight: 4.4,
    wall: "#1b1712",
    wallKind: "plaster",
    wallRoughness: 0.96,
    ceiling: "#0d0b09",
    ceilingKind: "flat",
    floor: "reflector",
    floorColor: "#13110d",
    bg: "#0b0a08",
    fogColor: "#0b0a08",
    fogNear: 9,
    fogFar: 42,
    ambient: 0.32,
    hemiSky: "#4a4230",
    hemiGround: "#0a0908",
    hemiIntensity: 0.42,
    ceilLightColor: "#ffe7c2",
    ceilLightIntensity: 7,
    exposure: 1.12,
    bloom: 0.5,
    bloomThreshold: 0.62,
    vignette: 0.72,
    pictureLight: { color: "#fff2dc", intensity: 42, angle: 0.66, show: true },
    intro: "placard",
    signature: "#c9a24b",
    accentFromPeriod: true,
    frame: "period",
    descMount: "wall",
    desc: DARK_DESC,
  },

  {
    id: "orsay",
    name: "Musée d'Orsay, Paris",
    short: "Orsay",
    blurb: {
      en: "A Beaux-Arts railway hall flooded with daylight — pale stone, a barrel vault, gilded frames.",
      fr: "Une gare Beaux-Arts inondée de lumière — pierre claire, voûte en berceau, cadres dorés.",
      ja: "陽光あふれるボザール様式の旧駅舎——淡い石、ヴォールト天井、金の額縁。",
    },
    roomWidth: 10,
    wallHeight: 5.8,
    wall: "#b6a987",
    wallKind: "stone",
    wallRoughness: 0.9,
    ceiling: "#d9cfb9",
    ceilingKind: "vault",
    floor: "parquet",
    floorColor: "#6f4d2e",
    bg: "#cabf9f",
    fogColor: "#cdc2a3",
    fogNear: 16,
    fogFar: 60,
    ambient: 0.82,
    hemiSky: "#fff4dc",
    hemiGround: "#75694c",
    hemiIntensity: 0.95,
    ceilLightColor: "#fff3da",
    ceilLightIntensity: 3,
    daylight: { color: "#fff6e6", intensity: 1.7, pos: [4, 9, 3] },
    exposure: 1.0,
    bloom: 0.34,
    bloomThreshold: 0.72,
    vignette: 0.34,
    pictureLight: { color: "#fff3df", intensity: 16, angle: 0.7, show: true },
    intro: "daylight",
    signature: "#c8a24b",
    accentFromPeriod: true,
    frame: "salon",
    descMount: "wall",
    desc: {
      panel: "#efe6d2",
      ink: "#2a2014",
      body: "#43382a",
      sub: "#6a5c44",
      faint: "#7c6e54",
      rule: "accent",
    },
  },

  {
    id: "chiba",
    name: "Eco-Friendly Art Museum, Chiba",
    short: "Chiba",
    blurb: {
      en: "Sustainable timber and soft clerestory daylight — pale wood, white walls, frameless calm.",
      fr: "Bois durable et lumière douce en clairevoie — bois clair, murs blancs, calme sans cadres.",
      ja: "持続可能な木材と高窓のやわらかな光——淡い木、白い壁、額装を抑えた静けさ。",
    },
    roomWidth: 9.5,
    wallHeight: 4.9,
    wall: "#e7e0d2",
    wallKind: "timber",
    wallRoughness: 0.85,
    ceiling: "#efe9dc",
    ceilingKind: "clerestory",
    floor: "plank",
    floorColor: "#caa878",
    bg: "#e8e3d6",
    fogColor: "#e9e4d7",
    fogNear: 18,
    fogFar: 64,
    ambient: 0.86,
    hemiSky: "#fbf6ea",
    hemiGround: "#8a7d63",
    hemiIntensity: 0.82,
    ceilLightColor: "#fbf4e6",
    ceilLightIntensity: 4,
    daylight: { color: "#fbf6ec", intensity: 1.2, pos: [-3, 9, 2] },
    exposure: 1.02,
    bloom: 0.3,
    bloomThreshold: 0.78,
    vignette: 0.3,
    pictureLight: { color: "#fffaf0", intensity: 9, angle: 0.8, show: true },
    intro: "daylight",
    signature: "#7d9b6a",
    accentFromPeriod: true,
    frame: "minimalWood",
    descMount: "placard",
    desc: {
      panel: "#f4f1e8",
      ink: "#26271f",
      body: "#3f4034",
      sub: "#6b6c5a",
      faint: "#7c7d6a",
      rule: "ink",
    },
  },

  {
    id: "hongkun",
    name: "HongKun Art Museum",
    short: "HongKun",
    blurb: {
      en: "A bright white-cube in a converted factory — exposed ducts and track lights, polished concrete, an arched portal.",
      fr: "Un white-cube lumineux dans une usine réhabilitée — gaines apparentes et rails de spots, béton poli, une arche.",
      ja: "改装された工場の明るいホワイトキューブ——剥き出しの配管とスポットレール、磨かれたコンクリート、アーチの開口。",
    },
    roomWidth: 10.5,
    wallHeight: 5.2,
    wall: "#eceae6",
    wallKind: "plaster",
    wallRoughness: 0.97,
    ceiling: "#34363a",
    ceilingKind: "industrial",
    floor: "concrete",
    floorColor: "#54565a",
    portal: true,
    bg: "#dadbdc",
    fogColor: "#dfe0e1",
    fogNear: 18,
    fogFar: 66,
    ambient: 0.72,
    hemiSky: "#f4f5f7",
    hemiGround: "#9a9ca0",
    hemiIntensity: 0.72,
    ceilLightColor: "#ffffff",
    ceilLightIntensity: 5,
    exposure: 1.02,
    bloom: 0.3,
    bloomThreshold: 0.82,
    vignette: 0.34,
    pictureLight: { color: "#ffffff", intensity: 13, angle: 0.82, show: true },
    intro: "daylight",
    signature: "#4a4e54",
    accentFromPeriod: false,
    frame: "contemporary",
    descMount: "placard",
    desc: {
      panel: "#1b1c1e",
      ink: "#f0f1f3",
      body: "#c7c9cd",
      sub: "#9a9da3",
      faint: "#83868c",
      rule: "ink",
    },
  },

  {
    id: "nezu",
    name: "Nezu Museum, Tokyo",
    short: "Nezu",
    blurb: {
      en: "A quiet world of dark timber and paper light — honed stone underfoot, antiquities in hush.",
      fr: "Un monde calme de bois sombre et de lumière de papier — pierre polie, antiquités feutrées.",
      ja: "暗い木と紙の光の静かな世界——磨かれた石の床、ひそやかな古美術。",
    },
    roomWidth: 8.6,
    wallHeight: 4.0,
    wall: "#2b221a",
    wallKind: "timber",
    wallRoughness: 0.84,
    ceiling: "#191510",
    ceilingKind: "beam",
    floor: "stone",
    floorColor: "#2f2b23",
    shoji: true,
    bg: "#0d0b08",
    fogColor: "#0e0b07",
    fogNear: 9,
    fogFar: 38,
    ambient: 0.3,
    hemiSky: "#5a4630",
    hemiGround: "#0a0805",
    hemiIntensity: 0.4,
    ceilLightColor: "#ffdcab",
    ceilLightIntensity: 3.4,
    exposure: 1.0,
    bloom: 0.32,
    bloomThreshold: 0.66,
    vignette: 0.74,
    pictureLight: { color: "#ffe6c2", intensity: 22, angle: 0.6, show: true },
    intro: "shoji",
    signature: "#9a7b3c",
    accentFromPeriod: true,
    frame: "nihon",
    descMount: "scroll",
    desc: {
      panel: "#1c1710",
      ink: "#ece1cb",
      body: "#cabd9f",
      sub: "#a08e6a",
      faint: "#8c7b59",
      rule: "accent",
    },
  },
];

export const DEFAULT_MUSEUM = MUSEUMS[0];

export function getMuseum(id: string | null | undefined): Museum {
  return MUSEUMS.find((m) => m.id === id) ?? DEFAULT_MUSEUM;
}

// ---- Framing -------------------------------------------------------------

// How much a painting's era wants ornament, 0 (modern, frameless) → 1 (heavy gilt).
const PERIOD_ORNATE: Record<string, number> = {
  "Medieval & Gothic": 0.85,
  "Early Renaissance": 0.9,
  "High Renaissance": 1,
  "Northern Renaissance": 0.95,
  Baroque: 1,
  Rococo: 1,
  Neoclassicism: 0.85,
  Romanticism: 0.7,
  Realism: 0.55,
  Impressionism: 0.5,
  "Post-Impressionism": 0.4,
  Expressionism: 0.2,
  Cubism: 0.1,
  Surrealism: 0.15,
  "Abstract Expressionism": 0.05,
  "Pop Art": 0.05,
  Contemporary: 0.05,
};

function ornateScore(periodName: string | null, year: number | null): number {
  if (periodName && periodName in PERIOD_ORNATE) return PERIOD_ORNATE[periodName];
  if (year == null) return 0.5;
  if (year < 1600) return 0.95;
  if (year < 1780) return 0.95;
  if (year < 1850) return 0.75;
  if (year < 1890) return 0.5;
  if (year < 1915) return 0.35;
  return 0.1;
}

export type FrameProfile = {
  style: "ornate" | "wood" | "float" | "none" | "silk";
  border: number; // face width of the moulding (m)
  depth: number; // projection from the wall (m)
  color: string;
  metalness: number;
  roughness: number;
  mat: number; // mat reveal around the canvas (0 = none)
  matColor: string;
  lip: boolean; // bright relief lip next to the canvas
  steps: 1 | 2 | 3; // concentric mouldings (carved depth)
  gap: number; // shadow gap for float frames
};

// A frame is chosen from the museum's strategy *and* the painting's era — the
// way a curator would dress each work for a temporary hang.
export function frameProfile(
  museum: Museum,
  periodName: string | null,
  year: number | null,
  accent: string,
): FrameProfile {
  const orn = ornateScore(periodName, year);

  const GOLD = "#b08a3c";
  const DARKGOLD = "#8a6a2c";

  switch (museum.frame) {
    case "salon": {
      // Orsay: a gilded Salon frame on everything, richer for older works.
      const rich = orn > 0.6;
      return {
        style: "ornate",
        border: rich ? 0.2 : 0.13,
        depth: rich ? 0.14 : 0.1,
        color: GOLD,
        metalness: 0.85,
        roughness: 0.36,
        mat: orn < 0.45 ? 0.07 : 0,
        matColor: "#efe7d2",
        lip: true,
        steps: rich ? 3 : 2,
        gap: 0,
      };
    }
    case "minimalWood": {
      // Chiba: slim natural-wood floaters; the most modern works go frameless.
      if (orn < 0.18)
        return {
          style: "none",
          border: 0.02,
          depth: 0.04,
          color: "#caa878",
          metalness: 0,
          roughness: 0.7,
          mat: 0,
          matColor: "#000",
          lip: false,
          steps: 1,
          gap: 0,
        };
      return {
        style: "wood",
        border: 0.05,
        depth: 0.06,
        color: "#c39f6e",
        metalness: 0,
        roughness: 0.66,
        mat: 0,
        matColor: "#000",
        lip: false,
        steps: 1,
        gap: 0.012,
      };
    }
    case "contemporary": {
      // HongKun: black floaters, frameless for the newest works.
      if (orn < 0.25)
        return {
          style: "none",
          border: 0.02,
          depth: 0.05,
          color: "#0c0c0d",
          metalness: 0,
          roughness: 0.5,
          mat: 0,
          matColor: "#000",
          lip: false,
          steps: 1,
          gap: 0,
        };
      return {
        style: "float",
        border: 0.035,
        depth: 0.07,
        color: "#0d0d0f",
        metalness: 0.1,
        roughness: 0.45,
        mat: 0,
        matColor: "#000",
        lip: false,
        steps: 1,
        gap: 0.02,
      };
    }
    case "nihon": {
      // Nezu: restrained dark wood with a wide silk/linen mat.
      return {
        style: "silk",
        border: 0.06,
        depth: 0.07,
        color: "#241b12",
        metalness: 0,
        roughness: 0.6,
        mat: 0.12,
        matColor: "#cdbfa0",
        lip: false,
        steps: 1,
        gap: 0,
      };
    }
    default: {
      // "period" — the default gallery dresses each work to its time.
      if (orn >= 0.8)
        return {
          style: "ornate",
          border: 0.19,
          depth: 0.14,
          color: GOLD,
          metalness: 0.8,
          roughness: 0.4,
          mat: 0,
          matColor: "#efe7d2",
          lip: true,
          steps: 3,
          gap: 0,
        };
      if (orn >= 0.45)
        return {
          style: "ornate",
          border: 0.12,
          depth: 0.1,
          color: DARKGOLD,
          metalness: 0.6,
          roughness: 0.45,
          mat: 0,
          matColor: "#efe7d2",
          lip: true,
          steps: 2,
          gap: 0,
        };
      if (orn >= 0.2)
        return {
          style: "wood",
          border: 0.06,
          depth: 0.07,
          color: accent,
          metalness: 0.35,
          roughness: 0.5,
          mat: 0,
          matColor: "#000",
          lip: false,
          steps: 1,
          gap: 0,
        };
      return {
        style: "float",
        border: 0.03,
        depth: 0.06,
        color: "#15120d",
        metalness: 0.2,
        roughness: 0.5,
        mat: 0,
        matColor: "#000",
        lip: false,
        steps: 1,
        gap: 0.018,
      };
    }
  }
}
