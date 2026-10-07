// Publishes live scores and player stats for the online copy while games are on (see src/lib/live/feed.ts).
// Run by .github/workflows/live-scores.yml: once a minute it reads the NHL scoreboard and
// force-pushes a one-commit `live-scores` branch holding the newest minute files. It also asks
// the "Deploy site" workflow for a full rebuild every 20 minutes during games and once after the
// last final, since GitHub's own schedule for that workflow often runs hours late.
//
// Env: GITHUB_REPOSITORY, GITHUB_TOKEN (contents + actions write). Options: --once (one pass, no push:
// prints the feed), MAX_MINUTES (default 340, under the 6-hour job limit).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DONE_STATES, LIVE_STATES, boxFile, boxOf, feedFile, feedOf, type LiveBox } from "../src/lib/live/feed";
import type { BoxscoreResponse, ScoreGame, ScoreResponse } from "../src/lib/nhl/types";

const MIN = 60_000;
const REPO = process.env.GITHUB_REPOSITORY ?? "";
const TOKEN = process.env.GITHUB_TOKEN ?? "";
const MAX_MINUTES = Number(process.env.MAX_MINUTES) || 340;
const KEEP_FILES = 10;
const REBUILD_EVERY = 20 * MIN;
const LEAD = 15 * MIN; // start publishing this long before the first puck drop
const MAX_WAIT = 90 * MIN;
const BRANCH = "live-scores";
const once = process.argv.includes("--once");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function nhl<T>(apiPath: string): Promise<T | null> {
  try {
    const res = await fetch(`https://api-web.nhle.com/v1/${apiPath}`, {
      headers: { accept: "application/json", "user-agent": "puck-edge/0.1" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`NHL API ${res.status}`);
    return (await res.json()) as T;
  } catch (e) {
    console.warn(`${apiPath}:`, e instanceof Error ? e.message : e);
    return null;
  }
}

const scoreboard = () => nhl<ScoreResponse>("score/now");

// A final game's box no longer changes, so it's read once more after the final horn and kept.
const finalBoxes = new Map<number, LiveBox>();

/** Player boxes of every started game: re-read each minute while live, once after the final. */
async function boxes(games: ScoreGame[]): Promise<LiveBox[]> {
  const started = games.filter((g) => LIVE_STATES.has(g.gameState) || DONE_STATES.has(g.gameState));
  const out = await Promise.all(
    started.map(async (g) => {
      const kept = finalBoxes.get(g.id);
      if (kept) return kept;
      const b = await nhl<BoxscoreResponse>(`gamecenter/${g.id}/boxscore`);
      const box = b ? boxOf(b) : null;
      if (box && DONE_STATES.has(g.gameState) && b && DONE_STATES.has(b.gameState)) finalBoxes.set(g.id, box);
      return box;
    }),
  );
  return out.filter((b): b is LiveBox => b !== null);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "live-scores-"));
const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: ["ignore", "pipe", "inherit"] }).toString();
let committed = false;

function publish(file: string, body: string, extra: { file: string; body: string }[] = []) {
  fs.writeFileSync(path.join(dir, file), body);
  for (const x of extra) fs.writeFileSync(path.join(dir, x.file), x.body);
  // Keep the newest minutes, each with its player boxes (202610070131.json, 202610070131-<game>.json).
  const minute = (f: string) => f.slice(0, 12);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const keep = new Set([...new Set(files.map(minute))].sort().slice(-KEEP_FILES));
  for (const old of files) if (!keep.has(minute(old))) fs.rmSync(path.join(dir, old));
  git("add", "-A");
  // One commit, amended each minute, so the branch never grows.
  git("commit", "-q", ...(committed ? ["--amend"] : []), "-m", `Live scores ${file}`);
  committed = true;
  const auth = Buffer.from(`x-access-token:${TOKEN}`).toString("base64");
  git("-c", `http.https://github.com/.extraheader=AUTHORIZATION: basic ${auth}`, "push", "-q", "-f", `https://github.com/${REPO}.git`, `HEAD:${BRANCH}`);
}

function publishMinute(board: ScoreResponse, boxList: LiveBox[]) {
  const file = feedFile(new Date());
  publish(file, JSON.stringify(feedOf([board])), boxList.map((b) => ({ file: boxFile(file, b.id), body: JSON.stringify(b) })));
}

async function rebuildSite() {
  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/pages.yml/dispatches`, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, accept: "application/vnd.github+json" },
    body: JSON.stringify({ ref: "main" }),
  });
  console.log(`site rebuild requested: ${res.status}`);
}

async function main() {
  if (once) {
    const board = await scoreboard();
    console.log(JSON.stringify(feedOf([board]), null, 1));
    for (const b of await boxes(board?.games ?? [])) console.log(`box ${b.id}: ${JSON.stringify(b).length} bytes`);
    return;
  }
  if (!REPO || !TOKEN) throw new Error("GITHUB_REPOSITORY and GITHUB_TOKEN are required");
  git("init", "-q", "-b", BRANCH);
  git("config", "user.name", "github-actions[bot]");
  git("config", "user.email", "41898299+github-actions[bot]@users.noreply.github.com");

  const deadline = Date.now() + MAX_MINUTES * MIN;
  let lastRebuild = Date.now(); // the run that started this job is usually a fresh deploy
  let doneBefore: Set<number> | null = null;
  let publishedAny = false;

  while (Date.now() < deadline) {
    const tick = Date.now();
    const board = await scoreboard();
    if (!board) {
      await sleep(MIN);
      continue;
    }
    const games = board.games ?? [];
    const live = games.filter((g) => LIVE_STATES.has(g.gameState));
    const left = games.filter((g) => !DONE_STATES.has(g.gameState));
    const done = new Set(games.filter((g) => DONE_STATES.has(g.gameState)).map((g) => g.id));
    const nextStart = Math.min(...left.map((g) => Date.parse(g.startTimeUTC)));

    if (!live.length && !left.length) {
      // Everything is final (or no games today): publish the finals, rebuild once, stop.
      if (publishedAny) {
        publishMinute(board, await boxes(games));
        await rebuildSite();
      }
      console.log("no games left today");
      return;
    }
    if (!live.length && nextStart - Date.now() > LEAD) {
      const wait = nextStart - LEAD - Date.now();
      // Don't spend this run's hours waiting: a later scheduled run covers a far-off start.
      if (wait > MAX_WAIT) {
        console.log(`next puck drop ${new Date(nextStart).toISOString()} is too far off; a later run will cover it`);
        return;
      }
      console.log(`waiting until ${new Date(nextStart - LEAD).toISOString()}`);
      await sleep(Math.min(wait, 30 * MIN));
      continue;
    }

    publishMinute(board, await boxes(games));
    publishedAny = true;
    console.log(`${new Date().toISOString()} ${live.map((g) => `${g.awayTeam.abbrev} ${g.awayTeam.score}-${g.homeTeam.score} ${g.homeTeam.abbrev}`).join(", ")}`);

    // A game just ended, or the rest of the site is getting old: full rebuild (results, picks graded, box scores).
    const newlyDone = doneBefore !== null && [...done].some((id) => !doneBefore!.has(id)) && tick - lastRebuild > 5 * MIN;
    if (newlyDone || Date.now() - lastRebuild > REBUILD_EVERY) {
      await rebuildSite();
      lastRebuild = Date.now();
    }
    doneBefore = done;
    await sleep(Math.max(0, MIN - (Date.now() - tick)));
  }
  console.log("time limit reached; the next scheduled run picks up from here");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
