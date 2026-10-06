import { cookies, headers } from "next/headers";
import { cache } from "react";
import { i18n, isLocale, LOCALE_COOKIE, localeFromAcceptLanguage, type Locale } from "./index";

/** The visitor's language: their saved choice, else what their browser asks for. */
export const getLocale = cache(async (): Promise<Locale> => {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;
  return localeFromAcceptLanguage((await headers()).get("accept-language"));
});

export const getI18n = cache(async () => i18n(await getLocale()));
