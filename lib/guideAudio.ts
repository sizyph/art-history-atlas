"use client";

import { useSyncExternalStore } from "react";

// One volume shared by every audio guide (paintings + artist bios), persisted.
const KEY = "guideVolume";
let vol = 1;
let loaded = false;
const subs = new Set<() => void>();

function ensure() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  const s = localStorage.getItem(KEY);
  if (s != null) vol = Math.max(0, Math.min(1, parseFloat(s)));
}

export function getGuideVolume(): number {
  ensure();
  return vol;
}

export function setGuideVolume(v: number) {
  vol = Math.max(0, Math.min(1, v));
  try {
    localStorage.setItem(KEY, String(vol));
  } catch {}
  subs.forEach((f) => f());
}

function subscribe(f: () => void) {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
}

export function useGuideVolume(): [number, (v: number) => void] {
  const v = useSyncExternalStore(subscribe, getGuideVolume, () => 1);
  return [v, setGuideVolume];
}
