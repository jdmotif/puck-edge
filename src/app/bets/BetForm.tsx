"use client";
import { useMemo, useState, type FormEvent } from "react";
import { addBet } from "./actions";
import { kellyFraction, parseOdds } from "@/lib/model/math";
import { useI18n } from "@/lib/i18n/client";

export interface GameOption { id: number; date: string; label: string; home: string; away: string }

export function BetForm({ games, prefill, bankroll, kelly, cap, onAdd }: {
  games: GameOption[];
  prefill: Record<string, string | undefined>;
  bankroll: number;
  kelly: number;
  cap: number;
  /** Static site: handle the form in the browser instead of the `addBet` server action. */
  onAdd?: (form: FormData) => void;
}) {
  const { t, f } = useI18n();
  const B = t.bets;
  const [gameId, setGameId] = useState(prefill.game ?? String(games[0]?.id ?? ""));
  const [market, setMarket] = useState(prefill.market ?? "moneyline");
  const [selection, setSelection] = useState(prefill.selection ?? "");
  const [odds, setOdds] = useState(prefill.odds ? (Number(prefill.odds) >= 2 ? `+${Math.round((Number(prefill.odds) - 1) * 100)}` : `${Math.round(-100 / (Number(prefill.odds) - 1))}`) : "");
  const [prob, setProb] = useState(prefill.prob ? (Number(prefill.prob) * 100).toFixed(1) : "");
  const [stake, setStake] = useState("");
  const game = games.find((g) => String(g.id) === gameId);
  const isProp = market.startsWith("prop_");
  const dec = parseOdds(odds);
  const suggestion = useMemo(() => {
    const p = Number(prob.replace(",", ".")) / 100;
    if (!dec || !(p > 0 && p < 1)) return null;
    const f = kellyFraction(p, dec, kelly, cap);
    return { f, amount: Math.round(f * bankroll * 100) / 100, implied: 1 / dec };
  }, [prob, dec, kelly, cap, bankroll]);
  const input = "mt-1 w-full border px-3 py-2";

  return (
    <form
      {...(onAdd ? { onSubmit: (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); onAdd(new FormData(e.currentTarget)); } } : { action: addBet })}
      className="grid gap-3 text-sm sm:grid-cols-2">
      <label className="sm:col-span-2">
        <span className="text-xs text-muted">{B.game}</span>
        {prefill.game && !game ? (
          <input className={input} value={prefill.gameLabel ?? prefill.game} readOnly />
        ) : (
          <select className={input} value={gameId} onChange={(e) => { setGameId(e.target.value); setSelection(""); }}>
            {games.map((g) => <option key={g.id} value={g.id}>{g.date} · {g.label}</option>)}
          </select>
        )}
      </label>
      <input type="hidden" name="gameId" value={gameId} />
      <input type="hidden" name="gameDate" value={game?.date ?? prefill.date ?? ""} />
      <input type="hidden" name="gameLabel" value={game?.label ?? prefill.gameLabel ?? ""} />
      <label>
        <span className="text-xs text-muted">{B.market}</span>
        <select name="market" className={input} value={market} onChange={(e) => { setMarket(e.target.value); setSelection(""); }}>
          <option value="moneyline">{t.markets.moneyline}</option>
          <option value="total">{t.markets.total}</option>
          <option value="puckline">{t.markets.puckline}</option>
          {isProp && <option value={market}>{t.markets[market as "prop_goal"] ?? B.playerProp}</option>}
        </select>
      </label>
      <label>
        <span className="text-xs text-muted">{B.selection}</span>
        {isProp ? (
          <input className={input} value={prefill.labelText ?? prefill.label ?? selection} readOnly />
        ) : market === "total" ? (
          <select className={input} value={selection} onChange={(e) => setSelection(e.target.value)}>
            <option value="">{B.choose}</option><option value="over">{t.label.over}</option><option value="under">{t.label.under}</option>
          </select>
        ) : (
          <select className={input} value={selection} onChange={(e) => setSelection(e.target.value)}>
            <option value="">{B.choose}</option>
            {game && <><option value={game.away}>{game.away}</option><option value={game.home}>{game.home}</option></>}
            {!game && prefill.selection && <option value={prefill.selection}>{prefill.selection}</option>}
          </select>
        )}
      </label>
      <input type="hidden" name="selection" value={selection} />
      <input type="hidden" name="selectionLabel" value={isProp ? prefill.label ?? selection : market === "moneyline" ? `${selection} ML` : market === "total" ? `${selection === "over" ? "Over" : "Under"}` : selection} />
      {(market === "total" || market === "puckline") && (
        <label>
          <span className="text-xs text-muted">{market === "total" ? B.lineTotal : B.lineSpread}</span>
          <input name="line" className={input} defaultValue={prefill.line ?? (market === "total" ? "6.5" : "-1.5")} inputMode="decimal" />
        </label>
      )}
      <label>
        <span className="text-xs text-muted">{B.oddsLabel}</span>
        <input name="odds" className={input} value={odds} onChange={(e) => setOdds(e.target.value)} inputMode="decimal" />
      </label>
      <label>
        <span className="text-xs text-muted">{B.probLabel}</span>
        <input className={input} value={prob} onChange={(e) => setProb(e.target.value)} inputMode="decimal" />
      </label>
      <label>
        <span className="text-xs text-muted">{B.stakeLabel}</span>
        <input name="stake" className={input} value={stake} onChange={(e) => setStake(e.target.value)} inputMode="decimal" />
      </label>
      <div className="rounded-md bg-surface-2 p-2 text-xs text-ink-2 sm:col-span-2">
        {suggestion ? (
          suggestion.f > 0 ? (
            <>
              {B.suggested(kelly === 1 ? B.fullKelly : B.kellyX(kelly), f.pct(cap, 1), f.money(bankroll, 0))}
              <button type="button" className="font-semibold text-accent-2" onClick={() => setStake(suggestion.amount.toFixed(2))}>{f.money(suggestion.amount)}</button>
              {B.implies(f.pct(suggestion.implied, 1))}
            </>
          ) : (
            <>{B.noEdge(f.pct(suggestion.implied, 1))}</>
          )
        ) : (
          B.enterOdds
        )}
      </div>
      <label className="sm:col-span-2">
        <span className="text-xs text-muted">{B.notes}</span>
        <input name="notes" className={input} />
      </label>
      <button className="bg-accent px-4 py-2.5 font-semibold text-white sm:col-span-2">{B.submit}</button>
    </form>
  );
}
