"use client";

import { useLocale } from "@/components/LocaleProvider";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n";

export default function LangSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useLocale();
  return (
    <div className={`pointer-events-auto flex items-center gap-0.5 ${className ?? ""}`}>
      {LOCALES.map((l, i) => (
        <span key={l} className="flex items-center">
          {i > 0 && <span className="px-1 text-[10px] text-ink-faint/50">·</span>}
          <button
            onClick={() => setLocale(l)}
            aria-pressed={locale === l}
            className="text-[11px] tracking-wide transition-colors hover:text-ink"
            style={{ color: locale === l ? "var(--gold)" : "var(--ink-faint)" }}
          >
            {LOCALE_LABELS[l]}
          </button>
        </span>
      ))}
    </div>
  );
}
