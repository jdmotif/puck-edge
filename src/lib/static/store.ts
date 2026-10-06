"use client";
// Per-visitor data on the static site, kept in this browser's localStorage.
import { useEffect, useState } from "react";
import type { BetRow } from "@/lib/bankroll-math";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/settings-shared";

const BETS_KEY = "puck-edge:bets";
const SETTINGS_KEY = "puck-edge:settings";
const EVENT = "puck-edge:store";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

export const loadBets = (): BetRow[] => read<BetRow[]>(BETS_KEY, []);
export const saveBets = (bets: BetRow[]) => write(BETS_KEY, bets);
export const loadSettings = (): Settings => ({ ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(SETTINGS_KEY, {}) });
export const saveSettings = (patch: Partial<Settings>) => write(SETTINGS_KEY, { ...read<Partial<Settings>>(SETTINGS_KEY, {}), ...patch });

/** Bets and settings from this browser; null until mounted, so server HTML and hydration agree. */
export function useLocalData() {
  const [data, setData] = useState<{ bets: BetRow[]; settings: Settings } | null>(null);
  useEffect(() => {
    const load = () => setData({ bets: loadBets(), settings: loadSettings() });
    load();
    window.addEventListener(EVENT, load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener(EVENT, load);
      window.removeEventListener("storage", load);
    };
  }, []);
  return data;
}
