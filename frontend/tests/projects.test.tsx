import { fireEvent, render, screen, waitFor } from "./render";
import { beforeEach, expect, test, vi } from "vitest";
import { ProjectWorkspace } from "@/components/ProjectWorkspace";
import ProjectsPage from "@/app/projects/page";
import ProjectPage from "@/app/projects/[projectId]/page";
import { ApiError, archiveProject, createProject, getProject, linkProjectCourse, listCourses, listProjects, unlinkProjectCourse, updateProject } from "@/lib/api";
import type { ProjectDetail } from "@/lib/types";

const { refresh, push, notFound } = vi.hoisted(() => ({
  refresh: vi.fn(), push: vi.fn(), notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }), notFound }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  archiveProject: vi.fn(), createProject: vi.fn(), getProject: vi.fn(), linkProjectCourse: vi.fn(),
  listCourses: vi.fn(), listProjects: vi.fn(), unlinkProjectCourse: vi.fn(), updateProject: vi.fn(),
}));

const project: ProjectDetail = {
  id: 1, name: "PyTorch", goal: "Tensor shapes", mode: "course", status: "active",
  created_at: "2026-10-20T00:00:00+00:00", updated_at: "2026-10-20T00:00:00+00:00",
  courses: [{ course_id: 2, title: "Tensor course", description: "Source", position: 0 }],
};
beforeEach(() => { vi.clearAllMocks(); });

test("creates a project once while pending and keeps the entered data", async () => {
  let finish!: (value: ProjectDetail) => void;
  vi.mocked(createProject).mockReturnValue(new Promise(resolve => { finish = resolve; }));
  render(<ProjectWorkspace />);
  fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "  PyTorch  " } });
  fireEvent.change(screen.getByLabelText("Learning goal"), { target: { value: "Tensor shapes" } });
  fireEvent.click(screen.getByRole("button", { name: "Create project" }));
  fireEvent.submit(screen.getByRole("form"));
  expect(createProject).toHaveBeenCalledTimes(1);
  expect(createProject).toHaveBeenCalledWith({ name: "PyTorch", goal: "Tensor shapes", mode: "course" });
  expect(screen.getByLabelText("Project name")).toHaveValue("  PyTorch  ");
  finish(project);
  await waitFor(() => expect(push).toHaveBeenCalledWith("/projects/1"));
});

test("failed save preserves input and permits retry", async () => {
  vi.mocked(updateProject).mockRejectedValueOnce(new ApiError(503, "The database is busy. Please retry."));
  render(<ProjectWorkspace project={project} />);
  fireEvent.change(screen.getByLabelText("Learning goal"), { target: { value: "Updated goal" } });
  fireEvent.click(screen.getByRole("button", { name: "Save project" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("The database is busy.");
  expect(screen.getByLabelText("Learning goal")).toHaveValue("Updated goal");
  expect(screen.getByRole("button", { name: "Save project" })).toBeEnabled();
});

test("links available courses and unlinks without calling course deletion", async () => {
  vi.mocked(linkProjectCourse).mockResolvedValue(project);
  vi.mocked(unlinkProjectCourse).mockResolvedValue({ ...project, courses: [] });
  render(<ProjectWorkspace project={project} courses={[{ id: 3, title: "Attention", description: "" }]} />);
  fireEvent.change(screen.getByLabelText("Choose a course"), { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: "Link course" }));
  await waitFor(() => expect(linkProjectCourse).toHaveBeenCalledWith(1, 3, 1));
  await waitFor(() => expect(screen.getByRole("button", { name: /Unlink course/ })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: /Unlink course/ }));
  await waitFor(() => expect(unlinkProjectCourse).toHaveBeenCalledWith(1, 2));
  expect(screen.getByRole("link", { name: "Tensor course" })).toHaveAttribute("href", "/courses/2");
});

test("archive requires confirmation and an archived project has no mutation controls", async () => {
  vi.mocked(archiveProject).mockResolvedValue({ ...project, status: "archived" });
  const { rerender } = render(<ProjectWorkspace project={project} />);
  fireEvent.click(screen.getByRole("button", { name: "Archive project" }));
  expect(archiveProject).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("button", { name: "Confirm archive" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Archive project" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm archive" }));
  await waitFor(() => expect(archiveProject).toHaveBeenCalledTimes(1));
  rerender(<ProjectWorkspace project={{ ...project, status: "archived" }} />);
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Unlink course" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Tensor course" })).toBeInTheDocument();
});

