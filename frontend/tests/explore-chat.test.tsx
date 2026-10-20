/**
 * The free-exploration reply's register layout, and what a failed question leaves behind.
 *
 * The server sends `body`, `beyond` and `check_question` as separate fields, and
 * AssistantReply is the component that keeps them apart on screen. The two properties
 * that carry the whole guarantee are asserted here:
 *
 * ORDER AND SIBLINGHOOD. There is exactly one boundary marker in a reply, the disclaimer
 * sentence inside the `beyond` block, and everything above it is grounded by
 * construction. `check_question` is a question about the whole reply, so it keeps the
 * last slot rather than interrupting the two registers.
 *
 * DISTINGUISHABILITY WITHOUT COLOUR. Solid against dashed is what separates the grounded
 * block from the ungrounded one, plus the two headings. jsdom loads no stylesheet, so the
 * assertions pin the class contract that carries this, which is exactly the thing a
 * restyle could silently drop.
 *
 * The failure test is the other half of the feature: a 502 writes neither row, so the
 * typed question has to survive in the box, and the screen has to say it was not saved
 * rather than leaving the learner to guess whether sending again would duplicate it.
 */

import { fireEvent, render, screen, waitFor, within } from "./render";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ExploreChat } from "@/components/ExploreChat";
import { ApiError, askExploreQuestion, createExplorePractice } from "@/lib/api";
import type { ExploreMessage } from "@/lib/types";

import { exploreQuestion, exploreReply, variantDraft } from "./fixtures";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  askExploreQuestion: vi.fn(),
  createExplorePractice: vi.fn(),
}));

// Restated rather than imported: these strings are the feature's visible contract, and a
// test that imported them would keep passing while a typo rewrote what every learner
// reads.
const GROUNDED = "From this project's material";
const BEYOND = "Not in this project's material";
const CHECK = "Think about it";
const DISCLAIMER =
  "This project's material does not cover this. What follows is general knowledge and " +
  "has not been checked against your files.";
const UNGROUNDED = "This answer does not cite this project's material.";
const DRAFT_DISCLAIMER =
  "This exercise is a model draft. It has not been reviewed, and the server has not run it.";
const PRACTICE_FAILED =
  "The model did not return a usable exercise. Nothing was saved, so you can try again.";

beforeEach(() => {
  vi.clearAllMocks();
});

function renderChat(messages: ExploreMessage[]) {
  render(
    <ExploreChat sessionId={7} projectId={1} initialMessages={messages} readOnly={false} />,
  );
}

/** The block a register heading lives in: its direct parent, which is the bordered div. */
function blockOf(heading: string): HTMLElement {
  const label = screen.getByText(heading);
  const block = label.parentElement;
  if (!(block instanceof HTMLElement)) {
    throw new Error(`the "${heading}" heading has no containing block element`);
  }
  return block;
}

/** Where a block sits among the reply region's direct children; -1 when it is not one. */
function slot(region: HTMLElement, block: HTMLElement): number {
  return Array.from(region.children).indexOf(block);
}

