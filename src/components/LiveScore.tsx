"use client";
// Live score overlay for the online copy: polls the minute files the live-scores workflow publishes
// (see src/lib/live/feed.ts) and replaces the snapshot's score and status while a game is on.
// In the app on your computer pages are rendered on request, so this does nothing there.
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { DONE_STATES, feedFile, liveStatus, started, type LiveFeed, type LiveGame } from "@/lib/live/feed";
import { useI18n } from "@/lib/i18n/client";
import { STATIC_SITE } from "@/lib/static/mode";
import { Pill } from "./ui";

const FEED_URL = STATIC_SITE ? (process.env.NEXT_PUBLIC_LIVE_FEED_URL ?? "") : "";
const POLL_MS = 60_000;
const MIN = 60_000;

let games = new Map<number, LiveGame>();
let lastFile = "";
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

async function poll() {
  if (typeof document !== "undefined" && document.hidden) return;
  // Newest minute first; one minute ahead covers a slow device clock.
  const now = Date.now();
  for (let k = -1; k <= 6; k++) {
    const file = feedFile(new Date(now - k * MIN));
    if (file === lastFile) return; // already showing the newest one there is
    try {
      const res = await fetch(`${FEED_URL}/${file}`, { cache: "no-store" });
      if (!res.ok) continue;
      const feed = (await res.json()) as LiveFeed;
      lastFile = file;
      // A snapshot built after this minute already has these scores or newer ones.
      const builtAt = Date.parse(document.documentElement.dataset.builtAt ?? "");
      if (Date.parse(feed.at) <= builtAt) return;
      games = new Map(feed.games.map((g) => [g.id, g]));
      listeners.forEach((l) => l());
      return;
    } catch {
      // Offline or blocked: keep what's shown.
    }
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  if (!timer && FEED_URL) {
    void poll();
    timer = setInterval(poll, POLL_MS);
  }
  return () => {
    listeners.delete(l);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** The latest published state of a game that has started, or null to keep the page's own. */
export function useLiveGame(id: number): LiveGame | null {
  const g = useSyncExternalStore(subscribe, () => games.get(id), () => undefined);
  return g && started(g.state) && g.away !== null && g.home !== null ? g : null;
}

/** Score in the middle of a game card or header; `children` is what the snapshot shows. */
export function LiveScore({ id, className, children }: { id: number; className?: string; children: ReactNode }) {
  const g = useLiveGame(id);
  if (!g) return <>{children}</>;
  return <div className={className}>{g.away}<span className="px-1 text-muted">–</span>{g.home}</div>;
}

/** Period and clock pill ("P2 12:34", "Final/OT"). */
export function LiveStatus({ id, children }: { id: number; children: ReactNode }) {
  const { t } = useI18n();
  const g = useLiveGame(id);
  if (!g) return <>{children}</>;
  const done = DONE_STATES.has(g.state);
  return (
    <Pill tone={done ? "neutral" : "bad"}>
      {!done && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-bad" />}
      {liveStatus(g, t.status)}
    </Pill>
  );
}

/** Compact "2–1" (plus OT/SO once final) for schedule rows. */
export function LiveScoreText({ id, children }: { id: number; children: ReactNode }) {
  const { t } = useI18n();
  const g = useLiveGame(id);
  if (!g) return <>{children}</>;
  const done = DONE_STATES.has(g.state);
  const extra = done && g.lastPeriodType && g.lastPeriodType !== "REG" ? ` ${t.status.period(0, g.lastPeriodType)}` : "";
  return <span className={done ? undefined : "text-bad"}>{`${g.away}–${g.home}${extra}`}</span>;
}

/** In the app on your computer: re-render the page every minute while a game on it is on. */
export function LiveRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (STATIC_SITE || !active) return;
    const id = setInterval(() => {
      if (!document.hidden) router.refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [active, router]);
  return null;
}
