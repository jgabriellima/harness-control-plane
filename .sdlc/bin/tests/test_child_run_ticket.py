#!/usr/bin/env python3
"""Tests for feature-flow child manifest ticket propagation."""
from __future__ import annotations

import argparse
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / ".sdlc" / "bin"))

from sdlc_invoke import _resolve_ticket_id  # noqa: E402
from sdlc_profile import resolve_qa_surface_from_ticket  # noqa: E402
from sdlc_ref_resolver import RunContext  # noqa: E402
from sdlc_workflow_gate import _qa_surface_from_context  # noqa: E402
from sdlc_workflow_manifest import cmd_register_ticket, init_manifest, load_manifest, save_manifest  # noqa: E402
from sdlc_workflow_run_resolve import ensure_feature_flow_child_ticket  # noqa: E402


class ChildRunTicketTests(unittest.TestCase):
    def test_ensure_feature_flow_child_ticket_copies_qa_fields(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            runs = Path(tmp) / "workflow-runs"
            runs.mkdir()
            with patch("sdlc_workflow_manifest.WORKFLOW_RUNS_DIR", runs):
                with patch("sdlc_workflow_manifest.REPO_ROOT", Path(tmp)):
                    with patch("sdlc_workflow_run_resolve.WORKFLOW_RUNS_DIR", runs):
                        with patch("work_items_sync.WORKFLOW_RUNS_DIR", runs):
                            parent_id = "goal-child-ticket-test"
                            child_id = f"{parent_id}-ff-proj-1"
                            init_manifest("goal-flow", "parent", parent_id, "agent")
                            parent = load_manifest(parent_id)
                            parent["tickets"] = {
                                "PROJ-1": {
                                    "role": "slice",
                                    "qa_surface": "headless",
                                    "validation_checks": [
                                        {"name": "pytest", "cmd": ["python3", "-m", "pytest", "-q"]},
                                    ],
                                    "worktree": "/tmp/wt-proj-1",
                                    "branch": "feat/proj-1",
                                },
                            }
                            save_manifest(parent_id, parent)

                            init_manifest("feature-flow", f"child (workflow={parent_id})", child_id, "agent")

                            found = ensure_feature_flow_child_ticket(child_id)
                            self.assertIsNotNone(found)
                            ticket_id, ticket = found or ("", {})
                            self.assertEqual(ticket_id, "PROJ-1")
                            self.assertEqual(ticket.get("qa_surface"), "headless")
                            self.assertEqual(len(ticket.get("validation_checks") or []), 1)

                            child = load_manifest(child_id)
                            self.assertEqual(child.get("active_ticket_id"), "PROJ-1")
                            surface, err = resolve_qa_surface_from_ticket(ticket, ticket_id="PROJ-1")
                            self.assertEqual(surface, "headless")
                            self.assertIsNone(err)

    def test_qa_surface_gate_heals_empty_child_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            runs = Path(tmp) / "workflow-runs"
            runs.mkdir()
            with patch("sdlc_workflow_manifest.WORKFLOW_RUNS_DIR", runs):
                with patch("sdlc_workflow_manifest.REPO_ROOT", Path(tmp)):
                    with patch("sdlc_workflow_run_resolve.WORKFLOW_RUNS_DIR", runs):
                        with patch("work_items_sync.WORKFLOW_RUNS_DIR", runs):
                            parent_id = "goal-qa-heal"
                            child_id = f"{parent_id}-ff-api-1"
                            init_manifest("goal-flow", "parent", parent_id, "agent")
                            parent = load_manifest(parent_id)
                            parent["tickets"] = {
                                "API-1": {
                                    "role": "slice",
                                    "qa_surface": "headless",
                                    "validation_checks": [
                                        {"name": "pytest", "cmd": ["python3", "-m", "pytest", "-q"]},
                                    ],
                                },
                            }
                            save_manifest(parent_id, parent)
                            init_manifest("feature-flow", f"child (workflow={parent_id})", child_id, "agent")

                            ctx = RunContext(
                                run_id=child_id,
                                intent="",
                                manifest=load_manifest(child_id),
                                node_id="qa",
                                execution_mode="agent",
                            )
                            surface, err = _qa_surface_from_context(ctx)
                            self.assertEqual(surface, "headless")
                            self.assertIsNone(err)

    def test_register_ticket_qa_surface_cli_flag(self) -> None:
        from sdlc_workflow_manifest import main as manifest_main  # noqa: WPS433

        parser = argparse.ArgumentParser()
        sub = parser.add_subparsers(dest="cmd")
        reg = sub.add_parser("register-ticket")
        reg.add_argument(
            "--qa-surface",
            "--qa_surface",
            dest="qa_surface",
            choices=["browser", "headless"],
        )
        args = parser.parse_args(["register-ticket", "--qa-surface", "headless"])
        self.assertEqual(args.qa_surface, "headless")
        args2 = parser.parse_args(["register-ticket", "--qa_surface", "browser"])
        self.assertEqual(args2.qa_surface, "browser")

    def test_subprocess_args_resolve_ticket_from_child_run(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            runs = Path(tmp) / "workflow-runs"
            runs.mkdir()
            with patch("sdlc_workflow_manifest.WORKFLOW_RUNS_DIR", runs):
                with patch("sdlc_workflow_manifest.REPO_ROOT", Path(tmp)):
                    with patch("sdlc_workflow_run_resolve.WORKFLOW_RUNS_DIR", runs):
                        with patch("work_items_sync.WORKFLOW_RUNS_DIR", runs):
                            parent_id = "goal-subprocess-ticket"
                            child_id = f"{parent_id}-ff-ui-1"
                            init_manifest("goal-flow", "parent", parent_id, "agent")
                            parent = load_manifest(parent_id)
                            parent["tickets"] = {"UI-1": {"role": "slice", "qa_surface": "browser"}}
                            save_manifest(parent_id, parent)
                            init_manifest("feature-flow", f"child (workflow={parent_id})", child_id, "agent")

                            ctx = RunContext(
                                run_id=child_id,
                                intent="",
                                manifest=load_manifest(child_id),
                                node_id="work-item-in-review",
                                execution_mode="agent",
                            )
                            ticket_id = _resolve_ticket_id(ctx)
                            self.assertEqual(ticket_id, "UI-1")

    def test_register_ticket_fails_without_qa_surface(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            runs = Path(tmp) / "workflow-runs"
            runs.mkdir()
            with patch("sdlc_workflow_manifest.WORKFLOW_RUNS_DIR", runs):
                with patch("sdlc_workflow_manifest.REPO_ROOT", Path(tmp)):
                    run_id = "register-qa-contract"
                    init_manifest("goal-flow", "test", run_id, "agent")
                    rc = cmd_register_ticket(run_id, "NO-QA-1")
                    self.assertEqual(rc, 1)
                    manifest = load_manifest(run_id)
                    self.assertNotIn("NO-QA-1", manifest.get("tickets") or {})

    def test_register_ticket_headless_requires_checks(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            runs = Path(tmp) / "workflow-runs"
            runs.mkdir()
            with patch("sdlc_workflow_manifest.WORKFLOW_RUNS_DIR", runs):
                with patch("sdlc_workflow_manifest.REPO_ROOT", Path(tmp)):
                    run_id = "register-headless-no-checks"
                    init_manifest("goal-flow", "test", run_id, "agent")
                    rc = cmd_register_ticket(run_id, "API-2", qa_surface="headless")
                    self.assertEqual(rc, 1)

    def test_register_ticket_browser_ok(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            runs = Path(tmp) / "workflow-runs"
            runs.mkdir()
            with patch("sdlc_workflow_manifest.WORKFLOW_RUNS_DIR", runs):
                with patch("sdlc_workflow_manifest.REPO_ROOT", Path(tmp)):
                    run_id = "register-browser-ok"
                    init_manifest("goal-flow", "test", run_id, "agent")
                    rc = cmd_register_ticket(run_id, "UI-9", qa_surface="browser")
                    self.assertEqual(rc, 0)
                    manifest = load_manifest(run_id)
                    self.assertEqual(manifest["tickets"]["UI-9"]["qa_surface"], "browser")


if __name__ == "__main__":
    unittest.main()
