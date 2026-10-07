import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Barlow_Condensed, Inter } from "next/font/google";
import { SessionReminder } from "@/components/SessionReminder";
import { MobileNav, Sidebar } from "@/components/AppNav";
import { getSettings } from "@/lib/settings";
import { lossLimitStatus } from "@/lib/data/bankroll";
import type { LossWarning } from "@/lib/bankroll-math";
import { getI18n } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/client";
import { BASE_PATH, STATIC_SITE } from "@/lib/static/mode";
import { bootScript } from "@/lib/static/paths";
import { LocalSessionReminder, LossLimitAlerts, SnapshotNotice } from "@/components/StaticExtras";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: "Puck Edge", description: t.meta.description };
}
export const viewport: Viewport = { themeColor: "#080b12", width: "device-width", initialScale: 1 };
export const dynamic = "force-dynamic";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const barlow = Barlow_Condensed({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-barlow", display: "swap" });

const ROUTES = ["/", "/lineups", "/schedule", "/results", "/standings", "/leaders", "/news", "/model", "/odds", "/parlay", "/bets", "/roi", "/settings"];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, t, f } = await getI18n();
  const settings = getSettings();
  const limits = STATIC_SITE ? { warnings: [] as LossWarning[] } : lossLimitStatus();
  const nav = ROUTES.map((href) => ({ href, label: t.nav[href] }));
  return (
    <html lang={locale} className={`${inter.variable} ${barlow.variable}`} data-built-at={STATIC_SITE ? new Date().toISOString() : undefined}>
      {STATIC_SITE && (
        <head>
          <script dangerouslySetInnerHTML={{ __html: bootScript(BASE_PATH) }} />
        </head>
      )}
      <body className="min-h-dvh font-sans">
        <I18nProvider locale={locale}>
        <Sidebar items={nav} />
        <MobileNav items={nav} />
        <div className="lg:pl-[var(--sidebar)]">
          {STATIC_SITE && <LossLimitAlerts className="mx-auto max-w-7xl px-4 pt-4 lg:px-8" />}
          {limits.warnings.length > 0 && (
            <div className="mx-auto max-w-7xl px-4 pt-4 lg:px-8">
              {limits.warnings.map((w) => t.limits[w.key](f.money(w.limit, 0))).map((w) => (
                <div key={w} role="alert" className="mb-2 rounded-xl border border-bad/40 bg-bad/10 px-4 py-2.5 text-sm text-bad">
                  {w}
                </div>
              ))}
            </div>
          )}
          <main className="mx-auto max-w-7xl px-4 pb-28 pt-5 lg:px-8 lg:pb-12 lg:pt-8">
            {STATIC_SITE && <SnapshotNotice at={new Date().toISOString()} />}
            {children}
          </main>
          <footer className="mx-auto max-w-7xl px-4 pb-28 text-xs text-muted lg:hidden">
            {t.common.disclaimer}
          </footer>
        </div>
        {STATIC_SITE ? <LocalSessionReminder /> : <SessionReminder minutes={settings.sessionReminderMinutes} />}
        </I18nProvider>
      </body>
    </html>
  );
}
