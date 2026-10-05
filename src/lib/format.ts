import { decimalToAmerican } from "@/lib/model/math";

export const pct = (p: number | null | undefined, digits = 0) => (p === null || p === undefined ? "–" : `${(p * 100).toFixed(digits)}%`);
export const signedPct = (p: number, digits = 1) => `${p >= 0 ? "+" : "−"}${Math.abs(p * 100).toFixed(digits)}%`;
export const american = (decimal: number) => {
  const a = decimalToAmerican(decimal);
  return a > 0 ? `+${a}` : String(a);
};
export const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toFixed(2)}`;
export const units = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(2)}u`;
export const record = (r: { w: number; l: number; otl: number }) => `${r.w}-${r.l}-${r.otl}`;
export const toiFmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
export const svPct = (sv: number) => sv.toFixed(3).replace(/^0/, "");
export function ago(ms: number) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 172800) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}
