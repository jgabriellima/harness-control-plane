#!/usr/bin/env python3
"""Protocol guard — parent step delegate denial (ADR-026)."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / ".sdlc" / "bin"))

import sdlc_protocol_guard as pg  # noqa: E402


class ProtocolGuardDelegateTests(unittest.TestCase):
    def test_allows_parent_step_without_prescribed_children(self) -> None:
        cmd = "python3 .sdlc/bin/sdlc_workflow_run.py step --run-id goal-run-20260608 --mode agent"
        manifest = {
            "metadata": {"run_id": "goal-run-20260608", "workflow_id": "goal-flow"},
            "status": "in_progress",
            "continuity": {"required_actions": []},
        }
        with patch.object(pg, "_active_workflow_run", return_value=("goal-run-20260608", manifest)):
            with patch.object(pg, "_active_legacy_run", return_value=(None, None)):
                result = pg.check_shell_command(cmd)
        self.assertTrue(result["allowed"], result.get("message", ""))

    def test_denies_parent_step_when_child_prescribed(self) -> None:
        parent = "goal-run-20260608"
        child = f"{parent}-ff-proj-1"
        cmd = f"python3 .sdlc/bin/sdlc_workflow_run.py step --run-id {parent} --mode agent"
        prescribed = f"python3 .sdlc/bin/sdlc_workflow_run.py step --run-id {child} --mode agent"
        manifest = {
            "metadata": {"run_id": parent, "workflow_id": "goal-flow"},
            "status": "in_progress",
            "continuity": {
                "required_actions": [
                    {"type": "command", "command": prescribed, "description": "child step"},
                ],
            },
        }
        with patch.object(pg, "_active_workflow_run", return_value=(parent, manifest)):
            with patch.object(pg, "_active_legacy_run", return_value=(None, None)):
                with patch.object(pg, "_enforce_blocking", return_value=True):
                    result = pg.check_shell_command(cmd)
        self.assertFalse(result["allowed"])
        self.assertIn("Parent step blocked", result.get("message", ""))
        self.assertIn(child, result.get("message", ""))

    def test_allows_prescribed_child_step(self) -> None:
        parent = "goal-run-20260608"
        child = f"{parent}-ff-proj-1"
        prescribed = f"python3 .sdlc/bin/sdlc_workflow_run.py step --run-id {child} --mode agent"
        manifest = {
            "metadata": {"run_id": parent, "workflow_id": "goal-flow"},
            "status": "in_progress",
            "continuity": {
                "required_actions": [
                    {"type": "command", "command": prescribed},
                ],
            },
        }
        with patch.object(pg, "_active_workflow_run", return_value=(parent, manifest)):
            with patch.object(pg, "_active_legacy_run", return_value=(None, None)):
                result = pg.check_shell_command(prescribed)
        self.assertTrue(result["allowed"], result.get("message", ""))


if __name__ == "__main__":
    unittest.main()
