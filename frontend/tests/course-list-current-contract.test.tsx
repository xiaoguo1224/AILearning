import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "./render";
import { CourseList } from "@/components/CourseList";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const courses = [
  { id: 1, title: "Zebra", description: "tensor shapes", opened_count: 2 },
  { id: 2, title: "Alpha", description: "attention", opened_count: 8 },
  { id: 3, title: "Beta", description: "matrix", opened_count: 1 },
];
const titles = () => Array.from(document.querySelectorAll(".course-card")).map((card) => card.querySelector("a span")?.textContent);

describe("latest committed course-list behavior", () => {
  test("keeps opened_count sorting, usage labels, course links, and deletion controls", () => {
    render(<CourseList courses={courses} />);
    expect(titles()).toEqual(["Alpha", "Zebra", "Beta"]);
    expect(screen.getByText("已学 8 次")).toBeInTheDocument();
    expect(document.querySelector('.course-card a[href="/courses/2"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: "Delete Alpha" })).toBeInTheDocument();
  });

  test("still filters titles and descriptions, and clearing restores all courses", () => {
    render(<CourseList courses={courses} />);
    const input = screen.getByPlaceholderText("搜索课程名称或简介");
    fireEvent.change(input, { target: { value: "SHAPES" } });
    expect(titles()).toEqual(["Zebra"]);
    fireEvent.change(input, { target: { value: "Alpha" } });
    expect(titles()).toEqual(["Alpha"]);
    fireEvent.change(input, { target: { value: "" } });
    expect(titles()).toHaveLength(3);
  });

  test("preserves created-order and alphabetical sort options from b64463e", () => {
    render(<CourseList courses={courses} />);
    fireEvent.click(screen.getByText("创建时间"));
    expect(titles()).toEqual(["Zebra", "Alpha", "Beta"]);
    fireEvent.click(screen.getByText("首字符"));
    expect(titles()).toEqual(["Alpha", "Beta", "Zebra"]);
    fireEvent.click(screen.getByText("常使用"));
    expect(titles()).toEqual(["Alpha", "Zebra", "Beta"]);
    expect(courses.map((course) => course.id)).toEqual([1, 2, 3]);
  });
});
