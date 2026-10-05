import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Barlow_Condensed, Inter } from "next/font/google";
import { SessionReminder } from "@/components/SessionReminder";
import { MobileNav, Sidebar } from "@/components/AppNav";
import { getSettings } from "@/lib/settings";
import { lossLimitStatus } from "@/lib/data/bankroll";

export const metadata: Metadata = { title: "Puck Edge", description: "Data-driven NHL picks, schedules and results" };
export const viewport: Viewport = { themeColor: "#080b12", width: "device-width", initialScale: 1 };
export const dynamic = "force-dynamic";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const barlow = Barlow_Condensed({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-barlow", display: "swap" });

const NAV = [
  { href: "/", label: "Tonight" },
  { href: "/schedule", label: "Schedule" },
  { href: "/results", label: "Results" },
  { href: "/standings", label: "Standings" },
  { href: "/leaders", label: "Leaders" },
  { href: "/news", label: "News" },
  { href: "/model", label: "Model" },
  { href: "/bets", label: "Bets" },
  { href: "/settings", label: "Settings" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = getSettings();
  const limits = lossLimitStatus();
  return (
    <html lang="en" className={`${inter.variable} ${barlow.variable}`}>
      <body className="min-h-dvh font-sans">
        <Sidebar items={NAV} />
        <MobileNav items={NAV} />
        <div className="lg:pl-[var(--sidebar)]">
          {limits.warnings.length > 0 && (
            <div className="mx-auto max-w-7xl px-4 pt-4 lg:px-8">
              {limits.warnings.map((w) => (
                <div key={w} role="alert" className="mb-2 rounded-xl border border-bad/40 bg-bad/10 px-4 py-2.5 text-sm text-bad">
                  {w}
                </div>
              ))}
            </div>
          )}
          <main className="mx-auto max-w-7xl px-4 pb-28 pt-5 lg:px-8 lg:pb-12 lg:pt-8">{children}</main>
          <footer className="mx-auto max-w-7xl px-4 pb-28 text-xs text-muted lg:hidden">
            Picks are probabilities, not guarantees. Bet only what you can afford to lose.
          </footer>
        </div>
        <SessionReminder minutes={settings.sessionReminderMinutes} />
      </body>
    </html>
  );
}
