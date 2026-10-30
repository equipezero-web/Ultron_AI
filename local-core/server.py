from __future__ import annotations

import os
import threading
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from indexer import DEFAULT_MODEL, UltronLocalIndex

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = Path(os.getenv("ULTRON_DATA_ROOT", PROJECT_ROOT / "Ultron_Data")).resolve()
PORT = int(os.getenv("ULTRON_LOCAL_PORT", "8765"))
WATCH_INTERVAL = float(os.getenv("ULTRON_LOCAL_WATCH_SECONDS", "8"))

app = FastAPI(title="Ultron Local Core", version="2.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://equipezero-web.github.io",
        "http://localhost",
        "http://127.0.0.1",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

index = UltronLocalIndex(DATA_ROOT)
watch_stop = threading.Event()
watch_thread: threading.Thread | None = None


class IndexRequest(BaseModel):
    force: bool = False


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=1000)
    limit: int = Field(default=6, ge=1, le=20)
    file_id: str | None = Field(default=None, max_length=128)


class CommandRequest(BaseModel):
    command: str = Field(min_length=1, max_length=1600)
    limit: int = Field(default=6, ge=1, le=20)
    file_id: str | None = Field(default=None, max_length=128)


class ExportRequest(BaseModel):
    source_file_id: str = Field(min_length=4, max_length=128)
    content: str = Field(max_length=4_000_000)
    filename: str | None = Field(default=None, max_length=240)
    confirm: bool = False


@app.on_event("startup")
def start_watcher() -> None:
    global watch_thread
    if watch_thread and watch_thread.is_alive():
        return
    watch_stop.clear()
    watch_thread = threading.Thread(
        target=index.watch_forever,
        args=(watch_stop,),
        kwargs={"interval": WATCH_INTERVAL},
        name="ultron-local-index-watcher",
        daemon=True,
    )
    watch_thread.start()


@app.on_event("shutdown")
def stop_watcher() -> None:
    watch_stop.set()


@app.get("/health")
def health() -> dict[str, Any]:
    stats = index.stats()
    return {
        "ok": True,
        "service": "ultron-local-core",
        "version": "2.1.0",
        "root": str(DATA_ROOT),
        "model": DEFAULT_MODEL,
        "files": stats["files"],
        "vector_chunks": stats["vector_chunks"],
        "stats": stats,
        "capabilities": {
            "hybridSearch": True,
            "incrementalIndex": True,
            "automaticWatcher": True,
            "activeFileRag": True,
            "safeVersionedExport": True,
            "rawFilePreview": True,
            "formats": ["text/code", "PDF", "DOCX", "XLSX/XLSM", "CSV/TSV", "PPTX", "image/audio/video metadata"],
        },
        "safety": {
            "rootRestricted": True,
            "sourceOverwrite": False,
            "exportsFolder": "_exports",
            "bindRecommended": "127.0.0.1",
        },
    }


@app.get("/stats")
def stats() -> dict[str, Any]:
    return {"ok": True, **index.stats()}


@app.post("/index")
def rebuild_index(body: IndexRequest) -> dict[str, Any]:
    return index.index_all(force=body.force)


@app.post("/index/file/{file_id}")
def reindex_file(file_id: str) -> dict[str, Any]:
    try:
        return index.index_file(file_id, force=True)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/index/remove/{file_id}")
def remove_from_index(file_id: str) -> dict[str, Any]:
    try:
        return index.remove_from_index(file_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/files")
def files() -> dict[str, Any]:
    return {"ok": True, "files": index.list_files()}


@app.post("/search")
def search(body: SearchRequest) -> dict[str, Any]:
    return {
        "ok": True,
        "query": body.query,
        "mode": "hybrid",
        "results": index.search(body.query, limit=body.limit, file_id=body.file_id),
    }


@app.post("/command")
def command(body: CommandRequest) -> dict[str, Any]:
    return {"ok": True, **index.command(body.command, limit=body.limit, file_id=body.file_id)}


@app.get("/file/{file_id}")
def preview(file_id: str) -> dict[str, Any]:
    try:
        return {"ok": True, **index.preview_file(file_id)}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/file/{file_id}/raw")
def raw_file(file_id: str) -> FileResponse:
    item = index.file_by_id(file_id)
    if not item:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado na base indexada.")

    try:
        path = (DATA_ROOT / str(item.get("path") or "")).resolve()
        path.relative_to(DATA_ROOT)
    except (ValueError, OSError) as exc:
        raise HTTPException(status_code=403, detail="Caminho do arquivo fora da Ultron_Data.") from exc

    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="Arquivo físico não encontrado.")

    return FileResponse(
        path=str(path),
        headers={"Cache-Control": "no-store", "Content-Disposition": "inline"},
    )


@app.get("/file/{file_id}/split")
def split(file_id: str) -> dict[str, Any]:
    try:
        return {"ok": True, **index.split_file(file_id)}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/file/{file_id}/versions")
def versions(file_id: str) -> dict[str, Any]:
    if not index.file_by_id(file_id):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado na base indexada.")
    return {"ok": True, "source_file_id": file_id, "versions": index.versions_for_file(file_id)}


@app.post("/file/{file_id}/open")
def open_file(file_id: str) -> dict[str, Any]:
    try:
        return index.open_file(file_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Não foi possível abrir o arquivo: {exc}") from exc


@app.post("/compose/export")
def export(body: ExportRequest) -> dict[str, Any]:
    if not body.confirm:
        raise HTTPException(status_code=409, detail="Confirmação explícita necessária para exportar o arquivo remontado.")
    try:
        return index.export_text(body.source_file_id, body.content, body.filename)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="127.0.0.1", port=PORT, reload=False)
