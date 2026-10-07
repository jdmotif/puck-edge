import { todayIso } from "@/lib/nhl/client";
import { getI18n } from "@/lib/i18n/server";
import { ButtonLink } from "./ui";

export const shift = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);

/** Yesterday … a few days ahead, as one row of chips (scrolls sideways on a phone). */
export async function DayStrip({ date, base }: { date: string; base: string }) {
  const { t, f } = await getI18n();
  const today = todayIso();
  // A phone shows the day before to two days after; wider screens three either side.
  const days = [-3, -2, -1, 0, 1, 2, 3].map((n) => ({ d: shift(date, n), wide: n < -1 || n > 2 }));
  const name = (d: string) =>
    d === today ? t.common.today : d === shift(today, -1) ? t.tonight.yesterday : d === shift(today, 1) ? t.tonight.tomorrow : f.day(d, { weekday: "short" });
  return (
    <nav aria-label={t.common.date} className="-mx-4 mb-5 flex items-center gap-1.5 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
      <ButtonLink href={`${base}?date=${shift(date, -7)}`} label={t.common.prevDay}>«</ButtonLink>
      {days.map(({ d, wide }) => {
        const on = d === date;
        return (
          <a
            key={d}
            href={d === today ? base : `${base}?date=${d}`}
            aria-current={on ? "date" : undefined}
            className={`${wide ? "hidden sm:flex" : "flex"} min-w-[4.25rem] shrink-0 flex-col items-center rounded-xl border px-2.5 py-1.5 leading-tight transition-colors ${
              on ? "border-accent/60 bg-accent text-white shadow-[0_4px_14px_-6px_var(--accent)]" : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink"
            }`}
          >
            <span className={`text-[10px] font-semibold uppercase tracking-[0.1em] ${on ? "text-white/80" : "text-muted"}`}>{name(d)}</span>
            <span className="font-display text-base font-bold">{f.day(d, { month: "short", day: "numeric" })}</span>
          </a>
        );
      })}
      <ButtonLink href={`${base}?date=${shift(date, 7)}`} label={t.common.nextDay}>»</ButtonLink>
    </nav>
  );
}

