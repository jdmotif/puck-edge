import { sqlite } from "@/db";

export interface Settings {
  edgeThreshold: number; // e.g. 0.03 = 3 percentage points
  kellyFraction: number; // 0.25 = quarter Kelly
  maxStakePct: number; // cap per bet as a fraction of bankroll
  startingBankroll: number;
  dailyLossLimit: number; // 0 = off
  weeklyLossLimit: number; // 0 = off
  sessionReminderMinutes: number; // 0 = off
  oddsCountry: string; // partner-game country
}

export const DEFAULT_SETTINGS: Settings = {
  edgeThreshold: 0.03,
  kellyFraction: 0.25,
  maxStakePct: 0.03,
  startingBankroll: 1000,
  dailyLossLimit: 0,
  weeklyLossLimit: 0,
  sessionReminderMinutes: 60,
  oddsCountry: "CA",
};

export function getSettings(): Settings {
  const rows = sqlite.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const out: Settings = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (r.key in out) (out as unknown as Record<string, unknown>)[r.key] = JSON.parse(r.value);
  }
  return out;
}

export function saveSettings(patch: Partial<Settings>) {
  const stmt = sqlite.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  const tx = sqlite.transaction(() => {
    for (const [k, v] of Object.entries(patch)) if (k in DEFAULT_SETTINGS && v !== undefined) stmt.run(k, JSON.stringify(v));
  });
  tx();
}
