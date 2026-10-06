"use client";
import { useEffect, useState } from "react";
import { outcomeFor, profitFor, type Market, type Outcome } from "@/lib/outcome";
import { parseBetForm } from "@/lib/bet-form";
import { BASE_PATH } from "@/lib/static/mode";
import { loadBets, saveBets, useLocalData } from "@/lib/static/store";
import { SkeletonCards } from "@/components/ui";
import { closingPrice, type OddsSnapshot } from "@/lib/clv";
import { BetsView } from "./BetsView";
import type { GameOption } from "./BetForm";

/** Final score file the static build writes for each recent game (scripts/static-site.ts). */
interface FinalGame {
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  players: Record<string, [goals: number, points: number]>;
  closing?: OddsSnapshot | null; // last odds before puck drop
}

const STATUS: Record<Outcome, string> = { win: "won", loss: "lost", push: "push", void: "void" };

/** Settles this browser's open bets against the published final scores. */
async function settleOpenBets() {
  const open = loadBets().filter((b) => b.status === "open");
  const ids = [...new Set(open.map((b) => b.gameId))];
  const finals = new Map<number, FinalGame>();
  await Promise.all(
    ids.map(async (id) => {
      try {
        const r = await fetch(`${BASE_PATH}/data/game/${id}.json`, { cache: "no-cache" });
        if (r.ok) finals.set(id, (await r.json()) as FinalGame);
      } catch {}
    }),
  );
  if (!finals.size) return;
  const now = Date.now();
  saveBets(
    loadBets().map((b) => {
      const g = b.status === "open" ? finals.get(b.gameId) : undefined;
      if (!g) return b;
      const p = g.players[b.selection];
      const r = outcomeFor(b.market as Market, b.selection, b.line, g, b.market.startsWith("prop_") ? (p ? { goals: p[0], points: p[1] } : null) : undefined);
      const c = g.closing ? closingPrice(g.closing, g, b.market, b.selection, b.line) : null;
      return { ...b, status: STATUS[r], profit: profitFor(r, b.stake, b.oddsDecimal), settledAt: now, closingOdds: c?.odds ?? null, closingProb: c?.prob ?? null };
    }),
  );
}

/** The bet tracker on the static site: bets and settings live in this browser. */
export function StaticBets({ games }: { games: GameOption[] }) {
  const data = useLocalData();
  const [prefill, setPrefill] = useState<Record<string, string | undefined> | null>(null);
  const [flash, setFlash] = useState<{ error?: string; added?: boolean }>({});
  useEffect(() => {
    setPrefill(Object.fromEntries(new URLSearchParams(window.location.search)));
    settleOpenBets();
  }, []);
  if (!data || !prefill) return <SkeletonCards n={2} h={220} />;
  return (
    <BetsView
      key={JSON.stringify(prefill)}
      bets={[...data.bets].sort((a, b) => (a.gameDate < b.gameDate ? 1 : a.gameDate > b.gameDate ? -1 : b.id - a.id))}
      settings={data.settings}
      games={games}
      prefill={prefill}
      flash={flash}
      onAdd={(form) => {
        const nb = parseBetForm(form);
        if (!nb) return setFlash({ error: "missing" });
        const bets = loadBets();
        const id = Math.max(Date.now(), ...bets.map((b) => b.id + 1));
        saveBets([...bets, { ...nb, id, createdAt: Date.now(), status: "open", profit: null, settledAt: null }]);
        setFlash({ added: true });
        // Clear the prefill so the next bet starts from a blank form.
        window.history.replaceState(null, "", window.location.pathname);
        setPrefill({});
        settleOpenBets(); // in case the game is already final
        window.scrollTo({ top: 0 });
      }}
      onDelete={(id) => saveBets(loadBets().filter((b) => b.id !== id))}
    />
  );
}
