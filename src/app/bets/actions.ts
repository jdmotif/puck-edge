"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sqlite } from "@/db";
import { settleBets } from "@/lib/grading";
import { parseBetForm } from "@/lib/bet-form";

export async function addBet(form: FormData) {
  const b = parseBetForm(form);
  if (!b) redirect("/bets?error=missing");
  sqlite
    .prepare(
      `INSERT INTO bets (created_at, game_id, game_date, game_label, market, selection, selection_label, line, odds_decimal, stake, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(Date.now(), b.gameId, b.gameDate, b.gameLabel, b.market, b.selection, b.selectionLabel, b.line, b.oddsDecimal, b.stake, b.notes);
  settleBets(); // in case the game is already final
  revalidatePath("/bets");
  redirect("/bets?added=1");
}

export async function deleteBet(form: FormData) {
  sqlite.prepare("DELETE FROM bets WHERE id = ?").run(Number(form.get("id")));
  revalidatePath("/bets");
}
