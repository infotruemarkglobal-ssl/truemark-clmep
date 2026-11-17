"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Globe } from "lucide-react";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/i18n/locales";

const LOCALE_LABELS: Record<SupportedLocale, string> = { en: "English", fr: "Français" };

export default function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations("Verify");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(next: string) {
    startTransition(async () => {
      await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
      router.refresh();
    });
  }

  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-slate-300">
      <Globe className="w-3.5 h-3.5" aria-hidden="true" />
      <span className="sr-only">{t("language")}</span>
      <select
        value={locale}
        disabled={isPending}
        onChange={(e) => handleChange(e.target.value)}
        className="bg-transparent border border-slate-600 rounded-md px-1.5 py-0.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
      >
        {SUPPORTED_LOCALES.map((l) => (
          <option key={l} value={l} className="text-slate-900">
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
