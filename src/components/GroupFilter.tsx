"use client";
// Chips that show one group of server-rendered rows at a time: sets data-group on the wrapper and
// CSS hides the rest (see globals.css), so it works the same on the static site.
import { useState, type ReactNode } from "react";

export function GroupFilter({ groups, labels, counts, aria, className = "", children }: {
  groups: string[]; // first one is "all"
  labels: Record<string, string>;
  counts: Record<string, number>;
  aria: string;
  className?: string;
  children: ReactNode;
}) {
  const [group, setGroup] = useState(groups[0]);
  return (
    <>
      <div role="group" aria-label={aria} className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
        {groups.map((g, i) => {
          const on = g === group;
          return (
            <button
              key={g}
              type="button"
              aria-pressed={on}
              disabled={i > 0 && !counts[g]}
              onClick={() => setGroup(g)}
              className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                on ? "border-accent/60 bg-accent text-white shadow-[0_4px_14px_-6px_var(--accent)]" : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink"
              }`}
            >
              {labels[g]}
              <span className={`tabular rounded-full px-1.5 text-xs ${on ? "bg-white/20" : "bg-surface-3 text-muted"}`}>{counts[g] ?? 0}</span>
            </button>
          );
        })}
      </div>
      <div className={`board ${className}`} data-group={group}>
        {children}
      </div>
    </>
  );
}
