#!/usr/bin/env python3
"""Tests for sdlc_workflow_validate.py contract review."""
from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
VALIDATOR = REPO_ROOT / ".sdlc" / "bin" / "sdlc_workflow_validate.py"


class WorkflowValidateTests(unittest.TestCase):
    def test_review_all_shipped_workflows_pass(self) -> None:
        result = subprocess.run(
            [sys.executable, str(VALIDATOR), "review", "--dir", ".sdlc/workflows"],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_legacy_format_rejected(self) -> None:
        legacy = """
name: legacy-flow
stages:
  - id: only
    action: read
"""
        with tempfile.NamedTemporaryFile("w", suffix=".yaml", delete=False) as tmp:
            tmp.write(legacy)
            tmp_path = tmp.name
        try:
            result = subprocess.run(
                [sys.executable, str(VALIDATOR), "validate", "--file", tmp_path],
                cwd=REPO_ROOT,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 1)
            self.assertIn("legacy-format-rejected", result.stdout + result.stderr)
        finally:
            Path(tmp_path).unlink(missing_ok=True)

    def test_legacy_node_shape_rejected(self) -> None:
        legacy = """
apiVersion: sdlc.jambu/v1
kind: Workflow
metadata:
  id: test-legacy-node
  name: Test Legacy Node
  version: "1.0.0"
  trigger: /test
spec:
  triggers:
    - type: command
      command: /test
  stateContract: schemas/workflow-state.schema.json
  nodes:
    - id: old-shape
      type: cognitive
      gate: gates/structured-output.pass
      objective: legacy
"""
        with tempfile.NamedTemporaryFile("w", suffix=".yaml", delete=False) as tmp:
            tmp.write(legacy)
            tmp_path = tmp.name
        try:
            result = subprocess.run(
                [sys.executable, str(VALIDATOR), "validate", "--file", tmp_path],
                cwd=REPO_ROOT,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 1)
            self.assertIn("composite-node-required", result.stdout + result.stderr)
        finally:
            Path(tmp_path).unlink(missing_ok=True)

    def test_gates_registry_passes(self) -> None:
        result = subprocess.run(
            [sys.executable, str(VALIDATOR), "gates"],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
