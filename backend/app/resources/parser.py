"""Resource and chunk parser: PDF, DOCX, Markdown, plain text, and web URL."""

import io
import xml.etree.ElementTree as ET
import zipfile
from dataclasses import dataclass

from pypdf import PdfReader

from app.ingest import chunk_text, clean_text, extract_url


@dataclass
class ParsedChunk:
    ordinal: int
    locator: str  # e.g., "page 1", "section 2", "chunk 1"
    text: str


def parse_pdf_chunks(data: bytes) -> list[ParsedChunk]:
    reader = PdfReader(io.BytesIO(data))
    chunks: list[ParsedChunk] = []
    ordinal = 0
    for page_idx, page in enumerate(reader.pages, start=1):
        raw = page.extract_text() or ""
        cleaned = clean_text(raw)
        if not cleaned:
            continue
        # If a single page is very long, sub-chunk it while keeping the locator
        page_subchunks = chunk_text(cleaned, max_chars=4000)
        for sub_idx, sub in enumerate(page_subchunks, start=1):
            locator = (
                f"page {page_idx}"
                if len(page_subchunks) == 1
                else f"page {page_idx} part {sub_idx}"
            )
            chunks.append(ParsedChunk(ordinal=ordinal, locator=locator, text=sub))
            ordinal += 1
    return chunks


def parse_docx_chunks(data: bytes) -> list[ParsedChunk]:
    """Extract paragraphs from word/document.xml without external dependencies."""
    chunks: list[ParsedChunk] = []
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            xml_content = zf.read("word/document.xml")
    except Exception as exc:
        raise ValueError("Invalid or corrupted DOCX archive") from exc

    tree = ET.fromstring(xml_content)
    # The namespace for WordProcessingML is typically:
    # http://schemas.openxmlformats.org/wordprocessingml/2006/main
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    paragraphs = []
    for p in tree.iterfind(".//w:p", ns):
        texts = [node.text for node in p.iterfind(".//w:t", ns) if node.text]
        if texts:
            paragraphs.append("".join(texts))

    full_text = clean_text("\n\n".join(paragraphs))
    if not full_text:
        return []

    raw_chunks = chunk_text(full_text, max_chars=4000)
    for idx, c in enumerate(raw_chunks):
        chunks.append(ParsedChunk(ordinal=idx, locator=f"section {idx + 1}", text=c))
    return chunks


def parse_markdown_or_text_chunks(text: str) -> list[ParsedChunk]:
    cleaned = clean_text(text)
    if not cleaned:
        return []
    raw_chunks = chunk_text(cleaned, max_chars=4000)
    return [
        ParsedChunk(ordinal=idx, locator=f"section {idx + 1}", text=c)
        for idx, c in enumerate(raw_chunks)
    ]


def parse_url_chunks(url: str) -> list[ParsedChunk]:
    text = extract_url(url)
    return parse_markdown_or_text_chunks(text)
