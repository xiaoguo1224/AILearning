import { beforeEach, describe, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "./render";
import HomePage from "@/app/page";
import { LandingPage } from "@/components/landing/LandingPage";
import { LocaleProvider } from "@/components/LocaleProvider";
import { listCourses } from "@/lib/api";
import { AppShell } from "@/components/AppShell";

vi.mock("@/lib/api", () => ({ listCourses: vi.fn() }));
const navigation = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/components/AppSidebar", () => ({ AppSidebar: () => <aside>Workspace sidebar</aside>, MobileTopBar: () => <header>Workspace header</header> }));

const courses = [{ id: 42, title: "PyTorch 张量与广播", description: "Shapes and broadcasting" }];

describe("learning landing page", () => {
  beforeEach(() => { vi.clearAllMocks(); navigation.pathname = "/"; });

  test("uses saved course titles and links without fetching review or generating content", async () => {
    vi.mocked(listCourses).mockResolvedValue(courses);
    render(await HomePage());
    expect(listCourses).toHaveBeenCalledWith("en");
    expect(screen.getAllByRole("link", { name: /PyTorch 张量与广播/ })).toHaveLength(2);
    for (const link of screen.getAllByRole("link", { name: /PyTorch 张量与广播/ })) expect(link).toHaveAttribute("href", "/courses/42");
    expect(document.querySelector('a[href="/today"]')).toBeNull();
  });

  test("distinguishes no courses from unavailable backend and keeps entry points", async () => {
    vi.mocked(listCourses).mockRejectedValue(new Error("private/internal/path"));
    render(await HomePage());
    expect(screen.getByRole("status")).toHaveTextContent("Courses are temporarily unavailable");
    expect(screen.queryByText(/private\/internal/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Create my first course" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Enter my workspace" })).toHaveAttribute("href", "/projects");
  });

  test("offers the first course creation for an empty library", async () => {
    vi.mocked(listCourses).mockResolvedValue([]);
    render(await HomePage());
    expect(screen.getByRole("link", { name: "Create my first course" })).toHaveAttribute("href", "/courses/new");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  test("pauses the marquee, hides its duplicate from focus, and opens mobile navigation", () => {
    render(<LandingPage courses={courses} unavailable={false} />);
    const button = screen.getAllByRole("button", { name: "Pause course animation" })[0];
    fireEvent.click(button);
    expect(screen.getAllByRole("button", { name: "Resume course animation" })[0]).toHaveAttribute("aria-pressed", "true");
    expect(document.querySelector('[data-paused="true"]')).not.toBeNull();
    const duplicate = document.querySelector('[aria-hidden="true"][inert]');
    expect(duplicate).not.toBeNull();
    expect(duplicate?.querySelector("a")).toHaveAttribute("href", "/courses/42");
    fireEvent.click(screen.getByRole("button", { name: "Toggle navigation" }));
    expect(screen.getByRole("navigation", { name: "Mobile navigation" })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("link", { name: "My courses" })[1]);
    expect(screen.queryByRole("navigation", { name: "Mobile navigation" })).not.toBeInTheDocument();
  });

  test("allows keyboard access to both scenes with reduced motion", () => {
    const media = vi.spyOn(window, "matchMedia").mockReturnValueOnce({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList);
    render(<LandingPage courses={courses} unavailable={false} />);
    const scene = screen.getByRole("link", { name: "Explore my courses" }).parentElement;
    expect(scene?.inert).toBe(false);
    media.mockRestore();
  });

  test("updates scroll progress and removes listeners on unmount", () => {
    const cancel = vi.spyOn(window, "cancelAnimationFrame");
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<LandingPage courses={courses} unavailable={false} />);
    const journey = screen.getByRole("region", { name: "A journey from curiosity to understanding" });
    vi.spyOn(journey, "getBoundingClientRect").mockReturnValue({ top: -1000, height: 2000 } as DOMRect);
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { callback(0); return 1; });
    act(() => fireEvent.scroll(window));
    expect(Number(journey.style.getPropertyValue("--progress"))).toBeGreaterThan(0);
    expect(journey).toHaveAttribute("data-scene", "courses");
    expect(screen.getByRole("heading", { level: 1 }).parentElement?.parentElement?.inert).toBe(true);
    unmount();
    expect(cancel).toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
    raf.mockRestore(); cancel.mockRestore(); remove.mockRestore();
  });

  test("localizes the introduction without translating saved course content", () => {
    render(<LocaleProvider locale="zh-CN"><LandingPage courses={courses} unavailable={false} /></LocaleProvider>);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("把好奇心");
    expect(screen.getAllByRole("link", { name: /PyTorch 张量与广播/ })[0]).toHaveAttribute("href", "/courses/42");
  });

  test("uses the full canvas only at home and restores the workspace shell on navigation", () => {
    const { rerender } = render(<AppShell><p>Page content</p></AppShell>);
    expect(screen.queryByText("Workspace sidebar")).not.toBeInTheDocument();
    navigation.pathname = "/courses/42";
    rerender(<AppShell><p>Page content</p></AppShell>);
    expect(screen.getByText("Workspace sidebar")).toBeInTheDocument();
    expect(screen.getByText("Workspace header")).toBeInTheDocument();
    expect(screen.getByText("Page content")).toBeInTheDocument();
  });
});
