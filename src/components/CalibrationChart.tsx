"use client";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";

export interface CalBucket { lo: number; hi: number; n: number; predicted: number | null; actual: number | null }

/** Predicted vs actual hit rate per 10% bucket. Points on the diagonal = well calibrated. */
export function CalibrationChart({ series }: { series: { label: string; color: string; buckets: CalBucket[] }[] }) {
  const { t, f } = useI18n();
  const [hover, setHover] = useState<{ s: string; b: CalBucket } | null>(null);
  const S = 260, pad = 28;
  const x = (v: number) => pad + v * (S - pad - 8);
  const y = (v: number) => S - pad - v * (S - pad - 8);
  const maxN = Math.max(1, ...series.flatMap((s) => s.buckets.map((b) => b.n)));
  return (
    <div className="relative">
      {series.length > 1 && (
        <div className="mb-1 flex gap-4 text-xs text-ink-2">
          {series.map((s) => <span key={s.label} className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.label}</span>)}
        </div>
      )}
      <svg viewBox={`0 0 ${S} ${S}`} className="w-full max-w-sm" role="img" aria-label={t.model.calAria}>
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1={x(0)} x2={x(1)} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={0.5} />
            <text x={x(0) - 4} y={y(v) + 3} fontSize="8" textAnchor="end" fill="var(--muted)">{f.pct(v)}</text>
            <text x={x(v)} y={S - pad + 12} fontSize="8" textAnchor="middle" fill="var(--muted)">{f.pct(v)}</text>
          </g>
        ))}
        <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke="var(--muted)" strokeDasharray="3 3" strokeWidth={1} />
        <text x={S / 2} y={S - 2} fontSize="8" textAnchor="middle" fill="var(--muted)">{t.model.predicted}</text>
        <text x={8} y={S / 2} fontSize="8" textAnchor="middle" fill="var(--muted)" transform={`rotate(-90 8 ${S / 2})`}>{t.model.actual}</text>
        {series.map((s) => {
          const pts = s.buckets.filter((b) => b.n > 0 && b.predicted !== null && b.actual !== null);
          return (
            <g key={s.label}>
              <polyline fill="none" stroke={s.color} strokeWidth={2} points={pts.map((b) => `${x(b.predicted!)},${y(b.actual!)}`).join(" ")} />
              {pts.map((b) => (
                <circle key={b.lo} cx={x(b.predicted!)} cy={y(b.actual!)} r={4 + 4 * Math.sqrt(b.n / maxN)} fill={s.color} stroke="var(--surface)" strokeWidth={2}
                  onMouseEnter={() => setHover({ s: s.label, b })} onMouseLeave={() => setHover(null)} />
              ))}
            </g>
          );
        })}
      </svg>
      {hover && (
        <div className="pointer-events-none absolute left-2 top-6 rounded-md border border-line bg-surface-2 px-2 py-1 text-xs shadow">
          <div className="font-medium">{hover.s} : {f.pct(hover.b.lo)}–{f.pct(hover.b.hi)}</div>
          <div className="tabular text-ink-2">{t.model.predicted} {f.pct(hover.b.predicted!, 1)} · {t.model.actual} {f.pct(hover.b.actual!, 1)} · n={hover.b.n}</div>
        </div>
      )}
    </div>
  );
}
