// Settings shape and defaults, safe to import in the browser (settings.ts reads them from SQLite).
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
