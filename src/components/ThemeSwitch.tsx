"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { THEME_KEY, THEMES, type ThemeChoice } from "@/lib/theme";

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const ICONS: Record<ThemeChoice, React.ReactNode> = {
  system: <><rect x="3" y="4" width="18" height="12" rx="2" {...stroke} /><path d="M8 20h8M12 16v4" {...stroke} /></>,
  light: <><circle cx="12" cy="12" r="4" {...stroke} /><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" {...stroke} /></>,
  dark: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" {...stroke} />,
};
const Icon = ({ k, className = "h-4 w-4" }: { k: ThemeChoice; className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden>{ICONS[k]}</svg>
);

function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  useEffect(() => {
    const read = () => {
      let saved: string | null = null;
      try {
        saved = window.localStorage.getItem(THEME_KEY);
      } catch {}
      setChoice(saved === "light" || saved === "dark" ? saved : "system");
    };
    read();
    const onStorage = (e: StorageEvent) => e.key === THEME_KEY && read();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const pick = (c: ThemeChoice) => {
    setChoice(c);
    try {
      if (c === "system") window.localStorage.removeItem(THEME_KEY);
      else window.localStorage.setItem(THEME_KEY, c);
    } catch {}
    (window as unknown as { __peTheme?: () => void }).__peTheme?.();
  };
  return [choice, pick] as const;
}

/** System / Light / Dark segmented control (sidebar and Settings). */
export function ThemeSwitch({ className = "" }: { className?: string }) {
  const { t } = useI18n();
  const [choice, pick] = useTheme();
  return (
    <div role="group" aria-label={t.theme.label} className={`grid grid-cols-3 rounded-full border border-line bg-surface p-0.5 text-xs font-medium ${className}`}>
      {THEMES.map((k) => (
        <button
          key={k}
          type="button"
          aria-pressed={choice === k}
          onClick={() => pick(k)}
          className={`flex items-center justify-center gap-1.5 rounded-full px-2.5 py-1.5 transition-colors ${choice === k ? "bg-accent text-white" : "text-muted hover:text-ink"}`}
        >
          <Icon k={k} className="h-3.5 w-3.5" />
          {t.theme[k]}
        </button>
      ))}
    </div>
  );
}

/** One icon button for the phone header: each tap moves System → Light → Dark. */
export function ThemeCycle({ className = "" }: { className?: string }) {
  const { t } = useI18n();
  const [choice, pick] = useTheme();
  const next = THEMES[(THEMES.indexOf(choice) + 1) % THEMES.length];
  const label = t.theme.cycle(t.theme[choice]);
  return (
    <button
      type="button"
      onClick={() => pick(next)}
      aria-label={label}
      title={label}
      className={`grid h-9 w-9 place-items-center rounded-xl border border-line bg-surface text-ink-2 ${className}`}
    >
      <Icon k={choice} className="h-[18px] w-[18px]" />
    </button>
  );
}
