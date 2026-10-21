import { getTranslator } from "@/lib/locale-server";
import { JobsList } from "@/components/JobsList";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

/**
 * AI generation progress page: every background AI job in one place.
 * Jobs keep running even if the learner navigates away; this page
 * reconnects to each job's live progress.
 */
export default async function JobsPage() {
  const t = await getTranslator();
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
      <PageHeader
        className="mt-4"
        title={t("AI jobs")}
      />
      <p className="mt-2 text-small text-ink-muted">
        {t("Background AI work: generation, regeneration, and reviews. They keep running even if you leave the page.")}
      </p>
      <div className="mt-8">
        <JobsList />
      </div>
    </main>
  );
}
