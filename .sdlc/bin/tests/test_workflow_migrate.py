#!/usr/bin/env python3
"""Tests for legacy → workflow-runs migration (ADR-027 FM-8)."""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / ".sdlc" / "bin"))

import yaml  # noqa: E402

import sdlc_workflow_migrate as migrate  # noqa: E402


class WorkflowMigrateTests(unittest.TestCase):
    def test_build_workflow_manifest_maps_stages(self) -> None:
        legacy = {
            "run_id": "demo-run",
            "status": "in_progress",
            "mode": "greenfield",
            "intent": "demo intent",
            "target": {"route": "/", "reference_url": "https://example.com"},
            "stages": {
                "hydrate": {"status": "completed"},
                "classify": {"status": "completed"},
                "discovery": {"status": "completed"},
                "decomposition": {"status": "pending"},
            },
            "tickets": {},
            "waves": [],
        }
        manifest = migrate.build_workflow_manifest("demo-run", legacy)
        self.assertEqual(manifest["metadata"]["workflow_id"], "goal-flow")
        self.assertEqual(manifest["nodes"]["hydrate"]["status"], "completed")
        self.assertEqual(manifest["nodes"]["reference-detect"]["status"], "skipped")
        self.assertEqual(manifest["nodes"]["decomposition"]["status"], "pending")

    def test_legacy_blocks_mutation_when_not_migrated(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            sdlc = root / ".sdlc" / "runs" / "legacy-run"
            sdlc.mkdir(parents=True)
            legacy = {
                "run_id": "legacy-run",
                "status": "in_progress",
                "stages": {"execution": {"status": "completed"}, "integration": {"status": "pending"}},
            }
            with (sdlc / "manifest.yaml").open("w", encoding="utf-8") as handle:
                yaml.safe_dump(legacy, handle)
            migrate.LEGACY_RUNS_DIR = root / ".sdlc" / "runs"
            migrate.REPO_ROOT = root
            migrate.WORKFLOW_RUNS_DIR = root / ".sdlc" / "workflow-runs"
            message = migrate.legacy_blocks_mutation("legacy-run")
            self.assertIsNotNone(message)
            self.assertIn("migrate", message or "")


if __name__ == "__main__":
    unittest.main()
