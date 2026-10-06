import { sqlite } from "@/db";
import { DEFAULT_SETTINGS, type Settings } from "./settings-shared";

export { DEFAULT_SETTINGS, type Settings } from "./settings-shared";

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
