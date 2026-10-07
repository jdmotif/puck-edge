"use client";
import { useMemo, useState } from "react";
import { american } from "@/lib/format";
import { parseOdds } from "@/lib/model/math";
import { useI18n } from "@/lib/i18n/client";
import { Card, Empty, Pill, TeamLogo } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";

export interface ParlayLeg {
  key: string; // gameId:market:team
  label: string;
  p: number; // Puck Edge's chance: market moved toward the model
  fair: number; // margin-free market chance
  odds: number; // best decimal price
  book: string;
}

export interface ParlayGame {
  id: number;
  away: string;
  home: string;
  start: string;
  legs: ParlayLeg[];
}

function Price({ d }: { d: number }) {
  const { f } = useI18n();
  return (
    <span className="tabular">
      <span className="odds-us">{american(d)}</span>
      <span className="odds-dec">{f.decimal(d)}</span>
    </span>
  );
}

/** Pick one leg per game, then compare the parlay's price with its chance of winning. */
export function ParlayChecker({ games, dateLabel }: { games: ParlayGame[]; dateLabel: string }) {
  const { t, f } = useI18n();
  const P = t.parlay;
  const [chosen, setChosen] = useState<Record<number, string>>({}); // game id → leg key
  const [raw, setRaw] = useState("");
  const legs = useMemo(
    () => games.flatMap((g) => g.legs.filter((l) => chosen[g.id] === l.key).map((l) => ({ ...l, game: `${g.away} @ ${g.home}`, gameId: g.id }))),
    [games, chosen],
  );
  if (!games.length) return <Empty>{P.noGames}</Empty>;

  const toggle = (gameId: number, key: string) =>
    setChosen((c) => {
      const next = { ...c };
      if (next[gameId] === key) delete next[gameId];
      else next[gameId] = key;
      return next;
    });
  const pOurs = legs.reduce((s, l) => s * l.p, 1);
  const pMarket = legs.reduce((s, l) => s * l.fair, 1);
  const bestPrice = legs.reduce((s, l) => s * l.odds, 1);
  const typed = raw.trim() ? parseOdds(raw) : null;
  const price = typed ?? bestPrice;
  const ev = pOurs * price - 1;
  const ready = legs.length >= 2;
  const perLeg = legs.length ? legs.reduce((s, l) => s + (1 - l.odds * l.fair), 0) / legs.length : 0;
  const total = 1 - price * pMarket;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
      <section>
        <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{P.games(dateLabel)}</h2>
        <p className="mb-3 text-sm text-ink-2">{P.pickLegs}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {games.map((g) => (
            <Card key={g.id} className="!p-3">
              <div className="mb-2 flex items-center gap-1.5 text-sm">
                <TeamLogo abbrev={g.away} size={22} />
                <span className="font-semibold">{g.away}</span>
                <span className="text-muted">@</span>
                <TeamLogo abbrev={g.home} size={22} />
                <span className="font-semibold">{g.home}</span>
                <span className="ml-auto text-xs text-muted"><LocalTime iso={g.start} /></span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {g.legs.map((l) => {
                  const on = chosen[g.id] === l.key;
                  return (
                    <button
                      key={l.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(g.id, l.key)}
                      className={`rounded-xl border px-2.5 py-2 text-left text-sm transition-colors ${
                        on ? "border-accent bg-accent/15 text-ink" : "border-line bg-surface-2/50 text-ink-2 hover:border-line-strong hover:text-ink"
                      }`}
                    >
                      <div className="truncate font-medium">{l.label}</div>
                      <div className="mt-0.5 flex justify-between text-xs">
                        <span className="font-semibold text-ink"><Price d={l.odds} /></span>
                        <span className="text-muted">{f.pct(l.p)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      </section>

      {legs.length > 0 && (
        // Phone: the summary sits below the games, so keep the verdict in view while picking legs.
        <a
          href="#parlay-summary"
          className="fixed inset-x-3 bottom-[76px] z-30 flex items-center justify-between gap-3 rounded-2xl border border-line-strong bg-surface-2/95 px-4 py-3 text-sm shadow-xl backdrop-blur lg:hidden"
        >
          <span className="font-medium">{P.yourParlay} · {legs.length}</span>
          {ready ? (
            <span className={`font-display tabular text-lg font-bold ${ev > 0 ? "text-edge" : "text-bad"}`}>{P.ev} {f.signedPct(ev)}</span>
          ) : (
            <span className="text-xs text-muted">{P.empty}</span>
          )}
        </a>
      )}
      <aside id="parlay-summary" className="scroll-mt-4 lg:sticky lg:top-6 lg:self-start">
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold uppercase tracking-wide">{P.yourParlay}</h2>
            {legs.length > 0 && (
              <button type="button" onClick={() => setChosen({})} className="text-xs text-muted hover:text-ink">{P.clear}</button>
            )}
          </div>
          {legs.length === 0 ? (
            <p className="text-sm text-muted">{P.empty}</p>
          ) : (
            <table className="tabular w-full text-sm">
              <thead className="text-[11px] uppercase tracking-[0.08em] text-muted">
                <tr className="[&>th]:py-1 [&>th]:pl-2 [&>th]:text-right [&>th:first-child]:pl-0 [&>th:first-child]:text-left">
                  <th>{P.cols.leg}</th><th>{P.cols.odds}</th><th>{P.cols.ours}</th><th>{P.cols.edge}</th><th />
                </tr>
              </thead>
              <tbody>
                {legs.map((l) => (
                  <tr key={l.key} className="border-t border-line [&>td]:py-1.5 [&>td]:pl-2 [&>td]:text-right [&>td:first-child]:pl-0">
                    <td className="!text-left">
                      <div className="font-medium">{l.label}</div>
                      <div className="text-xs text-muted">{l.game} · {l.book}</div>
                    </td>
                    <td><Price d={l.odds} /></td>
                    <td>{f.pct(l.p, 1)}</td>
                    <td className={l.p * l.odds - 1 >= 0 ? "text-edge" : "text-bad"}>{f.signedPct(l.p - 1 / l.odds)}</td>
                    <td>
                      <button type="button" onClick={() => toggle(l.gameId, l.key)} aria-label={P.remove} className="pl-2 text-muted hover:text-bad">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <label className="block text-sm">
            <span className="mb-1 block text-ink-2">{P.price}</span>
            <input value={raw} onChange={(e) => setRaw(e.target.value)} inputMode="decimal" placeholder={P.pricePh} className="w-full border px-3 py-2" />
            {raw.trim() && !typed ? (
              <span className="mt-1 block text-xs text-bad">{P.badPrice}</span>
            ) : legs.length > 0 ? (
              <span className="mt-1 block text-xs text-muted">{P.priceHint(`${american(bestPrice)} (${f.decimal(bestPrice)})`)}</span>
            ) : null}
          </label>

          {ready && (
            <>
              <div className="grid grid-cols-2 gap-2 text-center">
                {[
                  [P.ourProb, f.pct(pOurs, 1)],
                  [P.marketProb, f.pct(pMarket, 1)],
                  [P.bookProb, f.pct(1 / price, 1)],
                  [P.fairPrice, <Price key="fp" d={1 / pOurs} />],
                ].map(([k, v], idx) => (
                  <div key={idx} className="rounded-xl border border-line px-2 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">{k}</div>
                    <div className="font-display tabular mt-0.5 text-lg font-bold leading-none">{v}</div>
                  </div>
                ))}
              </div>
              <div className={`rounded-xl border px-3 py-3 ${ev > 0 ? "border-edge/40 bg-edge/10" : "border-bad/40 bg-bad/10"}`}>
                <div className="flex items-center justify-between gap-2">
                  <Pill tone={ev > 0 ? "edge" : "bad"}>{ev > 0 ? P.good : P.bad}</Pill>
                  <span className={`font-display tabular text-2xl font-bold ${ev > 0 ? "text-edge" : "text-bad"}`}>{f.signedPct(ev)}</span>
                </div>
                <p className="mt-2 text-xs text-ink-2">{P.evHint(f.money(10), f.money(10 * ev))}</p>
                {ev <= 0 && (
                  <p className="mt-1 text-xs text-ink-2">
                    {P.needs(`${american(1 / pOurs)} (${f.decimal(1 / pOurs)})`)}
                  </p>
                )}
              </div>
              {total > 0 && perLeg > 0 && <p className="text-xs text-muted">{P.margin(f.pct(perLeg, 1), f.pct(total, 1))}</p>}
            </>
          )}
          <p className="text-xs text-muted">{P.explain}</p>
        </Card>
      </aside>
    </div>
  );
}
