import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "./render";
import { LoginForm } from "@/components/LoginForm";
import { AppShell } from "@/components/AppShell";

const navigation = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation, usePathname: () => "/login" }));
vi.mock("@/components/AppSidebar", () => ({ AppSidebar: () => <aside>Private sidebar</aside>, MobileTopBar: () => <header>Private topbar</header> }));
vi.mock("@/components/CostBanner", () => ({ CostBanner: () => <div>Private costs</div> }));
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

function submit() {
  fireEvent.change(screen.getByLabelText("Workspace password"), { target: { value: "test-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Enter workspace" }));
}

test("password-only entry has no private shell and can pause the shared animation", () => {
  render(<AppShell><LoginForm next="/projects" /></AppShell>);
  expect(screen.queryByText("Private sidebar")).not.toBeInTheDocument();
  expect(screen.queryByText("Private costs")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Workspace password")).toHaveAttribute("type", "password");
  expect(screen.getByLabelText("Workspace password").closest("form")).toHaveAttribute("method", "post");
  expect(document.querySelectorAll("input")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Pause background animation" }));
  expect(screen.getByRole("button", { name: "Resume background animation" })).toHaveAttribute("aria-pressed", "true");
});

test("submits once, keeps pending state, and returns to the requested page", async () => {
  let finish!: (response: Response) => void;
  const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise<Response>((resolve) => { finish = resolve; }));
  vi.stubGlobal("fetch", fetch);
  render(<LoginForm next="/courses/42?tab=quiz" />);
  submit();
  expect(screen.getByRole("button", { name: "Signing in…" })).toBeDisabled();
  fireEvent.submit(document.querySelector("form")!);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toEqual({ password: "test-password" });
  finish(new Response(null, { status: 204 }));
  await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/courses/42?tab=quiz"));
  expect(navigation.refresh).toHaveBeenCalled();
});

test.each([
  [401, "Incorrect password. Please try again."],
  [429, "Too many attempts. Try again in a minute."],
  [503, "Sign-in is temporarily unavailable. Please try again."],
] as const)("handles sign-in error %s without exposing internal messages", async (status, message) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private stack", { status })));
  render(<LoginForm next="/projects" />);
  submit();
  expect(await screen.findByRole("alert")).toHaveTextContent(message);
  expect(screen.queryByText("private stack")).not.toBeInTheDocument();
  expect(navigation.replace).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Enter workspace" })).toBeEnabled();
});

test("handles network errors and permits retry", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
  render(<LoginForm next="/projects" />);
  submit();
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to connect");
  expect(screen.getByRole("button", { name: "Enter workspace" })).toBeEnabled();
});
