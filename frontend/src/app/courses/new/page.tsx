


import { getTranslator } from "@/lib/locale-server";
import Link from "next/link";

import { StagedGenerateWizard } from "@/components/StagedGenerateWizard";
import { MarkdownImportForm } from "@/components/MarkdownImportForm";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function NewCoursePage({ searchParams }: { searchParams: Promise<{ job?: string }> }) {
  const t = await getTranslator();
  const query = await searchParams;
  const jobId = typeof query.job === "string" ? query.job : undefined;
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <Link
        href="/courses"
        className="text-small text-ink-muted transition-colors duration-fast ease-standard hover:text-ink"
      >
        {t("← All courses")}</Link>
      <PageHeader
        className="mt-4"
        title={t("Create a course")}
        description={t("Combine pasted text, web pages, and PDFs into one course, in any mix.")}
      />
      <div className="mt-8">
        <StagedGenerateWizard key={jobId ?? "new"} initialJobId={jobId} />
      </div>
      <MarkdownImportForm />
    </main>
  );
}
