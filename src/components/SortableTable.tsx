"use client";
import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import type { Format } from "@/lib/format";

export interface Column {
  key: string;
  label: string;
  decimals?: number; // numeric formatting
  format?: "toi" | "sv";
  left?: boolean;
}

type Row = Record<string, string | number | null> & { href?: string };

function fmt(v: string | number | null, c: Column, f: Format) {
  if (v === null || v === undefined) return "–";
  if (typeof v !== "number") return v;
  if (c.format === "toi") return f.toi(v);
  if (c.format === "sv") return f.svPct(v);
  return c.decimals !== undefined ? f.num(v, c.decimals) : String(v);
}

/** Click a header to sort; click again to flip. Shows the first `pageSize` rows with a "show more". */
export function SortableTable({ columns, rows, initialSort, pageSize = 50, ascendingKeys = [] }: { columns: Column[]; rows: Row[]; initialSort: string; pageSize?: number; ascendingKeys?: string[] }) {
  const { t, f } = useI18n();
  const [sort, setSort] = useState(initialSort);
  const [asc, setAsc] = useState(ascendingKeys.includes(initialSort));
  const [limit, setLimit] = useState(pageSize);
  const [q, setQ] = useState("");
  const sorted = useMemo(() => {
    const filtered = q ? rows.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(q.toLowerCase()))) : rows;
    return [...filtered].sort((a, b) => {
      const x = a[sort], y = b[sort];
      if (x === y) return 0;
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return asc ? r : -r;
    });
  }, [rows, sort, asc, q]);
  return (
    <div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.leaders.filter} className="mb-3 w-full border px-3.5 py-2 text-sm sm:w-72" />
      <div className="card overflow-x-auto">
        <table className="tabular w-full min-w-[640px] text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th className="py-3 pl-4 pr-2 text-left">#</th>
              {columns.map((c) => (
                <th key={c.key} className={`px-2 py-3 ${c.left ? "text-left" : "text-right"}`}>
                  <button
                    className={`uppercase tracking-[0.06em] hover:text-ink ${sort === c.key ? "text-accent-2" : ""}`}
                    onClick={() => {
                      if (sort === c.key) setAsc(!asc);
                      else {
                        setSort(c.key);
                        setAsc(ascendingKeys.includes(c.key) || !!c.left);
                      }
                    }}
                    aria-sort={sort === c.key ? (asc ? "ascending" : "descending") : "none"}
                  >
                    {c.label}{sort === c.key ? (asc ? " ▲" : " ▼") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, limit).map((r, i) => (
              <tr key={i} className="border-t border-line">
                <td className="py-2 pl-4 pr-2 text-muted">{i + 1}</td>
                {columns.map((c, j) => (
                  <td key={c.key} className={`px-2 py-2 ${c.left ? "text-left" : "text-right"} ${sort === c.key ? "font-semibold text-ink" : ""}`}>
                    {j === 0 && r.href ? <a className="hover:text-accent-2" href={r.href}>{fmt(r[c.key], c, f)}</a> : fmt(r[c.key], c, f)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length > limit && (
        <button className="mt-3 rounded-full border border-line bg-surface px-4 py-1.5 text-sm font-medium text-ink-2 hover:text-ink" onClick={() => setLimit(limit + pageSize)}>{t.leaders.showMore(sorted.length - limit)}</button>
      )}
    </div>
  );
}
