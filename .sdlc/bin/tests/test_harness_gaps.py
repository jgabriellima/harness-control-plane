#!/usr/bin/env python3
"""Regression tests for deep-agent-gateway harness gap fixes."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / ".sdlc" / "bin"))

from sdlc_delivery import local_evidence_commands, merge_validation_checks  # noqa: E402
from sdlc_dsl_bindings import manifest_status_to_provider_state  # noqa: E402
from sdlc_profile import resolve_qa_surface_from_ticket  # noqa: E402
from sdlc_workflow_run import (  # noqa: E402
    reconcile_parent_after_child_complete,
    refresh_parent_child_actions,
)


class HarnessGapTests(unittest.TestCase):
    def test_manifest_status_in_review_and_completed_mappings(self) -> None:
        self.assertEqual(manifest_status_to_provider_state("in_review", REPO_ROOT), "in_review")
        self.assertEqual(manifest_status_to_provider_state("completed", REPO_ROOT), "done")

    def test_workspace_profile_does_not_infer_qa_surface(self) -> None:
        with patch("sdlc_profile.workspace_profile", return_value="python-fastapi"):
            surface, err = resolve_qa_surface_from_ticket({"id": "API-1"})
        self.assertIsNone(surface)
        self.assertIn("qa_surface missing", err or "")

    def test_local_evidence_headless_filters_playwright(self) -> None:
        sdlc = {
            "delivery": {
                "surfaces": {
                    "local": {
                        "enabled": True,
                        "evidence": ["pytest", "typecheck", "lint", "playwright", "build"],
                    },
                },
            },
        }
        checks = local_evidence_commands(REPO_ROOT, sdlc, qa_surface="headless")
        names = {name for name, _cmd in checks}
        self.assertIn("pytest", names)
        self.assertIn("typecheck", names)
        self.assertIn("lint", names)
        self.assertNotIn("playwright", names)
        self.assertNotIn("build", names)

    def test_merge_validation_checks_dedupes_by_name(self) -> None:
        primary = [("pytest", ["python3", "-m", "pytest"])]
        supplemental = [("pytest", ["other"]), ("lint", ["ruff", "check"])]
        merged = merge_validation_checks(primary, supplemental)
        self.assertEqual(len(merged), 2)
        self.assertEqual(merged[0][0], "pytest")
        self.assertEqual(merged[1][0], "lint")

    def test_reconcile_parent_after_child_complete(self) -> None:
        import tempfile

        from sdlc_workflow_manifest import init_manifest, load_manifest, save_manifest  # noqa: E402

        with tempfile.TemporaryDirectory() as tmp:
            runs = Path(tmp) / "workflow-runs"
            runs.mkdir()
            with patch("sdlc_workflow_manifest.WORKFLOW_RUNS_DIR", runs):
                with patch("sdlc_workflow_manifest.REPO_ROOT", Path(tmp)):
                    with patch("sdlc_workflow_run_resolve.WORKFLOW_RUNS_DIR", runs):
                        parent_id = "goal-reconcile-test"
                        child_id = f"{parent_id}-ff-proj-1"
                        init_manifest("goal-flow", "reconcile", parent_id, "agent")
                        parent = load_manifest(parent_id)
                        parent["tickets"] = {
                            "PROJ-1": {"role": "slice"},
                            "PROJ-2": {"role": "slice", "child_run_id": f"{parent_id}-ff-proj-2"},
                        }
                        save_manifest(parent_id, parent)

                        init_manifest("feature-flow", "child", child_id, "agent")
                        child = load_manifest(child_id)
                        child["status"] = "completed"
                        save_manifest(child_id, child)

                        result = reconcile_parent_after_child_complete(child_id)
                        self.assertIsNotNone(result)
                        assert result is not None
                        ticket = result["tickets"]["PROJ-1"]
                        self.assertTrue(ticket.get("feature_flow_complete"))
                        actions = result["continuity"]["required_actions"]
                        commands = [a.get("command", "") for a in actions]
                        self.assertFalse(any(child_id in c for c in commands))
                        self.assertTrue(any("proj-2" in c.lower() for c in commands))

    def test_refresh_parent_child_actions_empty_when_all_done(self) -> None:
        manifest = {
            "metadata": {"run_id": "goal-all-done"},
            "tickets": {
                "A": {"feature_flow_complete": True, "child_run_id": "goal-all-done-ff-a"},
            },
            "continuity": {"required_actions": [{"id": "stale"}]},
        }
        with patch("sdlc_workflow_run._child_run_status", return_value="completed"):
            refresh_parent_child_actions(manifest)
        self.assertEqual(manifest["continuity"]["required_actions"], [])


if __name__ == "__main__":
    unittest.main()
