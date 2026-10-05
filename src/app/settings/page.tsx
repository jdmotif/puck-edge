import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSettings, saveSettings } from "@/lib/settings";
import { Card, PageTitle } from "@/components/ui";
import { sqlite } from "@/db";

export const dynamic = "force-dynamic";

async function save(form: FormData) {
  "use server";
  const num = (k: string, scale = 1) => {
    const v = Number(form.get(k));
    return Number.isFinite(v) ? v * scale : undefined;
  };
  saveSettings({
    edgeThreshold: num("edgeThreshold", 0.01),
    kellyFraction: num("kellyFraction"),
    maxStakePct: num("maxStakePct", 0.01),
    startingBankroll: num("startingBankroll"),
    dailyLossLimit: num("dailyLossLimit"),
    weeklyLossLimit: num("weeklyLossLimit"),
    sessionReminderMinutes: num("sessionReminderMinutes"),
    oddsCountry: form.get("oddsCountry") === "US" ? "US" : "CA",
  });
  revalidatePath("/", "layout");
  redirect("/settings?saved=1");
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams;
  const s = getSettings();
  const lastSync = sqlite.prepare("SELECT started_at, finished_at, games_added, message FROM sync_log ORDER BY id DESC LIMIT 1").get() as
    | { started_at: number; finished_at: number | null; games_added: number; message: string | null }
    | undefined;
  const games = (sqlite.prepare("SELECT COUNT(*) AS n FROM games").get() as { n: number }).n;
  const input = "mt-1 w-full border px-3 py-2";
  const Field = ({ name, label, value, hint }: { name: string; label: string; value: number; hint?: string }) => (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input name={name} defaultValue={value} inputMode="decimal" className={input} />
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
  return (
    <>
      <PageTitle>Settings</PageTitle>
      {saved && <div className="mb-3 rounded-xl border border-good/40 bg-good/10 px-4 py-2.5 text-sm text-good">Saved.</div>}
      <form action={save} className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="font-display text-lg font-bold uppercase tracking-wide">Picks and staking</h2>
          <Field name="edgeThreshold" label="Value pick threshold (edge %)" value={+(s.edgeThreshold * 100).toFixed(2)} hint="A pick is labelled Value only when model − market is at least this. Default 3." />
          <Field name="kellyFraction" label="Kelly fraction" value={s.kellyFraction} hint="0.25 = quarter Kelly (default). Full Kelly is very aggressive." />
          <Field name="maxStakePct" label="Max stake per bet (% of bankroll)" value={+(s.maxStakePct * 100).toFixed(2)} />
          <Field name="startingBankroll" label="Starting bankroll ($)" value={s.startingBankroll} />
          <label className="block">
            <span className="text-sm font-medium">Where you bet</span>
            <select name="oddsCountry" defaultValue={s.oddsCountry} className={input}>
              <option value="CA">Canada (FanDuel lines)</option>
              <option value="US">United States (DraftKings lines)</option>
            </select>
            <span className="text-xs text-muted">Totals and puck-line prices come from this country&apos;s NHL betting partner, and best prices are limited to its books.</span>
          </label>
        </Card>
        <Card className="space-y-3">
          <h2 className="font-display text-lg font-bold uppercase tracking-wide">Responsible gambling</h2>
          <Field name="dailyLossLimit" label="Daily loss limit ($, 0 = off)" value={s.dailyLossLimit} hint="You'll see a warning at 80% and when it's reached." />
          <Field name="weeklyLossLimit" label="Weekly loss limit ($, 0 = off)" value={s.weeklyLossLimit} />
          <Field name="sessionReminderMinutes" label="Session reminder (minutes, 0 = off)" value={s.sessionReminderMinutes} />
          <p className="text-xs text-muted">Picks are probabilities, not guarantees. If betting stops being fun, take a break. Help is available at ConnexOntario 1-866-531-2600 (Canada) or 1-800-GAMBLER (US).</p>
        </Card>
        <button className="bg-accent px-4 py-2.5 font-semibold text-white lg:col-span-2">Save settings</button>
      </form>
      <Card className="mt-4 text-sm">
        <h2 className="mb-1 font-display text-lg font-bold uppercase tracking-wide">Data</h2>
        <p className="text-ink-2">{games} games stored. {lastSync ? `Last sync ${new Date(lastSync.started_at).toLocaleString()}${lastSync.finished_at ? `, added ${lastSync.games_added} (${lastSync.message})` : " (didn't finish)"}.` : "The backfill hasn't run yet."}</p>
        <p className="mt-1 text-xs text-muted">Run <code className="text-ink">npm run sync</code> nightly (see README for a scheduler example). Odds: {process.env.ODDS_API_KEY ? "The Odds API key is set." : "no ODDS_API_KEY set; moneyline, totals and puck-line prices come from the free NHL feeds."}</p>
      </Card>
    </>
  );
}
