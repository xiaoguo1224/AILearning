/**
 * Course-level reference materials (资料):
 * - The section lists the course's materials and supports add/remove.
 * - Q&A reference chips render for lesson_id null (a cited reference file).
 */
import { fireEvent, render, screen, waitFor } from "./render";
import { describe, expect, test, vi } from "vitest";

import { CourseResourcesSection } from "@/components/CourseResourcesSection";
import {
  addCourseTextResource,
  deleteCourseResource,
  listCourseResources,
} from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  listCourseResources: vi.fn(),
  addCourseTextResource: vi.fn(),
  addCourseUrlResource: vi.fn(),
  deleteCourseResource: vi.fn(),
  uploadCourseResource: vi.fn(),
}));

import type { ResourceSummary } from "@/lib/types";

const RES: ResourceSummary[] = [
  { id: 1, filename: "论文笔记.md", kind: "markdown", parse_status: "completed", created_at: "2026-10-21T00:00:00" },
  { id: 2, filename: "slides.pdf", kind: "pdf", parse_status: "completed", created_at: "2026-10-21T00:00:00" },
];

describe("CourseResourcesSection", () => {
  test("lists materials and removes one", async () => {
    vi.mocked(listCourseResources).mockResolvedValue(RES);
    render(<CourseResourcesSection courseId={7} />);
    fireEvent.click(screen.getByRole("button", { name: /Reference materials/ }));
    await waitFor(() => expect(screen.getByText("论文笔记.md")).toBeTruthy());
    expect(screen.getByText("slides.pdf")).toBeTruthy();

    vi.mocked(deleteCourseResource).mockResolvedValue({ status: "success", deleted_permanently: true });
    vi.mocked(listCourseResources).mockResolvedValue([RES[1]]);
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
    await waitFor(() => expect(vi.mocked(deleteCourseResource)).toHaveBeenCalledWith(7, 1));
  });

  test("pasting text adds a material", async () => {
    vi.mocked(listCourseResources).mockResolvedValue([]);
    render(<CourseResourcesSection courseId={7} />);
    fireEvent.click(screen.getByRole("button", { name: /Reference materials/ }));
    await waitFor(() => expect(screen.getByText("No reference materials yet.")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Add material" }));
    fireEvent.change(screen.getByPlaceholderText("Title"), { target: { value: "笔记" } });
    fireEvent.change(screen.getByPlaceholderText("Paste the material here"), {
      target: { value: "内容" },
    });
    vi.mocked(addCourseTextResource).mockResolvedValue({ ...RES[0], chunks: [] } as never);
    const textForm = screen.getByPlaceholderText("Paste the material here").closest("form");
    fireEvent.click(textForm!.querySelector('button[type="submit"]')!);
    await waitFor(() =>
      expect(vi.mocked(addCourseTextResource)).toHaveBeenCalledWith(7, "笔记", "内容"),
    );
  });
});
