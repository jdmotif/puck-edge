import type { CSSProperties, ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`card p-4 sm:p-5 ${className}`}>{children}</section>;
}

/** Small uppercase heading used inside cards and above sections. */
export function SectionTitle({ children, action, className = "" }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={`mb-3 flex items-center justify-between gap-2 ${className}`}>
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{children}</h2>
      {action}
    </div>
  );
}

export function PageTitle({ children, sub, eyebrow, actions }: { children: ReactNode; sub?: ReactNode; eyebrow?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 lg:mb-7">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-2">{eyebrow}</div>}
        <h1 className="font-display text-3xl font-bold uppercase leading-none tracking-wide sm:text-4xl">{children}</h1>
        {sub && <p className="mt-1.5 text-sm text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Pill-shaped link/button used for toolbar actions (date arrows, "Today", filters). */
export function ButtonLink({ href, children, active = false, label }: { href: string; children: ReactNode; active?: boolean; label?: string }) {
  return (
    <a
      href={href}
      aria-label={label}
      className={`inline-flex h-9 min-w-9 items-center justify-center rounded-full border px-3 text-sm font-medium transition-colors ${
        active ? "border-accent/60 bg-accent/15 text-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink"
      }`}
    >
      {children}
    </a>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "accent" | "edge" }) {
  const tones = {
    neutral: "bg-surface-3 text-ink-2 ring-line",
    good: "bg-good/12 text-good ring-good/25",
    warn: "bg-warn/12 text-warn ring-warn/25",
    bad: "bg-bad/12 text-bad ring-bad/25",
    accent: "bg-accent/15 text-accent-2 ring-accent/30",
    edge: "bg-edge/12 text-edge ring-edge/30",
  };
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${tones[tone]}`}>{children}</span>;
}

/** Big-number tile for KPI rows. */
export function StatTile({ label, value, hint, tone }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: "good" | "bad" | "edge" | "accent" }) {
  const color = tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : tone === "edge" ? "text-edge" : tone === "accent" ? "text-accent-2" : "text-ink";
  return (
    <div className="card px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className={`font-display tabular mt-1 text-2xl font-bold leading-none sm:text-3xl ${color}`}>{value}</div>
      {hint && <div className="mt-1 truncate text-xs text-muted">{hint}</div>}
    </div>
  );
}

/** Primary team colours for logo badges (logos come from the NHL CDN; the badge shows the abbreviation if they fail). */
export const TEAM_COLORS: Record<string, string> = {
  ANA: "#f47a38", BOS: "#fcb514", BUF: "#003087", CAR: "#ce1126", CBJ: "#002654", CGY: "#d2001c", CHI: "#cf0a2c", COL: "#6f263d",
  DAL: "#006847", DET: "#ce1126", EDM: "#ff4c00", FLA: "#c8102e", LAK: "#a2aaad", MIN: "#154734", MTL: "#af1e2d", NJD: "#ce1126",
  NSH: "#ffb81c", NYI: "#00539b", NYR: "#0038a8", OTT: "#c52032", PHI: "#f74902", PIT: "#fcb514", SEA: "#99d9d9", SJS: "#006d75",
  STL: "#002f87", TBL: "#002868", TOR: "#00205b", UTA: "#71afe5", VAN: "#00205b", VGK: "#b4975a", WPG: "#041e42", WSH: "#c8102e",
};

export function TeamLogo({ abbrev, size = 28 }: { abbrev: string; size?: number }) {
  const color = TEAM_COLORS[abbrev] ?? "#3d6bff";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://assets.nhle.com/logos/nhl/svg/${abbrev}_dark.svg`}
      alt={abbrev}
      data-abbr={abbrev}
      width={size}
      height={size}
      className="team-logo"
      style={{ width: size, height: size, padding: Math.round(size * 0.1), "--team": color, "--fs": `${Math.max(8, Math.round(size * 0.32))}px` } as CSSProperties}
    />
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong bg-surface/40 px-6 py-10 text-center text-sm text-muted">
      <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-surface-2 text-ink-2" aria-hidden>
        <svg viewBox="0 0 24 24" className="h-5 w-5"><ellipse cx="12" cy="14" rx="7" ry="3" fill="currentColor" opacity=".5" /><ellipse cx="12" cy="11" rx="7" ry="3" fill="currentColor" /></svg>
      </div>
      {children}
    </div>
  );
}

export function SkeletonCards({ n = 3, h = 140 }: { n?: number; h?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: h }} />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 8 }: { rows?: number }) {
  return (
    <div className="card space-y-2 p-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-8 !rounded-lg" />
      ))}
    </div>
  );
}

/** Segmented control. */
export function Tabs({ tabs, active }: { tabs: { href: string; label: string; key: string }[]; active: string }) {
  return (
    <nav className="mb-5 flex max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-surface p-1 text-sm sm:inline-flex">
      {tabs.map((t) => (
        <a
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? "page" : undefined}
          className={`whitespace-nowrap rounded-full px-4 py-1.5 font-medium transition-colors ${
            t.key === active ? "bg-accent text-white shadow-[0_4px_14px_-6px_var(--accent)]" : "text-muted hover:text-ink"
          }`}
        >
          {t.label}
        </a>
      ))}
    </nav>
  );
}

/** Renders a translated string, turning `backticked` spans into <code>. */
export function Rich({ text }: { text: string }) {
  return <>{text.split("`").map((part, i) => (i % 2 ? <code key={i} className="text-ink">{part}</code> : part))}</>;
}
