"use client";
// Browser-side pieces of the layout on the static site, where bets and settings live in localStorage.
import { lossLimits } from "@/lib/bankroll-math";
import { useI18n } from "@/lib/i18n/client";
import { useLocalData } from "@/lib/static/store";
import { LocalTime } from "./LocalTime";
import { SessionReminder } from "./SessionReminder";

export function LossLimitAlerts({ className = "" }: { className?: string }) {
  const { t, f } = useI18n();
  const data = useLocalData();
  const warnings = data ? lossLimits(data.bets, data.settings).warnings : [];
  if (!warnings.length) return null;
  return (
    <div className={className}>
      {warnings.map((w) => t.limits[w.key](f.money(w.limit, 0))).map((w) => (
        <div key={w} role="alert" className="mb-2 rounded-xl border border-bad/40 bg-bad/10 px-4 py-2.5 text-sm text-bad">
          {w}
        </div>
      ))}
    </div>
  );
}

export function LocalSessionReminder() {
  const data = useLocalData();
  return data ? <SessionReminder minutes={data.settings.sessionReminderMinutes} /> : null;
}

/** When this snapshot of the site was built. */
export function SnapshotNotice({ at }: { at: string }) {
  const { t } = useI18n();
  return (
    <p className="mb-4 text-xs text-muted">
      {t.static.updated} <LocalTime iso={at} format="datetime" /> · {t.static.refresh}
    </p>
  );
}
