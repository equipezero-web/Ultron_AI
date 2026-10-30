from __future__ import annotations

import ctypes
import json
import os
import platform
import secrets
import shutil
import socket
import subprocess
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path
from typing import Any

DEFAULT_CLOUD_URL = "https://ultron-backend.lucaalves17-20.workers.dev"
STATE_DIR = Path.home() / ".ultron"
STATE_FILE = STATE_DIR / "desktop_bridge.json"

CAPABILITIES = [
    "desktop.status",
    "desktop.app.open",
    "desktop.open.url",
    "desktop.volume.up",
    "desktop.volume.down",
    "desktop.volume.mute",
    "desktop.media.play_pause",
    "desktop.media.next",
    "desktop.media.previous",
    "desktop.lock",
    "desktop.sleep",
    "desktop.restart",
    "desktop.shutdown",
]

VK = {
    "desktop.volume.mute": 0xAD,
    "desktop.volume.down": 0xAE,
    "desktop.volume.up": 0xAF,
    "desktop.media.next": 0xB0,
    "desktop.media.previous": 0xB1,
    "desktop.media.play_pause": 0xB3,
}

APP_ALIASES: dict[str, list[str]] = {
    "notepad": ["notepad.exe"],
    "bloco de notas": ["notepad.exe"],
    "calculator": ["calc.exe"],
    "calculadora": ["calc.exe"],
    "explorer": ["explorer.exe"],
    "arquivos": ["explorer.exe"],
    "paint": ["mspaint.exe"],
    "terminal": ["wt.exe"],
    "edge": ["msedge.exe"],
    "chrome": ["chrome.exe"],
}


def _browser_install_candidates(executable: str) -> list[str]:
    candidates: list[str] = []
    local = os.environ.get("LOCALAPPDATA")
    program_files = os.environ.get("PROGRAMFILES")
    program_files_x86 = os.environ.get("PROGRAMFILES(X86)")

    if executable.lower() == "chrome.exe":
        for root in (local, program_files, program_files_x86):
            if root:
                candidates.append(str(Path(root) / "Google" / "Chrome" / "Application" / "chrome.exe"))
    elif executable.lower() == "msedge.exe":
        for root in (program_files_x86, program_files, local):
            if root:
                candidates.append(str(Path(root) / "Microsoft" / "Edge" / "Application" / "msedge.exe"))
    elif executable.lower() == "wt.exe":
        local_app_data = os.environ.get("LOCALAPPDATA")
        if local_app_data:
            candidates.append(str(Path(local_app_data) / "Microsoft" / "WindowsApps" / "wt.exe"))

    return candidates


def _resolve_allowed_app(candidates: list[str]) -> str:
    expanded: list[str] = []
    for candidate in candidates:
        expanded.append(candidate)
        expanded.extend(_browser_install_candidates(candidate))

    for candidate in expanded:
        direct = Path(os.path.expandvars(candidate))
        if direct.is_absolute() and direct.exists() and direct.is_file():
            return str(direct)
        found = shutil.which(candidate)
        if found:
            return found

    raise FileNotFoundError("Aplicativo autorizado, mas não encontrado neste Windows.")


def _json_request(url: str, payload: dict[str, Any], timeout: float = 12.0) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            data = response.read().decode("utf-8", errors="replace")
            parsed = json.loads(data or "{}")
            if not isinstance(parsed, dict):
                raise RuntimeError("Resposta inválida do Ultron Cloud.")
            return parsed
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(detail or "{}")
            message = parsed.get("error") or parsed.get("detail") or detail
        except Exception:
            message = detail
        raise RuntimeError(f"Ultron Cloud HTTP {exc.code}: {message}") from exc


