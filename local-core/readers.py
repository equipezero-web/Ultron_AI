from __future__ import annotations

from pathlib import Path
from typing import Iterable

from docx import Document
from openpyxl import load_workbook
from pypdf import PdfReader

TEXT_EXTENSIONS = {
    ".txt", ".md", ".markdown", ".html", ".htm", ".css", ".scss", ".sass",
    ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".json", ".jsonc", ".xml",
    ".yml", ".yaml", ".toml", ".ini", ".cfg", ".conf", ".env.example", ".sql",
    ".py", ".java", ".kt", ".kts", ".c", ".h", ".cpp", ".hpp", ".cs", ".go",
    ".rs", ".php", ".rb", ".sh", ".bat", ".ps1", ".vue", ".svelte"
}

MEDIA_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".svg",
    ".mp3", ".wav", ".ogg", ".m4a", ".mp4", ".mov", ".mkv", ".webm", ".avi"
}

SUPPORTED_EXTENSIONS = TEXT_EXTENSIONS | MEDIA_EXTENSIONS | {".pdf", ".docx", ".xlsx", ".xlsm"}


def _clean(text: str) -> str:
    return "\n".join(line.rstrip() for line in str(text or "").replace("\r\n", "\n").split("\n")).strip()


def _read_text(path: Path) -> str:
    for encoding in ("utf-8", "utf-8-sig", "latin-1"):
        try:
            return _clean(path.read_text(encoding=encoding, errors="strict"))
        except UnicodeDecodeError:
            continue
    return _clean(path.read_text(encoding="utf-8", errors="ignore"))


def _read_pdf(path: Path) -> str:
    reader = PdfReader(str(path))
    pages = []
    for index, page in enumerate(reader.pages, start=1):
        text = _clean(page.extract_text() or "")
        if text:
            pages.append(f"[PÁGINA {index}]\n{text}")
    return "\n\n".join(pages)


def _read_docx(path: Path) -> str:
    document = Document(str(path))
    blocks = []
    for paragraph in document.paragraphs:
        text = _clean(paragraph.text)
        if text:
            blocks.append(text)
    for table_index, table in enumerate(document.tables, start=1):
        rows = []
        for row in table.rows:
            values = [cell.text.strip() for cell in row.cells]
            if any(values):
                rows.append("\t".join(values))
        if rows:
            blocks.append(f"[TABELA {table_index}]\n" + "\n".join(rows))
    return "\n\n".join(blocks)


def _read_xlsx(path: Path) -> str:
    workbook = load_workbook(filename=str(path), read_only=True, data_only=True)
    blocks = []
    try:
        for sheet in workbook.worksheets:
            rows = []
            for row in sheet.iter_rows(values_only=True):
                values = ["" if value is None else str(value) for value in row]
                if any(value.strip() for value in values):
                    rows.append("\t".join(values))
            if rows:
                blocks.append(f"[PLANILHA: {sheet.title}]\n" + "\n".join(rows))
    finally:
        workbook.close()
    return "\n\n".join(blocks)


def _media_metadata(path: Path, relative_path: str) -> str:
    stat = path.stat()
    return (
        "[ARQUIVO DE MÍDIA]\n"
        f"Nome: {path.name}\n"
        f"Caminho relativo: {relative_path}\n"
        f"Extensão: {path.suffix.lower()}\n"
        f"Tamanho: {stat.st_size} bytes\n"
        "Conteúdo binário não extraído nesta versão; o arquivo permanece disponível para abertura e organização no HUD."
    )


def read_file(path: Path, root: Path) -> str:
    path = path.resolve()
    root = root.resolve()
    relative_path = path.relative_to(root).as_posix()
    suffix = path.suffix.lower()

    if suffix in TEXT_EXTENSIONS:
        return _read_text(path)
    if suffix == ".pdf":
        return _read_pdf(path)
    if suffix == ".docx":
        return _read_docx(path)
    if suffix in {".xlsx", ".xlsm"}:
        return _read_xlsx(path)
    if suffix in MEDIA_EXTENSIONS:
        return _media_metadata(path, relative_path)
    return ""


def chunk_text(text: str, *, chunk_size: int = 1400, overlap: int = 180) -> list[str]:
    text = _clean(text)
    if not text:
        return []

    chunk_size = max(400, int(chunk_size))
    overlap = max(0, min(int(overlap), chunk_size // 2))

    paragraphs = [item.strip() for item in text.split("\n\n") if item.strip()]
    chunks: list[str] = []
    buffer = ""

    for paragraph in paragraphs:
        candidate = f"{buffer}\n\n{paragraph}".strip() if buffer else paragraph
        if len(candidate) <= chunk_size:
            buffer = candidate
            continue

        if buffer:
            chunks.append(buffer)
            tail = buffer[-overlap:] if overlap else ""
            buffer = f"{tail}\n\n{paragraph}".strip()
        else:
            start = 0
            while start < len(paragraph):
                end = min(len(paragraph), start + chunk_size)
                chunks.append(paragraph[start:end])
                if end >= len(paragraph):
                    buffer = ""
                    break
                start = max(start + 1, end - overlap)

    if buffer:
        chunks.append(buffer)

    return [chunk.strip() for chunk in chunks if chunk.strip()]


def iter_supported_files(root: Path) -> Iterable[Path]:
    root = root.resolve()
    ignored_names = {".git", ".ultron_index", "__pycache__", ".venv", "node_modules"}
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if any(part in ignored_names for part in path.parts):
            continue
        if "_exports" in path.parts:
            continue
        if path.name.startswith("."):
            continue
        if path.suffix.lower() in SUPPORTED_EXTENSIONS:
            yield path
