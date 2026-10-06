"use client";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";

/** Bankroll after each settled bet. Single series, crosshair tooltip. */
export function BankrollChart({ points, start }: { points: { t: number; v: number; label: string }[]; start: number }) {
  const { t: tr, f } = useI18n();
  const [hover, setHover] = useState<number | null>(null);
  const data = [{ t: points[0]?.t ?? Date.now(), v: start, label: tr.bets.start }, ...points];
  const W = 640, H = 200, padL = 48, padB = 18, padT = 10;
  const vals = data.map((d) => d.v);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || Math.max(1, Math.abs(hi) * 0.1);
  const min = lo - span * 0.1, max = hi + span * 0.1;
  const x = (i: number) => padL + (i / Math.max(1, data.length - 1)) * (W - padL - 8);
  const y = (v: number) => padT + (H - padT - padB) * (1 - (v - min) / (max - min));
  const ticks = [min + (max - min) * 0.1, (min + max) / 2, max - (max - min) * 0.1];
  const h = hover !== null ? data[hover] : null;
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={tr.bets.chartAria}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((px - padL) / (W - padL - 8)) * (data.length - 1));
          setHover(Math.max(0, Math.min(data.length - 1, i)));
        }}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={0.5} />
            <text x={padL - 6} y={y(t) + 3} fontSize="9" textAnchor="end" fill="var(--muted)">{f.money(Math.round(t), 0)}</text>
          </g>
        ))}
        <line x1={padL} x2={W} y1={y(start)} y2={y(start)} stroke="var(--muted)" strokeDasharray="3 3" strokeWidth={1} />
        <polyline fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" points={data.map((d, i) => `${x(i)},${y(d.v)}`).join(" ")} />
        {hover !== null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} stroke="var(--muted)" strokeWidth={0.5} />
            <circle cx={x(hover)} cy={y(data[hover].v)} r={4} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />
          </>
        )}
      </svg>
      {h && (
        <div className="pointer-events-none absolute left-14 top-2 rounded-md border border-line bg-surface-2 px-2 py-1 text-xs shadow">
          <div className="font-medium tabular">{f.money(h.v)}</div>
          <div className="text-ink-2">{h.label}</div>
        </div>
      )}
    </div>
  );
}
