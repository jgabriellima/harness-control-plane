#!/usr/bin/env python3
"""Unit tests for ADR-018/027 gate adapter split."""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / ".sdlc" / "bin"))

from sdlc_ref_resolver import RunContext  # noqa: E402
from sdlc_workflow_gate import (  # noqa: E402
    check_ci_target_aligned,
    check_deploy_recorded,
    check_deploy_target_declared,
    check_e2e_deploy_target,
    check_feasibility_research,
    check_feature_flow_complete,
    check_reference_confirmed,
    check_reference_ui_ready,
    check_spec_reconciliation,
)


class WorkflowGateAdapterTests(unittest.TestCase):
    def test_ci_target_aligned_uses_contract_not_full_doctor_only(self) -> None:
        ctx = RunContext(
            run_id="test",
            intent="",
            manifest={},
            node_id="preflight",
            execution_mode="stub",
        )
        result = check_ci_target_aligned(ctx)
        self.assertEqual(result.outcome, "PASS")

    def test_feature_flow_complete_requires_workflow_tickets(self) -> None:
        ctx = RunContext(
            run_id="test",
            intent="",
            manifest={"tickets": {}},
            node_id="execution",
            execution_mode="agent",
        )
        result = check_feature_flow_complete(ctx)
        self.assertEqual(result.outcome, "FAIL")
        self.assertIn("workflow-run manifest", result.message)

    def test_deploy_recorded_from_manifest_deployment(self) -> None:
        ctx = RunContext(
            run_id="test",
            intent="",
            manifest={
                "deployment": {
                    "ci_run_url": "https://github.com/org/repo/actions/runs/1",
                },
            },
            node_id="deploy",
            execution_mode="agent",
        )
        result = check_deploy_recorded(ctx)
        self.assertEqual(result.outcome, "PASS")

    def test_reference_ui_ready_fails_without_pngs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            ctx = RunContext(
                run_id="ui-run",
                intent="clone dashboard UI",
                manifest={"run_mode": "greenfield"},
                node_id="discovery",
                execution_mode="agent",
                output_dir=out,
            )
            result = check_reference_ui_ready(ctx)
            self.assertEqual(result.outcome, "FAIL")
            self.assertIn("reference-screenshots", result.message)

    def test_reference_ui_ready_passes_with_png(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            ref_dir = out / "reference-screenshots"
            ref_dir.mkdir()
            png = ref_dir / "reference-desktop-1280.png"
            png.write_bytes(b"\x89PNG" + b"\x00" * 2000)
            ctx = RunContext(
                run_id="ui-run",
                intent="clone dashboard UI",
                manifest={"run_mode": "greenfield"},
                node_id="discovery",
                execution_mode="agent",
                output_dir=out,
            )
            result = check_reference_ui_ready(ctx)
            self.assertEqual(result.outcome, "PASS")

    def test_reference_confirmed_requires_flag(self) -> None:
        ctx = RunContext(
            run_id="ui-run",
            intent="",
            manifest={"run_mode": "greenfield", "target": {}},
            node_id="reference-confirm",
            execution_mode="agent",
        )
        result = check_reference_confirmed(ctx)
        self.assertEqual(result.outcome, "FAIL")

    def test_reference_confirmed_passes_with_manifest_flag(self) -> None:
        ctx = RunContext(
            run_id="ui-run",
            intent="",
            manifest={
                "run_mode": "greenfield",
                "target": {"reference_ui": {"confirmed": True}},
            },
            node_id="reference-confirm",
            execution_mode="agent",
        )
        result = check_reference_confirmed(ctx)
        self.assertEqual(result.outcome, "PASS")

    def test_feasibility_research_na_for_visual_clone(self) -> None:
        ctx = RunContext(
            run_id="clone-run",
            intent="clone landing page from reference URL",
            manifest={"run_mode": "greenfield"},
            node_id="feasibility-research",
            execution_mode="agent",
            output_dir=Path("/tmp/unused"),
        )
        result = check_feasibility_research(ctx)
        self.assertEqual(result.outcome, "PASS")
        self.assertIn("N/A", result.message)

    def test_feasibility_research_fails_for_runtime_intent(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            ctx = RunContext(
                run_id="cp-run",
                intent="build control plane with subprocess dispatch and SSR gateway",
                manifest={"run_mode": "greenfield"},
                node_id="feasibility-research",
                execution_mode="agent",
                output_dir=Path(tmp),
            )
            result = check_feasibility_research(ctx)
            self.assertEqual(result.outcome, "FAIL")
            self.assertIn("feasibility-report.md", result.message)

    def test_deploy_target_declared_defaults_to_local_only(self) -> None:
        ctx = RunContext(
            run_id="run",
            intent="",
            manifest={"run_mode": "greenfield", "target": {}},
            node_id="architecture",
            execution_mode="agent",
        )
        result = check_deploy_target_declared(ctx)
        self.assertEqual(result.outcome, "PASS")
        self.assertIn("local-only", result.message)

    def test_e2e_deploy_target_requires_report_for_serverless(self) -> None:
        ctx = RunContext(
            run_id="run",
            intent="",
            manifest={
                "target": {"deploy_target": "serverless"},
            },
            node_id="deploy",
            execution_mode="agent",
        )
        result = check_e2e_deploy_target(ctx)
        self.assertEqual(result.outcome, "FAIL")

    def test_spec_reconciliation_fails_when_missing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            ctx = RunContext(
                run_id="run",
                intent="",
                manifest={"run_mode": "greenfield"},
                node_id="architecture",
                execution_mode="agent",
                output_dir=Path(tmp),
            )
            result = check_spec_reconciliation(ctx)
            self.assertEqual(result.outcome, "FAIL")

    def test_feature_flow_complete_defers_future_wave_tickets(self) -> None:
        parent = "goal-wave-test"
        ctx = RunContext(
            run_id=parent,
            intent="",
            manifest={
                "waves": [
                    {"id": "wave-1", "status": "in_progress", "tickets": ["PROJ-1"]},
                    {"id": "wave-2", "status": "pending", "tickets": ["PROJ-2"]},
                ],
                "tickets": {
                    "PROJ-1": {"role": "slice", "title": "First"},
                    "PROJ-2": {"role": "slice", "title": "Second"},
                },
            },
            node_id="execution",
            execution_mode="agent",
        )
        result = check_feature_flow_complete(ctx)
        self.assertEqual(result.outcome, "FAIL")
        self.assertIn("PROJ-1", result.message)
        self.assertNotIn("PROJ-2", result.message)
        metrics = result.metrics or {}
        self.assertIn("PROJ-2", metrics.get("deferred_wave", []))


if __name__ == "__main__":
    unittest.main()
