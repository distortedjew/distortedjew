"""Audio per scena (edge-tts) + musica/sfx sintetizzati + render Remotion."""
import json
import shutil
import subprocess
from pathlib import Path

from . import synth_audio, tts
from .config import ROOT

REMOTION = ROOT / "remotion"
PAD = 14  # deve coincidere con PAD in remotion/src/types.ts (pausa dopo la voce, in frame)


def _stage_audio(pub: Path):
    gen = synth_audio.ensure_assets()
    for sub in ("sfx", "music"):
        shutil.rmtree(pub / sub, ignore_errors=True)
        shutil.copytree(gen / sub, pub / sub)
    for mood in synth_audio.MOODS:  # musica tua (assets/music/<umore>.mp3) ha la precedenza
        mine = ROOT / "assets" / "music" / f"{mood}.mp3"
        if mine.exists(): shutil.copy(mine, pub / "music" / f"{mood}.mp3")


def render(cfg: dict, script: dict, out: Path, tts_provider: str = "edge", seed: int = 1, concurrency: int | None = None) -> list[dict]:
    scenes = script["scenes"]
    pub = REMOTION / "public"
    audio_dir = pub / "audio"
    shutil.rmtree(audio_dir, ignore_errors=True)
    audio_dir.mkdir(parents=True)
    fps = cfg["fps"]
    for i, s in enumerate(scenes):
        name = f"s{i:04d}.mp3"
        voice = tts.synth(cfg, s["text"], audio_dir / name, tts_provider)
        s["audio"], s["frames"] = name, int(round(voice * fps)) + PAD
        print(f"voce {i+1}/{len(scenes)} ({voice:.1f}s)")
    _stage_audio(pub)
    props = {"scenes": scenes, "characters": script.get("characters", []), "seed": seed, "musicVolume": cfg.get("music_volume", 0.13)}
    pfile = pub / "props.json"
    pfile.write_text(json.dumps(props, ensure_ascii=False))
    if not (REMOTION / "node_modules").exists():
        subprocess.run(["npm", "ci", "--no-audit", "--no-fund"], cwd=REMOTION, check=True)
    cmd = ["npx", "remotion", "render", "src/index.ts", "Story", str(out.resolve()), f"--props={pfile}", "--log=error"]
    if concurrency: cmd.append(f"--concurrency={concurrency}")
    subprocess.run(cmd, cwd=REMOTION, check=True)
    return scenes
