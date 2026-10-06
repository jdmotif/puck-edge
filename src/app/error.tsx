"use client";
import { useI18n } from "@/lib/i18n/client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  return (
    <div className="rounded-xl border border-bad/40 bg-bad/10 p-6 text-sm">
      <p className="font-semibold text-bad">{t.common.errorTitle}</p>
      <p className="mt-1 text-ink-2">{error.message}</p>
      <button onClick={reset} className="mt-3 rounded-md bg-accent px-3 py-1.5 text-white">{t.common.tryAgain}</button>
    </div>
  );
}
