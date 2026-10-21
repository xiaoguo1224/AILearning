/**
 * GenerationProgress: the course assembles on screen instead of behind a spinner.
 *
 * The contract under test: the outline event draws every lesson's slot up front
 * (title visible, spinner running), and each lesson event fills exactly its own
 * slot by (module_index, lesson_index) — arrival order must not matter, because
 * the server authors lessons in parallel. A lesson_failed event marks its slot
 * without stopping the rest, and the done event hands over the course id.
 */
import { render, screen, waitFor } from "./render";
import { describe, expect, test, vi } from "vitest";

import { GenerationProgress } from "@/components/GenerationProgress";
import { streamCourseGeneration } from "@/lib/api";
import type { GenerationStreamEvent } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  streamCourseGeneration: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const OUTLINE: GenerationStreamEvent = {
  type: "outline",
  title: "Transformer 101",
  description: "",
  modules: [
    { title: "Basics", lessons: [{ title: "Attention" }, { title: "Heads" }] },
    { title: "Practice", lessons: [{ title: "Build it" }] },
  ],
};

function lessonEvent(mi: number, li: number, title: string): GenerationStreamEvent {
  return {
    type: "lesson",
    module_index: mi,
    lesson_index: li,
    lesson: {
      title,
      content: `# ${title}\nContent here.`,
      concepts: ["attention"],
      quiz: [{ question: "Q?", kind: "short", answer: "A" }],
    },
  };
}

async function* scripted(events: GenerationStreamEvent[]) {
  for (const e of events) yield e;
}

function mockStream(events: GenerationStreamEvent[]) {
  vi.mocked(streamCourseGeneration).mockImplementation(
    () => scripted(events) as AsyncGenerator<GenerationStreamEvent>,
  );
}

describe("GenerationProgress", () => {
  test("outline draws all slots; lessons fill by index regardless of arrival order", async () => {
    // Deliberately out of order: parallel authorship makes no ordering promise.
    mockStream([
      OUTLINE,
      lessonEvent(1, 0, "Build it"),
      lessonEvent(0, 1, "Heads"),
      lessonEvent(0, 0, "Attention"),
      { type: "done", id: 42, title: "Transformer 101", usage: { run_cost_usd: 0.01, total_cost_usd: 0.02, alert_active: false } },
    ]);
    render(
      <GenerationProgress sources={[]} onSourceFailures={() => {}} onCancel={() => {}} />,
    );

    // Slots exist as soon as the outline lands.
    expect(await screen.findByText("Attention")).toBeInTheDocument();
    expect(screen.getByText("Heads")).toBeInTheDocument();
    expect(screen.getByText("Build it")).toBeInTheDocument();

    // Each lesson lands in its own slot: the quiz count pins the pairing.
    await waitFor(() => {
      expect(screen.getAllByText(/practice questions/)).toHaveLength(3);
    });
    // The done event offers the way out.
    expect(await screen.findByText("Open course")).toBeInTheDocument();
  });

  test("a failed lesson is marked and the rest of the course continues", async () => {
    mockStream([
      OUTLINE,
      { type: "lesson_failed", module_index: 0, lesson_index: 1, title: "Heads" },
      lessonEvent(0, 0, "Attention"),
      { type: "done", id: 7, title: "Transformer 101", usage: { run_cost_usd: 0, total_cost_usd: 0, alert_active: false } },
    ]);
    render(
      <GenerationProgress sources={[]} onSourceFailures={() => {}} onCancel={() => {}} />,
    );

    expect(await screen.findByText("Could not generate; the rest of the course continues.")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/practice questions/)).toBeInTheDocument();
    });
    expect(await screen.findByText("Open course")).toBeInTheDocument();
  });

  test("a stream error is shown, not swallowed", async () => {
    mockStream([{ type: "error", error: "generation_failed", message: "Boom." }]);
    render(
      <GenerationProgress sources={[]} onSourceFailures={() => {}} onCancel={() => {}} />,
    );
    expect(await screen.findByText("Boom.")).toBeInTheDocument();
    expect(screen.queryByText("Open course")).not.toBeInTheDocument();
  });
});
