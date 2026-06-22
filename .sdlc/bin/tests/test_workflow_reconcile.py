#!/usr/bin/env python3
"""Tests for sdlc_workflow_reconcile.py."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / ".sdlc" / "bin"))

import sdlc_workflow_reconcile as reconcile  # noqa: E402


def _write_manifest(run_dir: Path, doc: dict) -> None:
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "manifest.yaml").write_text(yaml.safe_dump(doc), encoding="utf-8")


@pytest.fixture
def runs_dir(tmp_path, monkeypatch):
    runs = tmp_path / "workflow-runs"
    runs.mkdir()
    monkeypatch.setattr(reconcile, "WORKFLOW_RUNS_DIR", runs)
    monkeypatch.setattr(reconcile, "SUPPRESSIONS_PATH", runs / "reconcile-suppressions.yaml")
    monkeypatch.setattr(
        reconcile,
        "_manifest_path",
        lambda rid: runs / rid / "manifest.yaml",
    )
    monkeypatch.setattr(
        "sdlc_workflow_run_resolve.WORKFLOW_RUNS_DIR",
        runs,
    )
    return runs


def test_orphan_child_detected(runs_dir: Path) -> None:
    parent_id = "run-goal-1"
    child_id = "run-goal-1-ff-jambu-1"
    _write_manifest(
        runs_dir / parent_id,
        {
            "metadata": {"workflow_id": "goal-flow", "run_id": parent_id},
            "status": "completed",
            "tickets": {
                "JAMBU-1": {
                    "role": "vertical-slice",
                    "child_run_id": child_id,
                    "feature_flow_complete": True,
                },
            },
            "nodes": {"execution": {"status": "completed", "gate_outcome": "PASS"}},
        },
    )
    _write_manifest(
        runs_dir / child_id,
        {
            "metadata": {"workflow_id": "feature-flow"},
            "status": "in_progress",
            "intent": f"Feature-flow (workflow={parent_id})",
            "nodes": {"context-hydration": {"status": "running", "started_at": "t"}},
            "paths": {"output_dir": str(runs_dir / child_id / "out")},
        },
    )
    findings = reconcile.scan_findings()
    codes = {f.code for f in findings}
    assert "orphan_child_run" in codes
    assert "false_feature_flow_complete" in codes


def test_check_passes_when_suppressed(runs_dir: Path) -> None:
    child_id = "run-goal-1-ff-jambu-1"
    reconcile.SUPPRESSIONS_PATH.write_text(
        yaml.safe_dump({"suppressions": [{"run_id": child_id, "reason": "test", "until": "2099-12-31"}]}),
        encoding="utf-8",
    )
    parent_id = "run-goal-1"
    _write_manifest(
        runs_dir / parent_id,
        {
            "metadata": {"workflow_id": "goal-flow"},
            "status": "completed",
            "tickets": {"JAMBU-1": {"role": "vertical-slice", "child_run_id": child_id, "feature_flow_complete": True}},
            "nodes": {},
        },
    )
    _write_manifest(
        runs_dir / child_id,
        {"metadata": {"workflow_id": "feature-flow"}, "status": "in_progress", "nodes": {}},
    )
    assert reconcile.cmd_check(argparse_namespace(ignore_warnings=True)) == 0


def argparse_namespace(*, ignore_warnings: bool = False) -> object:
    class Ns:
        json = False

    ns = Ns()
    ns.ignore_warnings = ignore_warnings
    return ns


def test_aligned_parent_child_no_errors(runs_dir: Path) -> None:
    parent_id = "run-goal-2"
    child_id = "run-goal-2-ff-jambu-2"
    _write_manifest(
        runs_dir / parent_id,
        {
            "metadata": {"workflow_id": "goal-flow"},
            "status": "completed",
            "tickets": {"JAMBU-2": {"role": "vertical-slice", "child_run_id": child_id, "feature_flow_complete": True}},
            "nodes": {"execution": {"status": "completed", "gate_outcome": "PASS"}},
        },
    )
    _write_manifest(
        runs_dir / child_id,
        {"metadata": {"workflow_id": "feature-flow"}, "status": "completed", "nodes": {}},
    )
    errors = [f for f in reconcile.scan_findings() if f.severity == "error"]
    assert errors == []
