import { ButtonLink, Empty, PageTitle } from "@/components/ui";
import { getI18n } from "@/lib/i18n/server";
import { STATIC_SITE } from "@/lib/static/mode";

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <>
      <PageTitle>{t.static.notFoundTitle}</PageTitle>
      <Empty>
        <p>{STATIC_SITE ? t.static.notInSnapshot : t.static.notFound}</p>
        <div className="mt-3"><ButtonLink href="/">{t.static.home}</ButtonLink></div>
      </Empty>
    </>
  );
}
