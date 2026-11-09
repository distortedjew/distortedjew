"""Voce gratuita con edge-tts (voci neurali Microsoft, nessuna chiave). 'silent' per i test."""
import asyncio
import subprocess
from pathlib import Path

import edge_tts


def duration(path: Path) -> float:
    out = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                   "-of", "default=nk=1:nw=1", str(path)], text=True)
    return float(out.strip())


async def _edge(text: str, voice: str, rate: str, out: Path):
    await edge_tts.Communicate(text, voice, rate=rate).save(str(out))


def synth(cfg: dict, text: str, out: Path, provider: str = "edge") -> float:
    if provider == "silent":
        secs = max(2.0, len(text.split()) / 2.6)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i",
                        "anullsrc=r=44100:cl=stereo", "-t", f"{secs:.2f}", str(out)], check=True)
        return duration(out)
    last = None
    for _ in range(4):
        try:
            asyncio.run(_edge(text, cfg["voice"], cfg.get("voice_rate", "+0%"), out))
            return duration(out)
        except Exception as e:  # noqa: BLE001
            last = e
    raise RuntimeError(f"TTS fallito: {last}")
