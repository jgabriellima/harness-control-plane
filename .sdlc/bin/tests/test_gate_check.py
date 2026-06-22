#!/usr/bin/env python3
"""Unit tests for sdlc_gate_check deterministic gates."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

BIN_DIR = Path(__file__).resolve().parent.parent
if str(BIN_DIR) not in sys.path:
    sys.path.insert(0, str(BIN_DIR))

from sdlc_e2e_manifest import _coerce_ticket_value  # noqa: E402
from sdlc_gate_check import (  # noqa: E402
    gate_ci_target_aligned,
    gate_deploy,
    gate_handoff_not_stub,
    gate_integration,
    gate_manifest_integrity,
    gate_plane_hierarchy_complete,
    gate_reflect,
    gate_stage_complete,
    gate_stage_order,
    gate_stage_start,
    gate_workspace_rebind,
)

REPO_ROOT = Path(__file__).resolve().parents[3]


def _base_manifest() -> dict:
    return {
        "run_id": "test-run",
        "mode": "greenfield",
        "stages": {
            "hydrate": {"status": "completed", "skip_in_modes": []},
            "classify": {"status": "completed", "skip_in_modes": []},
            "discovery": {"status": "completed", "skip_in_modes": ["fix"]},
            "decomposition": {"status": "completed", "skip_in_modes": ["fix"]},
            "plane-hierarchy": {"status": "pending", "skip_in_modes": ["fix"]},
            "architecture": {"status": "pending", "skip_in_modes": ["fix"]},
            "workspace-rebind": {"status": "pending", "skip_in_modes": ["fix"]},
            "wave-planning": {"status": "pending", "skip_in_modes": ["fix"]},
            "execution": {"status": "pending", "skip_in_modes": []},
        },
        "epic": {},
        "tickets": {},
        "waves": [],
    }


class TestGateStageOrder:
    def test_allows_when_predecessors_complete(self) -> None:
        manifest = _base_manifest()
        manifest["stages"]["plane-hierarchy"]["status"] = "completed"
        assert gate_stage_order(manifest, "architecture") == []

    def test_blocks_when_predecessor_pending(self) -> None:
        manifest = _base_manifest()
        errors = gate_stage_order(manifest, "architecture")
        assert len(errors) == 1
        assert "plane-hierarchy" in errors[0]

    def test_blocks_execution_when_plane_hierarchy_pending(self) -> None:
        manifest = _base_manifest()
        for sid in ("plane-hierarchy", "architecture", "workspace-rebind", "wave-planning"):
            manifest["stages"][sid]["status"] = "completed"
        manifest["stages"]["plane-hierarchy"]["status"] = "pending"
        errors = gate_stage_order(manifest, "execution")
        assert any("plane-hierarchy" in e for e in errors)


class TestGatePlaneHierarchy:
    def test_architecture_blocked_without_epic(self) -> None:
        manifest = _base_manifest()
        manifest["stages"]["plane-hierarchy"]["status"] = "completed"
        errors = gate_plane_hierarchy_complete(manifest, "architecture")
        assert any("epic.uuid" in e for e in errors)

    def test_execution_blocked_without_tickets(self) -> None:
        manifest = _base_manifest()
        manifest["stages"]["plane-hierarchy"]["status"] = "completed"
        manifest["epic"] = {"uuid": "epic-uuid-1"}
        errors = gate_plane_hierarchy_complete(manifest, "execution")
        assert any("no slice/content tickets" in e for e in errors)

    def test_execution_passes_with_epic_and_tickets(self) -> None:
        manifest = _base_manifest()
        manifest["stages"]["plane-hierarchy"]["status"] = "completed"
        manifest["epic"] = {"uuid": "epic-uuid-1"}
        manifest["tickets"] = {"JAMBU-1": {"role": "slice", "status": "pending"}}
        assert gate_plane_hierarchy_complete(manifest, "execution") == []


class TestGateStageStart:
    def test_execution_requires_waves_and_dispatch(self) -> None:
        manifest = _base_manifest()
        for sid in ("plane-hierarchy", "architecture", "workspace-rebind", "wave-planning"):
            manifest["stages"][sid]["status"] = "completed"
        manifest["epic"] = {"uuid": "epic-uuid-1"}
        manifest["tickets"] = {
            "JAMBU-1": {"role": "slice", "status": "pending", "subagent_dispatched": False}
        }
        errors = gate_stage_start(manifest, "execution")
        assert any("register-wave" in e for e in errors)
        assert any("register-subagent-dispatch" in e for e in errors)


class TestGateManifestIntegrity:
    def test_detects_out_of_order_completed_stages(self) -> None:
        manifest = _base_manifest()
        manifest["stages"]["architecture"]["status"] = "completed"
        manifest["stages"]["wave-planning"]["status"] = "completed"
        errors = gate_manifest_integrity(manifest, REPO_ROOT)
        assert any("integrity:" in e and "plane-hierarchy" in e for e in errors)

    def test_detects_execution_without_tickets(self) -> None:
        manifest = _base_manifest()
        manifest["stages"]["execution"]["status"] = "in_progress"
        errors = gate_manifest_integrity(manifest, REPO_ROOT)
        assert any("execution stage in_progress/completed with tickets" in e for e in errors)

    def test_detects_protocol_violation(self) -> None:
        manifest = _base_manifest()
        manifest["protocol"] = {"violation": "orchestrator bypass detected"}
        errors = gate_manifest_integrity(manifest, REPO_ROOT)
        assert any("protocol.violation" in e for e in errors)


class TestBooleanCoercion:
    @pytest.mark.parametrize(
        ("field", "raw", "expected"),
        [
            ("plane_evidence_uploaded", "true", True),
            ("plane_evidence_uploaded", "false", False),
            ("feature_flow_complete", "True", True),
            ("pr_url", "https://example.com", "https://example.com"),
        ],
    )
    def test_coerce_ticket_value(self, field: str, raw: str, expected: object) -> None:
        assert _coerce_ticket_value(field, raw) == expected


class TestGateIntegration:
    def test_blocks_without_report(self, tmp_path: Path) -> None:
        manifest = {"run_id": "test-run", "tickets": {}}
        errors = gate_integration(manifest, tmp_path)
        assert any("integration-report.md missing" in e for e in errors)

    def test_passes_with_e2e_pass_report(self, tmp_path: Path) -> None:
        run_dir = tmp_path / ".sdlc" / "runs" / "test-run"
        run_dir.mkdir(parents=True)
        (run_dir / "integration-report.md").write_text(
            "Joint E2E PASS — 12 tests passed\n",
            encoding="utf-8",
        )
        manifest = {"run_id": "test-run", "tickets": {}}
        assert gate_integration(manifest, tmp_path) == []


class TestGateDeploy:
    def test_requires_staging_evidence(self) -> None:
        manifest = {"orchestrator": {}, "stages": {"deploy": {}}}
        errors = gate_deploy(manifest, REPO_ROOT)
        assert any("staging_smoke_pass" in e or "staging_url" in e for e in errors)

    def test_passes_with_staging_url(self) -> None:
        manifest = {
            "orchestrator": {"staging_url": "https://staging.example.com"},
            "stages": {"deploy": {}},
        }
        deploy_errors = gate_deploy(manifest, REPO_ROOT)
        assert not any("staging_smoke_pass" in e or "staging_url" in e for e in deploy_errors)


class TestGateReflect:
    def test_blocks_without_report(self, tmp_path: Path) -> None:
        manifest = {"run_id": "test-run"}
        errors = gate_reflect(manifest, tmp_path)
        assert any("reflect gate" in e for e in errors)

    def test_passes_with_pass_verdict(self, tmp_path: Path) -> None:
        run_dir = tmp_path / ".sdlc" / "runs" / "test-run"
        run_dir.mkdir(parents=True)
        (run_dir / "reflect-report.md").write_text("Overall: PASS\n", encoding="utf-8")
        manifest = {"run_id": "test-run"}
        assert gate_reflect(manifest, tmp_path) == []


class TestGateWorkspaceRebind:
    def test_blocks_without_rebind_report(self, tmp_path: Path) -> None:
        manifest = {"run_id": "test-run"}
        errors = gate_workspace_rebind(manifest, tmp_path)
        assert any("rebind-report.md missing" in e for e in errors)


class TestGateStageCompleteWiring:
    def test_integration_stage_invokes_gate(self, tmp_path: Path) -> None:
        manifest = _base_manifest()
        manifest["run_id"] = "test-run"
        for sid in (
            "plane-hierarchy",
            "architecture",
            "workspace-rebind",
            "wave-planning",
            "execution",
        ):
            manifest["stages"][sid] = {"status": "completed", "skip_in_modes": []}
        errors = gate_stage_complete(manifest, "integration", tmp_path)
        assert any("integration gate" in e for e in errors)


class TestGateHandoffStub:
    def test_rejects_stub_handoff(self, tmp_path: Path) -> None:
        handoffs = tmp_path / ".sdlc" / "handoffs"
        handoffs.mkdir(parents=True)
        (handoffs / "LATEST.md").write_text(
            "STUB — Agent did not enrich this handoff.\n",
            encoding="utf-8",
        )
        errors = gate_handoff_not_stub(tmp_path)
        assert len(errors) == 1
