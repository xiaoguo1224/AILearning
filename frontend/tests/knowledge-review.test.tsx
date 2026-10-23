/**
 * The review step's five load-bearing behaviours, and nothing else.
 *
 * The rules this screen has to get right are not layout: they are that a pending entry
 * says it is pending, that an edit which un-confirms something says so out loud, that a
 * diff is readable without seeing its colour, that a cut-short comparison admits it was
 * cut, and that "the text changed after you approved it" is stated rather than inferred
 * from two version numbers the reader would have to compare themselves.
 *
 * The page is exercised whole for four of them, because all four are server-rendered and
 * a component-level assertion would pass on markup the page never actually produces. The
 * sent-back notice is component-level instead, deliberately: that fact exists only on the
 * PATCH response, so the editor that made the edit is the only thing that can show it.
 */

import { fireEvent, render, screen } from "./render";
import { beforeEach, describe, expect, test, vi } from "vitest";

import ProjectKnowledgePage from "@/app/projects/[projectId]/knowledge/page";
import { KnowledgeEditor } from "@/components/KnowledgeEditor";
import {
  compareKnowledge,
  confirmKnowledge,
  getKnowledge,
  getProject,
  listKnowledgeRevisions,
  listProjectKnowledge,
  updateKnowledge,
} from "@/lib/api";
import type {
  KnowledgeCompare,
  KnowledgeDetail,
  KnowledgeRevisionList,
  ProjectDetail,
} from "@/lib/types";

const { refresh, notFound } = vi.hoisted(() => ({
  refresh: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
  notFound,
}));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getProject: vi.fn(),
  listProjectKnowledge: vi.fn(),
  getKnowledge: vi.fn(),
  listKnowledgeRevisions: vi.fn(),
  compareKnowledge: vi.fn(),
  updateKnowledge: vi.fn(),
  confirmKnowledge: vi.fn(),
}));

// Restated rather than imported: these sentences are what a learner reads, and a test
// that imported them would keep passing while a typo rewrote the screen.
const SENT_BACK =
  "This edit sent the entry back for review, so it is no longer treated as confirmed.";
const TRUNCATED = "This comparison is long, so only the first part of it is shown.";
const CONFIRMED_BEHIND = "The confirmed version is v1, and the entry has changed since.";

const project: ProjectDetail = {
  id: 1,
  name: "PyTorch",
  goal: "Tensor shapes",
  mode: "course",
  status: "active",
  created_at: "2026-10-01T00:00:00+00:00",
  updated_at: "2026-10-01T00:00:00+00:00",
  courses: [],
};

function entry(overrides: Partial<KnowledgeDetail> = {}): KnowledgeDetail {
  return {
    id: 10,
    project_id: 1,
    title: "Learning rate",
    kind: "definition",
    status: "pending_review",
    concept_key: "learning-rate",
    source_kind: "manual",
    created_at: "2026-10-01T00:00:00+00:00",
    updated_at: "2026-10-02T00:00:00+00:00",
    confirmed_at: null,
    body: "The step size used when updating weights.",
    provenance: [],
    projects: [{ project_id: 1, name: "PyTorch" }],
    prerequisites: [],
    related: [],
    sent_back_for_review: false,
    ...overrides,
  };
}

function revisions(overrides: Partial<KnowledgeRevisionList> = {}): KnowledgeRevisionList {
  return {
    items: [
      {
        version: 1,
        title: "Learning rate",
        kind: "definition",
        status: "confirmed",
        reason: "created",
        body_chars: 42,
        created_at: "2026-10-01T00:00:00+00:00",
      },
      {
        version: 2,
        title: "Learning rate",
        kind: "definition",
        status: "pending_review",
        reason: "edited",
        body_chars: 46,
        created_at: "2026-10-02T00:00:00+00:00",
      },
    ],
    total: 2,
    confirmed_version: 1,
    current_version: 2,
    ...overrides,
  };
}

function comparison(overrides: Partial<KnowledgeCompare> = {}): KnowledgeCompare {
  return {
    from_version: 1,
    from_title: "Learning rate",
    from_kind: "definition",
    from_status: "confirmed",
    to_title: "Learning rate",
    to_kind: "definition",
    to_status: "pending_review",
    changed: false,
    truncated: false,
    lines: [],
    ...overrides,
  };
}

/** Every fetch the page makes, in the state the test wants to examine. */
function mockPage(loaded: KnowledgeDetail, options: {
  revisionList?: KnowledgeRevisionList;
  compared?: KnowledgeCompare;
} = {}) {
  vi.mocked(getProject).mockResolvedValue(project);
  vi.mocked(listProjectKnowledge).mockResolvedValue({ items: [loaded], total: 1 });
  vi.mocked(getKnowledge).mockResolvedValue(loaded);
  vi.mocked(listKnowledgeRevisions).mockResolvedValue(options.revisionList ?? revisions());
  vi.mocked(compareKnowledge).mockResolvedValue(options.compared ?? comparison());
}

