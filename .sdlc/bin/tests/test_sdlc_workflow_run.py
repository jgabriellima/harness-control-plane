#!/usr/bin/env python3
"""Tests for SDLC workflow run orchestrator — idempotency and resume."""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
RUN_BIN = REPO_ROOT / ".sdlc" / "bin" / "sdlc_workflow_run.py"
MANIFEST_BIN = REPO_ROOT / ".sdlc" / "bin" / "sdlc_workflow_manifest.py"
RUNS_DIR = REPO_ROOT / ".sdlc" / "workflow-runs"


class SdlcWorkflowRunTests(unittest.TestCase):
    def setUp(self) -> None:
        self.run_id = "run-test-incident-flow-e2e"
        self._backup_active = None
        if (RUNS_DIR / "ACTIVE").is_file():
            self._backup_active = (RUNS_DIR / "ACTIVE").read_text(encoding="utf-8")

    def tearDown(self) -> None:
        test_run = RUNS_DIR / self.run_id
        if test_run.is_dir():
            shutil.rmtree(test_run)
        output = REPO_ROOT / ".sdlc" / "workflow-runs" / "output" / "incident-flow" / self.run_id
        if output.is_dir():
            shutil.rmtree(output)
        trace = REPO_ROOT / ".sdlc" / "workflow-runs" / "traces" / f"{self.run_id}.yaml"
        if trace.is_file():
            trace.unlink()
        if self._backup_active is not None:
            (RUNS_DIR / "ACTIVE").write_text(self._backup_active, encoding="utf-8")

    def _run(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(RUN_BIN), *args],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
        )

    def test_incident_flow_stub_run_and_resume(self) -> None:
        intent = "P3 stale cache on profile page"
        first = self._run(
            "run",
            "--workflow",
            "incident-flow",
            "--intent",
            intent,
            "--run-id",
            self.run_id,
            "--mode",
            "stub",
        )
        self.assertEqual(first.returncode, 0, first.stdout + first.stderr)

        manifest_path = RUNS_DIR / self.run_id / "manifest.yaml"
        self.assertTrue(manifest_path.is_file())

        output_dir = REPO_ROOT / ".sdlc" / "workflow-runs" / "output" / "incident-flow" / self.run_id
        cognitive_dir = output_dir / "cognitive"
        self.assertTrue((cognitive_dir / "ingestion.json").is_file())

        second = self._run("resume", "--run-id", self.run_id)
        self.assertEqual(second.returncode, 0, second.stdout + second.stderr)
        self.assertIn("VALIDATE PASS", second.stdout + second.stderr)

        manifest_validate = subprocess.run(
            [sys.executable, str(MANIFEST_BIN), "validate", "--run-id", self.run_id],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
        )
        self.assertEqual(manifest_validate.returncode, 0, manifest_validate.stdout + manifest_validate.stderr)

        with (cognitive_dir / "ingestion.json").open(encoding="utf-8") as handle:
            ingestion_doc = json.load(handle)
        self.assertEqual(ingestion_doc.get("nodeId"), "ingestion")


if __name__ == "__main__":
    unittest.main()
