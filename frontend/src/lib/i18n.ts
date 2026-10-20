import zh from "./messages/zh-CN.json";

export type Locale = "zh-CN" | "en";
export const DEFAULT_LOCALE: Locale = "zh-CN";
export const LOCALE_COOKIE = "studyforge_locale";

export function normalizeLocale(value?: string | null): Locale {
  return value === "en" ? "en" : DEFAULT_LOCALE;
}

export function browserLocale(): Locale {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  const cookie = document.cookie.split(";").find((part) => part.trim().startsWith(`${LOCALE_COOKIE}=`));
  return normalizeLocale(cookie?.trim().slice(LOCALE_COOKIE.length + 1));
}

export type Translator = ((message: string, ...values: (string | number)[]) => string) & { locale: Locale };

/** Only application copy is translated; source materials and saved learning content stay intact. */
export function createTranslator(locale: Locale): Translator {
  return Object.assign((message: string, ...values: (string | number)[]) => {
    const translated = (zh as Record<string, string>)[message.trim()];
    const template = locale === "en" || translated === undefined ? message : message.replace(message.trim(), translated);
    return template.replace(/\{(\d+)\}/g, (placeholder, index: string) => String(values[Number(index)] ?? placeholder));
  }, { locale });
}
