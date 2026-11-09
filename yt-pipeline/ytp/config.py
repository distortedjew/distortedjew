import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load_config(path: Path | None = None) -> dict:
    return json.loads((path or ROOT / "channel.json").read_text(encoding="utf-8"))
