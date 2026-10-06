// Reads the bet form. Shared by the server action and the static site's browser-side tracker.
import { parseOdds } from "@/lib/model/math";

export interface NewBet {
  gameId: number;
  gameDate: string;
  gameLabel: string;
  market: string;
  selection: string;
  selectionLabel: string;
  line: number | null;
  oddsDecimal: number;
  stake: number;
  notes: string | null;
}

/** The bet in a submitted form, or null when odds, stake, game, market or selection is missing. */
export function parseBetForm(form: FormData): NewBet | null {
  const oddsDecimal = parseOdds(String(form.get("odds") ?? ""));
  const num = (v: FormDataEntryValue | null) => Number(String(v ?? "").trim().replace(",", ".").replace("−", "-"));
  const stake = num(form.get("stake"));
  const gameId = Number(form.get("gameId"));
  const market = String(form.get("market") ?? "");
  const selection = String(form.get("selection") ?? "").trim();
  if (!oddsDecimal || !(stake > 0) || !gameId || !market || !selection) return null;
  const lineRaw = String(form.get("line") ?? "").trim();
  return {
    gameId,
    gameDate: String(form.get("gameDate") ?? ""),
    gameLabel: String(form.get("gameLabel") ?? ""),
    market,
    selection,
    selectionLabel: String(form.get("selectionLabel") || selection),
    line: lineRaw === "" ? null : num(lineRaw),
    oddsDecimal,
    stake,
    notes: String(form.get("notes") ?? "") || null,
  };
}
