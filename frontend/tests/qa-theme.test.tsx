import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "./render";
import { CourseQaSection } from "@/components/CourseQaSection";
import { LessonQaSection } from "@/components/LessonQaSection";
import { ThemeProvider, ThemeSwitcher } from "@/components/ThemeProvider";
import { VantThemeProvider } from "@/components/VantThemeProvider";
import { ApiError, getTutorConversation, sendTutorMessage, type TutorOutcome } from "@/lib/api";
import { THEME_COOKIE } from "@/lib/theme";
import { conversation, deferred, tutorRow, turnOutcome } from "./fixtures";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getTutorConversation: vi.fn(),
  sendTutorMessage: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTutorConversation).mockResolvedValue(conversation([]));
});

afterEach(() => {
  document.cookie = `${THEME_COOKIE}=; Path=/; Max-Age=0`;
  document.documentElement.removeAttribute("style");
  delete document.documentElement.dataset.theme;
});

function renderQa() {
  return render(
    <ThemeProvider initialTheme="light">
      <VantThemeProvider>
        <ThemeSwitcher />
        <CourseQaSection courseId={10} courseTitle="Java" />
      </VantThemeProvider>
    </ThemeProvider>,
  );
}

test.each([
  ["course:10", <CourseQaSection key="course" courseId={10} courseTitle="Java" />],
  ["lesson:20", <LessonQaSection key="lesson" lessonId={20} lessonTitle="JVM" />],
])("%s keeps lazy loading and the existing conversation scope", async (key, panel) => {
  render(panel);
  expect(getTutorConversation).not.toHaveBeenCalled();
  const toggle = screen.getByRole("button", { name: /Q&A/ });
  fireEvent.click(toggle);
  await screen.findByText(/1 of 10 questions/);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(getTutorConversation).toHaveBeenCalledWith(key);
  fireEvent.click(toggle);
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("theme changes preserve the draft, guided request, citations and loaded transcript", async () => {
  renderQa();
  fireEvent.click(screen.getByRole("button", { name: /Q&A/ }));
  await screen.findByText(/1 of 10 questions/);
  const composer = screen.getByRole("textbox", { name: "Ask about Java" });
  fireEvent.change(composer, { target: { value: "How does the JVM work?" } });
  fireEvent.click(screen.getByRole("button", { name: "Switch to dark theme" }));
  expect(composer).toHaveValue("How does the JVM work?");
  const pending = deferred<TutorOutcome>();
  vi.mocked(sendTutorMessage).mockReturnValue(pending.promise);
  fireEvent.click(screen.getByRole("button", { name: "Let me work it out" }));
  expect(screen.getByRole("button", { name: "Ask" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Working…" })).toBeDisabled();
  expect(composer).toBeEnabled();
  expect(sendTutorMessage).toHaveBeenCalledExactlyOnceWith("course:10", "How does the JVM work?", "guided");
  fireEvent.click(screen.getByRole("button", { name: "Switch to light theme" }));
  pending.resolve(turnOutcome(tutorRow({
    answer: "Bytecode runs inside the JVM.", ask: "What loads the bytecode?",
    beyond: "Other runtimes use different approaches.", refs: [{ lesson_id: 20, title: "JVM architecture" }],
  }), "How does the JVM work?"));
  const reply = await screen.findByRole("region", { name: "Tutor reply" });
  expect(within(reply).getByText("JVM architecture")).toBeInTheDocument();
  expect(within(reply).getByText("Your turn")).toBeInTheDocument();
  expect(within(reply).getByText("Not in your course")).toBeInTheDocument();
  expect(composer).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "Switch to dark theme" }));
  expect(reply).toBeInTheDocument();
  expect(getTutorConversation).toHaveBeenCalledTimes(1);
  expect(sendTutorMessage).toHaveBeenCalledTimes(1);
});

test("a failed send keeps the draft for a keyboard retry after switching theme", async () => {
  vi.mocked(sendTutorMessage).mockRejectedValueOnce(new ApiError(502, "Please retry."));
  renderQa();
  fireEvent.click(screen.getByRole("button", { name: /Q&A/ }));
  await screen.findByText(/1 of 10 questions/);
  const composer = screen.getByRole("textbox", { name: "Ask about Java" });
  fireEvent.change(composer, { target: { value: "Explain bytecode" } });
  fireEvent.click(screen.getByRole("button", { name: "Ask" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Ask" })).toBeEnabled());
  expect(screen.getAllByText("Please retry.").length).toBeGreaterThan(0);
  expect(composer).toHaveValue("Explain bytecode");
  expect(screen.queryByRole("region", { name: "Tutor reply" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Switch to dark theme" }));
  vi.mocked(sendTutorMessage).mockResolvedValueOnce(turnOutcome(tutorRow({ answer: "Bytecode is a JVM instruction format." }), "Explain bytecode"));
  fireEvent.keyDown(composer, { key: "Enter", ctrlKey: true });
  await screen.findByRole("region", { name: "Tutor reply" });
  expect(sendTutorMessage).toHaveBeenLastCalledWith("course:10", "Explain bytecode", "answer");
  expect(composer).toHaveValue("");
});
