import subprocess

from ytp.run import main


def test_dry_run_builds_video(tmp_path):
    r = main(["--dry-run", "--work", str(tmp_path / "w"), "--out", str(tmp_path / "o")])
    dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                         "-of", "default=nk=1:nw=1", r["video"]], text=True))
    assert dur > 10
