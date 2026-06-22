#!/usr/bin/env python3
"""Unit tests for ADR-028 delivery closure tiers."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / ".sdlc" / "bin"))

from sdlc_delivery import (  # noqa: E402
    closure_rank,
    closure_satisfied,
    delivery_config,
    node_skip_for_delivery,
    required_closure,
    sync_definition_of_done,
)
from sdlc_ref_resolver import RunContext  # noqa: E402
from sdlc_workflow_gate import check_closure_satisfied, check_local_validation_recorded  # noqa: E402


class DeliveryClosureTests(unittest.TestCase):
    def test_default_closure_is_local_validated(self) -> None:
        cfg = delivery_config({})
        self.assertEqual(cfg["default_closure"], "local-validated")
        self.assertTrue(cfg["surfaces"]["local"]["enabled"])
        self.assertFalse(cfg["surfaces"]["production"]["enabled"])

    def test_closure_rank_ordering(self) -> None:
        self.assertLess(closure_rank("local-validated"), closure_rank("production-validated"))

    def test_node_skip_when_closure_below_preview(self) -> None:
        node_spec = {
            "control": {
                "skipUnlessClosureAtLeast": "preview-validated",
            },
        }
        manifest = {"target": {"closure": "local-validated"}}
        skip, reason = node_skip_for_delivery(node_spec, manifest, {})
        self.assertTrue(skip)
        self.assertIn("preview-validated", reason)

    def test_closure_satisfied_local_default(self) -> None:
        manifest = {
            "target": {"closure": "local-validated"},
            "closure": {"tier": "local-validated", "build_pass": True},
        }
        self.assertTrue(closure_satisfied(manifest, {}))

    def test_local_validation_gate_pass(self) -> None:
        ctx = RunContext(
            run_id="test",
            intent="",
            manifest={
                "closure": {"tier": "local-validated", "build_pass": True},
            },
            node_id="validate-local",
            execution_mode="stub",
        )
        result = check_local_validation_recorded(ctx)
        self.assertEqual(result.outcome, "PASS")

    def test_closure_satisfied_gate_fail_when_missing(self) -> None:
        ctx = RunContext(
            run_id="test",
            intent="",
            manifest={"target": {"closure": "local-validated"}},
            node_id="reflect",
            execution_mode="stub",
        )
        result = check_closure_satisfied(ctx)
        self.assertEqual(result.outcome, "FAIL")

    def test_sync_dod_sets_closure_satisfied(self) -> None:
        manifest = {
            "target": {"closure": "local-validated"},
            "closure": {"tier": "local-validated"},
            "nodes": {"execution": {"status": "completed"}},
            "tickets": {},
        }
        sync_definition_of_done(manifest, {})
        self.assertTrue(manifest["definition_of_done"]["closure_satisfied"])
        self.assertTrue(manifest["definition_of_done"]["all_prs_merged"])

    def test_explain_cli_runs(self) -> None:
        from sdlc_delivery import cmd_explain

        self.assertEqual(cmd_explain(as_json=False), 0)


if __name__ == "__main__":
    unittest.main()
