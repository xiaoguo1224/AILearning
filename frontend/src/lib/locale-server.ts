import { cache } from "react";
import { cookies } from "next/headers";
import { createTranslator, LOCALE_COOKIE, normalizeLocale } from "./i18n";

export const getLocale = cache(async () => normalizeLocale((await cookies()).get(LOCALE_COOKIE)?.value));
export async function getTranslator() {
  return createTranslator(await getLocale());
}
