import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "./render";
import { ThemeProvider, ThemeSwitcher } from "@/components/ThemeProvider";
import { ConceptTreemap } from "@/components/ConceptTreemap";
import { ConceptStats } from "@/components/ConceptMapECharts";
import { JobTrace } from "@/components/JobTrace";
import { LandingPage } from "@/components/landing/LandingPage";
import { normalizeTheme, THEME_COOKIE, THEMES, themeVariables } from "@/lib/theme";
import type { ConceptLesson, ConceptNode } from "@/lib/types";
import type { Job } from "@/lib/api";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("echarts-for-react", () => ({ default: ({ option }: { option: unknown }) => <output data-testid="chart">{JSON.stringify(option)}</output> }));

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});

afterEach(() => {
  document.cookie = `${THEME_COOKIE}=; Path=/; Max-Age=0`;
  document.documentElement.removeAttribute("style");
  delete document.documentElement.dataset.theme;
  vi.restoreAllMocks();
});

describe("saved themes", () => {
  test("accepts only the two supported themes and shares the server token palette", () => {
    expect(normalizeTheme("light")).toBe("light");
    expect(normalizeTheme("dark")).toBe("dark");
    for (const value of [undefined, "system", "garbage"]) expect(normalizeTheme(value)).toBe("light");
    expect(themeVariables("light")["--sf-app"]).toBe(THEMES.light.app);
    expect(themeVariables("dark")["--sf-ink"]).toBe(THEMES.dark.ink);
  });

  test("switches root tokens, homepage layout, and persists a cookie for SSR", () => {
    render(<ThemeProvider initialTheme="dark"><LandingPage courses={[]} unavailable={false} /></ThemeProvider>);
    expect(screen.getByRole("main")).toHaveAttribute("data-theme", "dark");
    fireEvent.click(screen.getByRole("button", { name: "Switch to light theme" }));
    expect(screen.getByRole("main")).toHaveAttribute("data-theme", "light");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(document.documentElement.style.getPropertyValue("--sf-surface")).toBe(THEMES.light.surface);
    expect(document.cookie).toContain(`${THEME_COOKIE}=light`);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("A little curiosity.");
    fireEvent.click(screen.getByRole("button", { name: "Pause background animation" }));
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Switch to dark theme" }));
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(document.cookie).toContain(`${THEME_COOKIE}=dark`);
  });

  test("updates chart colors without changing concept grouping, importance, or mastery counts", () => {
    const lessons = [{ id: 1, index: 0, title: "张量" }] as ConceptLesson[];
    const concepts = [
      { lesson_id: 1, lesson_index: 0, concept_label: "广播", bucket: "not_started", importance: 5 },
      { lesson_id: 1, lesson_index: 0, concept_label: "形状", bucket: "mastered", importance: 2 },
    ] as unknown as ConceptNode[];
    render(<ThemeProvider initialTheme="dark"><ThemeSwitcher /><ConceptTreemap lessons={lessons} concepts={concepts} /><ConceptStats lessons={lessons} concepts={concepts} /></ThemeProvider>);
    const charts = () => screen.getAllByTestId("chart").map(node => JSON.parse(node.textContent!));
    const dark = charts();
    fireEvent.click(screen.getByRole("button", { name: "Switch to light theme" }));
    const light = charts();
    expect(light[0].series[0].data[0].name).toBe("张量");
    expect(light[0].series[0].data[0].children.map((node: { value: number }) => node.value)).toEqual([5, 2]);
    expect(light[0].series[0].data[0].children[0].itemStyle.color).not.toBe(dark[0].series[0].data[0].children[0].itemStyle.color);
    expect(light[0].series[0].itemStyle.borderColor).toBe(THEMES.light.app);
    expect(light[1].series.map((series: { data: number[] }) => series.data)).toEqual(dark[1].series.map((series: { data: number[] }) => series.data));
    expect(light[2].series[0].data.map((node: { value: number }) => node.value)).toEqual([1, 0, 0, 1]);
  });

  test("keeps trace records and payloads across a theme switch with independent keyboard scroll", () => {
    const job = { trace: { entries: [{ at: "2026-10-23T00:00:00", type: "tool_call", tool: "generate_outline", call_id: "abcdef1234", content: "等待返回", input: { topic: "<script>not executable</script>" }, output: { tokens: 24 } }] } } as Job;
    render(<ThemeProvider initialTheme="dark"><ThemeSwitcher /><JobTrace job={job} /></ThemeProvider>);
    fireEvent.click(screen.getByText("输入摘要"));
    expect(screen.getByText(/not executable/)).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByRole("region", { name: "调用记录列表" })).toHaveAttribute("tabindex", "0");
    fireEvent.click(screen.getByRole("button", { name: "Switch to light theme" }));
    expect(screen.getByText("调用 ID：abcdef12")).toBeInTheDocument();
    expect(screen.getByText("输入摘要").parentElement).toHaveAttribute("open");
  });
});
