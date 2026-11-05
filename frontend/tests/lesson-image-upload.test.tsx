import { fireEvent, render, screen, waitFor } from "./render";
import { beforeEach, expect, test, vi } from "vitest";
import { EditLessonButton } from "@/components/EditLessonButton";
import { LessonMarkdown } from "@/components/LessonMarkdown";
import { patchLesson, uploadAttachment, type UploadedAttachment } from "@/lib/api";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/MermaidBlock", () => ({ MermaidBlock: () => null }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  uploadAttachment: vi.fn(),
  patchLesson: vi.fn(),
}));

const image = new File(["png"], "image.png", { type: "image/png" });
const uploaded = { id: 42, filename: "image.png", mime: "image/png", size: 3, kind: "image" as const };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(uploadAttachment).mockResolvedValue(uploaded);
  vi.mocked(patchLesson).mockResolvedValue({ id: 1, title: "Title" });
});

function openEditor() {
  render(<EditLessonButton lessonId={1} initialTitle="Title" initialContent="Before after" initialConcepts={[]} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  const editor = document.querySelector("textarea")!;
  editor.focus();
  editor.setSelectionRange(7, 7);
  fireEvent.select(editor);
  return editor;
}

test("pasting an image inserts an authenticated reference at the cursor and saves it", async () => {
  const editor = openEditor();
  fireEvent.paste(editor, { clipboardData: { files: [image], getData: () => "" } });
  await waitFor(() => expect(editor.value).toContain("![Image](/backend/api/attachments/42)"));
  expect(editor.value).toBe("Before \n\n![Image](/backend/api/attachments/42)\n\nafter");
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(patchLesson).toHaveBeenCalledWith(1, expect.objectContaining({ content: editor.value })));
  const { container } = render(<LessonMarkdown title="Title" content={editor.value} />);
  expect(container.querySelector("img")).toHaveAttribute("src", "/backend/api/attachments/42");
});

test.each(["file", "drop"])("%s inserts an uploaded image", async method => {
  const editor = openEditor();
  if (method === "file") {
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [image] } });
  } else {
    fireEvent.drop(editor, { dataTransfer: { files: [image] } });
  }
  await waitFor(() => expect(editor.value).toContain("![Image](/backend/api/attachments/42)"));
  expect(uploadAttachment).toHaveBeenCalledWith(image);
});

test.each(["file", "drop"])("%s image insertion handles upload failures without changing the article", async (method) => {
  vi.mocked(uploadAttachment).mockRejectedValue(new Error("offline"));
  const editor = openEditor();
  if (method === "file") {
    const input = document.querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [image] } });
  } else {
    fireEvent.drop(editor, { dataTransfer: { files: [image] } });
  }
  await waitFor(() => expect(screen.getByText(/Some images could not be uploaded/)).toBeInTheDocument());
  expect(editor.value).toBe("Before after");
});

test("saving is disabled during upload and a non-image result is rejected", async () => {
  let finish!: (value: UploadedAttachment) => void;
  vi.mocked(uploadAttachment).mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const editor = openEditor();
  fireEvent.paste(editor, { clipboardData: { files: [image], getData: () => "" } });
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  expect(editor).toHaveAttribute("readonly");
  finish({ ...uploaded, kind: "text" });
  await waitFor(() => expect(screen.getByText(/Some images could not be uploaded/)).toBeInTheDocument());
  expect(editor.value).toBe("Before after");
  expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
});

test("pasting text with an image keeps the text even if the upload fails", async () => {
  vi.mocked(uploadAttachment).mockRejectedValue(new Error("offline"));
  const editor = openEditor();
  fireEvent.paste(editor, { clipboardData: { files: [image], getData: () => "pasted text" } });
  await waitFor(() => expect(editor.value).toBe("Before pasted textafter"));
  expect(screen.getByText(/Some images could not be uploaded/)).toBeInTheDocument();
});
