


import { getTranslator } from "@/lib/locale-server";
import Link from "next/link";

import { GenerateForm } from "@/components/GenerateForm";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function NewCoursePage() {
  const t = await getTranslator();
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
        <GenerateForm />
      </div>
    </main>
  );
}
