


import { getTranslator } from "@/lib/locale-server";
export default async function UsageLoading() {
  const t = await getTranslator();
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
      <div className="flex items-center gap-3 text-ink-muted">
        <span
          aria-hidden
          className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-line-strong border-t-ink"
        />
        <p>{t("Loading usage data...")}</p>
      </div>
    </main>
  );
}
