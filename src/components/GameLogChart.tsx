"use client";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";

export interface LogPoint {
  date: string;
  opp: string;
  home: boolean;
  a: number; // first series (e.g. goals)
  b: number; // second series stacked on top (e.g. assists)
  extra?: string; // tooltip line
}

/** Stacked bars per game (series A bottom, B top) with hover tooltip. One y-axis. */
export function GameLogChart({ points, labelA, labelB }: { points: LogPoint[]; labelA: string; labelB?: string }) {
  const { t } = useI18n();
  const [hover, setHover] = useState<number | null>(null);
  if (!points.length) return null;
  const W = 640, H = 180, padL = 24, padB = 18, padT = 8;
  const max = Math.max(3, ...points.map((p) => p.a + p.b));
  const innerW = W - padL - 4;
  const step = innerW / points.length;
  const bw = Math.max(2, Math.min(18, step - 2));
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const ticks = Array.from({ length: max + 1 }, (_, i) => i).filter((t) => max <= 5 || t % 2 === 0);
  const h = hover !== null ? points[hover] : null;
  return (
    <div className="relative">
      {labelB && (
        <div className="mb-1 flex gap-4 text-xs text-ink-2">
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-s1" />{labelA}</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-s2" />{labelB}</span>
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t.player.by(labelA, labelB)} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={t === 0 ? 1 : 0.5} />
            <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill="var(--muted)">{t}</text>
          </g>
        ))}
        {points.map((p, i) => {
          const x = padL + i * step + (step - bw) / 2;
          const ya = y(p.a), yb = y(p.a + p.b);
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={padL + i * step} y={padT} width={step} height={H - padT - padB} fill="transparent" />
              {p.a > 0 && <rect x={x} y={ya} width={bw} height={y(0) - ya} rx={Math.min(3, bw / 2)} fill="var(--series-1)" opacity={hover === null || hover === i ? 1 : 0.5} />}
              {p.b > 0 && <rect x={x} y={yb} width={bw} height={Math.max(0, ya - yb - (p.a > 0 ? 2 : 0))} rx={Math.min(3, bw / 2)} fill="var(--series-2)" opacity={hover === null || hover === i ? 1 : 0.5} />}
              {p.a + p.b === 0 && <rect x={x} y={y(0) - 1.5} width={bw} height={1.5} fill="var(--muted)" />}
            </g>
          );
        })}
        <text x={padL} y={H - 4} fontSize="9" fill="var(--muted)">{points[0].date}</text>
        <text x={W - 2} y={H - 4} fontSize="9" textAnchor="end" fill="var(--muted)">{points[points.length - 1].date}</text>
      </svg>
      {h && (
        <div className="pointer-events-none absolute right-2 top-6 rounded-md border border-line bg-surface-2 px-2 py-1 text-xs shadow">
          <div className="font-medium">{h.date} {h.home ? t.common.vs(h.opp) : t.common.at(h.opp)}</div>
          <div className="tabular text-ink-2">{labelA} {h.a}{labelB ? ` · ${labelB} ${h.b}` : ""}</div>
          {h.extra && <div className="text-ink-2">{h.extra}</div>}
        </div>
      )}
    </div>
  );
}
