import { american } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";

/** A decimal price shown as American and decimal odds; OddsFormat picks which one is visible. */
export async function Odds({ d, best = false }: { d: number | null | undefined; best?: boolean }) {
  if (!d) return <span className="text-muted">–</span>;
  const { f } = await getI18n();
  return (
    <span className={`tabular ${best ? "font-bold text-edge" : ""}`}>
      <span className="odds-us">{american(d)}</span>
      <span className="odds-dec">{f.decimal(d)}</span>
    </span>
  );
}
