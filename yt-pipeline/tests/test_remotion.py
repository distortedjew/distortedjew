import subprocess

from ytp.doc_script import sanitize
from ytp.run import main

IDS = ["tom", "re"]


def test_sanitize_fallbacks():
    assert sanitize({"kind": "map", "text": "x", "points": ["solo uno"]}, IDS)["kind"] == "narrate"
    assert sanitize({"kind": "boh", "text": "x"}, IDS)["kind"] == "narrate"
    assert sanitize({"kind": "narrate", "text": ""}, IDS) is None


def test_sanitize_direction_rules():
    s = sanitize({"kind": "narrate", "text": "x", "camera": "tilt_up", "cast": [{"id": "sconosciuto", "action": "volare", "emotion": "scared"}],
                  "sfx": [{"name": "boom", "at": 3}, {"name": "inesistente", "at": 0.1}], "transition": "esplosione"}, IDS)
    assert s["camera"] == "push_in"                      # tilt con personaggi -> push_in
    assert s["cast"][0]["id"] == "tom" and s["cast"][0]["action"] == "idle"
    assert [e["name"] for e in s["sfx"]] == ["boom"] and s["sfx"][0]["at"] <= 0.95
    assert s["transition"] == "fade"
    w = sanitize({"kind": "narrate", "text": "x", "camera": "static", "cast": [{"id": "re", "action": "walk"}]}, IDS)
    assert w["camera"] == "follow"                       # camminata -> camera segue


def test_remotion_dry_run(tmp_path):
    r = main(["--dry-run", "--engine", "remotion", "--out", str(tmp_path)])
    out = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "csv=p=0", r["video"]], text=True)
    assert "audio" in out and "video" in out
