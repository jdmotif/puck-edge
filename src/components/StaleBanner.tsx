import { getI18n } from "@/lib/i18n/server";

/** Shown whenever a page is rendering cached data because the live request failed. */
export async function StaleBanner({ items }: { items: { fetchedAt: number; stale: boolean; error?: string; data?: unknown }[] }) {
  const { t, f } = await getI18n();
  const stale = items.filter((i) => i.stale);
  if (!stale.length) return null;
  const missing = stale.filter((i) => i.data === null || i.fetchedAt === 0);
  const oldest = Math.min(...stale.filter((i) => i.fetchedAt > 0).map((i) => i.fetchedAt));
  return (
    <div role="status" className="mb-4 flex gap-2.5 rounded-xl border border-warn/30 bg-warn/10 px-4 py-2.5 text-sm text-warn">
      <span aria-hidden>●</span>
      <span>
        {Number.isFinite(oldest) && t.common.stale(f.dateTime(oldest), f.ago(oldest))}
        {missing.length > 0 && t.common.missing(missing[0].error ?? "")}
        {t.common.willRefresh}
      </span>
    </div>
  );
}
