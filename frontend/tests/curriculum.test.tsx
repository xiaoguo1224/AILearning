import { render, screen, fireEvent } from "./render";
import { expect, test, vi } from "vitest";
import { CurriculumTree } from "@/components/CurriculumTree";
import { ExploreChat } from "@/components/ExploreChat";
import { NewExploreSessionButton } from "@/components/NewExploreSessionButton";
import { createTranslator } from "@/lib/i18n";
import { askExploreQuestion, createProjectSession } from "@/lib/api";
import type { ProjectCurriculum } from "@/lib/types";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("@/lib/api", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/api")>()), createProjectSession: vi.fn(), askExploreQuestion: vi.fn() }));
const data: ProjectCurriculum = {
  project_id: 1, pathway: [],
  courses: [{ id: 2, title: "PyTorch", modules: [{ id: 3, title: "Tensors", lessons: [{ id: 4, title: "Broadcasting", completed: false, concept_keys: ["broadcasting"] }] }] }],
  points: [{ key: "broadcasting", label: "Broadcasting", lesson_ids: [4], knowledge_ids: [], status: "unassessed", evidence_count: 0, distinct_items: 0,
    prerequisites: [{ key: "tensors", label: "Tensors", ready: false, in_project: false, reading: { title: "2.1 数据操作", url: "https://zh.d2l.ai/chapter_preliminaries/ndarray.html" } }],
    reading: null, extension: true, recommendation: "prerequisite" }],
};
test("unassessed prerequisites never disable lesson navigation or invent a citation", () => {
  render(<CurriculumTree data={data} archived={false} t={createTranslator("en")} />);
  expect(screen.getAllByRole("link", { name: "Broadcasting" }).find(link => link.getAttribute("href") === "/courses/2/lessons/4")).toBeInTheDocument();
  expect(screen.getByText("Suggested next step: Strengthen prerequisites")).toBeInTheDocument();
  expect(screen.getByText(/No verified textbook mapping/)).toBeInTheDocument();
});
test("an empty Chinese tree retains the reading pathway and clear empty state", () => {
  render(<CurriculumTree data={{ project_id: 1, courses: [], points: [], pathway: [] }} archived={false} t={createTranslator("zh-CN")} />);
  expect(screen.getByText("请在项目页关联课程，以建立课程知识树。")).toBeInTheDocument();
});
test("a prepared question creates a session without spending a model call", async () => {
  vi.mocked(createProjectSession).mockResolvedValue({ id: 9 } as never);
  render(<NewExploreSessionButton projectId={1} draft="Study tensor shapes" />);
  fireEvent.click(screen.getByRole("button", { name: "New session" }));
  await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/projects/1/explore?session=9&draft=Study%20tensor%20shapes"));
  expect(askExploreQuestion).not.toHaveBeenCalled();
});
test("the learning question stays editable and is not automatically sent", () => {
  render(<ExploreChat sessionId={9} projectId={1} initialMessages={[]} readOnly={false} initialQuestion="Study tensor shapes" />);
  expect(screen.getByRole("textbox")).toHaveValue("Study tensor shapes");
  expect(askExploreQuestion).not.toHaveBeenCalled();
});
