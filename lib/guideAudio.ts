"use client";

import { useSyncExternalStore } from "react";
import type { Locale } from "@/lib/i18n";

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

const BCP47: Record<Locale, string> = { en: "en-US", fr: "fr-FR", ja: "ja-JP" };

// The browser's own voice — every guide's fallback when the neural Ava voice is
// unavailable, at the same unhurried pace and the shared guide volume.
export function browserUtterance(
  text: string,
  locale: Locale,
): SpeechSynthesisUtterance {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = BCP47[locale];
  u.rate = 0.96;
  u.volume = getGuideVolume();
  const v = window.speechSynthesis
    .getVoices()
    .find((x) => x.lang?.toLowerCase().startsWith(locale));
  if (v) u.voice = v;
  return u;
}
