"""Genera audio per scena (edge-tts) e renderizza il video con Remotion."""
import json
import shutil
import subprocess
from pathlib import Path

from . import tts
from .config import ROOT

REMOTION = ROOT / "remotion"


def render(cfg: dict, scenes: list[dict], out: Path, tts_provider: str = "edge", seed: int = 1,
           concurrency: int | None = None) -> list[dict]:
    pub = REMOTION / "public"
    audio_dir, music_dir = pub / "audio", pub / "music"
    shutil.rmtree(audio_dir, ignore_errors=True)
    audio_dir.mkdir(parents=True)
    fps = cfg["fps"]
    for i, s in enumerate(scenes):
        name = f"s{i:04d}.mp3"
        dur = tts.synth(cfg, s["text"], audio_dir / name, tts_provider) + 0.35
        s["audio"], s["frames"] = name, int(round(dur * fps))
        print(f"voce {i+1}/{len(scenes)} ({dur:.1f}s)")

    props = {"scenes": scenes, "seed": seed}
    tracks = sorted((ROOT / "assets" / "music").glob("*.mp3"))
    if tracks:
        shutil.rmtree(music_dir, ignore_errors=True)
        music_dir.mkdir(parents=True)
        shutil.copy(tracks[seed % len(tracks)], music_dir / "bg.mp3")
        props.update(music="bg.mp3", musicVolume=cfg["music_volume"])
    pfile = pub / "props.json"
    pfile.write_text(json.dumps(props, ensure_ascii=False))

    if not (REMOTION / "node_modules").exists():
        subprocess.run(["npm", "ci", "--no-audit", "--no-fund"], cwd=REMOTION, check=True)
    cmd = ["npx", "remotion", "render", "src/index.ts", "Story", str(out.resolve()), f"--props={pfile}", "--log=error"]
    if concurrency:
        cmd.append(f"--concurrency={concurrency}")
    subprocess.run(cmd, cwd=REMOTION, check=True)
    return scenes
