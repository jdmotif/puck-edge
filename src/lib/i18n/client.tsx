"use client";
import { createContext, useContext, type ReactNode } from "react";
import { i18n, type Locale } from "./index";

const Ctx = createContext<Locale>("en");

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <Ctx.Provider value={locale}>{children}</Ctx.Provider>;
}

export const useI18n = () => i18n(useContext(Ctx));
