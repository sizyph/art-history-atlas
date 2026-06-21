import * as THREE from "three";

// A slowly-varying daylight state, shared between the sun (directional light),
// the skylight strip, and the god-ray shafts of skylit museums — so a long
// visit drifts from a neutral midday toward a warm, lower golden hour and back.
export const daylight = {
  warm: 0, // 0 = neutral midday, 1 = golden dusk
  level: 1, // overall daylight strength (dims a touch toward dusk)
};

const NOON_SHAFT = new THREE.Color("#fff1d4");
const DUSK_SHAFT = new THREE.Color("#ffb868");
const NOON_SKY = new THREE.Color("#fff3da");
const DUSK_SKY = new THREE.Color("#ffc279");

// Write the current shaft / skylight colour into `out` (no per-frame allocation).
export function shaftColor(out: THREE.Color): THREE.Color {
  return out.copy(NOON_SHAFT).lerp(DUSK_SHAFT, daylight.warm);
}
export function skyColor(out: THREE.Color): THREE.Color {
  return out.copy(NOON_SKY).lerp(DUSK_SKY, daylight.warm);
}

export function resetDaylight() {
  daylight.warm = 0;
  daylight.level = 1;
}
