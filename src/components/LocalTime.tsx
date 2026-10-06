"use client";
import { useEffect, useState } from "react";
import { INTL } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";

/** Renders a UTC instant in the viewer's own timezone (falls back to UTC until hydrated). */
export function LocalTime({ iso, format = "time" }: { iso: string; format?: "time" | "datetime" | "date" }) {
  const { locale } = useI18n();
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    const d = new Date(iso);
    const opts: Intl.DateTimeFormatOptions =
      format === "time"
        ? { hour: "numeric", minute: "2-digit", timeZoneName: "short" }
        : format === "date"
          ? { weekday: "short", month: "short", day: "numeric" }
          : { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
    setText(d.toLocaleString(INTL[locale], opts));
  }, [iso, format, locale]);
  return <time dateTime={iso} suppressHydrationWarning>{text ?? new Date(iso).toISOString().slice(11, 16) + " UTC"}</time>;
}
