"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="rounded-xl border border-bad/40 bg-bad/10 p-6 text-sm">
      <p className="font-semibold text-bad">This page hit a problem loading data.</p>
      <p className="mt-1 text-ink-2">{error.message}</p>
      <button onClick={reset} className="mt-3 rounded-md bg-accent px-3 py-1.5 text-white">Try again</button>
    </div>
  );
}
