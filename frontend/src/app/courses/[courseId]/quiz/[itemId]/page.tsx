import { notFound } from "next/navigation";

import { CodeQuestionDetail } from "@/components/CodeQuestionDetail";
import { ErrorState } from "@/components/ui/ErrorState";
import { ApiError, getQuizItem } from "@/lib/api";
import { getTranslator } from "@/lib/locale-server";

export const dynamic = "force-dynamic";

/**
 * Code question detail: the question, the answer editor, the review, and the
 * submission history — on separate tabs, not crammed onto one page.
 */
export default async function CodeQuestionPage({
  params,
}: {
  params: Promise<{ courseId: string; itemId: string }>;
}) {
  const t = await getTranslator();
  const { courseId, itemId } = await params;
  const course = Number(courseId);
  const item = Number(itemId);
  if (
    !/^\d+$/.test(courseId) ||
    !/^\d+$/.test(itemId) ||
    !Number.isSafeInteger(course) ||
    !Number.isSafeInteger(item) ||
    course <= 0 ||
    item <= 0
  ) {
    notFound();
  }

  let question: Awaited<ReturnType<typeof getQuizItem>> | undefined;
  let error: string | undefined;
  try {
    question = await getQuizItem(item, t.locale);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    error = err instanceof ApiError ? err.message : t("Could not reach the server. Is the backend running?");
  }

  if (error || !question) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <ErrorState message={error ?? t("Could not reach the server.")} />
      </main>
    );
  }

  if (question.kind !== "code") notFound();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <CodeQuestionDetail courseId={course} item={question} />
    </main>
  );
}
