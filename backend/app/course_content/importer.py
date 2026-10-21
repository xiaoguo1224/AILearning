"""Turn a folder of markdown files into a course structure.

The folder contract (also documented in docs/markdown-import.md):

    my-course/
    ├── course.json            # optional: {"title": "...", "description": "..."}
    ├── 01-第一章/              # subfolder = one module
    │   ├── 01-注意力机制.md    # .md file = one lesson
    │   └── 02-多头注意力.md
    └── 02-第二章/
        └── 01-位置编码.md

- A leading numeric prefix ("01-", "02_") sets the order and is stripped from
  the displayed title. Without one, alphabetical order applies.
- A lesson's title is its first "# " heading, else the file name.
- .md files directly at the root go into a single module named after the
  course. Non-.md files (images, course.json aside) are ignored.
- Paths must be relative and stay inside the folder: absolute paths and ".."
  are refused, because the file list comes from the browser and is untrusted.
"""

import json
import posixpath
import re

MAX_FILES = 100
MAX_TOTAL_CHARS = 5_000_000

_NUM_PREFIX = re.compile(r"^\d+\s*[-_.]\s*")
_HEADING = re.compile(r"^#\s+(.+?)\s*$", re.MULTILINE)


class ImportError(ValueError):
    pass


def _safe_parts(path: str) -> list[str]:
    """Split a client-supplied path, refusing anything that escapes the folder."""
    if not path or path.startswith("/") or ".." in path.split("/"):
        raise ImportError(f"Unsafe path: {path!r}")
    parts = [p for p in path.split("/") if p not in ("", ".")]
    if not parts or any(p.startswith(".") and len(parts) == 1 for p in parts):
        raise ImportError(f"Unsafe path: {path!r}")
    return parts


def _strip_prefix(name: str) -> str:
    return _NUM_PREFIX.sub("", name).strip()


def _sort_key(name: str) -> tuple:
    """Numeric prefixes order first, numerically; the rest alphabetically."""
    match = re.match(r"^(\d+)\s*[-_.]\s*", name)
    if match:
        return (0, int(match.group(1)), name.lower())
    return (1, 0, name.lower())


def _lesson_title(filename: str, content: str) -> str:
    match = _HEADING.search(content)
    if match:
        return match.group(1).strip()[:300]
    base = posixpath.splitext(posixpath.basename(filename))[0]
    return _strip_prefix(base)[:300] or "未命名课时"


def parse_tree(files: list[dict]) -> dict:
    """Validate the file list and return {title, description, modules}.

    modules: [{title, lessons: [{title, content, path}]}]. Raises ImportError on
    any malformed input, so the router can answer 422 with the reason.
    """
    if not files:
        raise ImportError("No files provided.")
    if len(files) > MAX_FILES:
        raise ImportError(f"At most {MAX_FILES} files per import.")

    total = 0
    course_meta: dict = {}
    md_files: list[tuple[list[str], str]] = []
    for entry in files:
        parts = _safe_parts(entry["path"])
        content = entry.get("content") or ""
        total += len(content)
        name = parts[-1]
        if name == "course.json" and not course_meta:
            try:
                meta = json.loads(content)
            except ValueError:
                raise ImportError("course.json is not valid JSON.")
            if isinstance(meta, dict):
                course_meta = meta
            continue
        if not name.lower().endswith(".md"):
            continue
        md_files.append((parts, content))
    if total > MAX_TOTAL_CHARS:
        raise ImportError("The files are too large in total (5 MB limit).")
    if not md_files:
        raise ImportError("No markdown (.md) files found.")

    # The browser's folder picker prefixes every path with the picked folder's
    # own name ("my-course/01-章/01-课.md"). Strip that common root so it does
    # not become a module of its own.
    firsts = [parts[:-1] for parts, _ in md_files]
    depth = 0
    while firsts and all(len(p) > depth for p in firsts):
        heads = {p[depth] for p in firsts}
        if len(heads) != 1:
            break
        depth += 1
    stripped: list[tuple[list[str], str]] = []
    for parts, content in md_files:
        stripped.append((parts[depth:], content))
    md_files = stripped
    folder_title = ""
    if depth:
        # The stripped root was the picked folder's name; it is the course title
        # candidate when course.json does not name one.
        folder_title = _strip_prefix(firsts[0][0])

    # Group by top-level folder; root-level files share one module.
    groups: dict[str, list] = {}
    order: list[str] = []
    for parts, content in md_files:
        if len(parts) <= 1:
            key = ""
        else:
            key = parts[0]
        if key not in groups:
            groups[key] = []
            order.append(key)
        filename = parts[-1]
        groups[key].append(
            {
                "title": _lesson_title(filename, content),
                "content": content,
                "path": "/".join(parts),
                "sort": _sort_key(filename),
            }
        )

    modules = []
    for key in sorted(order, key=_sort_key):
        lessons = sorted(groups[key], key=lambda l: l["sort"])
        for lesson in lessons:
            del lesson["sort"]
        title = _strip_prefix(key) if key else (folder_title or "正文")
        modules.append({"title": title or "未命名模块", "lessons": lessons})

    title = course_meta.get("title") or folder_title or "导入课程"
    description = course_meta.get("description") or ""
    return {
        "title": str(title)[:300],
        "description": str(description)[:2000],
        "modules": modules,
    }
