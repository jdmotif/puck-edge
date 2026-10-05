import { decimalToAmerican } from "@/lib/model/math";

export type Locale = "en" | "fr";
/** Intl tags: English keeps the US look the app always had; French follows Québec (fr-CA) conventions. */
export const INTL: Record<Locale, string> = { en: "en-US", fr: "fr-CA" };

export const pct = (p: number | null | undefined, digits = 0) => (p === null || p === undefined ? "–" : `${(p * 100).toFixed(digits)}%`);
export const signedPct = (p: number, digits = 1) => `${p >= 0 ? "+" : "−"}${Math.abs(p * 100).toFixed(digits)}%`;
export const american = (decimal: number) => {
  const a = decimalToAmerican(decimal);
  return a > 0 ? `+${a}` : String(a);
};
export const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toFixed(2)}`;
export const units = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(2)}u`;
export const record = (r: { w: number; l: number; otl: number }) => `${r.w}-${r.l}-${r.otl}`;
// Round first so 1199.6 s reads 20:00, not 19:60.
export const toiFmt = (sec: number) => {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
export const svPct = (sv: number) => sv.toFixed(3).replace(/^0/, "");
export function ago(ms: number) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 172800) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}

const NBSP = " ";

/**
 * Locale-aware versions of the helpers above. French (Québec) writes 6,5 and 54 %, puts the dollar
 * sign after the amount (12,50 $) and save percentages as ,915; English output is unchanged.
 */
export function makeFormat(locale: Locale) {
  const fr = locale === "fr";
  const tag = INTL[locale];
  const nfCache = new Map<number, Intl.NumberFormat>();
  const nf = (d: number) => {
    let f = nfCache.get(d);
    if (!f) nfCache.set(d, (f = new Intl.NumberFormat(tag, { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: true })));
    return f;
  };
  const num = (n: number, digits = 0) => nf(digits).format(n).replace(/[  ]/g, NBSP).replace("-", "−");
  const pctOf = (p: number, digits: number) => (fr ? `${num(p * 100, digits)}${NBSP}%` : `${(p * 100).toFixed(digits)}%`);
  return {
    locale,
    tag,
    num,
    /** Signed number with a real minus sign: +0,45 / −1,5. */
    signed: (n: number, digits = 0) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${num(Math.abs(n), digits)}`,
    /** Line value: 6,5 or −1,5 / +1,5 when `signed`. */
    line: (n: number, signed = false) => `${signed && n > 0 ? "+" : n < 0 ? "−" : ""}${num(Math.abs(n), Number.isInteger(n) ? 0 : 1)}`,
    pct: (p: number | null | undefined, digits = 0) => (p === null || p === undefined ? "–" : pctOf(p, digits)),
    signedPct: (p: number, digits = 1) => `${p >= 0 ? "+" : "−"}${pctOf(Math.abs(p), digits)}`,
    american,
    decimal: (d: number) => num(d, 2),
    money: (n: number, digits = 2) => {
      const v = num(Math.abs(n), digits);
      return `${n < 0 ? "−" : ""}${fr ? `${v}${NBSP}$` : `$${v}`}`;
    },
    units: (n: number) => `${n >= 0 ? "+" : "−"}${num(Math.abs(n), 2)}${fr ? `${NBSP}u` : "u"}`,
    svPct: (sv: number) => (fr ? num(sv, 3).replace(/^0/, "") : svPct(sv)),
    toi: toiFmt,
    int: (n: number) => num(n, 0),
    /** Calendar date from YYYY-MM-DD, read at local noon so it never slips a day. */
    day: (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(iso + "T12:00:00").toLocaleDateString(tag, opts),
    dateTime: (ms: number) => new Date(ms).toLocaleString(tag),
    time: (ms: number) => new Date(ms).toLocaleTimeString(tag),
    /** Season id 20252026 → 2025–26 (en) or 2025-2026 (fr). */
    season: (s: number) => (fr ? `${String(s).slice(0, 4)}-${String(s).slice(4)}` : `${String(s).slice(0, 4)}–${String(s).slice(6)}`),
    ago: (ms: number) => {
      const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
      if (!fr) return ago(ms);
      if (s < 90) return `il y a ${s}${NBSP}s`;
      if (s < 5400) return `il y a ${Math.round(s / 60)}${NBSP}min`;
      if (s < 172800) return `il y a ${Math.round(s / 3600)}${NBSP}h`;
      return `il y a ${Math.round(s / 86400)}${NBSP}jours`;
    },
  };
}

export type Format = ReturnType<typeof makeFormat>;