test("project list backend errors are not disguised as an empty list", async () => {
  vi.mocked(listProjects).mockRejectedValue(new Error("offline"));
  render(await ProjectsPage({ searchParams: Promise.resolve({}) }));
  expect(screen.getByRole("alert")).toHaveTextContent("Could not reach the server.");
  expect(screen.queryByText("No projects in this view.")).not.toBeInTheDocument();
});

test("course-choice failure preserves the project and its linked courses", async () => {
  vi.mocked(getProject).mockResolvedValue(project);
  vi.mocked(listCourses).mockRejectedValue(new Error("offline"));
  render(await ProjectPage({ params: Promise.resolve({ projectId: "1" }) }));
  // The project name now lives in the project layout's header; the page itself
  // opens with its own section heading.
  expect(screen.getByRole("heading", { name: "Project settings" })).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("Could not load course choices.");
  expect(screen.getByRole("link", { name: "Tensor course" })).toBeInTheDocument();
});

test("invalid and absent projects use the not-found route", async () => {
  for (const projectId of ["NaN", "0", "9007199254740992"]) {
    await expect(ProjectPage({ params: Promise.resolve({ projectId }) })).rejects.toThrow("NOT_FOUND");
  }
  expect(getProject).not.toHaveBeenCalled();
  vi.mocked(getProject).mockRejectedValue(new ApiError(404, "Project not found."));
  await expect(ProjectPage({ params: Promise.resolve({ projectId: "1" }) })).rejects.toThrow("NOT_FOUND");
});

test("refresh updates untouched fields and preserves an unrelated draft", async () => {
  vi.mocked(updateProject).mockResolvedValue({ ...project, name: "My draft", goal: "Updated elsewhere" });
  const { rerender } = render(<ProjectWorkspace project={project} />);
  fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "My draft" } });
  const changed = { ...project, goal: "Updated elsewhere", updated_at: "2026-10-20T01:00:00+00:00" };
  rerender(<ProjectWorkspace project={changed} />);
  expect(screen.getByLabelText("Learning goal")).toHaveValue("Updated elsewhere");
  expect(screen.getByLabelText("Project name")).toHaveValue("My draft");
  fireEvent.click(screen.getByRole("button", { name: "Save project" }));
  await waitFor(() => expect(updateProject).toHaveBeenCalledWith(1, { name: "My draft", expected_updated_at: changed.updated_at }));
});

test("a conflicting draft is retained and must be reviewed before saving", async () => {
  const { rerender } = render(<ProjectWorkspace project={project} />);
  fireEvent.change(screen.getByLabelText("Learning goal"), { target: { value: "My draft" } });
  rerender(<ProjectWorkspace project={{ ...project, goal: "Updated elsewhere" }} />);
  expect(screen.getByLabelText("Learning goal")).toHaveValue("My draft");
  fireEvent.click(screen.getByRole("button", { name: "Save project" }));
  expect(updateProject).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("This project changed.");
  fireEvent.click(screen.getByRole("button", { name: "Discard draft and reload saved values" }));
  expect(screen.getByLabelText("Learning goal")).toHaveValue("Updated elsewhere");
});

test("a server revision conflict retains the draft even with a translated message", async () => {
  vi.mocked(updateProject).mockRejectedValue(new ApiError(409, "项目已被更新。", "project_changed"));
  render(<ProjectWorkspace project={project} />);
  fireEvent.change(screen.getByLabelText("Learning goal"), { target: { value: "My draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Save project" }));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("Learning goal")).toHaveValue("My draft");
  expect(screen.getByRole("button", { name: "Discard draft and reload saved values" })).toBeInTheDocument();
  expect(refresh).toHaveBeenCalled();
});