describe("explore reply block layout", () => {
  test("the grounded block and the beyond block are siblings, with the disclaimer only inside beyond", () => {
    renderChat([
      exploreReply({
        body: "The paper reports a 4.2 point gain on the benchmark.",
        beyond: "Other work in the field calls the same effect transfer.",
        refs: [{ marker: "S1", chunk_id: 11, resource_id: 3, filename: "paper.pdf", locator: "p.2" }],
      }),
    ]);

    const region = screen.getByRole("region", { name: "Answer" });
    const grounded = blockOf(GROUNDED);
    const beyond = blockOf(BEYOND);

    expect(grounded.parentElement).toBe(region);
    expect(beyond.parentElement).toBe(region);
    expect(
      grounded.contains(beyond),
      "beyond must not sit inside the grounded block: everything under that heading reads as unchecked general knowledge",
    ).toBe(false);
    expect(
      slot(region, grounded),
      "the grounded explanation comes first, so the disclaimer marks everything after it",
    ).toBeLessThan(slot(region, beyond));

    const sightings = screen.getAllByText(DISCLAIMER);
    expect(sightings, "the reply has exactly one boundary marker").toHaveLength(1);
    expect(beyond.contains(sightings[0])).toBe(true);
  });

  test("solid against dashed carries the register split without colour", () => {
    renderChat([
      exploreReply({ body: "Grounded text.", beyond: "General knowledge.", check: "What would you test next?" }),
    ]);

    const grounded = blockOf(GROUNDED);
    const beyond = blockOf(BEYOND);
    const check = blockOf(CHECK);

    expect(beyond).toHaveClass("border-dashed");
    expect(grounded).not.toHaveClass("border-dashed");

    const region = screen.getByRole("region", { name: "Answer" });
    expect(
      slot(region, beyond),
      "check_question is about the whole reply, so it keeps the last slot",
    ).toBeLessThan(slot(region, check));
  });

  test("citations render as marker, filename and locator, with the separator dropped when there is none", () => {
    renderChat([
      exploreReply({
        body: "Two sources support this.",
        refs: [
          { marker: "S1", chunk_id: 11, resource_id: 3, filename: "paper.pdf", locator: "p.2" },
          { marker: "S2", chunk_id: 12, resource_id: 4, filename: "notes.md", locator: "" },
        ],
      }),
    ]);

    expect(screen.getByText("[S1] paper.pdf · p.2")).toBeInTheDocument();
    expect(screen.getByText("[S2] notes.md")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Cited sources" })).toBeInTheDocument();
    expect(screen.queryByText(UNGROUNDED)).toBeNull();
  });

  test("a reply with no citations says so instead of drawing an empty source list", () => {
    renderChat([exploreReply({ body: "This one is general knowledge only." })]);

    expect(screen.getByText(UNGROUNDED)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Cited sources" })).toBeNull();
  });
});

describe("asking a follow-up", () => {
  test("a 502 leaves the question in the box and says it was not saved", async () => {
    vi.mocked(askExploreQuestion).mockRejectedValue(
      new ApiError(502, "The model did not answer. Your question was not saved.", "agent_unavailable"),
    );
    renderChat([]);

    const box = screen.getByLabelText("Ask about this project's material");
    fireEvent.change(box, { target: { value: "What does the paper say about attention?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    // Two sightings on purpose: the visible error beside the box, and the same sentence
    // in the live region, which is the only way a screen reader hears that the send
    // failed while focus stays in the box.
    expect(
      await screen.findAllByText(
        "The model did not answer. Your question was not saved, so you can send it again.",
      ),
    ).not.toHaveLength(0);
    expect(box).toHaveValue("What does the paper say about attention?");
  });

  test("a delivered answer is appended, and the first question refreshes the session list", async () => {
    const question = "What does the paper say about attention?";
    vi.mocked(askExploreQuestion).mockResolvedValue({
      user: exploreQuestion(question, 3),
      assistant: exploreReply({
        id: 4,
        body: "The paper reports a 4.2 point gain.",
        refs: [{ marker: "S1", chunk_id: 11, resource_id: 3, filename: "paper.pdf", locator: "p.2" }],
      }),
    });
    renderChat([]);

    const box = screen.getByLabelText("Ask about this project's material");
    fireEvent.change(box, { target: { value: question } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("[S1] paper.pdf · p.2")).toBeInTheDocument();
    expect(screen.getByText(question)).toBeInTheDocument();
    await waitFor(() => expect(box).toHaveValue(""));
    expect(
      refresh,
      "the server takes the session title from the first question, so the list is stale until it re-renders",
    ).toHaveBeenCalledTimes(1);
  });
});

/**
 * The exercise the practice endpoint returns is the one thing on this screen the model
 * wrote that nobody has read and the server has never run. So the card has to say that,
 * the region has to have a name of its own, and the submission link is the only place
 * the draft is offered as something to try.
 *
 * The 502 case is the mirror of the question failure: the endpoint writes neither the
 * reply nor the exercise, so the transcript above it must be exactly as it was and the
 * message has to say the exercise can be asked for again.
 */
describe("generating a temporary exercise", () => {
  test("a delivered draft is appended under its reply, with the unreviewed disclaimer and a submission link", async () => {
    const question = "How does the attention mask treat padding?";
    vi.mocked(createExplorePractice).mockResolvedValue({
      message: exploreReply({ id: 5, body: "The mask zeroes the padded positions." }),
      exercise: variantDraft({ id: 21, sessionId: 7, sourceQuestion: question }),
    });
    renderChat([exploreQuestion(question, 1), exploreReply({ id: 2, body: "A first answer." })]);

    fireEvent.click(screen.getByRole("button", { name: "Generate practice" }));

    const card = await screen.findByRole("region", {
      name: "Practice exercise: Widen the attention mask",
    });
    expect(card).toHaveTextContent(DRAFT_DISCLAIMER);
    expect(card).toHaveTextContent("def attend(q, k, mask):");
    expect(card).toHaveTextContent("Acceptance: Padded positions score zero for every query.");
    expect(
      within(card).getByRole("link", { name: "Submit code for this exercise" }),
    ).toHaveAttribute("href", "/projects/1/submissions?variant=21");
    // The reply that came with the exercise belongs in the transcript too.
    expect(screen.getByText("The mask zeroes the padded positions.")).toBeInTheDocument();
  });

  test("a 502 says nothing was saved and leaves the transcript alone", async () => {
    vi.mocked(createExplorePractice).mockRejectedValue(
      new ApiError(
        502,
        "The model did not return a usable practice set. Nothing was saved.",
        "practice_unavailable",
      ),
    );
    renderChat([
      exploreQuestion("What does the paper say about attention?", 1),
      exploreReply({ id: 2, body: "It reports a 4.2 point gain." }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Generate practice" }));

    // Twice on purpose: beside the button, and in the live region, which is the only way
    // this is heard while focus stays on the button.
    expect(await screen.findAllByText(PRACTICE_FAILED)).not.toHaveLength(0);
    expect(screen.getByText("It reports a 4.2 point gain.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /Practice exercise/ })).toBeNull();
  });

  test("no button until the session has a question to build from", () => {
    renderChat([]);

    expect(screen.queryByRole("button", { name: "Generate practice" })).toBeNull();
  });

  test("a reloaded conversation still shows the exercise it produced", () => {
    // The server sends the draft back on `message.exercise`, so the card is rendered from
    // the transcript rather than from state that only existed while the tab was open.
    const reply = {
      ...exploreReply({ id: 5, body: "The mask zeroes the padded positions." }),
      exercise: variantDraft({ id: 21, sessionId: 7, sourceQuestion: "How does masking work?" }),
    };

    renderChat([exploreQuestion("How does masking work?", 1), reply]);

    const card = screen.getByRole("region", {
      name: "Practice exercise: Widen the attention mask",
    });
    expect(card).toHaveTextContent(DRAFT_DISCLAIMER);
    expect(
      within(card).getByRole("link", { name: "Submit code for this exercise" }),
    ).toHaveAttribute("href", "/projects/1/submissions?variant=21");
  });
});
