import { ingestRecent } from "./ingest";
import { gradePicks, settleBets } from "@/lib/grading";

// Pulls in games that finished in the last few days, then grades picks and settles bets.
// Runs in the background at most every 10 minutes so pages never wait on it.
const g = globalThis as unknown as { __peRefresh?: { at: number; running: boolean } };
const state = (g.__peRefresh ??= { at: 0, running: false });

export function refreshRecentInBackground() {
  if (state.running || Date.now() - state.at < 10 * 60_000) return;
  state.running = true;
  state.at = Date.now();
  ingestRecent(2)
    .then(() => {
      gradePicks();
      settleBets();
    })
    .catch((e) => console.warn("background refresh failed:", e instanceof Error ? e.message : e))
    .finally(() => (state.running = false));
}
