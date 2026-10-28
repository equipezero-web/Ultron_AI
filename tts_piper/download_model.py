from pathlib import Path
from urllib.request import urlretrieve

BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/faber/medium"
MODEL_DIR = Path(__file__).resolve().parent / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

FILES = [
    "pt_BR-faber-medium.onnx",
    "pt_BR-faber-medium.onnx.json",
]

for name in FILES:
    target = MODEL_DIR / name
    if target.exists() and target.stat().st_size > 1024:
        print(f"already present: {target}")
        continue
    url = f"{BASE}/{name}?download=true"
    print(f"downloading {url} -> {target}")
    urlretrieve(url, target)

print("Piper pt-BR model ready")
