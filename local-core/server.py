from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from indexer import DEFAULT_MODEL, UltronLocalIndex

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = Path(os.getenv("ULTRON_DATA_ROOT", PROJECT_ROOT / "Ultron_Data")).resolve()
PORT = int(os.getenv("ULTRON_LOCAL_PORT", "8765"))

app = FastAPI(title="Ultron Local Core", version="1.0.0")
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


class IndexRequest(BaseModel):
    force: bool = False


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=1000)
    limit: int = Field(default=6, ge=1, le=12)


class CommandRequest(BaseModel):
    command: str = Field(min_length=1, max_length=1600)
    limit: int = Field(default=6, ge=1, le=12)


class ExportRequest(BaseModel):
    source_file_id: str = Field(min_length=4, max_length=128)
    content: str = Field(max_length=2_000_000)
    filename: str | None = Field(default=None, max_length=240)
    confirm: bool = False


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "ultron-local-core",
        "version": "1.0.0",
        "root": str(DATA_ROOT),
        "model": DEFAULT_MODEL,
        "files": len(index.list_files()),
        "vector_chunks": index.collection.count(),
        "safety": {
            "rootRestricted": True,
            "sourceOverwrite": False,
            "bindRecommended": "127.0.0.1",
        },
    }


@app.post("/index")
def rebuild_index(body: IndexRequest) -> dict[str, Any]:
    return index.index_all(force=body.force)


@app.get("/files")
def files() -> dict[str, Any]:
    return {"ok": True, "files": index.list_files()}


@app.post("/search")
def search(body: SearchRequest) -> dict[str, Any]:
    return {"ok": True, "query": body.query, "results": index.search(body.query, limit=body.limit)}


@app.post("/command")
def command(body: CommandRequest) -> dict[str, Any]:
    return {"ok": True, **index.command(body.command, limit=body.limit)}


@app.get("/file/{file_id}")
def preview(file_id: str) -> dict[str, Any]:
    try:
        return {"ok": True, **index.preview_file(file_id)}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/file/{file_id}/split")
def split(file_id: str) -> dict[str, Any]:
    try:
        return {"ok": True, **index.split_file(file_id)}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="127.0.0.1", port=PORT, reload=False)
