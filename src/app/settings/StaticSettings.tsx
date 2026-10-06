"use client";
import { useState } from "react";
import { Card } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";
import { saveSettings, useLocalData } from "@/lib/static/store";

/** Settings form on the static site: staking and limits are saved in this browser. */
export function StaticSettings() {
  const { t, f, locale } = useI18n();
  const S = t.settings;
  const data = useLocalData();
  const [saved, setSaved] = useState(false);
  if (!data) return null;
  const s = data.settings;
  // French shows 0,25 in the inputs; either separator is accepted.
  const shown = (v: number) => (locale === "fr" ? String(v).replace(".", ",") : v);
  const input = "mt-1 w-full border px-3 py-2";
  const Field = ({ name, label, value, hint }: { name: string; label: string; value: number | string; hint?: string }) => (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input name={name} defaultValue={value} inputMode="decimal" className={input} />
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
  return (
    <>
      {saved && <div className="mb-3 rounded-xl border border-good/40 bg-good/10 px-4 py-2.5 text-sm text-good">{S.saved}</div>}
      <form
        className="grid gap-4 lg:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const num = (k: string, scale = 1) => {
            const v = Number(String(form.get(k) ?? "").trim().replace(",", "."));
            return Number.isFinite(v) ? v * scale : undefined;
          };
          const patch = {
            kellyFraction: num("kellyFraction"),
            maxStakePct: num("maxStakePct", 0.01),
            startingBankroll: num("startingBankroll"),
            dailyLossLimit: num("dailyLossLimit"),
            weeklyLossLimit: num("weeklyLossLimit"),
            sessionReminderMinutes: num("sessionReminderMinutes"),
          };
          saveSettings(Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
          setSaved(true);
          window.scrollTo({ top: 0 });
        }}
      >
        <Card className="space-y-3">
          <h2 className="font-display text-lg font-bold uppercase tracking-wide">{S.picks}</h2>
          <Field name="kellyFraction" label={S.kelly} value={shown(s.kellyFraction)} hint={S.kellyHint} />
          <Field name="maxStakePct" label={S.maxStake} value={shown(+(s.maxStakePct * 100).toFixed(2))} />
          <Field name="startingBankroll" label={S.bankroll} value={shown(s.startingBankroll)} />
          <p className="text-xs text-muted">{S.staticFixed(f.pct(s.edgeThreshold), S.ca)}</p>
        </Card>
        <Card className="space-y-3">
          <h2 className="font-display text-lg font-bold uppercase tracking-wide">{S.rg}</h2>
          <Field name="dailyLossLimit" label={S.daily} value={shown(s.dailyLossLimit)} hint={S.dailyHint} />
          <Field name="weeklyLossLimit" label={S.weekly} value={shown(s.weeklyLossLimit)} />
          <Field name="sessionReminderMinutes" label={S.reminder} value={s.sessionReminderMinutes} />
          <p className="text-xs text-muted">{S.rgNote}</p>
        </Card>
        <button className="bg-accent px-4 py-2.5 font-semibold text-white lg:col-span-2">{S.save}</button>
        <p className="text-xs text-muted lg:col-span-2">{S.staticStored}</p>
      </form>
    </>
  );
}
