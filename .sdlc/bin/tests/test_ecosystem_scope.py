#!/usr/bin/env python3
"""Ecosystem ops scope audit tests (ADR-039 Phase 2)."""
from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / ".sdlc" / "bin"))

import sdlc_ecosystem_scope as es  # noqa: E402


def _git_init(repo: Path) -> None:
    subprocess.run(["git", "-C", str(repo), "init"], check=True, capture_output=True)


class EcosystemScopeTests(unittest.TestCase):
    def test_forbidden_child_path_detected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            child = root / "test-child"
            child.mkdir()
            _git_init(child)
            (child / "package.json").write_text("{}", encoding="utf-8")
            allowlist = root / "allowlist.yaml"
            allowlist.write_text(
                "child:\n  forbidden:\n    - package.json\n",
                encoding="utf-8",
            )
            manifest = {
                "metadata": {"workflow_id": "ecosystem-ops-flow"},
                "ecosystem_ops": {
                    "child_target": str(child),
                    "jambu_root": str(root),
                },
            }
            result = es.audit_ecosystem_scope(manifest, allowlist)
            self.assertFalse(result.passed)
            self.assertTrue(any("package.json" in v for v in result.violations))

    def test_allowed_child_path_passes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            child = root / "test-child"
            child.mkdir()
            _git_init(child)
            (child / ".sdlc").mkdir(parents=True)
            (child / ".sdlc" / "sdlc.yaml").write_text("status: uninitialized\n", encoding="utf-8")
            allowlist = root / "allowlist.yaml"
            allowlist.write_text(
                "child:\n  forbidden:\n    - package.json\n",
                encoding="utf-8",
            )
            manifest = {
                "metadata": {"workflow_id": "ecosystem-ops-flow"},
                "ecosystem_ops": {
                    "child_target": str(child),
                    "jambu_root": str(root),
                },
            }
            result = es.audit_ecosystem_scope(manifest, allowlist)
            self.assertTrue(result.passed)

    def test_premature_operational_status_fails(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            child = root / "test-child"
            child.mkdir()
            _git_init(child)
            pipeline = child / ".sdlc" / "pipeline"
            pipeline.mkdir(parents=True)
            (child / ".sdlc" / "sdlc.yaml").write_text("status: operational\n", encoding="utf-8")
            allowlist = root / "allowlist.yaml"
            allowlist.write_text("child:\n  forbidden: []\n", encoding="utf-8")
            manifest = {
                "metadata": {"workflow_id": "ecosystem-ops-flow"},
                "ecosystem_ops": {
                    "child_target": str(child),
                    "jambu_root": str(root),
                },
            }
            result = es.audit_ecosystem_scope(manifest, allowlist)
            self.assertFalse(result.passed)
            self.assertTrue(any("operational" in v for v in result.violations))

    def test_evaluate_stop_skips_without_active_ecosystem_run(self) -> None:
        with patch.object(es, "_active_ecosystem_manifest", return_value=None):
            self.assertIsNone(es.evaluate_stop_scope_audit())

    def test_evaluate_stop_emits_followup_on_violation(self) -> None:
        manifest = {
            "status": "in_progress",
            "metadata": {"workflow_id": "ecosystem-ops-flow"},
            "ecosystem_ops": {"scope_gate": None},
            "paths": {"output_dir": ".sdlc/workflow-runs/output/ecosystem-ops-flow/test-run"},
        }
        audit = es.ScopeAuditResult(
            passed=False,
            violations=["child:demo/package.json matches forbidden pattern"],
        )
        with patch.object(es, "_active_ecosystem_manifest", return_value=("test-run", manifest)):
            with patch.object(es, "_resolve_allowlist_path", return_value=Path("/tmp/allowlist.yaml")):
                with patch.object(es, "audit_ecosystem_scope", return_value=audit):
                    result = es.evaluate_stop_scope_audit()
        self.assertIsNotNone(result)
        assert result is not None
        self.assertFalse(result.passed)
        self.assertIn("SDLC_ECOSYSTEM_SCOPE_VIOLATION", result.followup_message or "")


if __name__ == "__main__":
    unittest.main()
