"use client";
import { useMemo, useState } from "react";
import { addBet } from "./actions";
import { kellyFraction, parseOdds } from "@/lib/model/math";

export interface GameOption { id: number; date: string; label: string; home: string; away: string }

export function BetForm({ games, prefill, bankroll, kelly, cap }: {
  games: GameOption[];
  prefill: Record<string, string | undefined>;
  bankroll: number;
  kelly: number;
  cap: number;
}) {
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
    const p = Number(prob) / 100;
    if (!dec || !(p > 0 && p < 1)) return null;
    const f = kellyFraction(p, dec, kelly, cap);
    return { f, amount: Math.round(f * bankroll * 100) / 100, implied: 1 / dec };
  }, [prob, dec, kelly, cap, bankroll]);
  const input = "w-full rounded-md border border-line bg-surface-2 px-2 py-1.5";

  return (
    <form action={addBet} className="grid gap-3 text-sm sm:grid-cols-2">
      <label className="sm:col-span-2">
        <span className="text-xs text-muted">Game</span>
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
        <span className="text-xs text-muted">Market</span>
        <select name="market" className={input} value={market} onChange={(e) => { setMarket(e.target.value); setSelection(""); }}>
          <option value="moneyline">Moneyline</option>
          <option value="total">Total goals</option>
          <option value="puckline">Puck line</option>
          {isProp && <option value={market}>{prefill.label ?? "Player prop"}</option>}
        </select>
      </label>
      <label>
        <span className="text-xs text-muted">Selection</span>
        {isProp ? (
          <input className={input} value={prefill.label ?? selection} readOnly />
        ) : market === "total" ? (
          <select className={input} value={selection} onChange={(e) => setSelection(e.target.value)}>
            <option value="">Choose…</option><option value="over">Over</option><option value="under">Under</option>
          </select>
        ) : (
          <select className={input} value={selection} onChange={(e) => setSelection(e.target.value)}>
            <option value="">Choose…</option>
            {game && <><option value={game.away}>{game.away}</option><option value={game.home}>{game.home}</option></>}
            {!game && prefill.selection && <option value={prefill.selection}>{prefill.selection}</option>}
          </select>
        )}
      </label>
      <input type="hidden" name="selection" value={selection} />
      <input type="hidden" name="selectionLabel" value={isProp ? prefill.label ?? selection : market === "moneyline" ? `${selection} ML` : market === "total" ? `${selection === "over" ? "Over" : "Under"}` : selection} />
      {(market === "total" || market === "puckline") && (
        <label>
          <span className="text-xs text-muted">{market === "total" ? "Line (e.g. 6.5)" : "Spread for your team (−1.5 or +1.5)"}</span>
          <input name="line" className={input} defaultValue={prefill.line ?? (market === "total" ? "6.5" : "-1.5")} inputMode="decimal" />
        </label>
      )}
      <label>
        <span className="text-xs text-muted">Odds (American like −110 / +150, or decimal like 1.91)</span>
        <input name="odds" className={input} value={odds} onChange={(e) => setOdds(e.target.value)} inputMode="decimal" />
      </label>
      <label>
        <span className="text-xs text-muted">Your win probability % (prefilled from the model)</span>
        <input className={input} value={prob} onChange={(e) => setProb(e.target.value)} inputMode="decimal" />
      </label>
      <label>
        <span className="text-xs text-muted">Stake ($)</span>
        <input name="stake" className={input} value={stake} onChange={(e) => setStake(e.target.value)} inputMode="decimal" />
      </label>
      <div className="rounded-md bg-surface-2 p-2 text-xs text-ink-2 sm:col-span-2">
        {suggestion ? (
          suggestion.f > 0 ? (
            <>
              Suggested stake ({kelly === 1 ? "full" : `${kelly}×`} Kelly, capped at {(cap * 100).toFixed(1)}% of ${bankroll.toFixed(0)}):{" "}
              <button type="button" className="font-semibold text-accent" onClick={() => setStake(suggestion.amount.toFixed(2))}>${suggestion.amount.toFixed(2)}</button>
              {" "}· price implies {(suggestion.implied * 100).toFixed(1)}%
            </>
          ) : (
            <>No edge at this price (it implies {(suggestion.implied * 100).toFixed(1)}%): Kelly says don&apos;t bet.</>
          )
        ) : (
          "Enter odds and a probability to see a Kelly stake suggestion."
        )}
      </div>
      <label className="sm:col-span-2">
        <span className="text-xs text-muted">Notes</span>
        <input name="notes" className={input} />
      </label>
      <button className="rounded-md bg-accent px-4 py-2 font-medium text-white sm:col-span-2">Log bet</button>
    </form>
  );
}
