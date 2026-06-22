#!/usr/bin/env python3
"""Runner authority — submit requires step dispatch (ADR-020 harness)."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest import mock

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / ".sdlc" / "bin"))

from sdlc_workflow_run import (  # noqa: E402
    _validate_cognitive_identity,
    _validate_submit_authority,
)
from sdlc_workflow_gate import (  # noqa: E402
    check_pr_registered,
    check_worktree_committed,
    check_worktree_registered,
)
from sdlc_ref_resolver import RunContext  # noqa: E402


class RunnerAuthorityTests(unittest.TestCase):
    def test_submit_rejects_pending_node(self) -> None:
        manifest = {
            "nodes": {
                "hydrate": {"status": "completed"},
                "classify": {"status": "pending"},
            },
        }
        order = ["hydrate", "classify"]
        cognitive = {
            "nodeId": "classify",
            "runId": "test-run",
            "recordedAt": "2026-06-04T00:00:00Z",
            "outcome": "success",
            "confidence": 0.9,
            "artifacts": [],
        }
        err = _validate_submit_authority(manifest, order, "classify", cognitive, "test-run")
        self.assertIsNotNone(err)
        self.assertIn("runner authority", err or "")

    def test_submit_accepts_running_node(self) -> None:
        manifest = {
            "nodes": {
                "hydrate": {"status": "completed"},
                "classify": {"status": "running", "started_at": "2026-06-04T00:00:00Z"},
            },
        }
        order = ["hydrate", "classify"]
        cognitive = {
            "nodeId": "classify",
            "runId": "test-run",
            "recordedAt": "2026-06-04T00:00:01Z",
            "outcome": "success",
            "confidence": 0.9,
            "artifacts": [],
        }
        err = _validate_submit_authority(manifest, order, "classify", cognitive, "test-run")
        self.assertIsNone(err)

    def test_cognitive_identity_mismatch(self) -> None:
        err = _validate_cognitive_identity(
            "run-a",
            "classify",
            {"nodeId": "hydrate", "runId": "run-a", "recordedAt": "t"},
        )
        self.assertIn("nodeId", err or "")


class FeatureFlowCompleteGateTests(unittest.TestCase):
    def test_fails_when_child_run_not_completed(self) -> None:
        from sdlc_workflow_gate import check_feature_flow_complete

        ctx = RunContext(
            run_id="run-goal-1",
            intent="",
            manifest={
                "tickets": {
                    "JAMBU-1": {
                        "role": "vertical-slice",
                        "child_run_id": "run-goal-1-ff-jambu-1",
                        "feature_flow_complete": True,
                    },
                },
            },
            node_id="execution",
            execution_mode="agent",
        )
        with mock.patch("sdlc_workflow_run_resolve.manifest_path") as mp:
            mp.return_value = Path("/nonexistent/manifest.yaml")
            result = check_feature_flow_complete(ctx)
        self.assertEqual(result.outcome, "FAIL")


class PrRegisteredGateTests(unittest.TestCase):
    def test_pr_registered_requires_url(self) -> None:
        ctx = RunContext(
            run_id="test",
            intent="",
            manifest={
                "tickets": {
                    "JAMBU-1": {
                        "role": "vertical-slice",
                        "worktree": "/tmp/wt",
                        "pr_url": None,
                    },
                },
            },
            node_id="pr-creation",
            execution_mode="agent",
        )
        result = check_pr_registered(ctx)
        self.assertEqual(result.outcome, "FAIL")
        self.assertIn("pr_url", result.message)

    def test_pr_registered_passes_with_github_url(self) -> None:
        ctx = RunContext(
            run_id="test",
            intent="",
            manifest={
                "tickets": {
                    "JAMBU-1": {
                        "role": "vertical-slice",
                        "pr_url": "https://github.com/org/repo/pull/1",
                    },
                },
            },
            node_id="integration",
            execution_mode="agent",
        )
        result = check_pr_registered(ctx)
        self.assertEqual(result.outcome, "PASS")


class WorktreeGateTests(unittest.TestCase):
    def test_worktree_registered_requires_tickets(self) -> None:
        ctx = RunContext(
            run_id="test",
            intent="",
            manifest={"tickets": {}},
            node_id="plane-hierarchy",
            execution_mode="agent",
        )
        result = check_worktree_registered(ctx)
        self.assertEqual(result.outcome, "FAIL")

    def test_worktree_committed_stub_deferred(self) -> None:
        ctx = RunContext(
            run_id="test",
            intent="",
            manifest={"tickets": {"JAMBU-1": {"role": "vertical-slice", "worktree": "/tmp/x"}}},
            node_id="execution",
            execution_mode="stub",
        )
        result = check_worktree_committed(ctx)
        self.assertEqual(result.outcome, "PASS")


if __name__ == "__main__":
    unittest.main()
