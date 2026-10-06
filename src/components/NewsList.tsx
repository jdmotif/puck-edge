import type { NewsItem } from "@/lib/news";
import { SOURCES } from "@/lib/news/sources";
import { getI18n } from "@/lib/i18n/server";
import { Pill } from "@/components/ui";

const sourceName = (id: string) => SOURCES.find((s) => s.id === id)?.name ?? id;

export async function NewsList({ items, compact = false }: { items: NewsItem[]; compact?: boolean }) {
  const { f } = await getI18n();
  return (
    <ul className={compact ? "space-y-2" : "space-y-3"}>
      {items.map((n) => (
        <li key={n.id} className={compact ? "" : "card p-3 sm:p-4"}>
          <div className="flex gap-3">
            <div className="min-w-0 flex-1">
              <a href={n.url} target="_blank" rel="noopener noreferrer" className={`font-medium hover:text-accent ${compact ? "text-sm" : ""}`}>
                {n.title}
              </a>
              <div className="mt-0.5 text-xs text-muted">
                {sourceName(n.source)}
                {n.publishedAt > 0 && <> · <time dateTime={new Date(n.publishedAt).toISOString()}>{f.ago(n.publishedAt)}</time></>}
              </div>
              {!compact && n.summary && <p className="mt-1 line-clamp-2 text-sm text-ink-2">{n.summary}</p>}
              {!compact && n.teams.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {n.teams.map((t) => (
                    <a key={t} href={`/news?team=${t}`}><Pill>{t}</Pill></a>
                  ))}
                </div>
              )}
            </div>
            {!compact && n.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={n.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-16 w-20 shrink-0 rounded-lg bg-surface-2 object-cover sm:h-24 sm:w-40" />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
