import { fireEvent, render, screen, waitFor } from "./render";
import { beforeEach, expect, test, vi } from "vitest";
import { DiagnosisForm } from "@/components/DiagnosisForm";
import { ProjectReviewTasks } from "@/components/ProjectReviewTasks";
import { ReviewSession } from "@/components/ReviewSession";
import { ApiError, recordDiagnosis, dismissDiagnosis } from "@/lib/api";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/api", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  recordDiagnosis: vi.fn(), dismissDiagnosis: vi.fn(),
}));
beforeEach(() => vi.clearAllMocks());

test("a review diagnosis sends the evidence locator, never a client finding", async () => {
  vi.mocked(recordDiagnosis).mockResolvedValue({ id: 7 });
  render(<DiagnosisForm projectId={2} evidence={{ review_id: 3, finding_index: 1 }} />);
  fireEvent.change(screen.getByLabelText("Knowledge point"), { target: { value: "matrix shapes" } });
  fireEvent.click(screen.getByRole("button", { name: "Record diagnosis" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Diagnosis saved");
  expect(recordDiagnosis).toHaveBeenCalledWith(2, { concept_key: "matrix shapes", cause: "concept_gap", note: "", review_id: 3, finding_index: 1 });
  expect(refresh).toHaveBeenCalled();
});

test("a failed diagnosis preserves the learner's concept and note", async () => {
  vi.mocked(recordDiagnosis).mockRejectedValue(new ApiError(409, "Archived project"));
  render(<DiagnosisForm projectId={2} />);
  fireEvent.change(screen.getByLabelText("Knowledge point"), { target: { value: "shapes" } });
  fireEvent.change(screen.getByLabelText("Note"), { target: { value: "My observation" } });
  fireEvent.click(screen.getByRole("button", { name: "Record diagnosis" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Archived project");
  expect(screen.getByLabelText("Note")).toHaveValue("My observation");
});

test("task actions target the concept and dismiss only the named diagnosis", async () => {
  vi.mocked(dismissDiagnosis).mockResolvedValue({ id: 9 });
  render(<ProjectReviewTasks projectId={2} archived={false} tasks={{ total: 1, items: [{
    concept_key: "matrix shapes", concept_label: "Matrix shapes", knowledge_id: 4,
    knowledge_title: "Matrix multiplication", knowledge_status: "pending_review", open_errors: 2,
    causes: [{ cause: "procedure", count: 2 }], latest_error_id: 9, latest_note: "", latest_detail: "",
  }] }} />);
  expect(screen.getByRole("link", { name: "Practise this concept" })).toHaveAttribute("href", "/projects/2/review-tasks?concept=matrix%20shapes");
  expect(screen.getByText("Pending review")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Dismiss latest diagnosis" }));
  await waitFor(() => expect(dismissDiagnosis).toHaveBeenCalledWith(9));
});

test("an unavailable concept gives an honest fallback and returns to the project", () => {
  render(<ReviewSession queue={{ cards: [], due_total: 0, estimated_minutes: 0 }} returnHref="/projects/2/review-tasks" />);
  expect(screen.getByText(/There is no existing review card/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Back to review suggestions" })).toHaveAttribute("href", "/projects/2/review-tasks");
  expect(screen.queryByText(/Concepts come back as their recall probability drops/)).toBeNull();
});
