"""Montaggio con ffmpeg: Ken Burns per scena (zoom/pan lento), sottotitoli bruciati, musica di sottofondo."""
import random
import subprocess
from pathlib import Path


def _run(cmd: list[str]):
    subprocess.run(cmd, check=True, stderr=subprocess.PIPE, text=True)


def _kenburns(i: int, frames: int, fps: int, w: int, h: int) -> str:
    inc = 0.14 / max(frames, 1)
    variant = i % 4
    if variant == 0:    # zoom in al centro
        z, x, y = f"min(zoom+{inc:.6f},1.14)", "iw/2-(iw/zoom/2)", "ih/2-(ih/zoom/2)"
    elif variant == 1:  # zoom out
        z, x, y = f"if(eq(on,0),1.14,max(zoom-{inc:.6f},1.0))", "iw/2-(iw/zoom/2)", "ih/2-(ih/zoom/2)"
    elif variant == 2:  # zoom in con pan a destra
        z, x, y = f"min(zoom+{inc:.6f},1.14)", f"(iw-iw/zoom)*on/{frames}", "ih/2-(ih/zoom/2)"
    else:               # zoom in con pan a sinistra
        z, x, y = f"min(zoom+{inc:.6f},1.14)", f"(iw-iw/zoom)*(1-on/{frames})", "ih/2-(ih/zoom/2)"
    return (f"scale={w*2}:{h*2},zoompan=z='{z}':x='{x}':y='{y}':d={frames}:s={w}x{h}:fps={fps},"
            "format=yuv420p,setsar=1")


def render_scene(img: Path, audio: Path, dur: float, i: int, cfg: dict, out: Path):
    fps, w, h = cfg["fps"], cfg["image_width"], cfg["image_height"]
    frames = int(dur * fps) + 1
    _run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(img), "-i", str(audio),
          "-vf", _kenburns(i, frames, fps, w, h), "-af", "apad,aresample=44100",
          "-t", f"{dur:.3f}", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
          "-r", str(fps), "-c:a", "aac", "-ar", "44100", "-ac", "2", str(out)])


def _fmt(t: float) -> str:
    return f"{int(t//3600)}:{int(t%3600//60):02d}:{t%60:05.2f}"


def write_ass(scenes: list[dict], path: Path, w: int, h: int):
    head = (f"[Script Info]\nScriptType: v4.00+\nPlayResX: {w}\nPlayResY: {h}\n\n[V4+ Styles]\n"
            "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,"
            "Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,"
            "MarginV,Encoding\nStyle: Default,DejaVu Sans,34,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,"
            "100,100,0,0,1,3,1,2,60,60,50,1\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,"
            "MarginV,Effect,Text\n")
    lines, t = [], 0.0
    for s in scenes:
        words = s["text"].split()
        chunks = [" ".join(words[k:k + 6]) for k in range(0, len(words), 6)] or [""]
        total = sum(len(c) for c in chunks) or 1
        cur = t
        for c in chunks:
            d = s["dur"] * len(c) / total
            lines.append(f"Dialogue: 0,{_fmt(cur)},{_fmt(cur + d)},Default,,0,0,0,,{c}")
            cur += d
        t += s["dur"]
    path.write_text(head + "\n".join(lines) + "\n", encoding="utf-8")


def concat_and_finish(clips: list[Path], scenes: list[dict], work: Path, cfg: dict, out: Path,
                      music_dir: Path | None = None):
    lst = work / "clips.txt"
    lst.write_text("".join(f"file '{c.resolve()}'\n" for c in clips))
    body = work / "body.mp4"
    _run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst),
          "-c", "copy", str(body)])

    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(body)]
    tracks = sorted(music_dir.glob("*.mp3")) if music_dir and music_dir.exists() else []
    vf = "null"
    if cfg.get("burn_subtitles"):
        ass = work / "subs.ass"
        write_ass(scenes, ass, cfg["image_width"], cfg["image_height"])
        vf = f"subtitles={ass.name}"
    if tracks:
        cmd += ["-stream_loop", "-1", "-i", str(random.choice(tracks))]
        fc = (f"[0:v]{vf}[v];[1:a]volume={cfg['music_volume']}[m];"
              "[0:a][m]amix=inputs=2:duration=first:dropout_transition=0[a]")
        cmd += ["-filter_complex", fc, "-map", "[v]", "-map", "[a]"]
    else:
        cmd += ["-vf", vf]
    cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-b:a", "160k",
            "-movflags", "+faststart", str(out)]
    subprocess.run(cmd, check=True, cwd=work, stderr=subprocess.PIPE, text=True)
