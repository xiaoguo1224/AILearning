import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { LanguageSwitcher, LocaleProvider, useI18n } from "@/components/LocaleProvider";
import { createTranslator, LOCALE_COOKIE, normalizeLocale } from "@/lib/i18n";
import { getLocale } from "@/lib/locale-server";
import { cookies } from "next/headers";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

function Sample() {
  const { t } = useI18n();
  return <><LanguageSwitcher /><h1>{t("Create a course")}</h1><p>Original course source</p></>;
}

beforeEach(() => {
  document.cookie = `${LOCALE_COOKIE}=; Max-Age=0; Path=/`;
  vi.clearAllMocks();
});
afterEach(() => {
  document.cookie = `${LOCALE_COOKIE}=; Max-Age=0; Path=/`;
  vi.unstubAllGlobals();
});

describe("language preferences", () => {
  test("defaults to Chinese and keeps source content intact", () => {
    render(<Sample />);
    expect(screen.getByRole("heading", { name: "创建课程" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "语言" })).toHaveValue("zh-CN");
    expect(screen.getByText("Original course source")).toBeInTheDocument();
    expect(normalizeLocale("untrusted")).toBe("zh-CN");
  });

  test("persists both switch directions and refreshes the server-rendered route", () => {
    const { rerender } = render(<LocaleProvider locale="zh-CN"><Sample /></LocaleProvider>);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "en" } });
    expect(document.cookie).toContain(`${LOCALE_COOKIE}=en`);
    expect(refresh).toHaveBeenCalledTimes(1);
    rerender(<LocaleProvider locale="en"><Sample /></LocaleProvider>);
    expect(screen.getByRole("heading", { name: "Create a course" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "zh-CN" } });
    expect(document.cookie).toContain(`${LOCALE_COOKIE}=zh-CN`);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  test("reads the same preference on the server with a safe default", async () => {
    vi.mocked(cookies).mockResolvedValue({ get: () => undefined } as unknown as Awaited<ReturnType<typeof cookies>>);
    await expect(getLocale()).resolves.toBe("zh-CN");
    vi.mocked(cookies).mockResolvedValue({ get: () => ({ value: "en" }) } as unknown as Awaited<ReturnType<typeof cookies>>);
    await expect(getLocale()).resolves.toBe("en");
  });

  test("substitutes values and preserves source fallback and spacing", () => {
    const t = createTranslator("zh-CN");
    expect(t(" {0} concepts are due for review ", 3)).toBe(" 3 个知识点待复习 ");
    expect(t("A source sentence outside application copy")).toBe("A source sentence outside application copy");
    expect(createTranslator("en")("Loading your conversation…")).toBe("Loading your conversation…");
  });
});

test.each(["en", "zh-CN"] as const)("sends %s to the API from browser and explicit server requests", async (locale) => {
  document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/`;
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
  vi.stubGlobal("fetch", fetch);
  const { listCourses } = await import("@/lib/api");
  await listCourses();
  await listCourses(locale);
  expect(fetch).toHaveBeenCalledTimes(2);
  for (const [, init] of fetch.mock.calls) {
    expect(init.headers.get("Accept-Language")).toBe(locale);
    expect(init.cache).toBe("no-store");
  }
});