class DesktopBridge:
    def __init__(self, cloud_url: str | None = None) -> None:
        self.cloud_url = str(cloud_url or os.getenv("ULTRON_CLOUD_URL") or DEFAULT_CLOUD_URL).rstrip("/")
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._lock = threading.RLock()
        self.last_error: str | None = None
        self.last_seen_at: float | None = None
        self.last_command: dict[str, Any] | None = None
        self.state = self._load_state()

    def _load_state(self) -> dict[str, Any]:
        try:
            if STATE_FILE.exists():
                data = json.loads(STATE_FILE.read_text(encoding="utf-8"))
                if isinstance(data, dict):
                    return data
        except Exception:
            pass
        return {}

    def _save_state(self) -> None:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        STATE_FILE.write_text(json.dumps(self.state, ensure_ascii=False, indent=2), encoding="utf-8")

    @property
    def paired(self) -> bool:
        return bool(self.state.get("deviceId") and self.state.get("deviceSecret"))

    @property
    def running(self) -> bool:
        return bool(self._thread and self._thread.is_alive())

    def pair(self, code: str, device_name: str | None = None) -> dict[str, Any]:
        normalized = "".join(ch for ch in str(code or "") if ch.isdigit())
        if len(normalized) != 6:
            raise ValueError("Código de pareamento deve ter 6 dígitos.")

        secret = secrets.token_hex(32)
        name = (device_name or f"{socket.gethostname()} // Windows").strip()[:80]
        result = _json_request(
            f"{self.cloud_url}/api/devices/pair/claim",
            {
                "code": normalized,
                "deviceName": name,
                "deviceType": "desktop",
                "deviceSecret": secret,
                "platform": f"Windows {platform.release()} // {platform.machine()}",
                "capabilities": CAPABILITIES,
            },
        )
        if result.get("ok") is False or not result.get("deviceId"):
            raise RuntimeError(result.get("error") or "Pareamento do Desktop Bridge falhou.")

        with self._lock:
            self.state = {
                "deviceId": result["deviceId"],
                "deviceSecret": secret,
                "deviceName": result.get("deviceName") or name,
                "pairedAt": time.time(),
            }
            self._save_state()
        self.start()
        return {"ok": True, "deviceId": result["deviceId"], "deviceName": self.state["deviceName"]}

    def start(self) -> bool:
        if not self.paired:
            return False
        if self.running:
            return True
        self._stop.clear()
        self._thread = threading.Thread(target=self._poll_forever, name="ultron-desktop-bridge", daemon=True)
        self._thread.start()
        return True

    def stop(self) -> None:
        self._stop.set()
        thread = self._thread
        if thread and thread.is_alive():
            thread.join(timeout=3.0)

    def status(self) -> dict[str, Any]:
        return {
            "ok": True,
            "paired": self.paired,
            "running": self.running,
            "deviceId": self.state.get("deviceId"),
            "deviceName": self.state.get("deviceName"),
            "cloudUrl": self.cloud_url,
            "lastError": self.last_error,
            "lastSeenAt": self.last_seen_at,
            "lastCommand": self.last_command,
            "capabilities": CAPABILITIES,
        }

    def _poll_forever(self) -> None:
        delay = 2.0
        while not self._stop.is_set():
            try:
                self._poll_once()
                self.last_error = None
                delay = 2.0
            except Exception as exc:
                self.last_error = str(exc)[:300]
                delay = min(15.0, max(3.0, delay * 1.6))
            self._stop.wait(delay)

    def _poll_once(self) -> None:
        if not self.paired:
            return
        device_id = str(self.state.get("deviceId") or "")
        secret = str(self.state.get("deviceSecret") or "")
        response = _json_request(
            f"{self.cloud_url}/api/bridge/poll",
            {"deviceId": device_id, "deviceSecret": secret},
        )
        self.last_seen_at = time.time()
        commands = response.get("commands") if isinstance(response, dict) else []
        if not isinstance(commands, list):
            return
        for item in commands:
            if not isinstance(item, dict):
                continue
            command_id = str(item.get("id") or "")
            command = str(item.get("command") or "")
            payload = item.get("payload") if isinstance(item.get("payload"), dict) else {}
            success = False
            result: dict[str, Any]
            try:
                result = self.execute(command, payload)
                success = bool(result.get("ok", True))
            except Exception as exc:
                result = {"ok": False, "error": str(exc)[:500]}
            self.last_command = {"id": command_id, "command": command, "success": success, "at": time.time()}
            _json_request(
                f"{self.cloud_url}/api/bridge/result",
                {
                    "deviceId": device_id,
                    "deviceSecret": secret,
                    "commandId": command_id,
                    "status": "completed" if success else "failed",
                    "result": result,
                },
            )

    def execute(self, command: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        payload = payload or {}
        command = str(command or "").strip()

        if command in {"device.status", "desktop.status"}:
            usage = shutil.disk_usage(Path.home().anchor or "C:\\")
            return {
                "ok": True,
                "hostname": socket.gethostname(),
                "platform": platform.platform(),
                "machine": platform.machine(),
                "python": platform.python_version(),
                "diskFreeGb": round(usage.free / (1024 ** 3), 2),
                "bridge": "online",
            }

        if command == "desktop.open.url":
            url = str(payload.get("url") or "").strip()
            if not (url.startswith("https://") or url.startswith("http://")):
                raise ValueError("Somente URLs http/https são permitidas.")
            opened = webbrowser.open(url, new=0, autoraise=True)
            return {"ok": bool(opened), "url": url}

        if command == "desktop.app.open":
            alias = str(payload.get("app") or payload.get("name") or "").strip().lower()
            candidates = APP_ALIASES.get(alias)
            if not candidates:
                raise ValueError("Aplicativo não autorizado pelo Desktop Bridge.")
            executable = _resolve_allowed_app(candidates)
            subprocess.Popen([executable], close_fds=True)
            return {"ok": True, "app": alias, "executable": Path(executable).name}

        if command in VK:
            key = VK[command]
            user32 = ctypes.windll.user32
            user32.keybd_event(key, 0, 0, 0)
            user32.keybd_event(key, 0, 2, 0)
            return {"ok": True, "key": command}

        if command == "desktop.lock":
            ok = bool(ctypes.windll.user32.LockWorkStation())
            return {"ok": ok, "locked": ok}

        if command in {"desktop.sleep", "desktop.restart", "desktop.shutdown"}:
            if payload.get("confirm") is not True:
                raise PermissionError("Confirmação explícita obrigatória para esta ação.")
            if command == "desktop.sleep":
                subprocess.Popen(["rundll32.exe", "powrprof.dll,SetSuspendState", "0,1,0"], close_fds=True)
            elif command == "desktop.restart":
                subprocess.Popen(["shutdown.exe", "/r", "/t", "0"], close_fds=True)
            else:
                subprocess.Popen(["shutdown.exe", "/s", "/t", "0"], close_fds=True)
            return {"ok": True, "requested": command}

        raise ValueError("Comando não permitido pelo Desktop Bridge.")
