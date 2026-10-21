import { fireEvent, render, screen } from "./render";
import { beforeEach, expect, test, vi } from "vitest";
import { SuggestionsPanel } from "@/components/SuggestionsPanel";
import { ApiError, createSuggestion, decideSuggestion } from "@/lib/api";
import type { LearningSuggestion, ProjectReviewTask } from "@/lib/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/api", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/api")>()), createSuggestion: vi.fn(), decideSuggestion: vi.fn() }));
const item: LearningSuggestion = {
  id: 3, source_project_id: 1, target_project_id: 2, source_name: "Paper", target_name: "PyTorch",
  source_error_id: 7, concept_key: "shapes", concept_label: "Matrix shapes", cause: "procedure", evidence: "User log reported a shape error",
  state: "pending", target_error_id: null, created_at: "2026-10-21T00:00:00Z", decided_at: null,
};
beforeEach(() => vi.clearAllMocks());
function panel(state: LearningSuggestion["state"] = "pending") {
  return <SuggestionsPanel projectId={1} suggestions={{ items: [{ ...item, state }], total: 1 }} initialChoices={{ items: [], total: 0 }} />;
}
test("viewing a pending suggestion does not accept it", () => {
  render(panel());
  expect(screen.getByText("Accepting adds a review task for Matrix shapes in PyTorch.")).toBeInTheDocument();
  expect(decideSuggestion).not.toHaveBeenCalled();
});
test("reject sends only rejection and reports the unchanged target", async () => {
  vi.mocked(decideSuggestion).mockResolvedValue({ ...item, state: "rejected" });
  render(panel());
  fireEvent.click(screen.getByRole("button", { name: "Reject suggestion" }));
  expect(await screen.findByRole("status")).toHaveTextContent("target project is unchanged");
  expect(decideSuggestion).toHaveBeenCalledWith(3, "rejected");
});
test("an acceptance failure stays an error, not a success notice", async () => {
  vi.mocked(decideSuggestion).mockRejectedValue(new ApiError(409, "Archived project"));
  render(panel());
  fireEvent.click(screen.getByRole("button", { name: "Accept suggestion" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Archived project");
  expect(screen.queryByRole("status")).toBeNull();
});
test("decided suggestions expose no new decision action", () => {
  render(panel("rejected"));
  expect(screen.queryByRole("button", { name: "Accept suggestion" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Reject suggestion" })).toBeNull();
});
test("proposing keeps acceptance separate", async () => {
  vi.mocked(createSuggestion).mockResolvedValue(item);
  const source: ProjectReviewTask = { concept_key: "shapes", concept_label: "Matrix shapes", knowledge_id: null, knowledge_title: null, knowledge_status: null, open_errors: 1, causes: [], latest_error_id: 7, latest_note: "Operands reversed", latest_detail: "" };
  render(<SuggestionsPanel projectId={1} suggestions={{ items: [], total: 0 }} source={source} initialChoices={{ items: [{ id: 2, name: "PyTorch", goal: "", mode: "course", status: "active", created_at: "", updated_at: "" }], total: 1 }} />);
  fireEvent.change(screen.getByRole("combobox", { name: "Target project" }), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "Propose review" }));
  expect(await screen.findByRole("status")).toHaveTextContent("saved for confirmation");
  expect(createSuggestion).toHaveBeenCalledWith(1, 7, 2);
  expect(decideSuggestion).not.toHaveBeenCalled();
});
