// Language support: English and Québec French. Pure module, safe on the server and in the browser.
import { makeFormat, type Locale } from "@/lib/format";
import type { Market } from "@/lib/grading";
import { en, type Messages } from "./en";
import { fr } from "./fr";

export type { Locale, Messages };
export const LOCALES: Locale[] = ["en", "fr"];
export const LOCALE_COOKIE = "pe-lang";

export const isLocale = (v: unknown): v is Locale => v === "en" || v === "fr";

/** Pick a language from an Accept-Language header: French if the browser prefers it, else English. */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  for (const part of (header ?? "").split(",")) {
    const tag = part.trim().split(";")[0].toLowerCase();
    if (tag.startsWith("fr")) return "fr";
    if (tag.startsWith("en")) return "en";
  }
  return "en";
}

const cache = new Map<Locale, ReturnType<typeof build>>();
function build(locale: Locale) {
  const f = makeFormat(locale);
  return { locale, f, t: (locale === "fr" ? fr : en)(f) };
}

/** Strings (`t`) and number/date formatting (`f`) for a language. */
export function i18n(locale: Locale) {
  let v = cache.get(locale);
  if (!v) cache.set(locale, (v = build(locale)));
  return v;
}
export type I18n = ReturnType<typeof i18n>;

// Picks and bets are stored with English labels; these suffixes recover the player name of a prop.
const PROP_SUFFIX = / (anytime goal|1\+ points|2\+ points)$/;

/**
 * Label for a stored pick or bet in the current language, rebuilt from its market and selection so
 * history logged in one language reads correctly in the other.
 */
export function pickLabel(t: Messages, market: Market | string, selection: string, line: number | null, stored: string) {
  switch (market) {
    case "moneyline":
      return t.label.moneyline(selection);
    case "total":
      return line === null ? stored : t.label.total(selection === "over", line);
    case "puckline":
      return line === null ? stored : t.label.puckline(selection, line);
    case "prop_goal":
    case "prop_point1":
    case "prop_point2":
      return t.label[market](stored.replace(PROP_SUFFIX, ""));
    default:
      return stored;
  }
}
