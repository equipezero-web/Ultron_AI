from __future__ import annotations

import io
import os
import threading
import wave
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field
from piper import PiperVoice

APP_DIR = Path(__file__).resolve().parent
MODEL_PATH = APP_DIR / "models" / "pt_BR-faber-medium.onnx"

app = FastAPI(title="ULTRON Piper TTS", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

_voice: PiperVoice | None = None
_voice_lock = threading.Lock()
_synth_lock = threading.Lock()


class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=3000)
    length_scale: float = Field(default=1.0, ge=0.65, le=1.8)


def get_voice() -> PiperVoice:
    global _voice
    if _voice is not None:
        return _voice

    with _voice_lock:
        if _voice is None:
            if not MODEL_PATH.exists():
                raise RuntimeError(f"Modelo Piper ausente: {MODEL_PATH}")
            _voice = PiperVoice.load(str(MODEL_PATH), use_cuda=False)
    return _voice


@app.get("/")
def root():
    return {
        "service": "ultron-piper-tts",
        "status": "online",
        "language": "pt-BR",
        "voice": "pt_BR-faber-medium",
    }


@app.get("/health")
def health():
    return {
        "ok": True,
        "modelPresent": MODEL_PATH.exists(),
        "voiceLoaded": _voice is not None,
        "voice": "pt_BR-faber-medium",
    }


@app.post("/tts")
def tts(payload: TTSRequest):
    text = " ".join(payload.text.split()).strip()
    if not text:
        raise HTTPException(status_code=400, detail="Texto vazio.")

    try:
        voice = get_voice()
        buffer = io.BytesIO()

        with _synth_lock:
            with wave.open(buffer, "wb") as wav_file:
                voice.synthesize_wav(text, wav_file)

        return Response(
            content=buffer.getvalue(),
            media_type="audio/wav",
            headers={
                "Cache-Control": "no-store",
                "X-Ultron-Voice": "pt_BR-faber-medium",
                "X-Ultron-Provider": "Piper TTS",
            },
        )
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "tts_piper.app:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "10000")),
    )
