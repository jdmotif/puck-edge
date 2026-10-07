"use client";
// American / decimal switch for odds tables. Prices render in both formats (see <Odds>) and the
// choice, kept in this browser, flips a data attribute on <html> that CSS reads.
import { useEffect, useState } from "react";

const KEY = "puck-edge:odds-format";
type Fmt = "us" | "dec";

export function OddsFormat({ label, american, decimal }: { label: string; american: string; decimal: string }) {
  const [fmt, setFmt] = useState<Fmt>("us");
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(KEY);
    } catch {}
    if (saved === "dec") setFmt("dec");
  }, []);
  useEffect(() => {
    document.documentElement.dataset.odds = fmt;
  }, [fmt]);
  const pick = (f: Fmt) => {
    setFmt(f);
    try {
      window.localStorage.setItem(KEY, f);
    } catch {}
  };
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-full border border-line bg-surface p-1 text-sm">
      {([["us", american], ["dec", decimal]] as const).map(([k, l]) => (
        <button
          key={k}
          type="button"
          aria-pressed={fmt === k}
          onClick={() => pick(k)}
          className={`rounded-full px-3 py-1 font-medium transition-colors ${fmt === k ? "bg-accent text-white" : "text-muted hover:text-ink"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
