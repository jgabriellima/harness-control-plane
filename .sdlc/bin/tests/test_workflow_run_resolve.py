#!/usr/bin/env python3
"""Tests for sdlc_workflow_run_resolve (ADR-023)."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / ".sdlc" / "bin"))

from sdlc_workflow_run_resolve import (  # noqa: E402
    dispatch_is_stalled,
    is_auto_resumable_goal_run,
    is_feature_flow_child_run,
    is_fixture_run_id,
    parent_goal_run_id_from_feature_flow,
    resolve_goal_run_id,
)


def test_is_feature_flow_child_run() -> None:
    assert is_feature_flow_child_run("run-abc-ff-jambu-121")
    assert not is_feature_flow_child_run("run-abc-20260604")


def test_parent_from_intent() -> None:
    manifest = {
        "intent": "Feature-flow for JAMBU-121: title (workflow=run-parent-20260604T211305Z)",
    }
    assert parent_goal_run_id_from_feature_flow(manifest) == "run-parent-20260604T211305Z"


def test_resolve_goal_ignores_feature_flow_active(tmp_path, monkeypatch) -> None:
    runs = tmp_path / "workflow-runs"
    runs.mkdir()
    monkeypatch.setattr("sdlc_workflow_run_resolve.WORKFLOW_RUNS_DIR", runs)
    monkeypatch.setattr("sdlc_workflow_run_resolve.manifest_path", lambda rid: runs / rid / "manifest.yaml")

    import yaml

    goal_id = "run-goal-20260604"
    ff_id = "run-goal-20260604-ff-jambu-121"
    for run_id, wf, status, intent in (
        (goal_id, "goal-flow", "in_progress", "homepage"),
        (ff_id, "feature-flow", "in_progress", f"Feature-flow (workflow={goal_id})"),
    ):
        run_dir = runs / run_id
        run_dir.mkdir()
        doc = {
            "metadata": {"workflow_id": wf, "run_id": run_id},
            "status": status,
            "intent": intent,
            "nodes": {
                "context-hydration": {"status": "running", "started_at": "2026-06-04T00:00:00Z"},
            },
            "paths": {"output_dir": f".sdlc/workflow-runs/output/feature-flow/{run_id}"},
        }
        (run_dir / "manifest.yaml").write_text(yaml.safe_dump(doc), encoding="utf-8")

    resolved = resolve_goal_run_id(ff_id, [(goal_id, doc)])
    assert resolved == goal_id


def test_fixture_and_blocked_runs_not_auto_resumed(tmp_path, monkeypatch) -> None:
    runs = tmp_path / "workflow-runs"
    runs.mkdir()
    monkeypatch.setattr("sdlc_workflow_run_resolve.WORKFLOW_RUNS_DIR", runs)
    monkeypatch.setattr("sdlc_workflow_run_resolve.manifest_path", lambda rid: runs / rid / "manifest.yaml")

    import yaml

    fixture_id = "test-exit42-20260604"
    blocked_id = "run-blocked-20260609"
    active_id = "run-active-20260609"
    goal_runs: list[tuple[str, dict]] = []
    for run_id, status, continuity in (
        (fixture_id, "blocked", {"required_actions": []}),
        (blocked_id, "blocked", {"required_actions": []}),
        (active_id, "in_progress", {"required_actions": []}),
    ):
        run_dir = runs / run_id
        run_dir.mkdir()
        doc = {
            "metadata": {"workflow_id": "goal-flow", "run_id": run_id, "updated_at": "2026-06-09T00:00:00Z"},
            "status": status,
            "intent": "smoke",
            "continuity": continuity,
        }
        (run_dir / "manifest.yaml").write_text(yaml.safe_dump(doc), encoding="utf-8")
        goal_runs.append((run_id, doc))

    assert is_fixture_run_id(fixture_id)
    assert not is_auto_resumable_goal_run(fixture_id, goal_runs[0][1])
    assert not is_auto_resumable_goal_run(blocked_id, goal_runs[1][1])
    assert is_auto_resumable_goal_run(active_id, goal_runs[2][1])
    assert resolve_goal_run_id(None, goal_runs) == active_id


def test_dispatch_stalled_without_cognitive(tmp_path, monkeypatch) -> None:
    runs = tmp_path / "workflow-runs"
    run_id = "run-ff-1"
    run_dir = runs / run_id
    out_dir = run_dir / "output"
    out_dir.mkdir(parents=True)
    import yaml

    doc = {
        "metadata": {"workflow_id": "feature-flow"},
        "status": "in_progress",
        "nodes": {"context-hydration": {"status": "running", "started_at": "t"}},
        "paths": {"output_dir": str(out_dir)},
    }
    (run_dir / "manifest.yaml").write_text(yaml.safe_dump(doc), encoding="utf-8")
    monkeypatch.setattr("sdlc_workflow_run_resolve.WORKFLOW_RUNS_DIR", runs)
    monkeypatch.setattr("sdlc_workflow_run_resolve.manifest_path", lambda rid: runs / rid / "manifest.yaml")
    assert dispatch_is_stalled(run_id, "context-hydration") is True
    (out_dir / "cognitive").mkdir()
    (out_dir / "cognitive" / "context-hydration.json").write_text("{}", encoding="utf-8")
    assert dispatch_is_stalled(run_id, "context-hydration") is False
