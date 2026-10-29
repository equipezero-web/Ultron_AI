from __future__ import annotations

import hashlib
import json
import os
import platform
import re
import subprocess
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import chromadb
from sentence_transformers import SentenceTransformer

from readers import chunk_text, iter_supported_files, read_file
from writers import export_content as write_export
from writers import safe_export_suffix, sanitize_filename

DEFAULT_MODEL = os.getenv(
    "ULTRON_EMBED_MODEL",
    "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
)
MAX_INDEX_CHARS = int(os.getenv("ULTRON_MAX_INDEX_CHARS", "4000000"))
INDEX_SCHEMA_VERSION = 2


def _sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _safe_relative(root: Path, value: str | Path) -> Path:
    root = root.resolve()
    path = (root / value).resolve() if not Path(value).is_absolute() else Path(value).resolve()
    path.relative_to(root)
    return path


def _normalize(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()


def _terms(value: str) -> set[str]:
    return {term for term in _normalize(value).split() if len(term) >= 2}


def _lexical_score(query: str, path: str, text: str) -> float:
    q = _normalize(query)
    if not q:
        return 0.0
    q_terms = _terms(q)
    if not q_terms:
        return 0.0

    path_norm = _normalize(path)
    text_norm = _normalize(text[:8000])
    path_terms = _terms(path_norm)
    text_terms = _terms(text_norm)

    path_overlap = len(q_terms & path_terms) / max(1, len(q_terms))
    text_overlap = len(q_terms & text_terms) / max(1, len(q_terms))
    phrase_boost = 1.0 if q in path_norm else (0.65 if q in text_norm else 0.0)
    return min(1.0, path_overlap * 0.5 + text_overlap * 0.35 + phrase_boost * 0.15)


@dataclass
class IndexStats:
    files_seen: int = 0
    files_indexed: int = 0
    files_skipped: int = 0
    chunks_indexed: int = 0
    errors: int = 0


class UltronLocalIndex:
    def __init__(self, root: Path, index_dir: Path | None = None):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.index_dir = (index_dir or self.root / ".ultron_index").resolve()
        self.index_dir.mkdir(parents=True, exist_ok=True)
        self.exports_dir = self.root / "_exports"
        self.exports_dir.mkdir(parents=True, exist_ok=True)
        self.manifest_path = self.index_dir / "manifest.json"
        self.lock = threading.RLock()
        self.last_index_at: str | None = None
        self.last_index_result: dict[str, Any] | None = None
        self.watcher_active = False

        self.model = SentenceTransformer(DEFAULT_MODEL)
        self.client = chromadb.PersistentClient(path=str(self.index_dir / "chroma"))
        self.collection = self.client.get_or_create_collection(
            name="ultron_files",
            metadata={"hnsw:space": "cosine"},
        )
        self.manifest = self._load_manifest()

    def _load_manifest(self) -> dict[str, dict[str, Any]]:
        try:
            data = json.loads(self.manifest_path.read_text(encoding="utf-8"))
            if isinstance(data, dict) and "files" in data:
                files = data.get("files")
                return files if isinstance(files, dict) else {}
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    def _save_manifest(self) -> None:
        payload = {
            "schema_version": INDEX_SCHEMA_VERSION,
            "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "files": self.manifest,
        }
        self.manifest_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def _encode_documents(self, texts: list[str]) -> list[list[float]]:
        if hasattr(self.model, "encode_document"):
            values = self.model.encode_document(texts, normalize_embeddings=True)
        else:
            values = self.model.encode(texts, normalize_embeddings=True)
        return values.tolist()

    def _encode_query(self, text: str) -> list[float]:
        if hasattr(self.model, "encode_query"):
            value = self.model.encode_query(text, normalize_embeddings=True)
        else:
            value = self.model.encode(text, normalize_embeddings=True)
        return value.tolist()

    def _index_path(self, path: Path, *, force: bool = False) -> dict[str, Any]:
        path = _safe_relative(self.root, path)
        if not path.exists() or not path.is_file():
            raise FileNotFoundError(str(path))

        relative = path.relative_to(self.root).as_posix()
        stat = path.stat()
        signature = f"{stat.st_mtime_ns}:{stat.st_size}"
        previous = self.manifest.get(relative)
        file_id = (previous or {}).get("file_id") or _sha(relative)[:24]

        if not force and previous and previous.get("signature") == signature:
            return {"indexed": False, "skipped": True, "chunks": int(previous.get("chunks") or 0), "file": previous}

        text = read_file(path, self.root)
        truncated = len(text) > MAX_INDEX_CHARS
        if truncated:
            text = text[:MAX_INDEX_CHARS]
        chunks = chunk_text(text)

        self.collection.delete(where={"file_id": file_id})
        if chunks:
            embed_inputs = [f"ARQUIVO: {relative}\nNOME: {path.name}\n\n{chunk}" for chunk in chunks]
            embeddings = self._encode_documents(embed_inputs)
            ids = [f"{file_id}:{index}" for index in range(len(chunks))]
            metadatas = [
                {
                    "file_id": file_id,
                    "path": relative,
                    "name": path.name,
                    "extension": path.suffix.lower(),
                    "chunk_index": index,
                    "modified_ns": stat.st_mtime_ns,
                }
                for index in range(len(chunks))
            ]
            self.collection.add(
                ids=ids,
                embeddings=embeddings,
                documents=chunks,
                metadatas=metadatas,
            )

        item = {
            "file_id": file_id,
            "path": relative,
            "name": path.name,
            "extension": path.suffix.lower(),
            "size": stat.st_size,
            "modified_ns": stat.st_mtime_ns,
            "signature": signature,
            "chunks": len(chunks),
            "index_truncated": truncated,
            "source_file_id": (previous or {}).get("source_file_id"),
        }
        self.manifest[relative] = item
        return {"indexed": True, "skipped": False, "chunks": len(chunks), "file": item}

    def index_all(self, *, force: bool = False) -> dict[str, Any]:
        stats = IndexStats()
        discovered: set[str] = set()
        errors: list[dict[str, str]] = []

        with self.lock:
            for path in iter_supported_files(self.root):
                stats.files_seen += 1
                relative = path.relative_to(self.root).as_posix()
                discovered.add(relative)
                try:
                    result = self._index_path(path, force=force)
                    if result["skipped"]:
                        stats.files_skipped += 1
                    else:
                        stats.files_indexed += 1
                        stats.chunks_indexed += int(result.get("chunks") or 0)
                except Exception as exc:
                    stats.errors += 1
                    errors.append({"path": relative, "error": str(exc)[:300]})

            removed = [path for path in list(self.manifest) if path not in discovered]
            for relative in removed:
                file_id = self.manifest[relative].get("file_id")
                if file_id:
                    self.collection.delete(where={"file_id": file_id})
                self.manifest.pop(relative, None)

            self._save_manifest()
            self.last_index_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        result = {
            "ok": True,
            "root": str(self.root),
            "model": DEFAULT_MODEL,
            "schema_version": INDEX_SCHEMA_VERSION,
            "files_seen": stats.files_seen,
            "files_indexed": stats.files_indexed,
            "files_skipped": stats.files_skipped,
            "chunks_indexed": stats.chunks_indexed,
            "errors": stats.errors,
            "error_items": errors[:20],
            "removed": len(removed),
            "total_files": len(self.manifest),
            "total_chunks": self.collection.count(),
            "indexed_at": self.last_index_at,
        }
        self.last_index_result = result
        return result

    def index_file(self, file_id: str, *, force: bool = True) -> dict[str, Any]:
        item = self.file_by_id(file_id)
        if not item:
            raise FileNotFoundError("Arquivo não encontrado na base indexada.")
        with self.lock:
            result = self._index_path(_safe_relative(self.root, item["path"]), force=force)
            self._save_manifest()
        return {"ok": True, **result}

    def remove_from_index(self, file_id: str) -> dict[str, Any]:
        item = self.file_by_id(file_id)
        if not item:
            raise FileNotFoundError("Arquivo não encontrado na base indexada.")
        with self.lock:
            self.collection.delete(where={"file_id": file_id})
            self.manifest.pop(item["path"], None)
            self._save_manifest()
        return {"ok": True, "removed_from_index": item["path"], "file_deleted": False}

    def list_files(self) -> list[dict[str, Any]]:
        with self.lock:
            items = [dict(item) for item in self.manifest.values()]
        items.sort(key=lambda item: item.get("modified_ns", 0), reverse=True)
        return items

    def file_by_id(self, file_id: str) -> dict[str, Any] | None:
        for item in self.list_files():
            if item.get("file_id") == file_id:
                return item
        return None

    def stats(self) -> dict[str, Any]:
        items = self.list_files()
        by_extension: dict[str, int] = {}
        total_bytes = 0
        errors = 0
        for item in items:
            extension = str(item.get("extension") or "sem-ext")
            by_extension[extension] = by_extension.get(extension, 0) + 1
            total_bytes += int(item.get("size") or 0)
            if item.get("error"):
                errors += 1
        return {
            "files": len(items),
            "vector_chunks": self.collection.count(),
            "total_bytes": total_bytes,
            "by_extension": dict(sorted(by_extension.items(), key=lambda pair: (-pair[1], pair[0]))),
            "errors": errors,
            "last_index_at": self.last_index_at,
            "last_index_result": self.last_index_result,
            "watcher_active": self.watcher_active,
            "schema_version": INDEX_SCHEMA_VERSION,
        }

    def search(self, query: str, *, limit: int = 6, file_id: str | None = None) -> list[dict[str, Any]]:
        query = str(query or "").strip()
        if not query:
            return []
        limit = max(1, min(int(limit), 20))

        with self.lock:
            count = self.collection.count()
            if count == 0:
                return []
            n_results = min(count, max(limit * 4, 12))
            kwargs: dict[str, Any] = {
                "query_embeddings": [self._encode_query(query)],
                "n_results": n_results,
                "include": ["documents", "metadatas", "distances"],
            }
            if file_id:
                kwargs["where"] = {"file_id": file_id}
            result = self.collection.query(**kwargs)

        documents = (result.get("documents") or [[]])[0]
        metadatas = (result.get("metadatas") or [[]])[0]
        distances = (result.get("distances") or [[]])[0]

        output = []
        for document, metadata, distance in zip(documents, metadatas, distances):
            semantic = max(0.0, min(1.0, 1.0 - float(distance or 0.0)))
            lexical = _lexical_score(query, str(metadata.get("path") or ""), str(document or ""))
            score = min(1.0, semantic * 0.82 + lexical * 0.18)
            output.append(
                {
                    "file_id": metadata.get("file_id"),
                    "path": metadata.get("path"),
                    "name": metadata.get("name"),
                    "extension": metadata.get("extension"),
                    "chunk_index": metadata.get("chunk_index"),
                    "score": round(score, 4),
                    "semantic_score": round(semantic, 4),
                    "lexical_score": round(lexical, 4),
                    "match_mode": "hybrid",
                    "text": document,
                }
            )

        output.sort(key=lambda item: item["score"], reverse=True)
        return output[:limit]

    def split_file(self, file_id: str) -> dict[str, Any]:
        item = self.file_by_id(file_id)
        if not item:
            raise FileNotFoundError("Arquivo não encontrado na base indexada.")
        path = _safe_relative(self.root, item["path"])
        text = read_file(path, self.root)
        chunks = chunk_text(text, chunk_size=1000, overlap=80)
        return {
            "file": item,
            "components": [
                {"id": f"{file_id}:{index}", "order": index, "text": chunk}
                for index, chunk in enumerate(chunks)
            ],
        }

    def preview_file(self, file_id: str, *, max_chars: int = 12000) -> dict[str, Any]:
        item = self.file_by_id(file_id)
        if not item:
            raise FileNotFoundError("Arquivo não encontrado na base indexada.")
        path = _safe_relative(self.root, item["path"])
        text = read_file(path, self.root)
        return {
            "file": item,
            "text": text[:max_chars],
            "truncated": len(text) > max_chars,
        }

    def export_text(self, source_file_id: str, content: str, filename: str | None = None) -> dict[str, Any]:
        item = self.file_by_id(source_file_id)
        if not item:
            raise FileNotFoundError("Arquivo de origem não encontrado.")

        source = Path(item["name"])
        requested_name = sanitize_filename(filename or f"{source.stem}_ultron{source.suffix or '.txt'}")
        requested_path = Path(requested_name)
        suffix = safe_export_suffix(source.suffix, requested_path.suffix)
        stem = requested_path.stem or f"{source.stem}_ultron"
        target = _safe_relative(self.root, Path("_exports") / f"{stem}{suffix}")
        if target.exists():
            target = target.with_name(f"{target.stem}_{_sha(str(content))[:8]}{target.suffix}")

        written_format = write_export(target, str(content))
        with self.lock:
            indexed = self._index_path(target, force=True)
            exported_rel = target.relative_to(self.root).as_posix()
            if exported_rel in self.manifest:
                self.manifest[exported_rel]["source_file_id"] = source_file_id
                self.manifest[exported_rel]["exported_version"] = True
                self._save_manifest()

        return {
            "ok": True,
            "source": item["path"],
            "exported": target.relative_to(self.root).as_posix(),
            "exported_file_id": indexed.get("file", {}).get("file_id"),
            "format": written_format,
            "overwrote_original": False,
            "indexed": True,
        }

    def versions_for_file(self, file_id: str) -> list[dict[str, Any]]:
        return [
            item for item in self.list_files()
            if item.get("source_file_id") == file_id
        ]

    def open_file(self, file_id: str) -> dict[str, Any]:
        item = self.file_by_id(file_id)
        if not item:
            raise FileNotFoundError("Arquivo não encontrado na base indexada.")
        path = _safe_relative(self.root, item["path"])

        system = platform.system().lower()
        if system == "windows":
            os.startfile(str(path))  # type: ignore[attr-defined]
        elif system == "darwin":
            subprocess.Popen(["open", str(path)])
        else:
            subprocess.Popen(["xdg-open", str(path)])
        return {"ok": True, "path": item["path"]}

    def command(self, command: str, *, limit: int = 6, file_id: str | None = None) -> dict[str, Any]:
        command = str(command or "").strip()
        matches = self.search(command, limit=limit, file_id=file_id)
        top = matches[0] if matches else None
        lower = command.lower()

        action = "SEARCH_FILES"
        if any(word in lower for word in ("abra", "abrir", "open")):
            action = "OPEN_FILE"
        elif any(word in lower for word in ("desmembre", "desmembrar", "isole", "isolar", "separe", "separar")):
            action = "SPLIT_FILE"
        elif any(word in lower for word in ("destaque", "destacar", "mostre", "mostrar")):
            action = "HIGHLIGHT_COMPONENT"
        elif any(word in lower for word in ("edite", "editar", "reescreva", "corrija", "corrigir")):
            action = "EDIT_COMPONENT"

        return {
            "response_text": (
                f"Encontrei {len(matches)} resultado(s) relacionado(s) na base local."
                if matches else
                "Não encontrei conteúdo relacionado na base local indexada."
            ),
            "target_file": top.get("path") if top else None,
            "target_file_id": top.get("file_id") if top else None,
            "action": action,
            "component_id": f"chunk-{top.get('chunk_index')}" if top else None,
            "status_color": "#00F0FF" if matches else "#FF5500",
            "matches": matches,
            "search_mode": "hybrid",
        }

    def watch_forever(self, stop_event: threading.Event, *, interval: float = 8.0) -> None:
        self.watcher_active = True
        try:
            while not stop_event.is_set():
                try:
                    self.index_all(force=False)
                except Exception as exc:
                    print(f"[ULTRON LOCAL INDEX] watcher: {exc}")
                stop_event.wait(max(3.0, float(interval)))
        finally:
            self.watcher_active = False
