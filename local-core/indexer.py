from __future__ import annotations

import hashlib
import json
import os
import platform
import subprocess
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import chromadb
from sentence_transformers import SentenceTransformer

from readers import chunk_text, iter_supported_files, read_file

DEFAULT_MODEL = os.getenv(
    "ULTRON_EMBED_MODEL",
    "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
)


def _sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _safe_relative(root: Path, value: str | Path) -> Path:
    root = root.resolve()
    path = (root / value).resolve() if not Path(value).is_absolute() else Path(value).resolve()
    path.relative_to(root)
    return path


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
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    def _save_manifest(self) -> None:
        self.manifest_path.write_text(
            json.dumps(self.manifest, ensure_ascii=False, indent=2),
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

    def index_all(self, *, force: bool = False) -> dict[str, Any]:
        stats = IndexStats()
        discovered: set[str] = set()

        with self.lock:
            for path in iter_supported_files(self.root):
                stats.files_seen += 1
                relative = path.relative_to(self.root).as_posix()
                discovered.add(relative)
                stat = path.stat()
                signature = f"{stat.st_mtime_ns}:{stat.st_size}"
                previous = self.manifest.get(relative)

                if not force and previous and previous.get("signature") == signature:
                    stats.files_skipped += 1
                    continue

                file_id = _sha(relative)[:24]
                try:
                    text = read_file(path, self.root)
                    chunks = chunk_text(text)
                    self.collection.delete(where={"file_id": file_id})

                    if chunks:
                        embeddings = self._encode_documents(chunks)
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

                    self.manifest[relative] = {
                        "file_id": file_id,
                        "path": relative,
                        "name": path.name,
                        "extension": path.suffix.lower(),
                        "size": stat.st_size,
                        "modified_ns": stat.st_mtime_ns,
                        "signature": signature,
                        "chunks": len(chunks),
                    }
                    stats.files_indexed += 1
                    stats.chunks_indexed += len(chunks)
                except Exception as exc:
                    stats.errors += 1
                    self.manifest[relative] = {
                        "file_id": file_id,
                        "path": relative,
                        "name": path.name,
                        "extension": path.suffix.lower(),
                        "size": stat.st_size,
                        "modified_ns": stat.st_mtime_ns,
                        "signature": signature,
                        "chunks": 0,
                        "error": str(exc)[:500],
                    }

            removed = [path for path in self.manifest if path not in discovered]
            for relative in removed:
                file_id = self.manifest[relative].get("file_id")
                if file_id:
                    self.collection.delete(where={"file_id": file_id})
                self.manifest.pop(relative, None)

            self._save_manifest()

        return {
            "ok": True,
            "root": str(self.root),
            "model": DEFAULT_MODEL,
            "files_seen": stats.files_seen,
            "files_indexed": stats.files_indexed,
            "files_skipped": stats.files_skipped,
            "chunks_indexed": stats.chunks_indexed,
            "errors": stats.errors,
            "removed": len(removed),
        }

    def list_files(self) -> list[dict[str, Any]]:
        with self.lock:
            items = list(self.manifest.values())
        items.sort(key=lambda item: item.get("modified_ns", 0), reverse=True)
        return items

    def file_by_id(self, file_id: str) -> dict[str, Any] | None:
        for item in self.list_files():
            if item.get("file_id") == file_id:
                return item
        return None

    def search(self, query: str, *, limit: int = 6) -> list[dict[str, Any]]:
        query = str(query or "").strip()
        if not query:
            return []
        limit = max(1, min(int(limit), 12))

        with self.lock:
            if self.collection.count() == 0:
                return []
            result = self.collection.query(
                query_embeddings=[self._encode_query(query)],
                n_results=limit,
                include=["documents", "metadatas", "distances"],
            )

        documents = (result.get("documents") or [[]])[0]
        metadatas = (result.get("metadatas") or [[]])[0]
        distances = (result.get("distances") or [[]])[0]

        output = []
        for document, metadata, distance in zip(documents, metadatas, distances):
            score = max(0.0, min(1.0, 1.0 - float(distance or 0.0)))
            output.append(
                {
                    "file_id": metadata.get("file_id"),
                    "path": metadata.get("path"),
                    "name": metadata.get("name"),
                    "extension": metadata.get("extension"),
                    "chunk_index": metadata.get("chunk_index"),
                    "score": round(score, 4),
                    "text": document,
                }
            )
        return output

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
        requested = Path(filename or f"{source.stem}_ultron{source.suffix or '.txt'}").name
        target = _safe_relative(self.root, Path("_exports") / requested)
        if target.exists():
            target = target.with_name(f"{target.stem}_{_sha(content)[:8]}{target.suffix}")
        target.write_text(str(content), encoding="utf-8")
        return {
            "ok": True,
            "source": item["path"],
            "exported": target.relative_to(self.root).as_posix(),
            "overwrote_original": False,
        }

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

    def command(self, command: str, *, limit: int = 6) -> dict[str, Any]:
        command = str(command or "").strip()
        matches = self.search(command, limit=limit)
        top = matches[0] if matches else None
        lower = command.lower()

        action = "SEARCH_FILES"
        if any(word in lower for word in ("abra", "abrir", "open")):
            action = "OPEN_FILE"
        elif any(word in lower for word in ("desmembre", "desmembrar", "isole", "isolar", "separe", "separar")):
            action = "SPLIT_FILE"
        elif any(word in lower for word in ("destaque", "destacar", "mostre", "mostrar")):
            action = "HIGHLIGHT_COMPONENT"

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
        }
