"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AudioEngine, type ArtSubject, type Scene } from "@/lib/audio";

type AudioCtx = {
  ready: boolean;
  muted: boolean;
  volume: number;
  setMuted: (m: boolean) => void;
  setVolume: (v: number) => void;
  setScene: (s: Scene) => void;
  setFacing: (f: number) => void;
  setDepth: (d: number) => void;
  step: () => void;
  setArtwork: (s: ArtSubject | null) => void;
  setDucked: (d: boolean) => void;
  enterMuseum: () => void;
};

const Ctx = createContext<AudioCtx>({
  ready: false,
  muted: false,
  volume: 0.55,
  setMuted: () => {},
  setVolume: () => {},
  setScene: () => {},
  setFacing: () => {},
  setDepth: () => {},
  step: () => {},
  setArtwork: () => {},
  setDucked: () => {},
  enterMuseum: () => {},
});

export function AudioProvider({ children }: { children: ReactNode }) {
  const engineRef = useRef<AudioEngine | null>(null);
  const [ready, setReady] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [volume, setVolumeState] = useState(0.55);
  const pendingScene = useRef<Scene>("off");

  useEffect(() => {
    const sv = localStorage.getItem("audioVolume");
    const sm = localStorage.getItem("audioMuted");
    if (sv != null) setVolumeState(Math.max(0, Math.min(1, parseFloat(sv))));
    if (sm != null) setMutedState(sm === "1");
  }, []);

  // The browser only allows audio after a user gesture — create + start then.
  useEffect(() => {
    const init = () => {
      if (engineRef.current) return;
      try {
        const e = new AudioEngine();
        engineRef.current = e;
        e.setVolume(volume);
        e.setMuted(muted);
        e.setScene(pendingScene.current);
        void e.start().then(() => setReady(true));
      } catch {}
    };
    window.addEventListener("pointerdown", init, { once: true });
    window.addEventListener("keydown", init, { once: true });
    return () => {
      window.removeEventListener("pointerdown", init);
      window.removeEventListener("keydown", init);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setMuted = useCallback((m: boolean) => {
    setMutedState(m);
    engineRef.current?.setMuted(m);
    try {
      localStorage.setItem("audioMuted", m ? "1" : "0");
    } catch {}
  }, []);

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    engineRef.current?.setVolume(v);
    try {
      localStorage.setItem("audioVolume", String(v));
    } catch {}
  }, []);

  const setScene = useCallback((s: Scene) => {
    pendingScene.current = s;
    engineRef.current?.setScene(s);
  }, []);

  const setFacing = useCallback((f: number) => {
    engineRef.current?.setFacing(f);
  }, []);

  const setDepth = useCallback((d: number) => {
    engineRef.current?.setDepth(d);
  }, []);

  const step = useCallback(() => {
    engineRef.current?.step();
  }, []);

  const setArtwork = useCallback((s: ArtSubject | null) => {
    engineRef.current?.setArtwork(s);
  }, []);

  const setDucked = useCallback((d: boolean) => {
    engineRef.current?.setDucked(d);
  }, []);

  const enterMuseum = useCallback(() => {
    engineRef.current?.enterTransition();
  }, []);

  return (
    <Ctx.Provider
      value={{
        ready,
        muted,
        volume,
        setMuted,
        setVolume,
        setScene,
        setFacing,
        setDepth,
        step,
        setArtwork,
        setDucked,
        enterMuseum,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAudio() {
  return useContext(Ctx);
}
