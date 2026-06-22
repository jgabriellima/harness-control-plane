"""Tests for sdlc_continuity_resolve.py (ADR-020 Phase 4)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

BIN_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BIN_DIR.parents[1]
sys.path.insert(0, str(BIN_DIR))

from sdlc_continuity_resolve import (  # noqa: E402
    SPEC_CREATE_COMMAND,
    resolve_command,
)
from sdlc_workflow_manifest import init_manifest, load_manifest, save_manifest  # noqa: E402


@pytest.fixture
def goal_run(tmp_path, monkeypatch):
    runs = tmp_path / "workflow-runs"
    runs.mkdir()
    monkeypatch.setattr("sdlc_continuity_resolve.WORKFLOW_RUNS_DIR", runs)
    monkeypatch.setattr("sdlc_continuity_resolve.ACTIVE_WORKFLOW_RUN_POINTER", runs / "ACTIVE")
    monkeypatch.setattr("sdlc_workflow_manifest.WORKFLOW_RUNS_DIR", runs)
    monkeypatch.setattr("sdlc_workflow_manifest.ACTIVE_WORKFLOW_RUN_POINTER", runs / "ACTIVE")
    monkeypatch.setattr("sdlc_workflow_manifest.REPO_ROOT", tmp_path)
    monkeypatch.setattr("sdlc_workflow_manifest.WORKFLOWS_DIR", REPO_ROOT / ".sdlc" / "workflows")
    monkeypatch.setattr("sdlc_continuity_resolve.REPO_ROOT", tmp_path)
    monkeypatch.setattr("sdlc_continuity_resolve.SDLC_ROOT", REPO_ROOT / ".sdlc")

    run_id = init_manifest("goal-flow", "SaaS onboarding email verification", None, "agent")
    manifest = load_manifest(run_id)
    manifest["status"] = "in_progress"
    manifest["nodes"]["plane-hierarchy"]["status"] = "completed"
    manifest["tickets"] = {"JAMBU-99": {"role": "vertical-slice", "status": "pending"}}
    save_manifest(run_id, manifest)
    return run_id


def test_spec_create_asks_when_goal_has_hierarchy(goal_run: str) -> None:
    decision = resolve_command(
        SPEC_CREATE_COMMAND,
        "SaaS onboarding with email verification",
    )
    assert decision["action"] == "ask"
    assert decision["run_id"] == goal_run
    manifest = load_manifest(goal_run)
    assert manifest["continuity"]["last_resolution"]["action"] == "ask"


def test_spec_create_continue_resumes(goal_run: str) -> None:
    decision = resolve_command(
        SPEC_CREATE_COMMAND,
        "other intent",
        continue_run=True,
    )
    assert decision["action"] == "resume"
    assert decision["run_id"] == goal_run
    assert "step" in (decision.get("cli") or "")


def test_spec_create_proceed_without_conflict(tmp_path, monkeypatch) -> None:
    runs = tmp_path / "workflow-runs"
    runs.mkdir()
    monkeypatch.setattr("sdlc_continuity_resolve.WORKFLOW_RUNS_DIR", runs)
    monkeypatch.setattr("sdlc_continuity_resolve.SDLC_ROOT", REPO_ROOT / ".sdlc")
    decision = resolve_command(SPEC_CREATE_COMMAND, "brand new unrelated feature xyz")
    assert decision["action"] == "proceed"


def test_resolve_json_cli(goal_run: str) -> None:
    import subprocess

    proc = subprocess.run(
        [
            sys.executable,
            str(BIN_DIR / "sdlc_continuity_resolve.py"),
            "resolve",
            "--command",
            SPEC_CREATE_COMMAND,
            "--intent",
            "onboarding email",
            "--json",
        ],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0, proc.stderr
    payload = json.loads(proc.stdout)
    assert payload["action"] in ("ask", "proceed", "resume")
