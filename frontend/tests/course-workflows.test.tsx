import { StrictMode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "./render";
import { CourseBrowser } from "@/components/CourseBrowser";
import { CourseOpenTracker } from "@/components/CourseOpenTracker";
import { JobTrace } from "@/components/JobTrace";
import { JobsList } from "@/components/JobsList";
import { StagedGenerateWizard } from "@/components/StagedGenerateWizard";
import { ProjectCourseGraph } from "@/components/ProjectCourseGraph";
import { getJob, getProjectGraph, listJobs, recordCourseOpen, retryGeneration, reviewGeneration, startStagedGeneration, type Job } from "@/lib/api";
import NewCoursePage from "@/app/courses/new/page";
import type { ProjectCurriculum } from "@/lib/types";

const { push, replace } = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace, refresh: vi.fn() }) }));
vi.mock("echarts-for-react", () => ({ default: ({ option }: { option: unknown }) => <output data-testid="project-graph">{JSON.stringify(option)}</output> }));
vi.mock("@/components/LessonMarkdown", () => ({ LessonMarkdown: ({ content }: { content: string }) => content }));
vi.mock("@/components/DeleteCourseButton", () => ({ DeleteCourseButton: () => null }));
vi.mock("@/lib/api", async original => ({ ...await original<typeof import("@/lib/api")>(),
  getJob: vi.fn(), getProjectGraph: vi.fn(), listJobs: vi.fn(), recordCourseOpen: vi.fn(), retryGeneration: vi.fn(), reviewGeneration: vi.fn(), startStagedGeneration: vi.fn(),
}));

function task(): Job {
  return { id: "test-job", type: "course_generate_staged", status: "awaiting_review", error: null,
    ref_id: null, ref_type: null, created_at: "2026-10-21T08:00:00Z", updated_at: "2026-10-21T08:00:00Z",
    result: null, trace: { entries: [{ type: "tool_call", tool: "llm.outline", at: "2026-10-21T08:00:00Z" }] },
    progress: { topic: "Tensor", mode: "full", difficulty: 2, revision: 1, stage: "outline_review", done: 0, total: 2,
      outline: { title: "Tensor course", modules: [{ title: "Basics", lessons: [{ title: "Shapes" }, { title: "Broadcast" }] }] } } };
}

beforeEach(() => { vi.clearAllMocks(); window.history.replaceState(null, "", "/courses"); });

describe("resumable course generation", () => {
  test("the new-course route forwards the saved task id instead of starting over", async () => {
    vi.mocked(getJob).mockResolvedValue(task());
    render(await NewCoursePage({ searchParams: Promise.resolve({ job: "test-job" }) }));
    await screen.findByText("Tensor course");
    expect(getJob).toHaveBeenCalledWith("test-job");
    expect(startStagedGeneration).not.toHaveBeenCalled();
  });

  test("retries the failed task and resumes its saved checkpoint", async () => {
    vi.mocked(getJob).mockResolvedValue({ ...task(), status: "failed", error: "Temporary failure" });
    vi.mocked(retryGeneration).mockResolvedValue({ job_id: "test-job" });
    render(<StagedGenerateWizard initialJobId="test-job" />);
    fireEvent.click(await screen.findByRole("button", { name: "重试未完成步骤" }));
    await waitFor(() => expect(retryGeneration).toHaveBeenCalledWith("test-job"));
    expect(startStagedGeneration).not.toHaveBeenCalled();
  });

  test("submits selected mode and difficulty and stores the resumable URL", async () => {
    vi.mocked(startStagedGeneration).mockResolvedValue({ job_id: "new-job" });
    vi.mocked(getJob).mockResolvedValue({ ...task(), id: "new-job", status: "running" });
    render(<StagedGenerateWizard />);
    fireEvent.change(screen.getByPlaceholderText("例如：Python 数据分析入门"), { target: { value: "Tensors" } });
    fireEvent.click(screen.getByText("全量审查"));
    fireEvent.click(screen.getByRole("button", { name: "高" }));
    fireEvent.click(screen.getByRole("button", { name: "生成提纲" }));
    await waitFor(() => expect(startStagedGeneration).toHaveBeenCalledWith("Tensors", "full", 2));
    expect(replace).toHaveBeenCalledWith("/courses/new?job=new-job");
  });

  test("restores outline review without a new generation and sends feedback with version", async () => {
    const job = task();
    vi.mocked(getJob).mockResolvedValue(job);
    vi.mocked(reviewGeneration).mockResolvedValue({ job_id: job.id });
    const mounted = render(<StagedGenerateWizard initialJobId={job.id} />);
    await screen.findByText("Tensor course");
    mounted.unmount();
    render(<StagedGenerateWizard initialJobId={job.id} />);
    await screen.findByRole("button", { name: "确认提纲，开始生成内容" });
    expect(startStagedGeneration).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText("填写需要修改、补充或调整的内容"), { target: { value: "Add dimensions" } });
    fireEvent.click(screen.getByRole("button", { name: "按意见重新生成" }));
    await waitFor(() => expect(reviewGeneration).toHaveBeenCalledWith(job.id, "revise", 1, "Add dimensions"));
  });

  test("restores a chapter draft, shows its quiz and preserves feedback on conflict", async () => {
    const job = task();
    job.progress = { ...job.progress, stage: "lesson_review", revision: 7,
      draft: { title: "Shapes", content: "Chapter body", concepts: ["tensor"], quiz: [{ question: "Dimension?", kind: "short", answer: "2", options: [], concept: "tensor" }] } };
    vi.mocked(getJob).mockResolvedValue(job);
    vi.mocked(reviewGeneration).mockRejectedValue(new Error("This review has changed"));
    render(<StagedGenerateWizard initialJobId={job.id} />);
    await screen.findByText("Chapter body");
    expect(screen.getByText("Dimension?")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("填写需要修改、补充或调整的内容"), { target: { value: "Explain rank" } });
    fireEvent.click(screen.getByRole("button", { name: "按意见重新生成" }));
    await screen.findByText("This review has changed");
    expect(screen.getByDisplayValue("Explain rank")).toBeInTheDocument();
  });
});

