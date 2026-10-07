"use client";
import { usePathname } from "next/navigation";
import { STATIC_SITE } from "@/lib/static/mode";
import { appPathOf } from "@/lib/static/paths";
import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n/client";
import { LanguageSwitch } from "./LanguageSwitch";
import { ThemeCycle, ThemeSwitch } from "./ThemeSwitch";

export interface NavItem { href: string; label: string }

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** Icons are looked up by route so new pages only need a NAV entry; unknown routes get a dot. */
const ICONS: Record<string, ReactNode> = {
  "/": <><circle cx="12" cy="12" r="9" {...stroke} /><path d="M12 7v5l3 2" {...stroke} /></>,
  "/lineups": <><circle cx="8" cy="8" r="3" {...stroke} /><circle cx="17" cy="9" r="2.5" {...stroke} /><path d="M3 19c.6-3 2.6-5 5-5s4.4 2 5 5M14 18.5c.4-2.2 1.6-3.5 3-3.5s2.6 1.3 3 3.5" {...stroke} /></>,
  "/news": <><rect x="4" y="5" width="16" height="14" rx="2" {...stroke} /><path d="M8 9h8M8 13h8M8 17h5" {...stroke} /></>,
  "/schedule": <><rect x="4" y="5" width="16" height="15" rx="2" {...stroke} /><path d="M4 10h16M9 3v4M15 3v4" {...stroke} /></>,
  "/results": <><path d="M7 4h10v5a5 5 0 0 1-10 0V4ZM12 14v4M8 20h8M17 6h3a3 3 0 0 1-3 3M7 6H4a3 3 0 0 0 3 3" {...stroke} /></>,
  "/standings": <><path d="M5 20V10M12 20V4M19 20v-7" {...stroke} /></>,
  "/leaders": <><path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.3 7.2 18.9l.9-5.4-3.9-3.8 5.4-.8L12 4Z" {...stroke} /></>,
  "/model": <><path d="M4 19 9 13l4 3 7-9" {...stroke} /><path d="M15 7h5v5" {...stroke} /></>,
  "/bets": <><rect x="3" y="6" width="18" height="13" rx="2" {...stroke} /><path d="M3 10h18M7 15h3" {...stroke} /></>,
  "/odds": <><path d="M4 7h16M4 12h16M4 17h16M9 4v16" {...stroke} /></>,
  "/parlay": <><path d="M6 6h5v5H6zM13 13h5v5h-5zM11 8.5h4.5V13" {...stroke} /></>,
  "/roi": <><path d="M4 18h16M6 15l4-4 3 2 5-6" {...stroke} /><circle cx="18" cy="7" r="1.5" {...stroke} /></>,
  "/settings": <><circle cx="12" cy="12" r="3" {...stroke} /><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.7h4l.4-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z" {...stroke} /></>,
};

export function NavIcon({ href, className = "h-5 w-5" }: { href: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      {ICONS[href] ?? <circle cx="12" cy="12" r="3" fill="currentColor" />}
    </svg>
  );
}

// On the static site the URL carries the language and query folders (/fr/standings/_q/view=league/).
const useAppPath = () => {
  const p = usePathname();
  return STATIC_SITE ? appPathOf(p, "").path : p;
};
const isActive = (path: string, href: string) => (href === "/" ? path === "/" || path.startsWith("/game") : path.startsWith(href));

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <a href="/" className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-gradient-to-br from-accent to-[#1b2f7a] shadow-[0_6px_20px_-6px_var(--accent)]">
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
          <ellipse cx="12" cy="14.5" rx="7.5" ry="3.2" fill="#0b1220" />
          <ellipse cx="12" cy="11.5" rx="7.5" ry="3.2" fill="#e8eeff" />
        </svg>
      </span>
      {!compact && (
        <span className="font-display text-xl font-bold uppercase tracking-wide">
          Puck<span className="text-edge">Edge</span>
        </span>
      )}
    </a>
  );
}

/** Desktop: fixed left sidebar. */
export function Sidebar({ items }: { items: NavItem[] }) {
  const path = useAppPath();
  const { t } = useI18n();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[var(--sidebar)] flex-col border-r border-line bg-bg/80 px-4 py-5 backdrop-blur-xl lg:flex">
      <div className="flex items-center justify-between gap-2 px-2"><Logo /><LanguageSwitch /></div>
      <nav className="mt-8 flex flex-col gap-1 text-sm">
        <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{t.nav.menu}</div>
        {items.map((n) => {
          const active = isActive(path, n.href);
          return (
            <a
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 font-medium transition-colors ${
                active ? "bg-accent/15 text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
              }`}
            >
              {active && <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-accent" />}
              <NavIcon href={n.href} className={`h-[18px] w-[18px] ${active ? "text-accent-2" : "text-muted group-hover:text-ink-2"}`} />
              {n.label}
            </a>
          );
        })}
      </nav>
      <ThemeSwitch className="mt-auto" />
      <div className="mt-3 rounded-xl border border-line bg-surface p-3 text-xs leading-relaxed text-muted">
        {t.common.disclaimer}
      </div>
    </aside>
  );
}

const PRIMARY = ["/", "/schedule", "/results", "/bets"];

/** Phone/tablet: slim top bar plus a bottom tab bar; everything else lives under "More". */
export function MobileNav({ items }: { items: NavItem[] }) {
  const path = useAppPath();
  const primary = PRIMARY.map((h) => items.find((i) => i.href === h)).filter((i): i is NavItem => !!i);
  const more = items.filter((i) => !PRIMARY.includes(i.href));
  const moreActive = more.some((i) => isActive(path, i.href));
  const { t } = useI18n();
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-xl lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Logo />
          <div className="flex items-center gap-2">
          <LanguageSwitch />
          <ThemeCycle />
          <a href="/settings" aria-label={t.nav["/settings"]} className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-surface text-ink-2">
            <NavIcon href="/settings" className="h-[18px] w-[18px]" />
          </a>
          </div>
        </div>
      </header>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {primary.map((n) => {
            const active = isActive(path, n.href);
            return (
              <a key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${active ? "text-ink" : "text-muted"}`}>
                <span className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${active ? "bg-accent/20 text-accent-2" : ""}`}>
                  <NavIcon href={n.href} />
                </span>
                {n.label}
              </a>
            );
          })}
          <details className="group relative">
            <summary className={`flex list-none flex-col items-center gap-1 py-2.5 text-[11px] font-medium [&::-webkit-details-marker]:hidden ${moreActive ? "text-ink" : "text-muted"}`}>
              <span className={`grid h-7 w-12 place-items-center rounded-full ${moreActive ? "bg-accent/20 text-accent-2" : ""}`}>
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden><circle cx="5" cy="12" r="1.6" fill="currentColor" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /><circle cx="19" cy="12" r="1.6" fill="currentColor" /></svg>
              </span>
              {t.nav.more}
            </summary>
            <div className="absolute bottom-full right-2 mb-2 w-52 overflow-hidden rounded-2xl border border-line-strong bg-surface-2 p-1.5 shadow-2xl">
              {more.map((n) => (
                <a key={n.href} href={n.href} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${isActive(path, n.href) ? "bg-accent/15 text-ink" : "text-ink-2 hover:bg-surface-3"}`}>
                  <NavIcon href={n.href} className="h-[18px] w-[18px]" />
                  {n.label}
                </a>
              ))}
            </div>
          </details>
        </div>
      </nav>
    </>
  );
}