function renderPage(search: { entry?: string; status?: string; core?: string; compare?: string }) {
  return ProjectKnowledgePage({
    params: Promise.resolve({ projectId: "1" }),
    searchParams: Promise.resolve(search),
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the review badge", () => {
  test("a pending entry says it is pending, in words, and offers the separate confirm action", async () => {
    mockPage(entry({ status: "pending_review" }));

    render(await renderPage({ entry: "10" }));

    expect(screen.getAllByText("Pending review").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
  });

  test("a confirmed entry offers no confirm button, because confirming it again would say nothing", async () => {
    mockPage(entry({ status: "confirmed", confirmed_at: "2026-10-02T00:00:00+00:00" }), {
      revisionList: revisions({ confirmed_version: 2, current_version: 2 }),
    });

    render(await renderPage({ entry: "10" }));

    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
  });
});

describe("editing a confirmed entry", () => {
  test("a save that sends it back for review says so, instead of letting the badge change quietly", async () => {
    vi.mocked(updateKnowledge).mockResolvedValue(
      entry({ status: "pending_review", sent_back_for_review: true }),
    );

    render(
      <KnowledgeEditor
        knowledge={entry({ status: "confirmed", confirmed_at: "2026-10-02T00:00:00+00:00" })}
        readOnly={false}
      />,
    );

    fireEvent.change(screen.getByLabelText("Body"), {
      target: { value: "The step size used when updating the weights, decaying over time." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText(SENT_BACK)).toBeInTheDocument();
    // The list, the version rows and the comparison are all server-rendered, so a
    // notice with no refresh would leave every one of them describing the old entry.
    expect(refresh).toHaveBeenCalled();
  });
});

describe("the comparison", () => {
  test("inserted and deleted lines carry a + or a - prefix, so the change does not rely on colour", async () => {
    mockPage(entry(), {
      compared: comparison({
        changed: true,
        lines: [
          { op: "equal", text: "The step size." },
          { op: "delete", text: "It is fixed for every step." },
          { op: "insert", text: "It decays over training." },
        ],
      }),
    });

    render(await renderPage({ entry: "10" }));

    expect(screen.getByText("- It is fixed for every step.")).toBeInTheDocument();
    expect(screen.getByText("+ It decays over training.")).toBeInTheDocument();
    expect(screen.getByText("The step size.")).toBeInTheDocument();
  });

  test("a comparison cut short by the server's line cap admits it, rather than looking complete", async () => {
    mockPage(entry(), {
      compared: comparison({
        changed: true,
        truncated: true,
        lines: [{ op: "insert", text: "It decays over training." }],
      }),
    });

    render(await renderPage({ entry: "10" }));

    expect(screen.getByText(TRUNCATED)).toBeInTheDocument();
  });

  test("a confirmed version older than the working copy is stated in one sentence", async () => {
    mockPage(entry(), { revisionList: revisions({ confirmed_version: 1, current_version: 2 }) });

    render(await renderPage({ entry: "10" }));

    expect(screen.getByText(CONFIRMED_BEHIND)).toBeInTheDocument();
  });
});

test("confirmation carries the revision the learner actually saw", async () => {
  mockPage(entry());
  vi.mocked(confirmKnowledge).mockResolvedValue(entry({ status: "confirmed" }));
  render(await renderPage({ entry: "10" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  expect(confirmKnowledge).toHaveBeenCalledWith(10, undefined, entry().updated_at);
});

test("an unrelated project entry never exposes its body or editor", async () => {
  mockPage(entry({ projects: [{ project_id: 2, name: "Other" }] }));
  render(await renderPage({ entry: "10" }));
  expect(screen.getByText("That knowledge entry is not part of this project.")).toBeInTheDocument();
  expect(screen.queryByLabelText("Body")).toBeNull();
  expect(listKnowledgeRevisions).not.toHaveBeenCalled();
});

test("a refreshed revision preserves unsaved text until the learner discards it", () => {
  const view = render(<KnowledgeEditor knowledge={entry()} readOnly={false} />);
  fireEvent.change(screen.getByLabelText("Body"), { target: { value: "My unsaved draft" } });
  view.rerender(<KnowledgeEditor knowledge={entry({ body: "New saved content", updated_at: "2026-10-03T00:00:00Z" })} readOnly={false} />);
  expect(screen.getByLabelText("Body")).toHaveValue("My unsaved draft");
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(updateKnowledge).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Discard draft and reload saved values" }));
  expect(screen.getByLabelText("Body")).toHaveValue("New saved content");
});

/*
 * The list's Previous/Next links are gone: entries are picked from the knowledge graph
 * now, not paged through in a sidebar. What still has to hold is that the review filter
 * survives the page load, which is what this asserts — at the request, since there is no
 * link left to carry it.
 */
test("the review filter reaches the knowledge query", async () => {
  mockPage(entry());
  vi.mocked(listProjectKnowledge).mockResolvedValue({ items: [entry()], total: 51 });
  render(await renderPage({ status: "pending_review", core: "1" }));
  expect(vi.mocked(listProjectKnowledge)).toHaveBeenCalledWith(
    1,
    expect.objectContaining({ status: "pending_review", core: true }),
    "en",
  );
});
