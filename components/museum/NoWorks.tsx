"use client";

import Link from "next/link";
import { useT } from "@/components/LocaleProvider";

export default function NoWorks({ name }: { name: string }) {
  const t = useT();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center">
      <h1 className="font-display text-4xl text-ink">{name}</h1>
      <p className="max-w-md text-sm leading-relaxed text-ink-soft">
        {t("noWorksBody", { name })}
      </p>
      <Link
        href="/"
        className="rounded-full border border-line px-5 py-2.5 text-sm text-ink transition-colors hover:bg-bg-elev"
      >
        ← {t("backConstellation")}
      </Link>
    </main>
  );
}
