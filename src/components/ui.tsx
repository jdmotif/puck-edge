import type { ReactNode } from "react";
import { ago } from "@/lib/format";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-line bg-surface p-4 ${className}`}>{children}</section>;
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4">
      <h1 className="text-xl font-semibold tracking-tight">{children}</h1>
      {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
    </div>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "accent" }) {
  const tones = {
    neutral: "bg-surface-2 text-ink-2",
    good: "bg-good/15 text-good",
    warn: "bg-warn/15 text-warn",
    bad: "bg-bad/15 text-bad",
    accent: "bg-accent/15 text-accent",
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function TeamLogo({ abbrev, size = 28 }: { abbrev: string; size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`https://assets.nhle.com/logos/nhl/svg/${abbrev}_dark.svg`} alt={abbrev} width={size} height={size} className="shrink-0" />;
}

/** Shown whenever a page is rendering cached data because the live request failed. */
export function StaleBanner({ items }: { items: { fetchedAt: number; stale: boolean; error?: string; data?: unknown }[] }) {
  const stale = items.filter((i) => i.stale);
  if (!stale.length) return null;
  const missing = stale.filter((i) => i.data === null || i.fetchedAt === 0);
  const oldest = Math.min(...stale.filter((i) => i.fetchedAt > 0).map((i) => i.fetchedAt));
  return (
    <div role="status" className="mb-4 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
      {Number.isFinite(oldest) && <>Live data unavailable — showing data stale since {new Date(oldest).toLocaleString()} ({ago(oldest)}). </>}
      {missing.length > 0 && <>Some data couldn&apos;t be loaded ({missing[0].error}). </>}
      It will refresh automatically.
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">{children}</div>;
}

export function SkeletonCards({ n = 3, h = 140 }: { n?: number; h?: number }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: h }} />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-8" />
      ))}
    </div>
  );
}

export function Tabs({ tabs, active }: { tabs: { href: string; label: string; key: string }[]; active: string }) {
  return (
    <nav className="mb-4 flex gap-1 overflow-x-auto rounded-lg bg-surface p-1 text-sm">
      {tabs.map((t) => (
        <a
          key={t.key}
          href={t.href}
          className={`whitespace-nowrap rounded-md px-3 py-1.5 ${t.key === active ? "bg-surface-2 text-ink" : "text-muted hover:text-ink"}`}
        >
          {t.label}
        </a>
      ))}
    </nav>
  );
}
