// While the app is running, keeps today's logged picks current in the hours before puck drop, so the
// pick that gets graded reflects the latest goalie, lineup and odds even if nobody has the page open.
import { api, todayIso } from "@/lib/nhl/client";
import { buildSlate, logPicks } from "@/lib/picks";

const EVERY = 5 * 60_000;
const WINDOW = 3 * 60 * 60_000; // start refreshing three hours before the first puck drop

const g = globalThis as unknown as { __pePregame?: NodeJS.Timeout };

export async function refreshPregamePicks(now = Date.now()) {
  const date = todayIso(new Date(now));
  const schedule = await api.schedule(date);
  const games = schedule.data?.gameWeek.find((d) => d.date === date)?.games ?? [];
  const soon = games.some((x) => {
    if (x.gameType !== 2 && x.gameType !== 3) return false; // preseason picks aren't tracked
    if (x.gameState !== "FUT" && x.gameState !== "PRE") return false;
    const until = Date.parse(x.startTimeUTC) - now;
    return until > 0 && until < WINDOW;
  });
  if (!soon) return false;
  logPicks(await buildSlate(date));
  return true;
}

export function startPregameWatch() {
  if (g.__pePregame || process.env.NHL_OFFLINE) return;
  const tick = () => refreshPregamePicks().catch((e) => console.warn("pregame refresh failed:", e instanceof Error ? e.message : e));
  g.__pePregame = setInterval(tick, EVERY);
  g.__pePregame.unref();
  setTimeout(tick, 30_000).unref();
}
