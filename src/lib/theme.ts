// Light / dark theme. The choice ("system", "light" or "dark") is kept in this browser; an inline
// script in <head> resolves it to data-theme="light|dark" on <html> before the first paint, follows
// the device setting while on "system", and re-applies when another tab changes it.
export const THEME_KEY = "puck-edge:theme";
export const THEMES = ["system", "light", "dark"] as const;
export type ThemeChoice = (typeof THEMES)[number];

export function themeBoot(key: string) {
  const root = document.documentElement;
  const media = window.matchMedia("(prefers-color-scheme: light)");
  const apply = () => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(key);
    } catch {}
    root.dataset.theme = saved === "light" || saved === "dark" ? saved : media.matches ? "light" : "dark";
  };
  apply();
  media.addEventListener("change", apply);
  window.addEventListener("storage", (e) => {
    if (e.key === key) apply();
  });
  (window as unknown as { __peTheme?: () => void }).__peTheme = apply;
}

export const themeScript = () => `(${themeBoot.toString()})(${JSON.stringify(THEME_KEY)});`;
