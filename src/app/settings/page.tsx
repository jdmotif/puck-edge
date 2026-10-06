import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSettings, saveSettings } from "@/lib/settings";
import { Card, PageTitle, Rich } from "@/components/ui";
import { getI18n } from "@/lib/i18n/server";
import { sqlite } from "@/db";

export const dynamic = "force-dynamic";

async function save(form: FormData) {
  "use server";
  const num = (k: string, scale = 1) => {
    const v = Number(String(form.get(k) ?? "").trim().replace(",", "."));
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
  const { t, f, locale } = await getI18n();
  const S = t.settings;
  // French shows 0,25 in the inputs; save() accepts either separator.
  const shown = (v: number) => (locale === "fr" ? String(v).replace(".", ",") : v);
  const s = getSettings();
  const lastSync = sqlite.prepare("SELECT started_at, finished_at, games_added, message FROM sync_log ORDER BY id DESC LIMIT 1").get() as
    | { started_at: number; finished_at: number | null; games_added: number; message: string | null }
    | undefined;
  const games = (sqlite.prepare("SELECT COUNT(*) AS n FROM games").get() as { n: number }).n;
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
      <PageTitle>{S.title}</PageTitle>
      {saved && <div className="mb-3 rounded-xl border border-good/40 bg-good/10 px-4 py-2.5 text-sm text-good">{S.saved}</div>}
      <form action={save} className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="font-display text-lg font-bold uppercase tracking-wide">{S.picks}</h2>
          <Field name="edgeThreshold" label={S.edge} value={shown(+(s.edgeThreshold * 100).toFixed(2))} hint={S.edgeHint} />
          <Field name="kellyFraction" label={S.kelly} value={shown(s.kellyFraction)} hint={S.kellyHint} />
          <Field name="maxStakePct" label={S.maxStake} value={shown(+(s.maxStakePct * 100).toFixed(2))} />
          <Field name="startingBankroll" label={S.bankroll} value={shown(s.startingBankroll)} />
          <label className="block">
            <span className="text-sm font-medium">{S.where}</span>
            <select name="oddsCountry" defaultValue={s.oddsCountry} className={input}>
              <option value="CA">{S.ca}</option>
              <option value="US">{S.us}</option>
            </select>
            <span className="text-xs text-muted">{S.whereHint}</span>
          </label>
        </Card>
        <Card className="space-y-3">
          <h2 className="font-display text-lg font-bold uppercase tracking-wide">{S.rg}</h2>
          <Field name="dailyLossLimit" label={S.daily} value={shown(s.dailyLossLimit)} hint={S.dailyHint} />
          <Field name="weeklyLossLimit" label={S.weekly} value={shown(s.weeklyLossLimit)} />
          <Field name="sessionReminderMinutes" label={S.reminder} value={s.sessionReminderMinutes} />
          <p className="text-xs text-muted">{S.rgNote}</p>
        </Card>
        <button className="bg-accent px-4 py-2.5 font-semibold text-white lg:col-span-2">{S.save}</button>
      </form>
      <Card className="mt-4 text-sm">
        <h2 className="mb-1 font-display text-lg font-bold uppercase tracking-wide">{S.data}</h2>
        <p className="text-ink-2">{S.stored(games)}{lastSync ? S.lastSync(f.dateTime(lastSync.started_at), lastSync.finished_at ? S.added(lastSync.games_added, lastSync.message) : null) : S.noSync}</p>
        <p className="mt-1 text-xs text-muted"><Rich text={S.syncHint(!!process.env.ODDS_API_KEY)} /></p>
      </Card>
    </>
  );
}
