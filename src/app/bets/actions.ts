"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sqlite } from "@/db";
import { parseOdds } from "@/lib/model/math";
import { settleBets } from "@/lib/grading";

export async function addBet(form: FormData) {
  const odds = parseOdds(String(form.get("odds") ?? ""));
  const num = (v: FormDataEntryValue | null) => Number(String(v ?? "").trim().replace(",", ".").replace("−", "-"));
  const stake = num(form.get("stake"));
  const gameId = Number(form.get("gameId"));
  const market = String(form.get("market"));
  const selection = String(form.get("selection") ?? "").trim();
  if (!odds || !(stake > 0) || !gameId || !market || !selection) redirect("/bets?error=missing");
  const lineRaw = String(form.get("line") ?? "").trim();
  sqlite
    .prepare(
      `INSERT INTO bets (created_at, game_id, game_date, game_label, market, selection, selection_label, line, odds_decimal, stake, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      Date.now(),
      gameId,
      String(form.get("gameDate") ?? ""),
      String(form.get("gameLabel") ?? ""),
      market,
      selection,
      String(form.get("selectionLabel") || selection),
      lineRaw === "" ? null : num(lineRaw),
      odds,
      stake,
      String(form.get("notes") ?? "") || null,
    );
  settleBets(); // in case the game is already final
  revalidatePath("/bets");
  redirect("/bets?added=1");
}

export async function deleteBet(form: FormData) {
  sqlite.prepare("DELETE FROM bets WHERE id = ?").run(Number(form.get("id")));
  revalidatePath("/bets");
}
