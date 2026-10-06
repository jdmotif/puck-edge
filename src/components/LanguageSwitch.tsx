"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocale } from "@/lib/i18n/actions";
import { LOCALES } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";
import { BASE_PATH, STATIC_SITE } from "@/lib/static/mode";
import { LANG_KEY, otherLanguageHref } from "@/lib/static/paths";

/** EN | FR segmented toggle. The choice is saved in a cookie and the page re-renders in place. */
export function LanguageSwitch({ className = "" }: { className?: string }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div role="group" aria-label={t.lang.switchTo} className={`inline-flex rounded-full border border-line bg-surface p-0.5 text-[11px] font-semibold ${pending ? "opacity-60" : ""} ${className}`}>
      {LOCALES.map((l) => {
        const active = l === locale;
        return (
          <button
            key={l}
            type="button"
            lang={l}
            aria-pressed={active}
            title={l === "en" ? "English" : "Français"}
            disabled={pending}
            onClick={() => {
              if (active) return;
              if (STATIC_SITE) {
                // Static site: each language is its own set of pages.
                try {
                  localStorage.setItem(LANG_KEY, l);
                } catch {}
                window.location.href = otherLanguageHref(BASE_PATH, l === "fr");
                return;
              }
              start(async () => {
                await setLocale(l);
                document.documentElement.lang = l;
                router.refresh();
              });
            }}
            className={`rounded-full px-2.5 py-1 uppercase tracking-wide transition-colors ${active ? "bg-accent text-white" : "text-muted hover:text-ink"}`}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}
