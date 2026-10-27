import { createRequire } from "node:module";
import path from "node:path";
import { expect, test, vi } from "vitest";
import { LessonMarkdown } from "@/components/LessonMarkdown";
import { QuizMarkdown } from "@/components/QuizMarkdown";
import { render } from "./render";

vi.mock("@/components/MermaidBlock", () => ({ MermaidBlock: () => <div>diagram</div> }));

const require = createRequire(path.resolve("package.json"));

// Rendering engines and the root stylesheet must use the same KaTeX layout classes.
test.each(["rehype-katex", "mermaid", "micromark-extension-math"])("%s shares the stylesheet's KaTeX version", name => {
  const dependencyRequire = createRequire(require.resolve(name));
  expect(dependencyRequire.resolve("katex")).toBe(require.resolve("katex"));
});

test.each(["lesson", "quiz"])("%s renders inline and display math with accessible MathML", kind => {
  const content = String.raw`Inline $x_i^2$.

$$
L_{\mathcal B}(\theta)=\frac{1}{|\mathcal B|}\sum_{i\in\mathcal B}\ell_i(\theta)
$$

$$
\begin{pmatrix}a & b \\ c & d\end{pmatrix}\quad\sqrt{x^2+1}
$$`;
  const { container } = render(kind === "lesson" ? <LessonMarkdown title="Math" content={content} /> : <QuizMarkdown content={content} />);
  expect(container.querySelectorAll(".katex")).toHaveLength(3);
  expect(container.querySelectorAll(".katex-display")).toHaveLength(2);
  expect(container.querySelector(".katex-error")).toBeNull();
  expect(container.querySelector("math mfrac")).not.toBeNull();
  expect(container.querySelector("math mtable")).not.toBeNull();
  expect(container.querySelector(".katex-html")?.getAttribute("aria-hidden")).toBe("true");
});
