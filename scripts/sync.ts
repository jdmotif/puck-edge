// Nightly job: backfill every completed game of the current and previous season,
// then grade picks, settle bets and refit the model.  Run with `npm run sync`.
import { api, seasonFor, todayIso } from "@/lib/nhl/client";
import { gameCount, ingestDetails, ingestGames } from "@/lib/data/ingest";
import { gradePicks, settleBets } from "@/lib/grading";
import { fitAndBacktest } from "@/lib/model/fit";
import { sqlite } from "@/db";

const DONE = new Set(["OFF", "FINAL"]);

async function main() {
  const started = Date.now();
  const logId = Number(sqlite.prepare("INSERT INTO sync_log (started_at) VALUES (?)").run(started).lastInsertRowid);
  const today = todayIso();
  const current = seasonFor(today);
  const previous = current - 10001;
  console.log(`Puck Edge sync — ${today}, seasons ${previous} and ${current}`);

  const standings = await api.standings("now");
  if (!standings.data) throw new Error(`Could not load teams from standings: ${standings.error}`);
  const teams = [...new Set(standings.data.standings.map((s) => s.teamAbbrev.default))].sort();
  console.log(`${teams.length} teams`);

  const ids = new Set<number>();
  for (const season of [previous, current]) {
    for (const team of teams) {
      const sched = await api.clubSchedule(team, season);
      if (!sched.data) {
        console.warn(`  ${team} ${season}: ${sched.error}`);
        continue;
      }
      for (const g of sched.data.games) {
        if ((g.gameType === 2 || g.gameType === 3) && DONE.has(g.gameState)) ids.add(g.id);
      }
    }
    console.log(`Season ${season}: ${[...ids].filter((id) => String(id).startsWith(String(season).slice(0, 4))).length} completed games found`);
  }

  let last = 0;
  const res = await ingestGames([...ids].sort(), {
    onProgress: (done, total) => {
      const pct = Math.floor((done / total) * 100);
      if (pct >= last + 5 || done === total) {
        last = pct;
        process.stdout.write(`  box scores ${done}/${total} (${pct}%)\n`);
      }
    },
  });
  console.log(`Stored ${res.added} new games (${gameCount(previous)} in ${previous}, ${gameCount(current)} in ${current})`);
  if (res.errors.length) console.warn(`${res.errors.length} games failed, e.g. ${res.errors.slice(0, 3).join("; ")}`);

  // Goal scorers and three stars for the current season's results page.
  const currentIds = [...ids].filter((id) => String(id).startsWith(String(current).slice(0, 4)));
  console.log(`Stored scorers/three stars for ${await ingestDetails(currentIds)} games`);

  console.log(`Graded ${gradePicks()} picks, settled ${settleBets()} bets`);
  fitAndBacktest((m) => console.log(m));

  sqlite
    .prepare("UPDATE sync_log SET finished_at = ?, games_added = ?, message = ? WHERE id = ?")
    .run(Date.now(), res.added, res.errors.length ? `${res.errors.length} errors` : "ok", logId);
  console.log(`Done in ${((Date.now() - started) / 1000).toFixed(0)}s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
