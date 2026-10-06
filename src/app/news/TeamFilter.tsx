"use client";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/client";
import { BASE_PATH, STATIC_SITE } from "@/lib/static/mode";
import { toStaticHref } from "@/lib/static/paths";

export function TeamFilter({ teams, value, source }: { teams: { abbrev: string; name: string }[]; value?: string; source?: string }) {
  const router = useRouter();
  const { t, locale } = useI18n();
  return (
    <select
      aria-label={t.news.filterTeam}
      value={value ?? ""}
      onChange={(e) => {
        const q = new URLSearchParams();
        if (source) q.set("source", source);
        if (e.target.value) q.set("team", e.target.value);
        const href = `/news${q.size ? `?${q}` : ""}`;
        if (STATIC_SITE) window.location.href = toStaticHref(href, BASE_PATH, locale === "fr");
        else router.push(href);
      }}
      className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm"
    >
      <option value="">{t.common.allTeams}</option>
      {teams.map((t) => (
        <option key={t.abbrev} value={t.abbrev}>{t.name}</option>
      ))}
    </select>
  );
}
