// Saves full, raw API responses to /fixtures (run where api-web.nhle.com is reachable).
import fs from "node:fs";
import path from "node:path";

const BASE = "https://api-web.nhle.com/v1/";
const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

async function get(p: string) {
  const res = await fetch(BASE + p, { redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} ${p}`);
  return res.json();
}

function save(p: string, body: unknown) {
  const name = p.replace(/\?.*$/, "").replace(/\//g, "_") + ".json";
  fs.writeFileSync(path.join("fixtures", name), JSON.stringify(body, null, 2));
  console.log("saved", name);
}

async function main() {
  const paths = [
    `schedule/${today}`,
    "schedule/now",
    `score/${yesterday}`,
    "standings/now",
    `standings/${yesterday}`,
    "skater-stats-leaders/current?categories=points,goals,assists&limit=50",
    "goalie-stats-leaders/current?categories=wins,savePctg,goalsAgainstAverage&limit=50",
    "club-stats/EDM/now",
    "roster/EDM/current",
    "club-schedule-season/EDM/now",
    "player/8478402/landing",
    "partner-game/CA/now",
    "partner-game/US/now",
  ];
  for (const p of paths) {
    try {
      save(p, await get(p));
    } catch (e) {
      console.warn("failed", p, (e as Error).message);
    }
  }
  const landing = await get("player/8478402/landing");
  const season = landing.featuredStats?.season;
  if (season) save(`player/8478402/game-log/${season}/2`, await get(`player/8478402/game-log/${season}/2`));
  const score = await get(`score/${yesterday}`);
  const done = score.games?.find((g: { gameState: string }) => g.gameState === "OFF");
  if (done) {
    for (const kind of ["boxscore", "play-by-play", "landing"]) save(`gamecenter/${done.id}/${kind}`, await get(`gamecenter/${done.id}/${kind}`));
  }
  const sched = await get(`schedule/${today}`);
  const next = sched.gameWeek?.[0]?.games?.[0];
  if (next) save(`gamecenter/${next.id}/landing`, await get(`gamecenter/${next.id}/landing`));
}

main();
