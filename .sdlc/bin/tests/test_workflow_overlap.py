#!/usr/bin/env python3
"""Tests for open integration overlap detection (ADR-027 FM-5)."""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / ".sdlc" / "bin"))

from sdlc_workflow_overlap import (  # noqa: E402
    find_open_integration_conflicts,
    integration_pending,
)


class WorkflowOverlapTests(unittest.TestCase):
    def test_integration_pending_workflow_nodes(self) -> None:
        manifest = {
            "status": "in_progress",
            "metadata": {"workflow_id": "goal-flow"},
            "nodes": {
                "execution": {"status": "completed"},
                "integration": {"status": "pending"},
            },
            "target": {"target_root": "app", "route": "/"},
        }
        self.assertTrue(integration_pending(manifest))

    def test_integration_pending_legacy_stages(self) -> None:
        manifest = {
            "status": "in_progress",
            "stages": {
                "execution": {"status": "completed"},
                "integration": {"status": "pending"},
            },
            "target": {"target_root": "app", "route": "/"},
        }
        self.assertTrue(integration_pending(manifest))

    def test_find_conflict_on_same_surface(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            sdlc = root / ".sdlc"
            wf_runs = sdlc / "workflow-runs" / "stale-run"
            wf_runs.mkdir(parents=True)
            manifest = {
                "status": "in_progress",
                "metadata": {"workflow_id": "goal-flow"},
                "nodes": {
                    "execution": {"status": "completed"},
                    "integration": {"status": "pending"},
                },
                "target": {"target_root": "app", "route": "/"},
            }
            import yaml

            with (wf_runs / "manifest.yaml").open("w", encoding="utf-8") as handle:
                yaml.safe_dump(manifest, handle)

            import sdlc_workflow_overlap as overlap

            overlap.WORKFLOW_RUNS_DIR = sdlc / "workflow-runs"
            overlap.REPO_ROOT = root
            overlap.SDLC_ROOT = sdlc

            conflicts = overlap.find_open_integration_conflicts(
                target_root="app",
                route="/",
                exclude_run_id="new-run",
            )
            self.assertEqual(len(conflicts), 1)
            self.assertEqual(conflicts[0]["run_id"], "stale-run")


if __name__ == "__main__":
    unittest.main()
