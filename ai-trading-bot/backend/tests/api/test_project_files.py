"""The files that configure and launch the stack stay in step with the code."""

from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path

import pytest

from tradebot.config import PROJECT_DIR, EnvConfig

SCRIPTS = PROJECT_DIR / "scripts"


def test_env_example_documents_every_setting() -> None:
    text = (PROJECT_DIR / ".env.example").read_text()
    documented = set(re.findall(r"^#? ?([A-Z][A-Z0-9_]*)=", text, re.MULTILINE))
    assert documented == {name.upper() for name in EnvConfig.model_fields}


def test_env_example_holds_no_secret_and_parses_to_the_defaults() -> None:
    example = EnvConfig(_env_file=str(PROJECT_DIR / ".env.example"))
    assert example.secret_values() == []
    assert not (example.openrouter_configured or example.telegram_configured or example.discord_configured)
    defaults = EnvConfig(_env_file=None)
    for name in (
        "trading_mode",
        "starting_balance",
        "feed",
        "api_host",
        "api_port",
        "cors_origins",
        "sim_seed",
    ):
        assert getattr(example, name) == getattr(defaults, name), name


@pytest.mark.parametrize("name", ["dev.sh", "start.sh"])
def test_launch_scripts_are_executable_and_parse(name: str) -> None:
    script = SCRIPTS / name
    assert os.access(script, os.X_OK)
    subprocess.run(["bash", "-n", str(script)], check=True)
    subprocess.run(["bash", "-n", str(SCRIPTS / "lib.sh")], check=True)
    text = script.read_text()
    assert "-m tradebot.engine_main" in text and "-m tradebot.api.main" in text


def test_start_script_help(tmp_path: Path) -> None:
    result = subprocess.run(
        [str(SCRIPTS / "start.sh"), "--help"], capture_output=True, text=True, check=True, cwd=tmp_path
    )
    assert "--build" in result.stdout and "set -euo" not in result.stdout
