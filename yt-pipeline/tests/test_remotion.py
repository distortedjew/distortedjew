import subprocess

from ytp.doc_script import sanitize
from ytp.run import main


def test_sanitize_fallbacks():
    assert sanitize({"kind": "map", "text": "x", "points": ["solo uno"]})["kind"] == "narrate"
    assert sanitize({"kind": "boh", "text": "x"})["kind"] == "narrate"
    assert sanitize({"kind": "narrate", "text": ""}) is None


def test_remotion_dry_run(tmp_path):
    r = main(["--dry-run", "--engine", "remotion", "--out", str(tmp_path)])
    dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                         "-of", "default=nk=1:nw=1", r["video"]], text=True))
    assert dur > 8