test("trace is an independent keyboard-accessible list with a scrollbar", () => {
  render(<JobTrace job={task()} />);
  expect(screen.getByText(/AI 调用链路与执行记录/)).toBeInTheDocument();
  expect(screen.getByText("llm.outline")).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "调用记录列表" })).toHaveAttribute("tabindex", "0");
});

test("job list opens the exact review task and displays its trace", async () => {
  vi.mocked(listJobs).mockResolvedValue({ items: [task()], total: 1 });
  render(<JobsList />);
  fireEvent.click(await screen.findByText("课程生成与审查"));
  fireEvent.click(await screen.findByRole("button", { name: "继续审查" }));
  expect(push).toHaveBeenCalledWith("/courses/new?job=test-job");
  expect(screen.getByText("llm.outline")).toBeInTheDocument();
});

test("job list requests the selected server page so older traces remain reachable", async () => {
  vi.mocked(listJobs).mockResolvedValue({ items: [task()], total: 21 });
  render(<JobsList />);
  await screen.findByText("课程生成与审查");
  expect(listJobs).toHaveBeenCalledWith(undefined, 10, 0);
  fireEvent.click(screen.getByTitle("Next Page"));
  await waitFor(() => expect(listJobs).toHaveBeenCalledWith(undefined, 10, 10));
});

test("course search and three sorts operate independently, default frequent", () => {
  render(<CourseBrowser courses={[
    { id: 1, title: "Banana", description: "advanced", opened_count: 2 },
    { id: 2, title: "Zebra", description: "base", opened_count: 8 },
    { id: 3, title: "Apple", description: "base", opened_count: 0 },
  ]} />);
  const titles = () => screen.getAllByRole("link").map(element => element.textContent);
  expect(titles()).toEqual(["Zebra", "Banana", "Apple"]);
  fireEvent.click(screen.getByText("创建时间"));
  expect(titles()).toEqual(["Banana", "Zebra", "Apple"]);
  fireEvent.click(screen.getByText("首字符"));
  expect(titles()).toEqual(["Apple", "Banana", "Zebra"]);
  fireEvent.change(screen.getByPlaceholderText("搜索课程名称或简介"), { target: { value: "base" } });
  expect(titles()).toEqual(["Apple", "Zebra"]);
  fireEvent.click(screen.getByText("常使用"));
  expect(titles()).toEqual(["Zebra", "Apple"]);
  expect(screen.getByDisplayValue("base")).toBeInTheDocument();
});

test("actual course visits count once under StrictMode", async () => {
  vi.mocked(recordCourseOpen).mockResolvedValue({ opened_count: 1 });
  render(<StrictMode><CourseOpenTracker courseId={3} /></StrictMode>);
  await waitFor(() => expect(recordCourseOpen).toHaveBeenCalledTimes(1));
});

test("graph preserves AI course positions, chapter nodes and valid relationships", async () => {
  const curriculum: ProjectCurriculum = { project_id: 1, points: [], pathway: [], courses: [1, 2].map(id => ({
    id, title: `Course ${id}`, modules: [{ id, title: "Module", lessons: Array.from({ length: 16 }, (_, index) => ({
      id: id * 100 + index, title: `Chapter ${index}`, completed: false, concept_keys: [],
    })) }],
  })) };
  vi.mocked(getProjectGraph).mockResolvedValue({ positions: { "course-1": { x: 10, y: 20 } }, edges: [
    { id: 1, from_type: "course", from_id: 1, to_type: "course", to_id: 9999, kind: "related", reason: "stale" },
  ] });
  vi.mocked(listJobs).mockResolvedValue({ items: [], total: 0 });
  render(<ProjectCourseGraph curriculum={curriculum} projectId={1} />);
  await waitFor(() => {
    const option = JSON.parse(screen.getByTestId("project-graph").textContent!);
    expect(option.series[0].data[0]).toMatchObject({ id: "course-1", x: 200, y: 400 });
  });
  const graph = JSON.parse(screen.getByTestId("project-graph").textContent!).series[0] as {
    data: { id: string; x: number; y: number }[]; links: { source: string; target: string }[];
  };
  expect(graph.data).toHaveLength(34);
  const chapters = graph.data.filter(node => node.id.startsWith("lesson-1"));
  expect(new Set(chapters.map(node => `${node.x},${node.y}`)).size).toBe(16);
  const ids = new Set(graph.data.map(node => node.id));
  expect(graph.links.every(link => ids.has(link.source) && ids.has(link.target))).toBe(true);
});
