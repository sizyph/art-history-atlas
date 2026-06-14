"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { type Locale, translate } from "@/lib/i18n";

type Ctx = { locale: Locale; setLocale: (l: Locale) => void };
const LocaleContext = createContext<Ctx>({ locale: "en", setLocale: () => {} });

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  // Read the stored / browser preference after hydration (initial render stays
  // "en" on both server and client, so there is no hydration mismatch).
  useEffect(() => {
    const stored = localStorage.getItem("locale");
    if (stored === "en" || stored === "fr" || stored === "ja") {
      setLocaleState(stored);
      return;
    }
    const nav = navigator.language.slice(0, 2);
    if (nav === "fr" || nav === "ja") setLocaleState(nav);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem("locale", l);
    } catch {}
  }, []);

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}

/** Returns a `t(key, vars?)` bound to the active locale. */
export function useT() {
  const { locale } = useContext(LocaleContext);
  return (key: string, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);
}
