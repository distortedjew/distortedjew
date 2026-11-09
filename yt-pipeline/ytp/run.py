"""Orchestratore. Uso: python -m ytp.run [--dry-run] [--no-upload]"""
import argparse
import json
import re
import shutil
import time
from pathlib import Path

from . import assemble, doc_script, images, remotion_render, script_gen, tts
from .config import ROOT, load_config
from .thumbnail import make_thumbnail

HISTORY = ROOT / "state" / "history.json"

SAMPLE = {
    "title": "Il bambino che ascoltava le stelle", "description": "Una storia di prova. #storie",
    "tags": ["storie"], "characters": [{"name": "Luca", "visual": "10 year old boy, curly brown hair, yellow jacket"}],
    "scenes": [{"narration": f"Scena numero {k}. Luca guardava il cielo e sapeva che qualcosa stava per cambiare.",
                "image_prompt": f"boy looking at starry sky, scene {k}", "characters": ["Luca"], "chapter": 0}
               for k in range(1, 7)],
}


def load_history() -> list[dict]:
    return json.loads(HISTORY.read_text()) if HISTORY.exists() else []


SAMPLE_DOC = {
    "title": "Il Grande Incendio di Londra", "description": "Storia di prova. #storia", "tags": ["storia"],
    "scenes": [
        {"kind": "title", "text": "Londra, settembre 1666. Una scintilla cambiò tutto.", "title": "Il Grande Incendio di Londra", "subtitle": "1666"},
        {"kind": "narrate", "text": "Era notte fonda, e il fornaio credeva di aver spento il forno.", "headline": "Pudding Lane", "setting": "city", "night": True, "mood": "tense", "people": 1},
        {"kind": "map", "text": "Il fuoco avanzò verso il Tamigi.", "points": ["Pudding Lane", "London Bridge", "St Paul"]},
        {"kind": "timeline", "text": "In quattro giorni tutto cambiò.", "items": [{"year": "2 set", "label": "Parte"}, {"year": "6 set", "label": "Si spegne"}]},
        {"kind": "stat", "text": "Furono distrutte più di tredicimila case.", "value": 13200, "unit": "", "label": "case distrutte"},
        {"kind": "narrate", "text": "Dalle ceneri nacque la Londra che conosciamo.", "setting": "countryside", "mood": "joy", "people": 3},
    ],
}


def run_remotion(cfg, a, outdir, history):
    if a.dry_run:
        script, tts_p = json.loads(json.dumps(SAMPLE_DOC)), "silent"
    else:
        topic = doc_script.pick_topic(cfg, history)
        print("Idea:", topic["title"])
        script, tts_p = doc_script.build_script(cfg, topic), "edge"
    safe = re.sub(r"[^a-z0-9]+", "-", script["title"].lower()).strip("-")[:50] or "video"
    video = outdir / f"{safe}.mp4"
    scenes = remotion_render.render(cfg, script["scenes"], video, tts_p, seed=int(time.time()) % 1000,
                                    concurrency=a.concurrency)
    (outdir / f"{safe}.script.json").write_text(json.dumps(script, ensure_ascii=False, indent=2))
    total = sum(s["frames"] for s in scenes) / cfg["fps"]
    print(f"Video: {video} ({total/60:.1f} min)")
    result = {"title": script["title"], "video": str(video)}
    if not (a.dry_run or a.no_upload):
        from .upload import upload
        result.update(upload(cfg, video, script["title"], script["description"], script.get("tags", []), None))
        print("Caricato:", result)
        history.append({"title": script["title"], "video_id": result["video_id"], "publish_at": result["publish_at"]})
        HISTORY.parent.mkdir(exist_ok=True)
        HISTORY.write_text(json.dumps(history, ensure_ascii=False, indent=2))
    return result


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="niente API: script finto, immagini/voce segnaposto")
    ap.add_argument("--no-upload", action="store_true")
    ap.add_argument("--engine", choices=["remotion", "images"], default=None, help="default da channel.json")
    ap.add_argument("--concurrency", type=int, default=None, help="thread di render Remotion")
    ap.add_argument("--work", default=str(ROOT / "work"))
    ap.add_argument("--out", default=str(ROOT / "output"))
    a = ap.parse_args(argv)

    cfg = load_config()
    work, outdir = Path(a.work), Path(a.out)
    shutil.rmtree(work, ignore_errors=True)
    (work / "clips").mkdir(parents=True)
    outdir.mkdir(parents=True, exist_ok=True)
    history = load_history()
    engine = a.engine or cfg.get("engine", "remotion")
    if engine == "remotion":
        return run_remotion(cfg, a, outdir, history)

    if a.dry_run:
        script, tts_p, img_p = SAMPLE, "silent", "placeholder"
    else:
        topic = script_gen.pick_topic(cfg, history)
        print("Idea:", topic["title"])
        script, tts_p, img_p = script_gen.build_script(cfg, topic), "edge", None
    (work / "script.json").write_text(json.dumps(script, ensure_ascii=False, indent=2))

    clips, scenes, last_img = [], [], None
    base_seed = int(time.time()) % 100000
    for i, s in enumerate(script["scenes"]):
        img = work / f"img_{i:03d}.jpg"
        prompt = script_gen.full_image_prompt(cfg, script, s)
        if not images.generate_image(cfg, prompt, img, base_seed + i * 7, img_p):
            if last_img is None:
                raise RuntimeError("Impossibile generare la prima immagine")
            shutil.copy(last_img, img)  # fallback: riusa l'immagine precedente
        last_img = img
        aud = work / f"aud_{i:03d}.mp3"
        dur = tts.synth(cfg, s["narration"], aud, tts_p) + 0.35
        clip = work / "clips" / f"clip_{i:03d}.mp4"
        assemble.render_scene(img, aud, dur, i, cfg, clip)
        clips.append(clip)
        scenes.append({"text": s["narration"], "dur": dur})
        print(f"scena {i+1}/{len(script['scenes'])} ok ({dur:.1f}s)")

    safe = re.sub(r"[^a-z0-9]+", "-", script["title"].lower()).strip("-")[:50] or "video"
    video = outdir / f"{safe}.mp4"
    assemble.concat_and_finish(clips, scenes, work, cfg, video, ROOT / "assets" / "music")
    thumb = outdir / f"{safe}.jpg"
    make_thumbnail(work / "img_000.jpg", script["title"], thumb)
    total = sum(s["dur"] for s in scenes)
    print(f"Video: {video} ({total/60:.1f} min)")

    result = {"title": script["title"], "video": str(video)}
    if not (a.dry_run or a.no_upload):
        from .upload import upload
        result.update(upload(cfg, video, script["title"], script["description"], script.get("tags", []), thumb))
        print("Caricato:", result)
        history.append({"title": script["title"], "video_id": result["video_id"], "publish_at": result["publish_at"]})
        HISTORY.parent.mkdir(exist_ok=True)
        HISTORY.write_text(json.dumps(history, ensure_ascii=False, indent=2))
    return result


if __name__ == "__main__":
    main()
