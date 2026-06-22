"""Tests for sdlc_init_validate.py (ADR-029)."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

BIN = Path(__file__).resolve().parents[1]
VALIDATOR = BIN / "sdlc_init_validate.py"
FIXTURE = BIN.parent / "pipeline" / ".slot-test-init.json"


def test_valid_fixture_passes() -> None:
    proc = subprocess.run(
        [sys.executable, str(VALIDATOR), "--file", str(FIXTURE)],
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0, proc.stderr


def test_missing_confirmed_at_fails(tmp_path: Path) -> None:
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    data.pop("confirmed_at")
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps(data), encoding="utf-8")
    proc = subprocess.run(
        [sys.executable, str(VALIDATOR), "--file", str(bad)],
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode != 0


def test_staging_closure_requires_deploy(tmp_path: Path) -> None:
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    data["delivery"]["default_closure"] = "staging-validated"
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps(data), encoding="utf-8")
    proc = subprocess.run(
        [sys.executable, str(VALIDATOR), "--file", str(bad)],
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode != 0
