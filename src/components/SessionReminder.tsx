"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/client";

/** Gentle nudge after N minutes in the app. Session start is kept per browser tab. */
export function SessionReminder({ minutes }: { minutes: number }) {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!minutes) return;
    let start = Date.now();
    try {
      const s = sessionStorage.getItem("pe-session-start");
      if (s) start = Number(s);
      else sessionStorage.setItem("pe-session-start", String(start));
    } catch {}
    const due = start + minutes * 60_000;
    const t = setTimeout(() => setShow(true), Math.max(0, due - Date.now()));
    return () => clearTimeout(t);
  }, [minutes]);
  if (!show) return null;
  return (
    <div className="fixed inset-x-3 bottom-20 z-50 mx-auto max-w-md rounded-xl border border-line bg-surface-2 p-4 text-sm shadow-xl md:bottom-6">
      <p>{t.common.sessionReminder(minutes)}</p>
      <button
        className="mt-2 rounded-md bg-accent px-3 py-1 text-white"
        onClick={() => {
          try {
            sessionStorage.setItem("pe-session-start", String(Date.now()));
          } catch {}
          setShow(false);
        }}
      >
        {t.common.gotIt}
      </button>
    </div>
  );
}
