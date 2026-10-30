from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel, Field

from server import app
from desktop_bridge import DesktopBridge

bridge = DesktopBridge()


class DesktopPairRequest(BaseModel):
    code: str = Field(min_length=6, max_length=12)
    device_name: str | None = Field(default=None, max_length=80)


class DesktopExecuteRequest(BaseModel):
    command: str = Field(min_length=1, max_length=120)
    payload: dict[str, Any] = Field(default_factory=dict)


@app.on_event("startup")
def start_desktop_bridge() -> None:
    if bridge.paired:
        bridge.start()


@app.on_event("shutdown")
def stop_desktop_bridge() -> None:
    bridge.stop()


@app.get("/desktop/bridge/status")
def desktop_bridge_status() -> dict[str, Any]:
    return bridge.status()


@app.post("/desktop/bridge/pair")
def desktop_bridge_pair(body: DesktopPairRequest) -> dict[str, Any]:
    try:
        return bridge.pair(body.code, body.device_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Falha ao parear Desktop Bridge: {exc}") from exc


@app.post("/desktop/bridge/start")
def desktop_bridge_start() -> dict[str, Any]:
    if not bridge.paired:
        raise HTTPException(status_code=409, detail="Desktop Bridge ainda não pareado.")
    bridge.start()
    return bridge.status()


@app.post("/desktop/bridge/stop")
def desktop_bridge_stop() -> dict[str, Any]:
    bridge.stop()
    return bridge.status()


@app.post("/desktop/control")
def desktop_control(body: DesktopExecuteRequest) -> dict[str, Any]:
    try:
        return bridge.execute(body.command, body.payload)
    except PermissionError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Falha no controle local: {exc}") from exc
