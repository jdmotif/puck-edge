import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SessionReminder } from "@/components/SessionReminder";
import { getSettings } from "@/lib/settings";
import { lossLimitStatus } from "@/lib/data/bankroll";

export const metadata: Metadata = { title: "Puck Edge", description: "Data-driven NHL picks, schedules and results" };
export const viewport: Viewport = { themeColor: "#0e0f11", width: "device-width", initialScale: 1 };
export const dynamic = "force-dynamic";

const NAV = [
  { href: "/", label: "Tonight" },
  { href: "/lineups", label: "Lineups" },
  { href: "/schedule", label: "Schedule" },
  { href: "/results", label: "Results" },
  { href: "/standings", label: "Standings" },
  { href: "/leaders", label: "Leaders" },
  { href: "/model", label: "Model" },
  { href: "/bets", label: "Bets" },
  { href: "/settings", label: "Settings" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = getSettings();
  const limits = lossLimitStatus();
  return (
    <html lang="en">
      <body className="min-h-dvh font-sans">
        <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
            <a href="/" className="text-base font-bold tracking-tight">
              Puck<span className="text-accent">Edge</span>
            </a>
            <nav className="-mx-1 flex flex-1 gap-1 overflow-x-auto text-sm">
              {NAV.map((n) => (
                <a key={n.href} href={n.href} className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-ink-2 hover:bg-surface hover:text-ink">
                  {n.label}
                </a>
              ))}
            </nav>
          </div>
        </header>
        {limits.warnings.length > 0 && (
          <div className="mx-auto max-w-6xl px-4 pt-3">
            {limits.warnings.map((w) => (
              <div key={w} role="alert" className="mb-2 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
                {w}
              </div>
            ))}
          </div>
        )}
        <main className="mx-auto max-w-6xl px-4 py-5">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-10 pt-4 text-xs text-muted">
          Picks are probabilities, not guarantees. Bet only what you can afford to lose.
        </footer>
        <SessionReminder minutes={settings.sessionReminderMinutes} />
      </body>
    </html>
  );
}
